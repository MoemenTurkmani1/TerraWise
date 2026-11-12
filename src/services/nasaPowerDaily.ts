/** NASA POWER daily T2M extrema are historical gridded estimates at 2 m,
 * not field sensors. Local solar time is explicitly requested. */
const DAILY_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point'
const allowedUnits = ['C', '°C', 'degC']
type DailyResponse = { header?: { fill_value?: number }; parameters?: Record<string, { units?: string }>; properties?: { parameter?: Record<string, Record<string, number>> } }
export interface DailyExtremes {
  start: string
  end: string
  freezingDays: number
  coldest: { date: string; celsius: number }
  hottest: { date: string; celsius: number }
  retrievedAt: string
}

export function datesBetween(start: string, end: string): string[] {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid historical date.')
    const time = Date.parse(`${value}T00:00:00Z`)
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Invalid historical date.')
    return time
  }
  const first = parse(start), last = parse(end)
  if (last < first || (last - first) / 86400000 > 365) throw new Error('Choose a historical period no longer than 366 days.')
  const dates: string[] = []
  for (let time = first; time <= last; time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10))
  return dates
}

export function dailyPowerUrl(latitude: number, longitude: number, start: string, end: string): string {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Valid field coordinates are required.')
  datesBetween(start, end)
  if (start < '1981-01-01' || end >= new Date().toISOString().slice(0, 10)) throw new Error('Choose a completed historical period from 1981 onwards.')
  const query = new URLSearchParams({ parameters: 'T2M_MIN,T2M_MAX', community: 'AG', latitude: String(latitude), longitude: String(longitude), start: start.replaceAll('-', ''), end: end.replaceAll('-', ''), format: 'JSON', 'time-standard': 'LST' })
  return `${DAILY_URL}?${query}`
}

export function parseDailyExtremes(raw: unknown, start: string, end: string, retrievedAt: string): DailyExtremes {
  const dates = datesBetween(start, end)
  if (!raw || typeof raw !== 'object') throw new Error('NASA POWER returned invalid daily data.')
  const data = raw as DailyResponse
  if (!allowedUnits.includes(data.parameters?.T2M_MIN?.units ?? '') || !allowedUnits.includes(data.parameters?.T2M_MAX?.units ?? '')) throw new Error('NASA POWER daily temperature units are missing or unsupported.')
  const values = data.properties?.parameter
  if (!values) throw new Error('NASA POWER returned no daily temperature data.')
  const fill = data.header?.fill_value ?? -999
  const observations = dates.map(date => {
    const key = date.replaceAll('-', '')
    const min = values.T2M_MIN?.[key], max = values.T2M_MAX?.[key]
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || min === fill || max === fill || min === -999 || max === -999 || min < -90 || max > 65 || min > max) throw new Error('NASA POWER daily temperatures are incomplete or invalid for the selected period.')
    return { date, min, max }
  })
  const coldest = observations.reduce((a, b) => a.min <= b.min ? a : b)
  const hottest = observations.reduce((a, b) => a.max >= b.max ? a : b)
  return { start, end, freezingDays: observations.filter(day => day.min <= 0).length, coldest: { date: coldest.date, celsius: coldest.min }, hottest: { date: hottest.date, celsius: hottest.max }, retrievedAt }
}

export async function fetchDailyExtremes(latitude: number, longitude: number, start: string, end: string, signal?: AbortSignal): Promise<DailyExtremes> {
  const url = dailyPowerUrl(latitude, longitude, start, end)
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 12000)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`NASA POWER daily request failed (HTTP ${response.status}).`)
    const raw: unknown = await response.json()
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    return parseDailyExtremes(raw, start, end, new Date().toISOString())
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    throw new Error(timedOut ? 'NASA POWER daily data timed out.' : error instanceof Error ? error.message : 'NASA POWER daily data is unavailable.')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
