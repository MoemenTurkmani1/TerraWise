import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoWorkspace, demoClimateFor, demoDailyExtremes, demoWaterClimate, tagDemoField } from '../data/demo'
import { DEMO_ACTIVE_KEY, DEMO_FARM_IDS, assertRealData, demoWorkspaceKey } from '../lib/demoSession'
import { hasSyntheticClimate } from '../lib/demoEvidence'
import { hasTraceableClimate } from '../lib/analysisEvidence'
import { screenCrops } from '../lib/ecologicalScreen'
import { assessCrops, buildRotation, rankCrops } from '../lib/recommendations'
import { completeGrowthProfile, cropKcOnDate, standardCropEt } from '../lib/cropWater'
import { totalAvailableWater } from '../lib/waterBalance'
import { isAnalysisRecord } from '../types/analysis'
import { fieldRepository, isField } from './repository'
import { readDemoWorkspace, resetDemoStorage, validateDemoWorkspace, writeDemoWorkspace } from './demoWorkspace'
const remote = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: remote.from }, supabaseConfigurationError: null }))
import { readRemoteWorkspace, writeRemoteWorkspace } from './supabaseWorkspace'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  key(index: number) { return [...this.data.keys()][index] ?? null }
}
beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); remote.from.mockClear() })
afterEach(() => vi.unstubAllGlobals())

describe('isolated demo fixtures and persistence', () => {
  it.each(DEMO_FARM_IDS)('%s seeds complete usable records with synthetic provenance and engine-derived unknown suitability', farm => {
    const data = createDemoWorkspace(farm)
    expect(validateDemoWorkspace(data, farm)).toBe(true)
    expect(data.fields).toHaveLength(2)
    expect(data.fields.every(isField)).toBe(true)
    expect(data.analysisRecords).toHaveLength(2)
    expect(data.analysisRecords.every(isAnalysisRecord)).toBe(true)
    for (const field of data.fields) {
      expect(field.name).toMatch(/^DEMO/)
      const climate = demoClimateFor(field)
      expect(hasSyntheticClimate(field, climate)).toBe(true)
      expect(hasTraceableClimate(field, climate)).toBe(false)
      expect(climate.provenance).toBeUndefined()
      const profiles = assessCrops(field, climate)
      expect(profiles).toHaveLength(8)
      expect(profiles.every(item => item.score === null && item.decision === 'insufficient_evidence' && item.factors.find(f => f.name === 'Water fit')?.score === null)).toBe(true)
      expect(rankCrops(field, climate)).toEqual([])
      const plan = buildRotation(field, climate)
      expect(plan).toHaveLength(4)
      expect(plan.every(step => step.recommendation.dataSource === 'demo')).toBe(true)
    }
  })
  it('persists independent farm changes and leaves source fixtures and real storage untouched', () => {
    localStorage.setItem('terrawise.fields.v1', '[]')
    localStorage.setItem('sb-real-auth-token', 'keep-token')
    const data = createDemoWorkspace('bekaa')
    data.fields[0].soil.ph = 6.4
    writeDemoWorkspace(localStorage, 'bekaa', data)
    expect(readDemoWorkspace(localStorage, 'bekaa').fields[0].soil.ph).toBe(6.4)
    expect(createDemoWorkspace('bekaa').fields[0].soil.ph).toBe(7.7)
    expect(readDemoWorkspace(localStorage, 'north').fields[0].soil.ph).toBe(7.1)
    expect(localStorage.getItem('terrawise.fields.v1')).toBe('[]')
    expect(localStorage.getItem('sb-real-auth-token')).toBe('keep-token')
  })
  it('reset removes only demo workspaces and demo drafts', () => {
    for (const id of DEMO_FARM_IDS) writeDemoWorkspace(localStorage, id, createDemoWorkspace(id))
    localStorage.setItem('terrawise.preferences', 'real-preferences')
    localStorage.setItem('sb-real-auth-token', 'real-session')
    sessionStorage.setItem('terrawise.field-draft.v1:new', 'real-draft')
    sessionStorage.setItem('terrawise.demo.draft.v1:bekaa:new', 'demo-draft')
    sessionStorage.setItem(DEMO_ACTIVE_KEY, 'bekaa')
    resetDemoStorage(localStorage, sessionStorage)
    expect(localStorage.length).toBe(2)
    expect(sessionStorage.getItem('terrawise.field-draft.v1:new')).toBe('real-draft')
    expect(sessionStorage.getItem(DEMO_ACTIVE_KEY)).toBe('bekaa')
    expect(sessionStorage.getItem('terrawise.demo.draft.v1:bekaa:new')).toBeNull()
    expect(readDemoWorkspace(localStorage, 'coast').fields).toHaveLength(2)
  })
  it('rejects corrupt or cross-farm storage rather than overwriting it', () => {
    localStorage.setItem(demoWorkspaceKey('bekaa'), '{"broken":true}')
    expect(() => readDemoWorkspace(localStorage, 'bekaa')).toThrow(/invalid/)
    expect(localStorage.getItem(demoWorkspaceKey('bekaa'))).toBe('{"broken":true}')
    expect(() => writeDemoWorkspace(localStorage, 'bekaa', createDemoWorkspace('north'))).toThrow(/synthetic/)
    const data = createDemoWorkspace('bekaa')
    data.analysisRecords[0].recommendations[0].score = 99
    expect(validateDemoWorkspace(data, 'bekaa')).toBe(false)
  })
  it('permanently labels newly entered or edited demo inputs', () => {
    const field = createDemoWorkspace('north').fields[0]
    const tagged = tagDemoField({ ...field, name: 'Edited name', dataClassification: undefined, soil: { ...field.soil, provenance: 'measured' } }, 'north')
    expect(tagged.name).toBe('DEMO · Edited name')
    expect(tagged.soil.provenance).toBe('synthetic')
    expect(() => assertRealData(tagged)).toThrow(/cannot be saved/)
    expect(() => fieldRepository.saveAll([tagged])).toThrow(/cannot be saved/)
  })
  it.each(DEMO_FARM_IDS)('blocks both remote write paths for %s even outside Demo Mode', async farm => {
    const workspace = createDemoWorkspace(farm)
    await expect(writeRemoteWorkspace('real-owner', workspace, 0)).rejects.toThrow(/cannot be saved/)
    await expect(writeRemoteWorkspace('real-owner', workspace, 4)).rejects.toThrow(/cannot be saved/)
    expect(remote.from).not.toHaveBeenCalled()
  })
  it('blocks remote reads and writes during an active demo session', async () => {
    sessionStorage.setItem(DEMO_ACTIVE_KEY, 'bekaa')
    await expect(readRemoteWorkspace('real-owner')).rejects.toThrow(/cannot access/)
    await expect(writeRemoteWorkspace('real-owner', createDemoWorkspace('bekaa'), 0)).rejects.toThrow(/cannot access/)
    expect(remote.from).not.toHaveBeenCalled()
  })
  it('rejects nested synthetic copies, including an empty marked workspace', () => {
    expect(() => assertRealData({ dataClassification: 'demo-synthetic', fields: [] })).toThrow()
    expect(() => assertRealData({ analysisRecords: [createDemoWorkspace('north').analysisRecords[0]] })).toThrow()
    expect(() => assertRealData({ soil: { provenance: 'synthetic' } })).toThrow()
  })
})

describe('existing scientific engines with explicit synthetic inputs', () => {
  it('calculates a limiting-factor screen rather than assigning fixture scores', () => {
    const field = createDemoWorkspace('north').fields[0]
    const result = screenCrops(field, demoClimateFor(field), 'Spring')
    // Sunflower pH 7.1 is optimal; March 14°C gives (14 - 5) / (17 - 5) = 0.75.
    const sunflower = result.ranked.find(item => item.crop.id === 'sunflower')
    expect(sunflower?.score).toBe(75)
    expect(sunflower?.confidence).toBe('low')
    expect(sunflower?.warnings.join(' ')).toMatch(/SYNTHETIC/)
    const changed = { ...field, soil: { ...field.soil, ph: 4 } }
    expect(screenCrops(changed, demoClimateFor(changed), 'Spring').ranked).toEqual([])
  })
  it('requires pH, complete temperatures and exact-location fixture metadata', () => {
    const field = createDemoWorkspace('coast').fields[0], climate = demoClimateFor(field)
    expect(screenCrops({ ...field, soil: { ...field.soil, ph: null } }, climate, 'Spring').ranked).toEqual([])
    const missing = structuredClone(climate); missing.monthly.pop()
    expect(screenCrops(field, missing, 'Spring').ranked).toEqual([])
    expect(screenCrops({ ...field, latitude: field.latitude + 1 }, climate, 'Spring').ranked).toEqual([])
    expect(screenCrops({ ...field, dataClassification: undefined }, climate, 'Spring').ranked).toEqual([])
    expect(screenCrops(field, { ...climate, fixture: undefined }, 'Spring').ranked).toEqual([])
  })
  it.each(DEMO_FARM_IDS)('%s computes daily FAO-56 ETo and sourced stage-dependent ETc', farm => {
    const field = createDemoWorkspace(farm).fields[0]
    const input = field.waterInputs!, growth = completeGrowthProfile(input.growth)!
    const daily = demoWaterClimate(field, input.scheduleStart, input.scheduleEnd)
    expect(daily.days.length).toBe(farm === 'bekaa' ? 240 : 145)
    expect(daily.days.every(day => day.eto.status === 'ok')).toBe(true)
    expect(cropKcOnDate(growth, growth.plantedOn)).toBe(farm === 'bekaa' ? 0.7 : 0.6)
    const day = daily.days[0]
    if (day.eto.status !== 'ok') throw new Error('ETo missing')
    expect(standardCropEt(day.eto.mmPerDay, cropKcOnDate(growth, day.date))).toBeCloseTo(day.eto.mmPerDay * (farm === 'bekaa' ? 0.7 : 0.6), 10)
    expect(growth.source).toContain('fao.org/4/X0490E')
    expect(totalAvailableWater(input.fieldCapacityPercent, input.wiltingPointPercent, input.rootDepthM)).toBeGreaterThan(0)
    expect(daily.days.reduce((sum, day) => sum + (day.eto.status === 'ok' ? day.eto.mmPerDay : 0), 0)).toBeGreaterThan(100)
  })
  it('keeps missing elevation, stages, Kc, and soil capacity unknown', () => {
    const field = createDemoWorkspace('coast').fields[1]
    const daily = demoWaterClimate(field, '2025-04-01', '2025-04-05')
    expect(daily.days.every(day => day.eto.status === 'insufficient_data')).toBe(true)
    expect(completeGrowthProfile(field.waterInputs?.growth)).toBeNull()
    expect(standardCropEt(4, null)).toBeNull()
    expect(totalAvailableWater(null, 10, 0.6)).toBeNull()
    expect(screenCrops(field, demoClimateFor(field), 'Autumn').ranked).toEqual([])
    const profile = completeGrowthProfile(createDemoWorkspace('bekaa').fields[0].waterInputs?.growth)!
    expect(cropKcOnDate(profile, '1900-01-01')).toBeNull()
    expect(cropKcOnDate({ ...profile, kcMid: NaN }, profile.plantedOn)).toBeNull()
  })
  it('daily extrema are reproducible test context and respect valid period bounds', () => {
    const field = createDemoWorkspace('bekaa').fields[0]
    const result = demoDailyExtremes(field, '2025-01-01', '2025-01-10')
    expect(result.freezingDays).toBeGreaterThan(0)
    expect(result.coldest.celsius).toBeLessThan(result.hottest.celsius)
    expect(() => demoWaterClimate(field, '2025-02-30', '2025-03-01')).toThrow()
    expect(() => demoWaterClimate(field, '2024-01-01', '2025-12-31')).toThrow()
  })
})
