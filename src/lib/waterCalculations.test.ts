import { describe, expect, it } from 'vitest'
import { fao56DailyEto } from './fao56'
import { completeGrowthProfile, cropKcOnDate, standardCropEt } from './cropWater'
import { evaluateWaterBalance, totalAvailableWater, type WaterBalanceInputs } from './waterBalance'
import { cropWaterReferences } from '../data/cropWaterRequirements'
import { parseWaterClimate, waterPowerUrl } from '../services/nasaPowerWater'
import { isField } from '../services/repository'
import { demoFields } from '../test/fixtures'

// FAO-56 chapter 4, example 18, Uccle on 6 July. Published demonstration
// inputs only, not NASA or a farmer's field: https://www.fao.org/4/x0490e/x0490e08.htm
const faoExample = { date: '2001-07-06', latitudeDeg: 50.8, elevationM: 100, minC: 12.3, maxC: 21.5, actualVapourKpa: 1.409, wind2mMs: 2.08, pressureKpa: 100.1, solarMjM2Day: 22.07 }

describe('FAO-56 reference evapotranspiration', () => {
  it('reproduces published FAO example 18 within rounding tolerance', () => {
    const result = fao56DailyEto(faoExample)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.mmPerDay).toBeCloseTo(3.88, 1)
  })
  it('does not substitute missing inputs or accept inconsistent data', () => {
    for (const input of [{ ...faoExample, elevationM: null }, { ...faoExample, wind2mMs: null }, { ...faoExample, minC: 30 }, { ...faoExample, actualVapourKpa: 20 }, { ...faoExample, date: '2025-02-29' }]) {
      expect(fao56DailyEto(input).status).toBe('insufficient_data')
    }
  })
})

const growth = { cropId: 'wheat', plantedOn: '2025-01-01', source: 'Synthetic test source', initialDays: 2, developmentDays: 2, midDays: 2, lateDays: 2, kcInitial: 0.4, kcMid: 1.2, kcEnd: 0.6 }
describe('stage-aware crop demand', () => {
  it('interpolates an explicitly supplied Kc curve and computes standard ETc', () => {
    expect(cropKcOnDate(growth, '2025-01-01')).toBe(0.4)
    expect(cropKcOnDate(growth, '2025-01-03')).toBeCloseTo(0.8)
    expect(cropKcOnDate(growth, '2025-01-04')).toBeCloseTo(1.2)
    expect(cropKcOnDate(growth, '2025-01-08')).toBeCloseTo(0.6)
    expect(cropKcOnDate(growth, '2025-01-09')).toBeNull()
    expect(standardCropEt(4, 1.2)).toBeCloseTo(4.8)
  })
  it('withholds demand for unknown Kc, source, stage or ETo', () => {
    expect(cropKcOnDate({ ...growth, source: '' }, '2025-01-01')).toBeNull()
    expect(completeGrowthProfile({ ...growth, kcMid: null })).toBeNull()
    expect(standardCropEt(null, 1)).toBeNull()
    expect(standardCropEt(0, 1)).toBe(0)
    expect(cropWaterReferences.wheat.kcInitial).toEqual([0.4, 0.7])
    expect(cropWaterReferences.tomato).toBeUndefined()
  })
})

const balance: WaterBalanceInputs = { previousDepletionMm: 20, totalAvailableWaterMm: 100, rainfallMm: 10, runoffMm: 2, netIrrigationMm: 0, capillaryRiseMm: 0, actualEtMm: 5, deepPercolationMm: 0, allowableDepletionFraction: 0.5, thresholdSource: 'Synthetic test source' }
describe('explicit-input FAO-56 root-zone balance', () => {
  it('calculates total available water only from complete volumetric inputs', () => {
    expect(totalAvailableWater(30, 10, 1)).toBeCloseTo(200)
    expect(totalAvailableWater(30, null, 1)).toBeNull()
    expect(totalAvailableWater(10, 30, 1)).toBeNull()
  })
  it('distinguishes a supplied threshold crossing and its boundary', () => {
    expect(evaluateWaterBalance(balance)).toMatchObject({ status: 'assessed', depletionMm: 17, assessment: 'within_supplied_threshold' })
    expect(evaluateWaterBalance({ ...balance, previousDepletionMm: 53 })).toMatchObject({ status: 'assessed', depletionMm: 50, assessment: 'within_supplied_threshold' })
    expect(evaluateWaterBalance({ ...balance, previousDepletionMm: 54 })).toMatchObject({ status: 'assessed', depletionMm: 51, assessment: 'above_supplied_threshold' })
  })
  it('requires every flux and does not equate rainfall with effective rain or irrigation', () => {
    expect(evaluateWaterBalance({ ...balance, netIrrigationMm: null }).status).toBe('insufficient_data')
    expect(evaluateWaterBalance({ ...balance, actualEtMm: null }).status).toBe('insufficient_data')
    expect(evaluateWaterBalance({ ...balance, thresholdSource: '' }).status).toBe('insufficient_data')
    expect(evaluateWaterBalance({ ...balance, runoffMm: 11 }).status).toBe('insufficient_data')
    expect(evaluateWaterBalance({ ...balance, previousDepletionMm: 0, rainfallMm: 100 }).status).toBe('insufficient_data')
  })
})

const response = {
  header: { fill_value: -999 },
  parameters: { T2M_MIN: { units: 'C' }, T2M_MAX: { units: 'C' }, T2MDEW: { units: 'C' }, WS2M: { units: 'm/s' }, PS: { units: 'kPa' }, ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day' }, PRECTOTCORR: { units: 'mm/day' } },
  properties: { parameter: { T2M_MIN: { '20010706': 12.3 }, T2M_MAX: { '20010706': 21.5 }, T2MDEW: { '20010706': 12 }, WS2M: { '20010706': 2.08 }, PS: { '20010706': 100.1 }, ALLSKY_SFC_SW_DWN: { '20010706': 22.07 }, PRECTOTCORR: { '20010706': 0 } } },
}
describe('NASA daily water data', () => {
  it('requests required quantities and calculates only from complete supported units', () => {
    expect(new URL(waterPowerUrl(50.8, 4.3, '2001-07-06', '2001-07-06')).searchParams.get('parameters')).toContain('WS2M')
    const result = parseWaterClimate(response, 50.8, 100, '2001-07-06', '2001-07-06', '2026-01-01T00:00:00Z')
    expect(result.days[0].precipitationMm).toBe(0)
    expect(result.days[0].eto.status).toBe('ok')
    expect(parseWaterClimate(response, 50.8, null, '2001-07-06', '2001-07-06', 'x').days[0].eto.status).toBe('insufficient_data')
  })
  it('rejects missing observations and unsupported units instead of guessing', () => {
    const missing = structuredClone(response); delete (missing.properties.parameter.WS2M as Record<string, number>)['20010706']
    expect(() => parseWaterClimate(missing, 50.8, 100, '2001-07-06', '2001-07-06', 'x')).toThrow(/WS2M/)
    const invalid = structuredClone(response); invalid.parameters.PS.units = 'Pa'
    expect(() => parseWaterClimate(invalid, 50.8, 100, '2001-07-06', '2001-07-06', 'x')).toThrow(/units/)
  })
})

describe('optional farmer water inputs', () => {
  it('preserves older fields and validates structured new values', () => {
    const field = demoFields[0]
    expect(isField(field)).toBe(true)
    const waterInputs = { fieldCapacityPercent: 30, wiltingPointPercent: 10, rootDepthM: 1, initialDepletionMm: null, scheduleKind: 'actual' as const, scheduleStart: '2025-01-01', scheduleEnd: '2025-01-31', irrigationEvents: [{ date: '2025-01-10', appliedMm: 0 }], growth }
    expect(isField({ ...field, waterInputs })).toBe(true)
    expect(isField({ ...field, waterInputs: { ...waterInputs, wiltingPointPercent: 40 } })).toBe(false)
  })
})
