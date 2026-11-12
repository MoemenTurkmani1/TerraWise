import { crops } from '../data/crops';
import type { ClimateData, Crop, Field, Recommendation, RotationStep } from '../types';
import { historySerial, sortedHistory } from './history';
import { needsLegacyReview } from './legacyField';
import { constraintDecision, evaluateConstraint, rankEligible } from './constraints';

/** Increment when eligibility, scores or configurable rules change. */
export const MODEL_VERSION = 'terrawise-evidence-v2.0';

/** Illustrative weights, ranges and penalties; not a calibrated agronomic model.
 * Nutrient tests vary by extraction method: confirm thresholds with an agronomist.
 */
export const heuristicConfig = {
  weights: { climate: 0.25, ph: 0.15, nutrients: 0.15, water: 0.2, rotation: 0.2, priorities: 0.05 },
  recentHistorySeasons: 3,
  sameCropScoreCap: 45,
  sameFamilyScoreCap: 65,
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const known = (value: number | null): value is number => value !== null && Number.isFinite(value);
const seasonMonths: Record<string, number[]> = { Spring: [2, 3, 4, 5], Autumn: [8, 9, 10, 11] };

function rangeScore(value: number, range: [number, number], drop: number): number {
  return clamp(100 - Math.max(range[0] - value, value - range[1], 0) * drop);
}

function recentHistory(field: Field) {
  return sortedHistory(field.previousCrops);
}

function scoreCrop(crop: Crop, field: Field, climate: ClimateData, season: string): Recommendation {
  const missingInputs: string[] = [];
  const warnings = [
    'Exploratory profile only. Crop ranges and provisional factor weights are not agronomist-validated.',
    'Water compatibility and crop-specific critical constraints have not been verified.',
  ];
  const indices = seasonMonths[season];
  const months = indices?.map(index => climate.monthly[index]).filter(month => month && Number.isFinite(month.temperature) && Number.isFinite(month.rainfall)) ?? [];
  const hasClimate = months.length === 4;
  const temperature = hasClimate ? average(months.map(month => month.temperature)) : null;
  const rainfall = hasClimate ? months.reduce((sum, month) => sum + month.rainfall, 0) : null;
  if (!hasClimate) missingInputs.push('Complete seasonal climate data');
  const climateScore = temperature === null ? null : Math.round(rangeScore(temperature, crop.temperature, 7));

  const ph = field.soil.ph;
  if (!known(ph)) missingInputs.push('Soil pH');
  const phScore = known(ph) ? Math.round(rangeScore(ph, crop.ph, 40)) : null;
  const nutrientKeys = ['nitrogen', 'phosphorus', 'potassium'] as const;
  for (const key of nutrientKeys) if (!known(field.soil[key])) missingInputs.push(`Soil ${key}`);
  const nutrientsKnown = nutrientKeys.every(key => known(field.soil[key]));
  const nutrientScore = nutrientsKnown
    ? Math.round(average(nutrientKeys.map(key => clamp((field.soil[key]! / crop.nutrients[key]) * 100))))
    : null;
  if (!known(field.soil.organicMatter)) missingInputs.push('Soil organic matter');
  else if (field.soil.organicMatter < 2) warnings.push('Organic matter is below the unvalidated 2% starter warning; consult a local agronomist.');

  missingInputs.push('Effective rainfall, irrigation volume and crop water requirement');
  const history = recentHistory(field);
  const lastCrop = crops.find(candidate => candidate.id === history[0]?.cropId);
  const recentSameFamily = history.slice(0, heuristicConfig.recentHistorySeasons).some(entry => crops.find(candidate => candidate.id === entry.cropId)?.family === crop.family);
  const sameCrop = lastCrop?.id === crop.id;
  const sameFamily = lastCrop?.family === crop.family;
  if (!lastCrop) missingInputs.push('Recognized previous crop');
  if (history.some(entry => !crops.some(candidate => candidate.id === entry.cropId))) warnings.push('Some recorded crops are absent from the starter catalog; family risks may be incomplete.');
  const rotationScore = !lastCrop ? null : sameCrop ? 10 : sameFamily ? 30 : recentSameFamily ? 70 : 100;
  if (sameFamily) warnings.push(`Follows ${lastCrop?.name} in the ${crop.family} family. Review shared pests and local return intervals.`);
  else if (recentSameFamily) warnings.push(`${crop.family} appears in recent history; review local disease-specific return intervals.`);
  if (field.soil.provenance === 'estimated') warnings.push('Soil values are farmer estimates, not confirmed laboratory measurements.');
  else if (field.soil.provenance !== 'measured') warnings.push('Soil values are user-entered; measurement provenance is unconfirmed.');
  if (field.previousCrops.some(entry => entry.diseaseNotes?.trim())) warnings.push('Recorded pest or disease notes are not interpreted by this starter model.');
  if (!crop.seasons.includes(season)) warnings.push(`The unvalidated starter catalog does not list ${season} for this crop; this is not a verified incompatibility.`);
  if (field.priorities.includes('production') || field.priorities.includes('profitability') || field.budget) warnings.push('Production, profit and budget are not calculated without validated local economic and yield data.');

  const factors: Recommendation['factors'] = [
    { name: 'Climate fit', score: climateScore, weight: heuristicConfig.weights.climate, explanation: temperature === null ? 'Unknown: seasonal climate is unavailable.' : `${season} historical mean ${temperature.toFixed(1)}°C compared with an unvalidated starter range of ${crop.temperature[0]}–${crop.temperature[1]}°C; not a forecast.` },
    { name: 'Soil pH', score: phScore, weight: heuristicConfig.weights.ph, explanation: phScore === null ? 'Unknown: no soil pH was provided.' : `pH ${ph!.toFixed(1)} compared with the unvalidated starter range ${crop.ph[0]}–${crop.ph[1]}.` },
    { name: 'Nutrient fit', score: nutrientScore, weight: heuristicConfig.weights.nutrients, explanation: nutrientScore === null ? 'Unknown: all N, P and K values are needed for this provisional factor; missing tests are not zero.' : 'N/P/K are compared with unvalidated starter screens. Laboratory methods require local interpretation.' },
    { name: 'Water fit', score: null, weight: heuristicConfig.weights.water, explanation: `${rainfall === null ? 'Seasonal rainfall unavailable.' : `${Math.round(rainfall)} mm historical seasonal precipitation.`} Irrigation is ${field.water}; effective rainfall, irrigation volume and crop water needs are unknown. Water compatibility is unknown.` },
    { name: 'Rotation fit', score: rotationScore, weight: heuristicConfig.weights.rotation, explanation: !lastCrop ? 'Unknown: no recognized previous crop.' : sameFamily ? `Starter family warning: follows ${lastCrop.name}; this is not a validated disease-specific interval.` : `Starter comparison: different family from ${lastCrop.name}.${recentSameFamily ? ' This family appeared earlier.' : ''}` },
    { name: 'Your priorities', score: null, weight: heuristicConfig.weights.priorities, explanation: `Farmer priorities are context: ${field.priorities.length ? field.priorities.join(', ').replaceAll('-', ' ') : 'not provided'}. They are not combined with physical suitability.` },
  ];
  const constraints = [
    evaluateConstraint({ id: 'water-balance', conclusion: 'unknown', explanation: 'Water compatibility is unknown without a validated water balance.' }),
    evaluateConstraint({ id: 'crop-specific-critical-rules', conclusion: 'unknown', explanation: 'No region- and crop-specific critical rules have been independently reviewed.' }),
    evaluateConstraint({ id: 'planting-window', conclusion: 'unknown', explanation: 'Starter planting windows are illustrative and are not verified local constraints.' }),
  ];
  const completeness = Math.round(([hasClimate, known(ph), ...nutrientKeys.map(key => known(field.soil[key])), known(field.soil.organicMatter), !!lastCrop, false].filter(Boolean).length / 8) * 100);
  const reasons = factors.filter(factor => factor.score !== null && factor.score >= 75).slice(0, 3).map(factor => factor.explanation);
  if (!reasons.length) reasons.push('Available inputs do not establish an overall crop match.');
  return { crop, score: null, factors, reasons, warnings: [...new Set(warnings)], missingInputs, completeness, confidence: 'low', dataSource: climate.source, constraints, decision: constraintDecision(constraints) };
}

export interface ExcludedCrop { crop: Crop; reasons: string[] }
/** Starter calendar labels are unreviewed and cannot prove incompatibility. */
export function assessEligibility(crop: Crop, season: string): { supported: boolean; status: 'unknown'; reasons: string[] } {
  if (!(season in seasonMonths)) return { supported: false, status: 'unknown', reasons: [`${season} is not a supported interface window.`] };
  return { supported: true, status: 'unknown', reasons: crop.seasons.includes(season) ? [] : ['The starter catalog does not list this window; local suitability is unknown.'] };
}

export function excludedCrops(season: string): ExcludedCrop[] {
  return crops.map(crop => ({ crop, ...assessEligibility(crop, season) })).filter(item => !item.supported).map(({ crop, reasons }) => ({ crop, reasons }));
}

/** Unranked exploration only; alphabetical order never represents suitability. */
export function assessCrops(field: Field, climate: ClimateData, season = 'Autumn'): Recommendation[] {
  if (needsLegacyReview(field) || climate.source !== 'nasa-power' || climate.monthly.length !== 12 || !(season in seasonMonths)) return [];
  if (!climate.monthly.every(month => month && [month.temperature, month.rainfall, month.solar].every(Number.isFinite))) return [];
  return crops.map(crop => scoreCrop(crop, field, climate, season)).sort((a, b) => a.crop.name.localeCompare(b.crop.name));
}

/** Current reviewed critical rules and water data are unavailable, so this
 * returns no ranked results instead of treating unknown as compatible. */
export function rankCrops(field: Field, climate: ClimateData, season = 'Autumn'): Recommendation[] {
  return rankEligible(assessCrops(field, climate, season));
}

/** Sequential family-aware rotation. Soil values are held constant: no invented
 * yield, nitrogen credits or soil improvement projections are applied.
 */
export function buildRotation(field: Field, climate: ClimateData, count = 4, startSeason = 'Autumn', startYear = 2026): RotationStep[] {
  const planningField: Field = { ...field, previousCrops: [...field.previousCrops] };
  const plan: RotationStep[] = [];
  let season = startSeason === 'Spring' ? 'Spring' : 'Autumn';
  let year = Number.isInteger(startYear) && startYear >= 1900 && startYear <= 2200 ? startYear : 2026;
  const latestHistory = recentHistory(field)[0];
  // Never schedule a proposed crop before (or in the same window as) history.
  // This also keeps user-entered newer history useful.
  if (latestHistory) {
    const historicalWindow = historySerial(latestHistory);
    while (historySerial({ year, season }) <= historicalWindow) {
      if (season === 'Autumn') { season = 'Spring'; year += 1; } else season = 'Autumn';
    }
  }
  const total = Number.isFinite(count) ? Math.max(0, Math.min(8, Math.floor(count))) : 0;
  for (let index = 0; index < total; index += 1) {
    const ranked = assessCrops(planningField, climate, season);
    const previous = crops.find((crop) => crop.id === recentHistory(planningField)[0]?.cropId);
    const recommendation = ranked.find((candidate) => candidate.crop.family !== previous?.family) ?? ranked[0];
    if (!recommendation) break;
    plan.push({ season, year, recommendation });
    planningField.previousCrops.push({ cropId: recommendation.crop.id, season, year });
    if (season === 'Autumn') { season = 'Spring'; year += 1; } else season = 'Autumn';
  }
  return plan;
}

export interface RotationAlternative {
  id: string;
  title: string;
  steps: RotationStep[];
  explanation: string;
  tradeoffs: string[];
}

/** Different first crops create distinct sequences; all later windows are independently rescored. */
export function buildRotationAlternatives(field: Field, climate: ClimateData, count = 4, startSeason = 'Autumn', startYear = 2026): RotationAlternative[] {
  const template = buildRotation(field, climate, count, startSeason, startYear);
  if (!template.length) return [];
  const ranked = assessCrops(field, climate, template[0].season);
  const previous = crops.find(crop => crop.id === recentHistory(field)[0]?.cropId);
  const pool = ranked.filter(item => item.crop.family !== previous?.family);
  const eligible = pool.length ? pool : ranked;
  // Prefer different families for first choices, then different crops of the same family.
  const uniqueFamilies = eligible.filter((item, index) => eligible.findIndex(other => other.crop.family === item.crop.family) === index);
  const seeds = [...uniqueFamilies, ...eligible.filter(item => !uniqueFamilies.some(first => first.crop.id === item.crop.id))].slice(0, 3);
  return seeds.map((seed, alternativeIndex) => {
    let rolling: Field = { ...field, previousCrops: [...field.previousCrops] };
    const steps = template.map((window, index) => {
      const choices = assessCrops(rolling, climate, window.season);
      const last = crops.find(crop => crop.id === recentHistory(rolling)[0]?.cropId);
      const nonRepeating = choices.filter(item => item.crop.family !== last?.family);
      const candidates = nonRepeating.length ? nonRepeating : choices;
      const selected = index === 0 ? choices.find(item => item.crop.id === seed.crop.id)! : candidates[0];
      rolling = { ...rolling, previousCrops: [...rolling.previousCrops, { cropId: selected.crop.id, season: window.season, year: window.year }] };
      return { season: window.season, year: window.year, recommendation: selected };
    });
    const lowWater = steps.filter(step => step.recommendation.crop.waterNeed === 'low').length;
    const legumes = steps.filter(step => step.recommendation.crop.fixesNitrogen).length;
    return {
      id: `alternative-${seed.crop.id}`,
      title: `Exploratory sequence ${alternativeIndex + 1}`,
      steps,
      explanation: `Unranked alphabetical starting choice: ${seed.crop.name}. ${lowWater} crops have an unvalidated lower-water label and ${legumes} are legumes; neither establishes field suitability.`,
      tradeoffs: [
        'Family changes screen only the recorded sequence; pest-specific return intervals and cross-family hosts require local review.',
        'Soil cover, crop duration, overlaps, and soil nutrient changes are not modeled. Plan residue and cover separately.',
        'Legume nitrogen benefits depend on nodulation, conditions and residue management. Water demand categories are relative, not measured savings.',
      ],
    };
  });
}
