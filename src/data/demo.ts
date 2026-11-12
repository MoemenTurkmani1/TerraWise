import type { ClimateData, ClimateMonth, Field, FieldWaterInputs } from '../types'
import type { WorkspaceData } from '../services/supabaseWorkspace'
import type { DemoFarmId } from '../lib/demoSession'
import { MODEL_VERSION, assessCrops, buildRotation } from '../lib/recommendations'
import { fao56DailyEto, saturationVapourPressure } from '../lib/fao56'
import { datesBetween } from '../services/nasaPowerDaily'
import type { WaterClimateSeries } from '../services/nasaPowerWater'

export const DEMO_NOTICE = 'DEMO / SYNTHETIC — fictional farms and inputs for software testing. Not measurements, NASA observations, or planting advice.'
export const FAO_KC_SOURCE = 'https://www.fao.org/4/X0490E/x0490e0b.htm'
export const demoFarms: readonly { id: DemoFarmId; name: string; description: string }[] = [
  { id: 'bekaa', name: 'Bekaa Valley · Wheat Farm', description: 'Cool inland upland, calcareous clay loam, winter wheat and pulses; limited irrigation.' },
  { id: 'north', name: 'North Lebanon · Mixed Vegetables', description: 'Milder northern plain, loam, tomato and potato history; drip irrigation.' },
  { id: 'coast', name: 'Coastal Lebanon · Sandy Farm', description: 'Warm humid coast, sandy loam, lower water holding capacity and a deliberately incomplete soil profile.' },
]
const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const temperatures: Record<DemoFarmId, number[]> = {
  bekaa: [4.5, 6, 10, 14.5, 19.5, 23.5, 26, 25.5, 22, 17, 10.5, 6],
  north: [10, 11, 14, 18, 22, 25.5, 28, 28, 25.5, 21, 16, 12],
  coast: [13, 14, 16, 19, 22.5, 25.5, 28, 28.5, 27, 23.5, 19, 15],
}
const rainfall: Record<DemoFarmId, number[]> = {
  bekaa: [100, 85, 65, 35, 15, 3, 0, 1, 7, 35, 65, 95],
  north: [140, 115, 90, 45, 18, 4, 1, 2, 12, 65, 100, 135],
  coast: [130, 105, 75, 35, 12, 2, 0, 1, 10, 60, 100, 125],
}
const solar = [2.4, 3.2, 4.4, 5.5, 6.6, 7.5, 7.8, 7.1, 5.9, 4.3, 3, 2.3]
function fixtureMonths(farm: DemoFarmId): ClimateMonth[] {
  return names.map((month, i) => ({ month, temperature: temperatures[farm][i], rainfall: rainfall[farm][i], solar: solar[i], humidity: (farm === 'coast' ? 73 : farm === 'north' ? 66 : 58) - (i > 3 && i < 9 ? 8 : 0) }))
}
/** Deterministic test scenarios. No NASA provenance is attached. */
export function demoClimateFor(field: Field, years = 1, endYear = new Date().getUTCFullYear() - 1): ClimateData {
  if (field.dataClassification !== 'demo-synthetic' || !field.demoFarmId) throw new Error('Synthetic climate requires a demo field.')
  if (!Number.isInteger(years) || years < 1 || years > 10 || !Number.isInteger(endYear) || endYear < 1984 || endYear >= new Date().getUTCFullYear()) throw new Error('Unsupported demo climate period.')
  const monthly = fixtureMonths(field.demoFarmId)
  return { source: 'demo', year: endYear, monthly,
    history: Array.from({ length: years }, (_, i) => ({ year: endYear - years + i + 1, monthly: structuredClone(monthly) })),
    fixture: { kind: 'synthetic-local-demo', version: 1, farmId: field.demoFarmId, coordinates: { latitude: field.latitude, longitude: field.longitude }, label: DEMO_NOTICE },
  }
}
export function tagDemoField(field: Field, farmId: DemoFarmId): Field {
  return { ...field, dataClassification: 'demo-synthetic', demoFarmId: farmId, reviewedRealData: false,
    name: field.name.startsWith('DEMO · ') ? field.name : `DEMO · ${field.name}`,
    soil: { ...field.soil, provenance: 'synthetic' }, soilReport: undefined }
}
function waterProfile(cropId: 'wheat' | 'tomato', plantedOn: string): FieldWaterInputs {
  const wheat = cropId === 'wheat'
  const total = wheat ? 240 : 145
  const end = new Date(Date.parse(`${plantedOn}T00:00:00Z`) + (total - 1) * 86400000).toISOString().slice(0, 10)
  return {
    fieldCapacityPercent: wheat ? 32 : 26, wiltingPointPercent: wheat ? 17 : 12, rootDepthM: wheat ? 1.1 : 0.7, initialDepletionMm: 25,
    scheduleKind: 'planned', scheduleStart: plantedOn, scheduleEnd: end,
    irrigationEvents: Array.from({ length: wheat ? 5 : 15 }, (_, i) => ({ date: new Date(Date.parse(`${plantedOn}T00:00:00Z`) + (wheat ? 90 + i * 28 : 8 + i * 9) * 86400000).toISOString().slice(0, 10), appliedMm: wheat ? 25 : 12 })),
    growth: { cropId, plantedOn, initialDays: 30, developmentDays: wheat ? 140 : 40, midDays: wheat ? 40 : 45, lateDays: 30,
      kcInitial: wheat ? 0.7 : 0.6, kcMid: 1.15, kcEnd: wheat ? 0.25 : 0.8,
      source: `DEMO assumptions: FAO-56 tables 11/12 ${FAO_KC_SOURCE}; ${wheat ? 'non-frozen winter wheat; dry harvest end 0.25' : 'Mediterranean tomato; selected end 0.8 within 0.7–0.9'}. Unadjusted reference, not locally calibrated.` },
  }
}
export function createDemoWorkspace(farmId: DemoFarmId): WorkspaceData {
  const year = new Date().getUTCFullYear() - 1
  const bekaa = farmId === 'bekaa', north = farmId === 'north'
  const location = bekaa ? 'Zahle vicinity, Bekaa Valley, Lebanon — SYNTHETIC' : north ? 'Akkar plain, North Lebanon — SYNTHETIC' : 'Damour vicinity, Coastal Lebanon — SYNTHETIC'
  const lat = bekaa ? 33.8467 : north ? 34.532 : 33.724
  const lon = bekaa ? 35.9019 : north ? 36.079 : 35.454
  const profile = waterProfile(bekaa ? 'wheat' : 'tomato', bekaa ? `${year - 1}-11-01` : `${year}-04-01`)
  if (farmId === 'coast') { profile.fieldCapacityPercent = 21; profile.wiltingPointPercent = 9; profile.rootDepthM = 0.6 }
  const base: Field = {
    id: `demo:${farmId}:main`, name: bekaa ? 'Wheat Terrace' : north ? 'Tomato Garden' : 'Coastal Tomato Plot', location,
    latitude: lat, longitude: lon, area: bekaa ? 4.8 : north ? 1.4 : 1.8, areaUnit: 'ha', country: 'Lebanon',
    elevationM: bekaa ? 920 : north ? 115 : 28, locationSource: 'manual', soilType: bekaa ? 'Calcareous clay loam' : north ? 'Alluvial loam' : 'Sandy loam',
    soil: { ph: bekaa ? 7.7 : north ? 7.1 : 7.3, nitrogen: bekaa ? 28 : 38, phosphorus: bekaa ? 18 : 26, potassium: bekaa ? 210 : 170,
      organicMatter: bekaa ? 2.2 : north ? 3.1 : 1.6, salinity: farmId === 'coast' ? 1.7 : 0.6,
      texture: bekaa ? 'Clay loam' : north ? 'Loam' : 'Sandy loam', sampleDate: `${year}-03-05`, sampleDepthCm: 30,
      laboratory: 'DEMO — no laboratory measurement', testMethod: 'SYNTHETIC N/P/K scenario in mg/kg; no extraction method or laboratory result is claimed', provenance: 'synthetic' },
    water: bekaa ? 'limited' : 'reliable', irrigation: { method: bekaa ? 'Sprinkler — DEMO' : 'Drip — DEMO', source: 'Fictional allocated supply — SYNTHETIC', seasonalRestrictions: bekaa ? 'DEMO: limited summer allocation' : 'DEMO: scheduled allocation; net infiltration unknown' },
    waterInputs: profile, previousCrops: [
      { cropId: bekaa ? 'chickpea' : 'fava', season: 'Spring', year: year - 2, plantedAt: `${year - 2}-03-01`, harvestedAt: `${year - 2}-07-01`, residueManagement: 'DEMO: residues incorporated' },
      { cropId: bekaa ? 'wheat' : 'potato', season: bekaa ? 'Autumn' : 'Spring', year: year - 1, plantedAt: bekaa ? `${year - 1}-11-01` : `${year - 1}-03-01`, harvestedAt: bekaa ? `${year}-06-28` : `${year - 1}-07-01`, diseaseNotes: 'SYNTHETIC record: no diagnostic survey performed' },
      ...(!bekaa ? [{ cropId: 'tomato', season: 'Spring', year, plantedAt: `${year}-04-01`, harvestedAt: `${year}-08-23`, residueManagement: 'DEMO: crop residues removed' }] : []),
    ], priorities: bekaa ? ['water-saving', 'soil-health'] : ['production', 'risk-reduction'], riskTolerance: 'low', budget: 'DEMO qualitative context; economics not calculated', image: bekaa ? '/images/field-1.jpg' : north ? '/images/field-2.jpg' : '/images/field-3.jpg',
  }
  const secondary: Field = { ...structuredClone(base), id: `demo:${farmId}:secondary`, name: bekaa ? 'Dryland Pulse Strip' : north ? 'Potato Rotation Plot' : 'Sandy Legume Strip',
    latitude: lat + 0.008, longitude: lon + 0.006, area: bekaa ? 2.6 : north ? 0.9 : 0.8, water: bekaa ? 'rainfed' : 'limited',
    elevationM: farmId === 'coast' ? null : base.elevationM! + 12,
    soil: { ...base.soil, ph: farmId === 'coast' ? null : base.soil.ph! - 0.2, nitrogen: null, phosphorus: null, salinity: null },
    waterInputs: undefined, previousCrops: [{ cropId: bekaa ? 'lentil' : north ? 'potato' : 'fava', season: 'Spring', year }],
  }
  const fields = [base, secondary].map(field => tagDemoField(field, farmId))
  const plans = Object.fromEntries(fields.map(field => [field.id, buildRotation(field, demoClimateFor(field), 4, 'Autumn', year + 1)]))
  const analysisRecords = fields.map((field, i) => { const climate = demoClimateFor(field); return {
    id: `demo:${farmId}:analysis:${i}`, createdAt: `${year}-10-${i === 0 ? '20' : '10'}T10:00:00Z`, field: structuredClone(field), climate,
    season: 'Autumn' as const, recommendations: assessCrops(field, climate, 'Autumn').slice(0, 4), modelVersion: MODEL_VERSION,
  } })
  return { dataClassification: 'demo-synthetic', fields, plans, analysisRecords,
    preferences: { name: `DEMO ${bekaa ? 'Bekaa Farmer' : north ? 'North Farmer' : 'Coastal Farmer'}`, climateMode: 'demo', language: 'en', areaUnit: 'ha' } }
}
/** Existing FAO-56 engine, synthetic meteorological INPUTS; never precomputed ETo. */
export function demoWaterClimate(field: Field, start: string, end: string): WaterClimateSeries {
  const climate = demoClimateFor(field)
  const days = datesBetween(start, end).map(date => {
    const parsed = new Date(`${date}T00:00:00Z`), month = parsed.getUTCMonth(), day = parsed.getUTCDate()
    const m = climate.monthly[month], daysInMonth = new Date(Date.UTC(parsed.getUTCFullYear(), month + 1, 0)).getUTCDate()
    const temperature = m.temperature + 1.5 * Math.sin(day * Math.PI / 15)
    return { date, precipitationMm: day % 5 === 0 ? m.rainfall / Math.floor(daysInMonth / 5) : 0,
      eto: fao56DailyEto({ date, latitudeDeg: field.latitude, elevationM: field.elevationM ?? null, minC: temperature - 6, maxC: temperature + 6,
        actualVapourKpa: saturationVapourPressure(temperature) * m.humidity! / 100, wind2mMs: 1.8,
        pressureKpa: 101.3 * ((293 - 0.0065 * (field.elevationM ?? 0)) / 293) ** 5.26, solarMjM2Day: m.solar * 3.6 }) }
  })
  return { start, end, retrievedAt: new Date().toISOString(), days }
}

export function demoDailyExtremes(field: Field, start: string, end: string) {
  const climate = demoClimateFor(field)
  const days = datesBetween(start, end).map(date => {
    const d = new Date(date + 'T00:00:00Z')
    const mean = climate.monthly[d.getUTCMonth()].temperature + 1.5 * Math.sin(d.getUTCDate() * Math.PI / 15)
    return { date, min: mean - 6, max: mean + 6 }
  })
  const cold = days.reduce((a, b) => a.min <= b.min ? a : b)
  const hot = days.reduce((a, b) => a.max >= b.max ? a : b)
  return { start, end, freezingDays: days.filter(day => day.min <= 0).length, coldest: { date: cold.date, celsius: cold.min }, hottest: { date: hot.date, celsius: hot.max }, retrievedAt: new Date().toISOString() }
}
