import { dailyPowerUrl, datesBetween } from './nasaPowerDaily'
import { fao56DailyEto, saturationVapourPressure, type EtoResult } from '../lib/fao56'

const parameters = ['T2M_MIN', 'T2M_MAX', 'T2MDEW', 'WS2M', 'PS', 'ALLSKY_SFC_SW_DWN', 'PRECTOTCORR'] as const
type Parameter = typeof parameters[number]
type ResponseShape = { header?: { fill_value?: number }; parameters?: Record<string, { units?: string }>; properties?: { parameter?: Record<string, Record<string, number>> } }
export interface DailyWaterClimate { date: string; precipitationMm: number; eto: EtoResult }
export interface WaterClimateSeries { start: string; end: string; retrievedAt: string; days: DailyWaterClimate[] }
const units: Record<Parameter, readonly string[]> = {
  T2M_MIN: ['C', '°C', 'degC'], T2M_MAX: ['C', '°C', 'degC'], T2MDEW: ['C', '°C', 'degC'],
  WS2M: ['m/s'], PS: ['kPa'], ALLSKY_SFC_SW_DWN: ['MJ/m^2/day'], PRECTOTCORR: ['mm/day', 'mm d-1'],
}

export function waterPowerUrl(lat: number, lon: number, start: string, end: string): string {
  const url = new URL(dailyPowerUrl(lat, lon, start, end))
  url.searchParams.set('parameters', parameters.join(','))
  return url.toString()
}

/** One missing parameter or day rejects the series; no interpolation/fallback. */
export function parseWaterClimate(raw: unknown, latitude: number, elevationM: number | null, start: string, end: string, retrievedAt: string): WaterClimateSeries {
  if (!raw || typeof raw !== 'object') throw new Error('NASA POWER water climate response is invalid.')
  const data = raw as ResponseShape
  const values = data.properties?.parameter
  if (!values) throw new Error('NASA POWER water climate parameters are unavailable.')
  for (const parameter of parameters) if (!units[parameter].includes(data.parameters?.[parameter]?.units ?? '')) throw new Error(`NASA POWER ${parameter} units are missing or unsupported.`)
  const fill = data.header?.fill_value ?? -999
  const days = datesBetween(start, end).map(date => {
    const key = date.replaceAll('-', '')
    function read(parameter: Parameter): number {
      const value = values![parameter]?.[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value === fill || value === -999) throw new Error(`NASA POWER ${parameter} is missing or invalid for the requested period.`)
      return value
    }
    const minC = read('T2M_MIN'), maxC = read('T2M_MAX'), dewpoint = read('T2MDEW'), wind2mMs = read('WS2M')
    const pressureKpa = read('PS'), solarMjM2Day = read('ALLSKY_SFC_SW_DWN'), precipitationMm = read('PRECTOTCORR')
    if (minC < -90 || maxC > 65 || minC > maxC || dewpoint < -90 || dewpoint > maxC || wind2mMs < 0 || pressureKpa <= 0 || solarMjM2Day < 0 || precipitationMm < 0) throw new Error('NASA POWER daily water climate failed physical quality checks.')
    return { date, precipitationMm, eto: fao56DailyEto({ date, latitudeDeg: latitude, elevationM, minC, maxC, actualVapourKpa: saturationVapourPressure(dewpoint), wind2mMs, pressureKpa, solarMjM2Day }) }
  })
  return { start, end, retrievedAt, days }
}

export async function fetchWaterClimate(lat: number, lon: number, elevationM: number | null, start: string, end: string, signal?: AbortSignal): Promise<WaterClimateSeries> {
  const url = waterPowerUrl(lat, lon, start, end)
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 12000)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`NASA POWER water climate request failed (HTTP ${response.status}).`)
    const raw: unknown = await response.json()
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    return parseWaterClimate(raw, lat, elevationM, start, end, new Date().toISOString())
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    throw new Error(timedOut ? 'NASA POWER water climate request timed out.' : error instanceof Error ? error.message : 'NASA POWER water climate unavailable.')
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
}
