import { describe, expect, it } from 'vitest'
import { ecologicalMembership, screenCrops } from './ecologicalScreen'
import { rankCrops } from './recommendations'
import { demoClimate, demoFields } from '../test/fixtures'
import type { ClimateData } from '../types'

// Test values are synthetic fixtures, not NASA observations or soil tests.
const field = { ...demoFields[0], reviewedRealData: true, soil: { ...demoFields[0].soil, ph: 6.5 } }
const climate: ClimateData = {
  ...demoClimate, source: 'nasa-power',
  monthly: demoClimate.monthly.map(month => ({ ...month, temperature: 20 })),
  provenance: { provider: 'NASA POWER', coordinates: { latitude: field.latitude, longitude: field.longitude }, parameters: [{ code: 'T2M', unit: '°C', sourceUnit: 'C' }], period: { start: '2025-01-01', end: '2025-12-31' }, retrievedAt: '2026-01-01T00:00:00Z', quality: 'complete', missing: [], cache: 'fresh' },
}

describe('FAO range membership', () => {
  const range = [4, 6, 8, 10] as const
  it('returns zero at and beyond absolute limits and one within optimal limits', () => {
    expect(ecologicalMembership(4, range)).toBe(0)
    expect(ecologicalMembership(10, range)).toBe(0)
    expect(ecologicalMembership(6, range)).toBe(1)
    expect(ecologicalMembership(8, range)).toBe(1)
    expect(ecologicalMembership(11, range)).toBe(0)
  })
  it('interpolates transitions and rejects invalid values and malformed ranges', () => {
    expect(ecologicalMembership(5, range)).toBeCloseTo(0.5)
    expect(ecologicalMembership(9, range)).toBeCloseTo(0.5)
    expect(ecologicalMembership(Number.NaN, range)).toBeNull()
    expect(ecologicalMembership(5, [4, 4, 8, 10])).toBeNull()
  })
})

describe('two-factor ECOCROP screen', () => {
  it('uses the limiting factor, sorts deterministically, and returns no more than four', () => {
    const result = screenCrops(field, climate, 'Spring')
    expect(result.unavailable).toEqual([])
    expect(result.ranked.map(item => item.crop.name)).toEqual(['Barley', 'Chickpea', 'Durum wheat', 'Fava bean'])
    expect(result.ranked.every(item => item.score === Math.min(item.phScore, item.temperatureScore) && item.confidence === 'low')).toBe(true)
    expect(rankCrops(field, climate, 'Spring')).toEqual([]) // Overall eligibility and water remain unknown.
  })
  it('excludes crops at the source range boundary without claiming locally verified incompatibility', () => {
    const result = screenCrops({ ...field, soil: { ...field.soil, ph: 8 } }, climate, 'Spring')
    expect(result.excluded.find(item => item.crop.id === 'barley')?.reasons.join(' ')).toContain('absolute range')
    expect(result.ranked.some(item => item.crop.id === 'barley')).toBe(false)
  })
  it('uses the least suitable of four monthly temperatures rather than the annual mean', () => {
    const altered = { ...climate, monthly: climate.monthly.map((month, index) => index === 2 ? { ...month, temperature: 5 } : month) }
    const result = screenCrops(field, altered, 'Spring')
    expect(result.excluded.find(item => item.crop.id === 'chickpea')?.reasons.join(' ')).toContain('Mar')
    expect(result.ranked.find(item => item.crop.id === 'barley')?.limitingMonth).toBe('Mar')
  })
  it('never ranks missing pH or unmatched, missing, invalid, and simulated climate', () => {
    expect(screenCrops({ ...field, soil: { ...field.soil, ph: null } }, climate, 'Spring').ranked).toEqual([])
    expect(screenCrops(field, { ...climate, source: 'demo' }, 'Spring').ranked).toEqual([])
    expect(screenCrops(field, { ...climate, provenance: undefined }, 'Spring').ranked).toEqual([])
    expect(screenCrops(field, { ...climate, provenance: { ...climate.provenance!, parameters: [] } }, 'Spring').ranked).toEqual([])
    expect(screenCrops({ ...field, latitude: field.latitude + 1 }, climate, 'Spring').ranked).toEqual([])
    expect(screenCrops(field, { ...climate, monthly: climate.monthly.slice(0, 11) }, 'Spring').ranked).toEqual([])
    expect(screenCrops(field, { ...climate, monthly: climate.monthly.map((m, i) => i === 2 ? { ...m, temperature: NaN } : m) }, 'Spring').ranked).toEqual([])
  })
  it('treats entered pH zero as a value and returns fewer when all crops fail the screen', () => {
    const result = screenCrops({ ...field, soil: { ...field.soil, ph: 0 } }, climate, 'Spring')
    expect(result.unavailable).toEqual([])
    expect(result.ranked).toEqual([])
    expect(result.excluded).toHaveLength(8)
  })
  it('returns only one candidate when only one passes the limited screen', () => {
    const result = screenCrops({ ...field, soil: { ...field.soil, ph: 9 } }, climate, 'Spring')
    expect(result.ranked.map(item => item.crop.id)).toEqual(['chickpea'])
    expect(result.excluded).toHaveLength(7)
  })
  it('discloses estimated pH, water uncertainty, and same-family rotation warning', () => {
    const result = screenCrops({ ...field, soil: { ...field.soil, provenance: 'estimated' }, previousCrops: [{ cropId: 'wheat', year: 2025, season: 'Autumn' }] }, climate, 'Spring')
    const barley = result.ranked.find(item => item.crop.id === 'barley')!
    expect(barley.warnings.join(' ')).toContain('farmer estimate')
    expect(barley.warnings.join(' ')).toContain('Water balance')
    expect(barley.warnings.join(' ')).toContain('same family')
  })
})
