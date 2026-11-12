import { describe, expect, it } from 'vitest'
import { screenBekaaWheat, waterEvidence } from './localSeason'
import { demoClimate, demoFields } from '../test/fixtures'
import type { ClimateData } from '../types'

// Synthetic values only; not NASA data or soil measurements.
const field = { ...demoFields[0], reviewedRealData: true, soil: { ...demoFields[0].soil, ph: 6.5 } }
const months = demoClimate.monthly.map(month => ({ ...month, temperature: 20, rainfall: 5 }))
const climate: ClimateData = {
  ...demoClimate, source: 'nasa-power', year: 2025, monthly: months,
  history: [{ year: 2024, monthly: months }, { year: 2025, monthly: months }],
  provenance: { provider: 'NASA POWER', coordinates: { latitude: field.latitude, longitude: field.longitude }, period: { start: '2024-01-01', end: '2025-12-31' }, retrievedAt: '2026-01-01T00:00:00Z', quality: 'complete', missing: [], cache: 'fresh', parameters: [{ code: 'T2M', unit: '°C', sourceUnit: 'C' }, { code: 'PRECTOTCORR', unit: 'mm/month', sourceUnit: 'mm/day' }] },
}

describe('Bekaa wheat historical reference', () => {
  it('uses November–December of the preceding year and January–June of the next', () => {
    const result = screenBekaaWheat(field, climate, 'Autumn')
    expect(result.period).toEqual({ start: '2024-11-01', end: '2025-06-30' })
    expect(result.screen.ranked.map(item => item.crop.id)).toEqual(['wheat'])
    expect(result.screen.ranked[0].warnings.join(' ')).toContain('winter dormancy')
    expect(result.water.rainfallMm).toBe(40)
    expect(result.water).toMatchObject({ effectiveRainfallMm: null, cropDemandMm: null, irrigationSupplyMm: null, waterFit: 'unknown' })
  })
  it('treats a spring selection as outside the study reference, not verified incompatibility', () => {
    const result = screenBekaaWheat(field, climate, 'Spring')
    expect(result.screen.ranked).toEqual([])
    expect(result.screen.unavailable.join(' ')).toContain('not a verified incompatibility')
    expect(result.period).toBeNull()
  })
  it('rejects missing years, mismatched location, missing pH, and simulated data', () => {
    expect(screenBekaaWheat(field, { ...climate, history: undefined }, 'Autumn').screen.ranked).toEqual([])
    expect(screenBekaaWheat({ ...field, latitude: field.latitude + 1 }, climate, 'Autumn').screen.ranked).toEqual([])
    expect(screenBekaaWheat({ ...field, soil: { ...field.soil, ph: null } }, climate, 'Autumn').screen.ranked).toEqual([])
    expect(screenBekaaWheat(field, { ...climate, source: 'demo' }, 'Autumn').screen.ranked).toEqual([])
  })
  it('excludes documented pH and temperature screen boundaries without claiming certainty', () => {
    const phBoundary = screenBekaaWheat({ ...field, soil: { ...field.soil, ph: 5.5 } }, climate, 'Autumn')
    expect(phBoundary.screen.excluded[0].crop.id).toBe('wheat')
    const earlier = months.map((month, i) => i === 10 ? { ...month, temperature: 6 } : month)
    const cold = screenBekaaWheat(field, { ...climate, history: [{ year: 2024, monthly: earlier }, { year: 2025, monthly: months }] }, 'Autumn')
    expect(cold.screen.excluded[0].reasons.join(' ')).toContain('Nov')
  })
  it('describes wet, dry, zero and missing rainfall without converting them to water fit', () => {
    const dry = waterEvidence(months.slice(0, 8).map(month => ({ ...month, rainfall: 0 })))
    const wet = waterEvidence(months.slice(0, 8).map(month => ({ ...month, rainfall: 100 })))
    const missing = waterEvidence([months[0], undefined])
    expect(dry.rainfallMm).toBe(0)
    expect(wet.rainfallMm).toBe(800)
    expect(missing.rainfallMm).toBeNull()
    for (const value of [dry, wet, missing]) expect(value).toMatchObject({ waterFit: 'unknown', effectiveRainfallMm: null, referenceEtMm: null, cropDemandMm: null, irrigationSupplyMm: null })
  })
  it('does not infer irrigation supply from rainfed, limited, or reliable categories', () => {
    for (const water of ['rainfed', 'limited', 'reliable'] as const) {
      const result = screenBekaaWheat({ ...field, water }, climate, 'Autumn')
      expect(result.water.irrigationSupplyMm).toBeNull()
      expect(result.water.waterFit).toBe('unknown')
    }
  })
  it('does not let wet or dry precipitation silently alter a two-factor score', () => {
    const variant = (rainfall: number): ClimateData => ({ ...climate, history: climate.history!.map(year => ({ ...year, monthly: year.monthly.map(month => ({ ...month, rainfall })) })) })
    const dry = screenBekaaWheat(field, variant(0), 'Autumn')
    const wet = screenBekaaWheat(field, variant(100), 'Autumn')
    expect(dry.screen.ranked[0].score).toBe(wet.screen.ranked[0].score)
    expect(dry.water.rainfallMm).toBe(0)
    expect(wet.water.rainfallMm).toBe(800)
    expect(dry.water.waterFit).toBe('unknown')
    expect(wet.water.waterFit).toBe('unknown')
  })
})
