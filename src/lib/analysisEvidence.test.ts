import { describe, expect, it } from 'vitest'
import { canSaveAnalysis, exportExploratoryAnalysis, hasTraceableClimate, isVisibleAnalysis } from './analysisEvidence'
import { assessCrops, MODEL_VERSION } from './recommendations'
import { demoClimate, demoFields } from '../test/fixtures'
import type { ClimateData } from '../types'
import type { AnalysisRecord } from '../types/analysis'
function fixture(): AnalysisRecord {
  const field = { ...structuredClone(demoFields[0]), id: 'regression-field' }
  const retrievedAt = '2026-01-01T00:00:00Z'
  const climate: ClimateData = { ...structuredClone(demoClimate), source: 'nasa-power', retrievedAt, provenance: {
    provider: 'NASA POWER', coordinates: { latitude: field.latitude, longitude: field.longitude }, period: { start: '2025-01-01', end: '2025-12-31' }, retrievedAt, cache: 'fresh', quality: 'complete', missing: [],
    parameters: [{ code: 'T2M', unit: '\u00b0C', sourceUnit: 'C' }, { code: 'PRECTOTCORR', unit: 'mm/month', sourceUnit: 'mm/day' }, { code: 'ALLSKY_SFC_SW_DWN', unit: 'kWh/m\u00b2/day', sourceUnit: 'MJ/m^2/day' }],
  } }
  return { id: 'regression', createdAt: retrievedAt, field, climate, season: 'Autumn', modelVersion: MODEL_VERSION, recommendations: assessCrops(field, climate, 'Autumn').slice(0, 4) }
}
describe('analysis evidence boundary', () => {
  it('accepts traceable exploratory snapshots', () => { expect(canSaveAnalysis(fixture())).toBe(true) })
  it('rejects simulated, missing and mismatched NASA provenance', () => {
    const record = fixture(); record.climate.source = 'demo'; expect(isVisibleAnalysis(record)).toBe(false)
    record.climate.source = 'nasa-power'; record.climate.provenance!.coordinates.latitude += 1
    expect(canSaveAnalysis(record)).toBe(false)
    delete record.climate.provenance; expect(hasTraceableClimate(record.field, record.climate)).toBe(false)
  })
  it('rejects current records claiming overall or water suitability', () => {
    const record = fixture(); record.recommendations[0].score = 90; expect(canSaveAnalysis(record)).toBe(false)
    record.recommendations[0].score = null; record.recommendations[0].factors.find(factor => factor.name === 'Water fit')!.score = 90
    expect(canSaveAnalysis(record)).toBe(false)
  })
  it('sanitizes historical export copies while preserving originals', () => {
    const record = fixture(); record.modelVersion = 'legacy'; record.recommendations[0].score = 90
    const exported = exportExploratoryAnalysis(record)
    expect(exported.recommendations[0].score).toBeNull()
    expect(exported.recommendations[0].factors.every(factor => factor.score === null)).toBe(true)
    expect(record.recommendations[0].score).toBe(90)
  })
})