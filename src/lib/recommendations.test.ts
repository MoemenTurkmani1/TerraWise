import { describe, expect, it } from 'vitest'
import { demoClimate as simulatedClimate, demoFields as sampleFields } from '../test/fixtures'
import { assessCrops, assessEligibility, buildRotation, buildRotationAlternatives, rankCrops } from './recommendations'
import { compareEvidence, constraintDecision, evaluateConstraint, rankEligible } from './constraints'
import { historySerial, sortedHistory } from './history'
import { isAnalysisRecord } from '../types/analysis'
import type { Recommendation } from '../types'

// Synthetic inputs are restricted to tests and are never application data.
const climate = { ...simulatedClimate, source: 'nasa-power' as const }
const field = { ...sampleFields[0], reviewedRealData: true }
const profile = () => assessCrops(field, climate, 'Spring')[0]

describe('unknown evidence and exploratory profiles', () => {
  it('withholds overall scores and ranked crops when water and reviewed rules are unknown', () => {
    expect(rankCrops(field, climate, 'Spring')).toEqual([])
    const profiles = assessCrops(field, climate, 'Spring')
    expect(profiles).toHaveLength(8)
    expect(profiles.map(item => item.crop.name)).toEqual([...profiles.map(item => item.crop.name)].sort((a, b) => a.localeCompare(b)))
    for (const item of profiles) {
      expect(item.score).toBeNull()
      expect(item.decision).toBe('insufficient_evidence')
      expect(item.constraints?.every(constraint => constraint.status === 'unknown')).toBe(true)
      expect(item.confidence).toBe('low')
      expect(item.factors.find(factor => factor.name === 'Water fit')?.score).toBeNull()
      expect(item.missingInputs).toContain('Effective rainfall, irrigation volume and crop water requirement')
    }
  })

  it('leaves missing pH, NPK and history unknown rather than assuming zero', () => {
    const missing = { ...field, soil: { ph: null, nitrogen: null, phosphorus: null, potassium: null, organicMatter: null }, previousCrops: [] }
    const item = assessCrops(missing, climate)[0]
    for (const name of ['Soil pH', 'Nutrient fit', 'Water fit', 'Rotation fit']) expect(item.factors.find(f => f.name === name)?.score).toBeNull()
    expect(item.missingInputs).toEqual(expect.arrayContaining(['Soil pH', 'Soil nitrogen', 'Soil phosphorus', 'Soil potassium', 'Soil organic matter', 'Recognized previous crop']))
    expect(item.completeness).toBe(13)
  })

  it('does not turn partial NPK measurements into a complete nutrient score', () => {
    const item = assessCrops({ ...field, soil: { ...field.soil, phosphorus: null } }, climate)[0]
    expect(item.factors.find(f => f.name === 'Nutrient fit')?.score).toBeNull()
    expect(item.missingInputs).toContain('Soil phosphorus')
  })

  it('distinguishes explicitly entered zeros from missing nutrients', () => {
    const item = assessCrops({ ...field, soil: { ...field.soil, nitrogen: 0, phosphorus: 0, potassium: 0 } }, climate)[0]
    expect(item.factors.find(f => f.name === 'Nutrient fit')?.score).toBe(0)
    expect(item.missingInputs).not.toContain('Soil nitrogen')
  })

  it('keeps water unknown for every qualitative irrigation category', () => {
    for (const water of ['rainfed', 'limited', 'reliable'] as const) {
      const factor = assessCrops({ ...field, water }, climate)[0].factors.find(f => f.name === 'Water fit')!
      expect(factor.score).toBeNull()
      expect(factor.explanation).toContain(water)
      expect(factor.explanation).toContain('unknown')
    }
  })

  it('reports completeness separately from confidence and includes unknown water', () => {
    expect(profile().completeness).toBe(88)
    expect(profile().confidence).toBe('low')
    const estimated = assessCrops({ ...field, soil: { ...field.soil, provenance: 'estimated' } }, climate)[0]
    expect(estimated.warnings.join(' ')).toContain('estimates')
  })

  it('withholds profiles for simulated, unavailable, incomplete or invalid climate and unreviewed old fields', () => {
    expect(assessCrops(field, simulatedClimate)).toEqual([])
    expect(assessCrops(field, { ...climate, source: 'unavailable' })).toEqual([])
    expect(assessCrops(field, { ...climate, monthly: [] })).toEqual([])
    expect(assessCrops(field, { ...climate, monthly: climate.monthly.map((m, i) => i ? m : { ...m, temperature: NaN }) })).toEqual([])
    expect(assessCrops(sampleFields[0], climate)).toEqual([])
  })

  it('changes an observed pH factor without manufacturing an overall ranking', () => {
    const good = assessCrops(field, climate).find(item => item.crop.id === 'chickpea')!
    const bad = assessCrops({ ...field, soil: { ...field.soil, ph: 4 } }, climate).find(item => item.crop.id === 'chickpea')!
    expect(bad.factors.find(f => f.name === 'Soil pH')!.score!).toBeLessThan(good.factors.find(f => f.name === 'Soil pH')!.score!)
    expect(good.score).toBeNull()
    expect(bad.score).toBeNull()
  })

  it('does not equate an illustrative calendar mismatch with verified incompatibility', () => {
    const tomato = assessCrops(field, climate, 'Autumn').find(item => item.crop.id === 'tomato')!
    expect(assessEligibility(tomato.crop, 'Autumn')).toMatchObject({ supported: true, status: 'unknown' })
    expect(tomato.constraints?.find(c => c.id === 'planting-window')?.status).toBe('unknown')
    expect(tomato.warnings.join(' ')).toContain('not a verified incompatibility')
  })

  it('does not mix preferences or absent profit estimates into physical suitability', () => {
    const item = assessCrops({ ...field, priorities: ['profitability'], budget: 'not modeled' }, climate)[0]
    expect(item.factors.find(f => f.name === 'Your priorities')?.score).toBeNull()
    expect(item.warnings.join(' ')).toContain('not calculated')
    expect(item.score).toBeNull()
  })

  it('compares actual factor evidence without asserting an unsupported rank', () => {
    const profiles = assessCrops(field, climate)
    const lines = compareEvidence(profiles[0], profiles[1])
    expect(lines[0]).toContain('ranking is unavailable')
    expect(lines.some(line => line.includes('Climate fit:'))).toBe(true)
    expect(lines.some(line => line.startsWith('Water fit:'))).toBe(false)
  })
})

describe('hard constraints and top-four contract', () => {
  const confirmed = (id: number, score: number): Recommendation => ({
    ...profile(), crop: { ...profile().crop, id: `synthetic-${id}`, name: `Synthetic ${id}` },
    score, factors: [{ name: 'Test-only factor', score, weight: 1, explanation: 'Synthetic test evidence.' }],
    constraints: [evaluateConstraint({ id: 'test', conclusion: 'compatible', explanation: 'Synthetic test only.', reviewedRuleId: 'test-only-reviewed-rule' })],
    decision: 'eligible',
  })

  it('leaves unreviewed claims unknown', () => {
    const result = evaluateConstraint({ id: 'x', conclusion: 'compatible', explanation: 'Unreviewed' })
    expect(result.status).toBe('unknown')
    expect(constraintDecision([result])).toBe('insufficient_evidence')
    expect(constraintDecision([])).toBe('insufficient_evidence')
  })

  it('lets a verified incompatible constraint veto a high score', () => {
    const pass = evaluateConstraint({ id: 'p', conclusion: 'compatible', explanation: 'Test', reviewedRuleId: 'test-only' })
    const fail = evaluateConstraint({ id: 'f', conclusion: 'incompatible', explanation: 'Test', reviewedRuleId: 'test-only' })
    expect(constraintDecision([pass, fail])).toBe('ineligible')
    expect(rankEligible([{ ...confirmed(1, 100), constraints: [pass, fail] }])).toEqual([])
  })

  it('rejects unreviewed claims of compatible or incompatible', () => {
    expect(constraintDecision([{ id: 'x', status: 'compatible', explanation: 'No review' }])).toBe('insufficient_evidence')
    expect(constraintDecision([{ id: 'x', status: 'incompatible', explanation: 'No review' }])).toBe('insufficient_evidence')
    expect(constraintDecision([{ id: '', status: 'compatible', explanation: 'Test', reviewedRuleId: 'test-only' }])).toBe('insufficient_evidence')
    expect(rankEligible([{ ...confirmed(1, 80), decision: 'insufficient_evidence' }])).toEqual([])
  })

  it('returns at most four comparable candidates with deterministic ties', () => {
    const input = [confirmed(1, 80), confirmed(2, 90), confirmed(3, 70), confirmed(4, 90), confirmed(5, 60)]
    expect(rankEligible(input).map(item => item.crop.name)).toEqual(['Synthetic 2', 'Synthetic 4', 'Synthetic 1', 'Synthetic 3'])
    expect(rankEligible(input.slice(0, 2))).toHaveLength(2)
    expect(compareEvidence(input[1], input[0])[0]).toContain('ranks above')
  })

  it('excludes incomplete evidence and refuses mixed factors or inconsistent scores', () => {
    const good = confirmed(1, 80)
    expect(rankEligible([{ ...good, factors: [{ ...good.factors[0], score: null }] }])).toEqual([])
    expect(rankEligible([{ ...good, score: null }])).toEqual([])
    expect(rankEligible([{ ...good, score: 100 }])).toEqual([])
    const different = { ...confirmed(2, 70), factors: [{ ...good.factors[0], name: 'Different', score: 70 }] }
    expect(rankEligible([good, different])).toEqual([])
    expect(compareEvidence(good, different)[0]).toContain('not comparable')
  })
})

describe('exploratory rotations and snapshots', () => {
  it('keeps chronological history and makes unranked scenarios without mutating inputs', () => {
    const before = structuredClone(field)
    const plan = buildRotation(field, climate)
    expect(plan.map(step => `${step.season} ${step.year}`)).toEqual(['Autumn 2026', 'Spring 2027', 'Autumn 2027', 'Spring 2028'])
    expect(plan.every(step => step.recommendation.score === null)).toBe(true)
    expect(field).toEqual(before)
    expect(buildRotationAlternatives(field, climate, 3).length).toBeGreaterThanOrEqual(2)
  })

  it('bounds scenario lengths and starts after latest history', () => {
    expect(buildRotation(field, climate, 0)).toEqual([])
    expect(buildRotation(field, climate, Number.NaN)).toEqual([])
    expect(buildRotation(field, climate, 100)).toHaveLength(8)
    const future = { ...field, previousCrops: [{ cropId: 'tomato', season: 'Autumn', year: 2028 }] }
    expect(buildRotation(future, climate, 2).map(step => `${step.season} ${step.year}`)).toEqual(['Spring 2029', 'Autumn 2029'])
  })

  it('orders all four history seasons using the start-of-year Winter convention', () => {
    const history = ['Summer', 'Winter', 'Spring', 'Autumn'].map(season => ({ cropId: 'wheat', season, year: 2026 }))
    expect(sortedHistory(history).map(entry => entry.season)).toEqual(['Autumn', 'Summer', 'Spring', 'Winter'])
    expect(historySerial({ season: 'Autumn', year: 2026 })).toBeLessThan(historySerial({ season: 'Winter', year: 2027 }))
  })

  it('accepts both new unknown scores and old numeric snapshots without rewriting them', () => {
    const item = profile()
    const base = { id: 'test', createdAt: '2026-01-01T00:00:00Z', field, climate, season: 'Spring', recommendations: [item], modelVersion: 'terrawise-evidence-v2.0' }
    expect(isAnalysisRecord(base)).toBe(true)
    const legacy = { ...base, modelVersion: 'terrawise-heuristic-v1.2', recommendations: [{ ...item, score: 61, factors: item.factors.map(f => ({ ...f, score: f.score ?? 0 })), constraints: undefined, decision: undefined }] }
    expect(isAnalysisRecord(legacy)).toBe(true)
    expect(legacy.recommendations[0].score).toBe(61)
  })
})

