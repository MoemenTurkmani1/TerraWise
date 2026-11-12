import { hasSyntheticClimate } from './demoEvidence.ts'
import { crops } from '../data/crops.ts'
import { ecocropScreenRequirements, type EcologicalRange, type EcocropScreenRequirement } from '../data/ecocropScreen.ts'
import type { ClimateData, Crop, Field } from '../types.ts'
import { sortedHistory } from './history.ts'
import { needsLegacyReview } from './legacyField.ts'

const windows: Record<'Spring' | 'Autumn', readonly number[]> = { Spring: [2, 3, 4, 5], Autumn: [8, 9, 10, 11] }
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** ECOCROP-style trapezoid: 1 in the optimal range, 0 at/outside the
 * absolute range, linear transitions. This is a model, not measured yield. */
export function ecologicalMembership(value: number, range: EcologicalRange): number | null {
  const [absoluteMin, optimalMin, optimalMax, absoluteMax] = range
  if (!Number.isFinite(value) || !range.every(Number.isFinite) || !(absoluteMin < optimalMin && optimalMin <= optimalMax && optimalMax < absoluteMax)) return null
  if (value <= absoluteMin || value >= absoluteMax) return 0
  if (value >= optimalMin && value <= optimalMax) return 1
  return value < optimalMin ? (value - absoluteMin) / (optimalMin - absoluteMin) : (absoluteMax - value) / (absoluteMax - optimalMax)
}

export interface EcologicalScreen {
  crop: Crop
  requirement: EcocropScreenRequirement
  score: number
  phScore: number
  temperatureScore: number
  limitingMonth: string
  limitingTemperature: number
  warnings: string[]
  confidence: 'low'
}
export interface ScreenResult {
  ranked: EcologicalScreen[]
  excluded: { crop: Crop; reasons: string[] }[]
  unavailable: string[]
}

/** A limited two-factor screen, never an overall crop recommendation.
 * It uses a fixed four-month UI window, not a verified growing season. */
export function screenCrops(field: Field, climate: ClimateData, season: string, limit = 4): ScreenResult {
  const unavailable: string[] = []
  if (needsLegacyReview(field)) unavailable.push('Review the older example-derived field.')
  const indices = season === 'Spring' || season === 'Autumn' ? windows[season] : null
  if (!indices) unavailable.push('Choose a supported interface window.')
  const ph = field.soil.ph
  if (ph === null || !Number.isFinite(ph) || ph < 0 || ph > 14) unavailable.push('Enter a valid soil pH.')
  const provenance = climate.provenance
  const climateMatches = hasSyntheticClimate(field, climate) || climate.source === 'nasa-power' && provenance?.provider === 'NASA POWER'
    && provenance.coordinates.latitude === field.latitude && provenance.coordinates.longitude === field.longitude
    && Number.isInteger(climate.year) && provenance.period.end === `${climate.year}-12-31`
    && provenance.parameters.some(parameter => parameter.code === 'T2M' && parameter.unit === '°C' && ['C', '°C', 'degC'].includes(parameter.sourceUnit))
    && climate.monthly.length === 12 && climate.monthly.every((month, index) =>
      month?.month === monthNames[index] && Number.isFinite(month.temperature) && month.temperature >= -90 && month.temperature <= 65)
  if (!climateMatches) unavailable.push('Historical NASA temperature for the exact field location is unavailable or incomplete.')
  if (unavailable.length || !indices || ph === null) return { ranked: [], excluded: [], unavailable }

  const ranked: EcologicalScreen[] = []
  const excluded: ScreenResult['excluded'] = []
  const previous = crops.find(crop => crop.id === sortedHistory(field.previousCrops)[0]?.cropId)
  for (const crop of crops) {
    const requirement = ecocropScreenRequirements[crop.id]
    if (!requirement) continue
    const phFit = ecologicalMembership(ph, requirement.ph)
    const monthly = indices.map(index => ({ month: climate.monthly[index], score: ecologicalMembership(climate.monthly[index].temperature, requirement.temperature) }))
    if (phFit === null || monthly.some(item => item.score === null)) continue
    const limiting = monthly.reduce((a, b) => a.score! <= b.score! ? a : b)
    const tempFit = limiting.score!
    if (phFit === 0 || tempFit === 0) {
      const reasons: string[] = []
      if (phFit === 0) reasons.push('Entered pH is at or outside the FAO ECOCROP absolute range.')
      if (tempFit === 0) reasons.push(`${limiting.month.month} historical monthly mean is at or outside the FAO ECOCROP absolute temperature range.`)
      excluded.push({ crop, reasons })
      continue
    }
    const warnings = [
      ...(climate.source === 'demo' ? ['DEMO / SYNTHETIC inputs: a calculated test result, not NASA evidence or a planting recommendation.'] : []),
      'This screen covers only pH and four historical monthly mean temperatures; it is not overall suitability or a planting recommendation.',
      'Water balance, locally valid sowing dates, disease, salinity and crop-specific rotation constraints remain unknown.',
      'FAO ECOCROP species ranges and this screen have not been validated for this field or cultivar.',
    ]
    if (field.soil.provenance === 'estimated') warnings.push('Soil pH was marked as a farmer estimate.')
    else if (field.soil.provenance !== 'measured') warnings.push('Soil pH measurement provenance is unconfirmed.')
    if (!previous) warnings.push('A recognized previous crop is unavailable; rotation risk is unknown.')
    else if (previous.family === crop.family) warnings.push(`The previous crop ${previous.name} is in the same family. Ask a local agronomist about pest-specific return intervals.`)
    else warnings.push(`The previous crop ${previous.name} is in a different family; cross-family pests and return intervals are not assessed.`)
    if (!crop.seasons.includes(season)) warnings.push('The unvalidated starter catalog does not list this interface window; local planting dates remain unknown.')
    ranked.push({ crop, requirement, score: Math.round(100 * Math.min(phFit, tempFit)), phScore: Math.round(100 * phFit), temperatureScore: Math.round(100 * tempFit), limitingMonth: limiting.month.month, limitingTemperature: limiting.month.temperature, warnings, confidence: 'low' })
  }
  ranked.sort((a, b) => b.score - a.score || a.crop.name.localeCompare(b.crop.name))
  return { ranked: ranked.slice(0, Math.max(0, Math.min(crops.length, Math.floor(limit)))), excluded, unavailable }
}
