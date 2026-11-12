import { describe, expect, it, vi } from 'vitest'
import { dailyPowerUrl, fetchDailyExtremes, parseDailyExtremes } from './nasaPowerDaily'

// Synthetic test fixture; these values are never shipped as NASA observations.
const raw = {
  header: { fill_value: -999 },
  parameters: { T2M_MIN: { units: 'C' }, T2M_MAX: { units: 'C' } },
  properties: { parameter: { T2M_MIN: { '20240228': 2, '20240229': 0, '20240301': -1 }, T2M_MAX: { '20240228': 15, '20240229': 20, '20240301': 30 } } },
}

describe('NASA POWER daily historical extremes', () => {
  it('requests two-metre extrema in explicit local solar time', () => {
    const url = new URL(dailyPowerUrl(33.8, 35.9, '2024-02-28', '2024-03-01'))
    expect(url.searchParams.get('parameters')).toBe('T2M_MIN,T2M_MAX')
    expect(url.searchParams.get('time-standard')).toBe('LST')
    expect(url.searchParams.get('start')).toBe('20240228')
  })
  it('handles leap days, physical freezing boundary, and actual observed extremes', () => {
    const result = parseDailyExtremes(raw, '2024-02-28', '2024-03-01', '2026-01-01T00:00:00Z')
    expect(result.freezingDays).toBe(2)
    expect(result.coldest).toEqual({ date: '2024-03-01', celsius: -1 })
    expect(result.hottest).toEqual({ date: '2024-03-01', celsius: 30 })
  })
  it('rejects missing days, fill values, inverted extrema, invalid dates and unsupported units', () => {
    expect(() => parseDailyExtremes(raw, '2024-02-28', '2024-03-02', 'x')).toThrow(/incomplete/)
    const fill = structuredClone(raw); fill.properties.parameter.T2M_MIN['20240228'] = -999
    expect(() => parseDailyExtremes(fill, '2024-02-28', '2024-03-01', 'x')).toThrow(/invalid/)
    const inverted = structuredClone(raw); inverted.properties.parameter.T2M_MAX['20240228'] = -5
    expect(() => parseDailyExtremes(inverted, '2024-02-28', '2024-03-01', 'x')).toThrow(/invalid/)
    const units = structuredClone(raw); units.parameters.T2M_MIN.units = 'F'
    expect(() => parseDailyExtremes(units, '2024-02-28', '2024-03-01', 'x')).toThrow(/units/)
    expect(() => dailyPowerUrl(33, 35, '2023-02-29', '2023-03-01')).toThrow(/date/)
  })
  it('reports API failures without inventing fallback observations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    try { await expect(fetchDailyExtremes(33, 35, '2024-02-28', '2024-03-01')).rejects.toThrow('503') }
    finally { vi.unstubAllGlobals() }
  })
})
