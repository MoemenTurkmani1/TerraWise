import type { ClimateData, Field } from '../types'
export const isDemoField = (field: Field) => field.dataClassification === 'demo-synthetic'
const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Synthetic input is a separate source. It can never satisfy NASA provenance. */
export function hasSyntheticClimate(field: Field, climate: ClimateData): boolean {
  const fixture = climate.fixture
  return isDemoField(field) && !!field.demoFarmId && climate.source === 'demo' && !climate.provenance
    && fixture?.kind === 'synthetic-local-demo' && fixture.version === 1 && fixture.farmId === field.demoFarmId
    && fixture.coordinates.latitude === field.latitude && fixture.coordinates.longitude === field.longitude
    && Number.isInteger(climate.year) && climate.year >= 1984 && climate.year < new Date().getUTCFullYear()
    && climate.monthly.length === 12 && climate.monthly.every((month, index) => month?.month === names[index]
      && Number.isFinite(month.temperature) && month.temperature >= -90 && month.temperature <= 65
      && Number.isFinite(month.rainfall) && month.rainfall >= 0 && Number.isFinite(month.solar) && month.solar >= 0)
}
export const canExploreClimate = (field: Field, climate: ClimateData) => climate.source === 'nasa-power' || hasSyntheticClimate(field, climate)
