/** Root-zone bookkeeping from FAO-56 ch. 8, using supplied daily fluxes.
 * No missing flux, stress coefficient, irrigation, or effective rain is inferred. */
export interface WaterBalanceInputs {
  previousDepletionMm: number | null
  totalAvailableWaterMm: number | null
  rainfallMm: number | null
  runoffMm: number | null
  netIrrigationMm: number | null
  capillaryRiseMm: number | null
  actualEtMm: number | null
  deepPercolationMm: number | null
  locallyReviewedDepletionFraction: number | null
  thresholdSource: string
}
export type WaterBalanceResult = { status: 'insufficient_data'; reason: string } | { status: 'assessed'; depletionMm: number; readilyAvailableMm: number; assessment: 'above_reviewed_threshold' | 'within_reviewed_threshold' }
/** FAO-56 eq. 82, uniform root zone; volumetric percentages and metres. */
export function totalAvailableWater(fieldCapacityPercent: number | null, wiltingPointPercent: number | null, rootDepthM: number | null): number | null {
  if ([fieldCapacityPercent, wiltingPointPercent, rootDepthM].some(value => value === null || !Number.isFinite(value))) return null
  if (fieldCapacityPercent! > 100 || wiltingPointPercent! < 0 || fieldCapacityPercent! <= wiltingPointPercent! || rootDepthM! <= 0) return null
  return 1000 * ((fieldCapacityPercent! - wiltingPointPercent!) / 100) * rootDepthM!
}
export function evaluateWaterBalance(input: WaterBalanceInputs): WaterBalanceResult {
  const { previousDepletionMm: previous, totalAvailableWaterMm: taw, rainfallMm: rain, runoffMm: runoff, netIrrigationMm: irrigation, capillaryRiseMm: capillary, actualEtMm: et, deepPercolationMm: deep, locallyReviewedDepletionFraction: p } = input
  if ([previous, taw, rain, runoff, irrigation, capillary, et, deep, p].some(x => x === null || !Number.isFinite(x)) || !input.thresholdSource.trim()) return { status: 'insufficient_data', reason: 'A complete daily root-zone balance and a locally reviewed stress threshold are required.' }
  if (taw! <= 0 || previous! < 0 || previous! > taw! || [rain!, runoff!, irrigation!, capillary!, et!, deep!].some(x => x < 0) || runoff! > rain! || p! <= 0 || p! >= 1) return { status: 'insufficient_data', reason: 'Water-balance inputs are inconsistent or outside physical bounds.' }
  const depletion = previous! - (rain! - runoff!) - irrigation! - capillary! + et! + deep!
  if (depletion < -1e-9 || depletion > taw! + 1e-9) return { status: 'insufficient_data', reason: 'The supplied fluxes produce an impossible root-zone depletion; review storage or missing losses.' }
  const limit = p! * taw!
  return { status: 'assessed', depletionMm: depletion, readilyAvailableMm: limit, assessment: depletion > limit ? 'above_reviewed_threshold' : 'within_reviewed_threshold' }
}
