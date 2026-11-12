import { crops } from '../data/crops'
import { ecocropScreenRequirements } from '../data/ecocropScreen'
import type { ClimateData, ClimateMonth, Field } from '../types'
import { ecologicalMembership, type EcologicalScreen, type ScreenResult } from './ecologicalScreen'
import { sortedHistory } from './history'
import { needsLegacyReview } from './legacyField'

/** Observed wheat calendar for the Bekaa study, not a field-validated sowing rule. */
export const BEKAA_WHEAT_SOURCE = 'https://www.mdpi.com/1424-8220/18/7/2089'
const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface WaterEvidence {
  rainfallMm: number | null
  effectiveRainfallMm: null
  referenceEtMm: null
  cropDemandMm: null
  irrigationSupplyMm: null
  waterFit: 'unknown'
}
export interface LocalSeasonResult {
  screen: ScreenResult
  period: { start: string; end: string } | null
  water: WaterEvidence
}

/** Descriptive rainfall is never treated as effective rainfall or water supply. */
export function waterEvidence(months: (ClimateMonth | undefined)[]): WaterEvidence {
  const rainfallMm = months.length > 0 && months.every(month => month && Number.isFinite(month.rainfall) && month.rainfall >= 0)
    ? Math.round(months.reduce((sum, month) => sum + month!.rainfall, 0) * 10) / 10 : null
  return { rainfallMm, effectiveRainfallMm: null, referenceEtMm: null, cropDemandMm: null, irrigationSupplyMm: null, waterFit: 'unknown' }
}

/** User explicitly opts in to the Bekaa reference; coordinates are not
 * automatically checked against an administrative or agroecological boundary. */
export function screenBekaaWheat(field: Field, climate: ClimateData, season: string): LocalSeasonResult {
  const emptyWater = waterEvidence([])
  const unavailable: string[] = []
  if (needsLegacyReview(field)) unavailable.push('Review this older example-derived field.')
  if (season !== 'Autumn') unavailable.push('This study describes November planting; Spring is outside its observed reference, not a verified incompatibility.')
  const ph = field.soil.ph
  if (ph === null || !Number.isFinite(ph) || ph < 0 || ph > 14) unavailable.push('Enter a valid soil pH.')
  const year = climate.year
  const provenance = climate.provenance
  const validSource = climate.source === 'nasa-power' && provenance?.provider === 'NASA POWER'
    && provenance.coordinates.latitude === field.latitude && provenance.coordinates.longitude === field.longitude
    && Number.isInteger(year) && provenance.period.start === `${year - 1}-01-01` && provenance.period.end === `${year}-12-31`
    && provenance.parameters.some(p => p.code === 'T2M' && p.unit === '°C' && ['C', '°C', 'degC'].includes(p.sourceUnit))
  const earlier = climate.history?.find(item => item.year === year - 1)?.monthly
  const later = climate.history?.find(item => item.year === year)?.monthly
  const months = earlier && later ? [...earlier.slice(10, 12), ...later.slice(0, 6)] : []
  const validMonths = months.length === 8 && months.every((month, index) =>
    month?.month === names[(index + 10) % 12] && Number.isFinite(month.temperature) && month.temperature >= -90 && month.temperature <= 65)
  if (!validSource || !validMonths) unavailable.push('Two complete historical years for the exact field location are required for November–June.')
  const period = season === 'Autumn' && validSource && validMonths ? { start: `${year - 1}-11-01`, end: `${year}-06-30` } : null
  const water = period && provenance?.parameters.some(p => p.code === 'PRECTOTCORR' && p.unit === 'mm/month' && ['mm/day', 'mm d-1'].includes(p.sourceUnit))
    ? waterEvidence(months) : emptyWater
  if (unavailable.length || ph === null || !period) return { screen: { ranked: [], excluded: [], unavailable }, period, water }
  const crop = crops.find(item => item.id === 'wheat')!
  const requirement = ecocropScreenRequirements.wheat
  const phFit = ecologicalMembership(ph, requirement.ph)
  const temperatures = months.map(month => ecologicalMembership(month.temperature, requirement.temperature))
  if (phFit === null || temperatures.some(value => value === null)) return { screen: { ranked: [], excluded: [], unavailable: ['Crop requirements or temperatures are invalid.'] }, period, water }
  const limitingIndex = temperatures.reduce<number>((best, value, index) => value! < temperatures[best]! ? index : best, 0)
  const tempFit = temperatures[limitingIndex]!
  if (phFit === 0 || tempFit === 0) {
    const reasons: string[] = []
    if (phFit === 0) reasons.push('Entered pH is at or outside the FAO ECOCROP absolute range.')
    if (tempFit === 0) reasons.push(`${months[limitingIndex].month} historical mean is at or outside the FAO ECOCROP absolute temperature range.`)
    return { screen: { ranked: [], excluded: [{ crop, reasons }], unavailable: [] }, period, water }
  }
  const previous = crops.find(item => item.id === sortedHistory(field.previousCrops)[0]?.cropId)
  const warnings = [
    'Bekaa location is user-selected and has not been verified against a geographic boundary.',
    'November–June is a published study period for wheat; its application to this field and durum cultivar is unverified.',
    'This is a pH and historical temperature screen, not a water balance or planting recommendation.',
    'A single species temperature range is applied to every month; winter dormancy and crop stages are not modeled, so adapted winter wheat may be screened out incorrectly.',
    'Water, crop duration for the chosen variety, disease, salinity and local rotation rules remain unknown.',
    previous ? `Previous crop: ${previous.name}. Disease-specific rotation risks are not assessed.` : 'Previous crop is unknown; rotation risk is not assessed.',
  ]
  if (field.soil.provenance === 'estimated') warnings.push('Soil pH was marked as a farmer estimate.')
  else if (field.soil.provenance !== 'measured') warnings.push('Soil pH measurement provenance is unconfirmed.')
  const item: EcologicalScreen = { crop, requirement, score: Math.round(100 * Math.min(phFit, tempFit)), phScore: Math.round(100 * phFit), temperatureScore: Math.round(100 * tempFit), limitingMonth: `${months[limitingIndex].month} ${limitingIndex < 2 ? year - 1 : year}`, limitingTemperature: months[limitingIndex].temperature, warnings, confidence: 'low' }
  return { screen: { ranked: [item], excluded: [], unavailable: [] }, period, water }
}
