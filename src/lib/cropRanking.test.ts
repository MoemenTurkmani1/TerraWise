import { describe, expect, it } from 'vitest'
import { createDemoWorkspace, demoClimateFor } from '../data/demo'
import { screenCrops } from './ecologicalScreen'
import { rankCrops } from './recommendations'
import { crops } from '../data/crops'
const field = createDemoWorkspace('north').fields[0]
const testField = { ...field, soil: { ...field.soil, ph: 6.5 } }
const climate = { ...demoClimateFor(testField), monthly: demoClimateFor(testField).monthly.map(month => ({ ...month, temperature: 20 })) }
describe('complete catalog crop ranking', () => {
  it.each(crops.map(crop => crop.id))('computes %s from unchanged source ranges', id => {
    const crop = screenCrops(testField, climate, 'Spring', 8).ranked.find(item => item.crop.id === id)!
    expect(crop).toBeDefined()
    expect(crop.score).toBe(id === 'potato' ? 87 : 100)
    expect(crop.phScore).toBe(id === 'potato' ? 87 : 100)
    expect(crop.temperatureScore).toBe(100)
  })
  it('returns all passing crops sorted descending and alphabetical on ties', () => {
    const full = screenCrops(testField, climate, 'Spring', 8)
    expect(full.ranked.map(item => item.crop.id)).toEqual(['barley','chickpea','wheat','fava','lentil','sunflower','tomato','potato'])
    expect(screenCrops(testField, climate, 'Spring').ranked).toEqual(full.ranked.slice(0, 4))
    expect(full.ranked.every((item,i,all) => !i || all[i-1].score >= item.score)).toBe(true)
    expect(rankCrops(testField, climate, 'Spring')).toEqual([])
  })
  it('recomputes after pH edits and accounts for all excluded crops', () => {
    const result = screenCrops({ ...testField, soil: { ...testField.soil, ph: 9 } }, climate, 'Spring', 8)
    expect(result.ranked.map(item => item.crop.id)).toEqual(['chickpea'])
    expect(result.excluded).toHaveLength(7)
  })
  it.each([null, NaN, Infinity, -1, 15])('withholds scores for invalid pH %s', ph => {
    const result = screenCrops({ ...testField, soil: { ...testField.soil, ph } }, climate, 'Spring', 8)
    expect(result.unavailable.length).toBeGreaterThan(0)
    expect(result.ranked).toEqual([])
  })
  it('withholds scores for wrong coordinates and missing or malformed temperatures', () => {
    expect(screenCrops({ ...testField, latitude: 10 }, climate, 'Spring', 8).ranked).toEqual([])
    for (const monthly of [[], climate.monthly.slice(1), [...climate.monthly].reverse(), climate.monthly.map((m,i) => i === 0 ? { ...m, temperature: NaN } : m)]) expect(screenCrops(testField, { ...climate, monthly }, 'Spring', 8).ranked).toEqual([])
  })
})
