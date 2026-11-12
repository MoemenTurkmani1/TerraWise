import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchClimate, fetchClimateRange, parsePowerResponse, powerRequestUrl } from './nasaPower';

function responseFixture(year = 2024) {
  const parameter: Record<string, Record<string, number>> = { T2M: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {}, RH2M: {} };
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}${String(month).padStart(2, '0')}`;
    parameter.T2M[key] = 15;
    parameter.PRECTOTCORR[key] = 2;
    parameter.ALLSKY_SFC_SW_DWN[key] = 5;
    parameter.RH2M[key] = 60;
  }
  parameter.T2M[`${year}13`] = -999;
  return { header: { fill_value: -999 }, properties: { parameter }, parameters: { T2M: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, ALLSKY_SFC_SW_DWN: { units: 'kW-hr/m^2/day' }, RH2M: { units: '%' } } };
}

afterEach(() => vi.unstubAllGlobals());

describe('NASA POWER contract', () => {
  it('constructs a public monthly AG request with documented parameters and no key', () => {
    const url = new URL(powerRequestUrl(33.8, 35.9, 2024));
    expect(url.searchParams.get('community')).toBe('AG');
    expect(url.searchParams.get('parameters')).toBe('T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M');
    expect(url.searchParams.get('start')).toBe('2024');
    expect(url.searchParams.get('end')).toBe('2024');
    expect(() => powerRequestUrl(100, 35.9, 2024)).toThrow();
    expect(() => powerRequestUrl(33.8, 35.9, new Date().getUTCFullYear())).toThrow();
  });

  it('converts precipitation rates to monthly totals including leap February', () => {
    const climate = parsePowerResponse(responseFixture(), 2024);
    expect(climate.monthly).toHaveLength(12);
    expect(climate.monthly[0].rainfall).toBe(62);
    expect(climate.monthly[1].rainfall).toBe(58);
    expect(climate.source).toBe('nasa-power');
    expect(climate.retrievedAt).toBeTruthy();
    expect(climate.monthly[0].humidity).toBe(60);
  });

  it('converts the AG community’s solar MJ units to kWh instead of mislabelling energy', () => {
    const fixture = responseFixture();
    fixture.parameters.ALLSKY_SFC_SW_DWN.units = 'MJ/m^2/day';
    fixture.properties.parameter.ALLSKY_SFC_SW_DWN['202401'] = 18;
    expect(parsePowerResponse(fixture, 2024).monthly[0].solar).toBe(5);
  });

  it('rejects fill values, partial responses and unexpected units', () => {
    const bad = responseFixture();
    bad.properties.parameter.T2M['202405'] = -999;
    expect(() => parsePowerResponse(bad, 2024)).toThrow('missing or invalid');
    expect(() => parsePowerResponse({}, 2024)).toThrow();
    const wrongUnits = responseFixture();
    wrongUnits.parameters.PRECTOTCORR.units = 'mm/month';
    expect(() => parsePowerResponse(wrongUnits, 2024)).toThrow('unit');
    const partial = responseFixture();
    delete partial.properties.parameter.T2M['202407'];
    expect(() => parsePowerResponse(partial, 2024)).toThrow();
  });

  it('reports network failure without substituting artificial climate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));
    await expect(fetchClimate(33.8, 35.9, 2024)).rejects.toThrow('Network offline');
  });

  it('reports rate limiting without supplying observations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchClimate(33.8, 35.9, 2024)).rejects.toThrow('HTTP 429');
  });

  it('passes successfully validated observations through as historical NASA data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => responseFixture() }));
    const climate = await fetchClimate(33.8, 35.9, 2024);
    expect(climate.source).toBe('nasa-power');
    expect(climate.error).toBeUndefined();
    expect(climate.provenance).toMatchObject({ provider: 'NASA POWER', coordinates: { latitude: 33.8, longitude: 35.9 }, quality: 'complete', cache: 'fresh', period: { start: '2024-01-01', end: '2024-12-31' } });
  });

  it('retains valid core data and flags missing humidity instead of inventing it', async () => {
    const partial = responseFixture();
    delete partial.properties.parameter.RH2M['202405'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => partial }));
    const climate = await fetchClimate(33.8, 35.9, 2024);
    expect(climate.source).toBe('nasa-power');
    expect(climate.monthly[4].humidity).toBeNull();
    expect(climate.provenance?.quality).toBe('partial');
    expect(climate.provenance?.missing).toContain('RH2M 2024-05');
  });

  it('retrieves a bounded multi-year period with each year and units traceable', async () => {
    const first = responseFixture(2023), second = responseFixture(2024);
    for (const key of Object.keys(first.properties.parameter)) Object.assign(first.properties.parameter[key], second.properties.parameter[key]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => first }));
    const climate = await fetchClimateRange(33.8, 35.9, 2023, 2024);
    expect(climate.history?.map(item => item.year)).toEqual([2023, 2024]);
    expect(climate.provenance?.period).toEqual({ start: '2023-01-01', end: '2024-12-31' });
    expect(climate.provenance?.parameters.find(item => item.code === 'PRECTOTCORR')).toMatchObject({ sourceUnit: 'mm/day', unit: 'mm/month' });
  });

  it('uses only a validated, dated cache for exactly the requested location and period', async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => responseFixture() }).mockRejectedValue(new Error('Offline'));
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchClimate(33.8, 35.9, 2024);
    const cached = await fetchClimate(33.8, 35.9, 2024);
    expect(cached.source).toBe('nasa-power');
    expect(cached.provenance?.cache).toBe('cached');
    expect(cached.retrievedAt).toBe(first.retrievedAt);
    expect(cached.error).toContain('cached NASA POWER');
    await expect(fetchClimate(33.9, 35.9, 2024)).rejects.toThrow('No historical data is available');
    await expect(fetchClimate(33.8, 35.9, 2023)).rejects.toThrow('No historical data is available');
  });

  it('treats user cancellation as cancellation rather than successful fallback', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchClimate(33.8, 35.9, 2024, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
