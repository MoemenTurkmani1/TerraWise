import { describe, expect, it } from 'vitest'
import { summarizeWaterClimate } from './waterSummary'
import { demoFields } from '../test/fixtures'
import type { WaterClimateSeries } from '../services/nasaPowerWater'
const period = { start: '2025-07-01', end: '2025-07-02' }
const series: WaterClimateSeries = { ...period, retrievedAt: '2026-01-01', days: [{ date: period.start, precipitationMm: 0, eto: { status: 'ok', mmPerDay: 4, warnings: [] } }, { date: period.end, precipitationMm: 0, eto: { status: 'ok', mmPerDay: 5, warnings: [] } }] }
describe('complete period water evidence', () => {
  it('sums complete ETo while preserving unknown suitability', () => { expect(summarizeWaterClimate(demoFields[0], period, series)).toMatchObject({ etoMm: 9, etcMm: null, appliedMm: null, waterSuitability: 'unknown' }) })
  it('withholds a total for a failed day', () => {
    const partial = structuredClone(series); partial.days[1].eto = { status: 'insufficient_data', reason: 'Unsupported radiation' }
    expect(summarizeWaterClimate(demoFields[0], period, partial)).toMatchObject({ etoMm: null, availableEtoDays: 1 })
  })
  it('rejects omitted, duplicate and mismatched days', () => {
    for (const days of [series.days.slice(0, 1), [series.days[0], series.days[0]]]) expect(summarizeWaterClimate(demoFields[0], period, { ...series, days }).etoMm).toBeNull()
    expect(summarizeWaterClimate(demoFields[0], period, { ...series, start: '2025-06-30' }).etoMm).toBeNull()
  })
})
