import { describe, expect, it } from 'vitest'
import { canUseLocalReports, MAX_SOIL_REPORT_BYTES, validateSoilReport, verifySoilReport } from './soilReports'

describe('soil report validation', () => {
  it('accepts the documented file types and boundary size', () => {
    expect(validateSoilReport({ type: 'application/pdf', size: MAX_SOIL_REPORT_BYTES })).toBeNull()
    expect(validateSoilReport({ type: 'image/jpeg', size: 1 })).toBeNull()
    expect(validateSoilReport({ type: 'image/png', size: 1 })).toBeNull()
  })
  it('rejects empty, oversized and unsupported uploads', () => {
    expect(validateSoilReport({ type: 'image/jpeg', size: 0 })).toMatch(/empty/i)
    expect(validateSoilReport({ type: 'application/pdf', size: MAX_SOIL_REPORT_BYTES + 1 })).toMatch(/5 MB/)
    expect(validateSoilReport({ type: 'text/html', size: 50 })).toMatch(/Choose/)
  })
  it('checks content signatures rather than trusting the browser-provided MIME type', async () => {
    const pdf = new File(['%PDF-1.4\nexample'], 'soil.pdf', { type: 'application/pdf' })
    const spoofed = new File(['not a PDF'], 'soil.pdf', { type: 'application/pdf' })
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'soil.png', { type: 'image/png' })
    expect(await verifySoilReport(pdf)).toBeNull()
    expect(await verifySoilReport(png)).toBeNull()
    expect(await verifySoilReport(spoofed)).toMatch(/does not match/i)
  })
  it('allows browser-profile report access only for a resolved, valid guest workspace', () => {
    expect(canUseLocalReports({ authenticated: false, loading: false, configurationInvalid: false })).toBe(true)
    expect(canUseLocalReports({ authenticated: true, loading: false, configurationInvalid: false })).toBe(false)
    expect(canUseLocalReports({ authenticated: false, loading: true, configurationInvalid: false })).toBe(false)
    expect(canUseLocalReports({ authenticated: false, loading: false, configurationInvalid: true })).toBe(false)
  })
})
