import type { ClimateData } from '../types.ts';

export const POWER_API = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
export const POWER_DOCUMENTATION = 'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/';
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Public NASA POWER endpoint, no key. AG=agroclimatology, monthly start/end
 * use YYYY. T2M=mean air temperature at 2m (°C), PRECTOTCORR=corrected
 * precipitation rate (mm/day), ALLSKY_SFC_SW_DWN=solar (AG returns MJ/m²/day),
 * and RH2M=relative humidity (%). Missing humidity is recorded as partial data.
 * Solar MJ values are divided by 3.6 for the UI's kWh/m²/day unit.
 * Historical gridded estimates are not field measurements or a forecast.
 * Docs: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
 */
export function powerRequestUrl(latitude: number, longitude: number, year: number, endYear = year): string {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('A valid latitude and longitude are required.');
  if (!Number.isInteger(year) || year < 1984 || year >= new Date().getUTCFullYear()) throw new Error('Choose a complete historical year from 1984 to last year.');
  if (!Number.isInteger(endYear) || endYear < year || endYear >= new Date().getUTCFullYear() || endYear - year > 9) throw new Error('Choose a complete historical period of one to ten years.');
  const parameters = new URLSearchParams({ parameters: 'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M', community: 'AG', latitude: String(latitude), longitude: String(longitude), start: String(year), end: String(endYear), format: 'JSON' });
  return `${POWER_API}?${parameters}`;
}

type PowerResponse = { header?: { fill_value?: number }; parameters?: Record<string, { units?: string }>; properties?: { parameter?: Record<string, Record<string, number>> } };

/** Reject incomplete, missing and fill-value data rather than turning -999 into
 * apparent observations. Annual key YYYY13 is deliberately ignored.
 */
export function parsePowerResponse(raw: unknown, year: number): ClimateData {
  if (!raw || typeof raw !== 'object') throw new Error('NASA POWER returned an invalid response.');
  const response = raw as PowerResponse;
  const values = response.properties?.parameter;
  if (!values) throw new Error('NASA POWER returned no climate parameters.');
  const units = response.parameters;
  if (!units?.PRECTOTCORR?.units || !['mm/day', 'mm d-1'].includes(units.PRECTOTCORR.units)) throw new Error('NASA POWER returned a missing or unsupported precipitation unit.');
  if (!units?.T2M?.units || !['C', '°C', 'degC'].includes(units.T2M.units)) throw new Error('NASA POWER returned a missing or unsupported temperature unit.');
  const solarUnit = units?.ALLSKY_SFC_SW_DWN?.units;
  if (!solarUnit || !['MJ/m^2/day', 'kW-hr/m^2/day', 'kWh/m^2/day', 'kWh/m2/day'].includes(solarUnit)) throw new Error('NASA POWER returned a missing or unsupported solar radiation unit.');
  const fill = response.header?.fill_value ?? -999;
  const read = (parameter: string, key: string, min: number, max: number) => {
    const value = values[parameter]?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value === fill || value === -999 || value < min || value > max) throw new Error(`NASA POWER ${parameter} data is missing or invalid for ${key}.`);
    return value;
  };
  const monthly = monthNames.map((month, index) => {
    const key = `${year}${String(index + 1).padStart(2, '0')}`;
    const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const humidityValue = values.RH2M?.[key];
    const humidity = units.RH2M?.units === '%' && typeof humidityValue === 'number' && Number.isFinite(humidityValue) && humidityValue !== fill && humidityValue !== -999 && humidityValue >= 0 && humidityValue <= 100 ? humidityValue : null;
    return { month, temperature: read('T2M', key, -90, 65), rainfall: Math.round(read('PRECTOTCORR', key, 0, 1500) * days * 10) / 10, solar: read('ALLSKY_SFC_SW_DWN', key, 0, solarUnit === 'MJ/m^2/day' ? 72 : 20) / (solarUnit === 'MJ/m^2/day' ? 3.6 : 1), humidity };
  });
  return { source: 'nasa-power', year, monthly, retrievedAt: new Date().toISOString() };
}

type CachedResponse = { latitude: number; longitude: number; startYear: number; endYear: number; retrievedAt: string; raw: unknown };
const cacheKey = (latitude: number, longitude: number, startYear: number, endYear: number) => `terrawise.power.v1:${latitude}:${longitude}:${startYear}:${endYear}`;

export function parsePeriod(raw: unknown, latitude: number, longitude: number, startYear: number, endYear: number, retrievedAt: string, cache: 'fresh' | 'cached'): ClimateData {
  const parsed = Array.from({ length: endYear - startYear + 1 }, (_, index) => parsePowerResponse(raw, startYear + index));
  const missing = parsed.flatMap(item => item.monthly.flatMap((month, index) => month.humidity == null ? [`RH2M ${item.year}-${String(index + 1).padStart(2, '0')}`] : []));
  const response = raw as PowerResponse;
  return {
    ...parsed[parsed.length - 1], retrievedAt,
    history: parsed.map(item => ({ year: item.year, monthly: item.monthly })),
    provenance: {
      provider: 'NASA POWER', coordinates: { latitude, longitude }, period: { start: `${startYear}-01-01`, end: `${endYear}-12-31` }, retrievedAt,
      parameters: [
        { code: 'T2M', unit: '°C', sourceUnit: response.parameters?.T2M?.units ?? 'unknown' },
        { code: 'PRECTOTCORR', unit: 'mm/month', sourceUnit: response.parameters?.PRECTOTCORR?.units ?? 'unknown' },
        { code: 'ALLSKY_SFC_SW_DWN', unit: 'kWh/m²/day', sourceUnit: response.parameters?.ALLSKY_SFC_SW_DWN?.units ?? 'unknown' },
        { code: 'RH2M', unit: '%', sourceUnit: response.parameters?.RH2M?.units ?? 'unavailable' },
      ], quality: missing.length ? 'partial' : 'complete', missing, cache,
    },
  };
}

function cachedClimate(latitude: number, longitude: number, startYear: number, endYear: number): ClimateData | null {
  try {
    const saved = sessionStorage.getItem(cacheKey(latitude, longitude, startYear, endYear));
    if (!saved) return null;
    const entry = JSON.parse(saved) as CachedResponse;
    if (entry.latitude !== latitude || entry.longitude !== longitude || entry.startYear !== startYear || entry.endYear !== endYear || typeof entry.retrievedAt !== 'string' || !Number.isFinite(Date.parse(entry.retrievedAt)) || Date.parse(entry.retrievedAt) > Date.now()) return null;
    return parsePeriod(entry.raw, latitude, longitude, startYear, endYear, entry.retrievedAt, 'cached');
  } catch { return null; }
}

/** NASA responses are cached only after validation, scoped to exact coordinates
 * and period, for the current browser tab. A cached result keeps its original
 * retrieval date and is clearly identified when the network request fails. */
export async function fetchClimateRange(latitude: number, longitude: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<ClimateData> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    const url = powerRequestUrl(latitude, longitude, startYear, endYear);
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`NASA POWER request failed (HTTP ${response.status}).`);
    const raw: unknown = await response.json();
    const retrievedAt = new Date().toISOString();
    const climate = parsePeriod(raw, latitude, longitude, startYear, endYear, retrievedAt, 'fresh');
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    try { sessionStorage.setItem(cacheKey(latitude, longitude, startYear, endYear), JSON.stringify({ latitude, longitude, startYear, endYear, retrievedAt, raw } satisfies CachedResponse)); } catch { /* Cache is optional; validated live data is still usable. */ }
    return climate;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    const message = timedOut ? 'NASA POWER did not respond within 12 seconds.' : error instanceof Error ? error.message : 'NASA POWER is unavailable.';
    const cached = cachedClimate(latitude, longitude, startYear, endYear);
    if (cached) return { ...cached, error: `${message} Showing cached NASA POWER historical data retrieved ${cached.retrievedAt}; no new data was fetched.` };
    throw new Error(`${message} No historical data is available for this location and period. Try again.`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export function fetchClimate(latitude: number, longitude: number, year: number, signal?: AbortSignal): Promise<ClimateData> {
  return fetchClimateRange(latitude, longitude, year, year, signal);
}
