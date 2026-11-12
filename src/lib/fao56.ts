/** Daily FAO-56 grass-reference Penman–Monteith. Inputs must be in the stated
 * units; data are estimates, not field observations. Returns no substituted values.
 * https://www.fao.org/4/x0490e/x0490e08.htm (equation 6, example 18)
 * https://www.fao.org/4/x0490e/x0490e07.htm (equations 11–13, 21, 37–40)
 */
export interface EtoInputs {
  date: string
  latitudeDeg: number | null
  elevationM: number | null
  minC: number | null
  maxC: number | null
  actualVapourKpa: number | null
  wind2mMs: number | null
  pressureKpa: number | null
  solarMjM2Day: number | null
}
export type EtoResult = { status: 'ok'; mmPerDay: number; warnings: string[] } | { status: 'insufficient_data'; reason: string }
const unknown = (reason: string): EtoResult => ({ status: 'insufficient_data', reason })
export const saturationVapourPressure = (temperatureC: number) => 0.6108 * Math.exp(17.27 * temperatureC / (temperatureC + 237.3))

export function fao56DailyEto(input: EtoInputs): EtoResult {
  const { latitudeDeg: lat, elevationM: z, minC: min, maxC: max, actualVapourKpa: ea, wind2mMs: wind, pressureKpa: pressure, solarMjM2Day: solar, date } = input
  if ([lat, z, min, max, ea, wind, pressure, solar].some(value => value === null || !Number.isFinite(value))) return unknown('Required meteorological inputs or elevation are missing.')
  if (lat! < -90 || lat! > 90 || z! < -500 || z! > 9000 || min! < -90 || max! > 65 || min! > max! || ea! < 0 || wind! < 0 || pressure! <= 0 || solar! < 0) return unknown('Meteorological inputs are outside supported physical ranges.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return unknown('A valid date is required.')
  const day = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return unknown('A valid date is required.')
  const j = Math.floor((day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 0)) / 86400000)
  const t = (min! + max!) / 2
  const es = (saturationVapourPressure(min!) + saturationVapourPressure(max!)) / 2
  if (ea! > es) return unknown('Vapour pressure exceeds the supported saturation pressure; review input quality.')
  const delta = 4098 * saturationVapourPressure(t) / ((t + 237.3) ** 2)
  const gamma = 0.000665 * pressure!
  const phi = lat! * Math.PI / 180
  const dr = 1 + 0.033 * Math.cos(2 * Math.PI * j / 365)
  const declination = 0.409 * Math.sin(2 * Math.PI * j / 365 - 1.39)
  const angle = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(declination))))
  const ra = (24 * 60 / Math.PI) * 0.0820 * dr * (angle * Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.sin(angle))
  const clearSky = (0.75 + 2e-5 * z!) * ra
  if (!Number.isFinite(clearSky) || clearSky <= 0) return unknown('Clear-sky radiation is unavailable for this date and latitude.')
  const rawRatio = solar! / clearSky
  if (rawRatio < 0.3) return unknown('Solar-to-clear-sky radiation ratio is below the supported cloudiness range; review radiation data.')
  const ratio = Math.min(1, rawRatio)
  const cloudTerm = 1.35 * ratio - 0.35
  if (cloudTerm < 0 || 0.34 - 0.14 * Math.sqrt(ea!) < 0) return unknown('Radiation or vapour pressure is outside this FAO-56 approximation’s supported range.')
  const netShort = 0.77 * solar!
  const netLong = 4.903e-9 * (((max! + 273.16) ** 4 + (min! + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(ea!)) * cloudTerm
  const netRadiation = netShort - netLong
  const eto = (0.408 * delta * netRadiation + gamma * (900 / (t + 273)) * wind! * (es - ea!)) / (delta + gamma * (1 + 0.34 * wind!))
  if (!Number.isFinite(eto) || eto < 0) return unknown('FAO-56 result is outside the supported range; review data and local conditions.')
  return { status: 'ok', mmPerDay: eto, warnings: rawRatio > 1 ? ['Solar-to-clear-sky radiation ratio was capped at 1 as in FAO-56.'] : [] }
}
