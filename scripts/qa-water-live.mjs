// Read-only checks at a public test coordinate. No farm/account data is used.
// Elevation and example Kc are synthetic assumptions, not verified local inputs.
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args)
  const url = new URL(String(args[0]))
  if (url.hostname === 'power.larc.nasa.gov') requests.push({
    endpoint: url.pathname, status: response.status,
    parameters: url.searchParams.get('parameters'), start: url.searchParams.get('start'),
    end: url.searchParams.get('end'), timeStandard: url.searchParams.get('time-standard') || 'API default',
  })
  return response
}
const report = {
  checkedAt: new Date().toISOString(), latitude: 33.85, longitude: 35.9,
  elevationM: 1000, elevationSource: 'Synthetic test assumption', checks: {}, requests,
}
async function check(name, run) {
  try { report.checks[name] = { status: 'passed', ...await run() } }
  catch (error) {
    report.checks[name] = { status: 'failed', message: error instanceof Error ? error.message : 'Unavailable; no substitute data was used.' }
    process.exitCode = 1
  }
}
try {
  const { fetchClimate } = await server.ssrLoadModule('/src/services/nasaPower.ts')
  const { fetchDailyExtremes, datesBetween } = await server.ssrLoadModule('/src/services/nasaPowerDaily.ts')
  const { fetchWaterClimate } = await server.ssrLoadModule('/src/services/nasaPowerWater.ts')
  const { fao56DailyEto } = await server.ssrLoadModule('/src/lib/fao56.ts')
  const { standardCropEt } = await server.ssrLoadModule('/src/lib/cropWater.ts')
  await check('monthly', async () => {
    const result = await fetchClimate(report.latitude, report.longitude, 2025)
    assert.equal(result.monthly.length, 12)
    assert.equal(result.provenance.cache, 'fresh')
    assert.equal(result.provenance.quality, 'complete')
    return { year: result.year, acceptedMonths: result.monthly.length, quality: result.provenance.quality, cache: result.provenance.cache, retrievedAt: result.retrievedAt, parameters: result.provenance.parameters }
  })
  await check('dailyExtremes', async () => {
    const start = '2024-11-01', end = '2025-06-30'
    const result = await fetchDailyExtremes(report.latitude, report.longitude, start, end)
    return { ...result, acceptedDays: datesBetween(start, end).length }
  })
  await check('waterClimate', async () => {
    const result = await fetchWaterClimate(report.latitude, report.longitude, report.elevationM, '2025-07-01', '2025-07-03')
    assert.equal(result.days.length, 3)
    assert.equal(result.days.filter(day => day.eto.status === 'ok').length, 3)
    const days = result.days.map(day => ({ date: day.date, precipitationMm: day.precipitationMm, etoMm: day.eto.mmPerDay, exampleEtcMm: standardCropEt(day.eto.mmPerDay, 1.15), warnings: day.eto.warnings }))
    return { start: result.start, end: result.end, retrievedAt: result.retrievedAt, acceptedDays: days.length, exampleKc: 1.15, exampleKcSource: 'Synthetic illustration; no crop profile or local validation is inferred', days, etoTotalMm: days.reduce((sum, day) => sum + day.etoMm, 0), exampleEtcTotalMm: days.reduce((sum, day) => sum + day.exampleEtcMm, 0) }
  })
  await check('bekaaWaterClimate', async () => {
    const result = await fetchWaterClimate(report.latitude, report.longitude, report.elevationM, '2024-11-01', '2025-06-30')
    assert.equal(result.days.length, 242)
    const accepted = result.days.filter(day => day.eto.status === 'ok')
    const unknown = result.days.filter(day => day.eto.status !== 'ok')
    const reasons = {}
    for (const day of unknown) reasons[day.eto.reason] = (reasons[day.eto.reason] || 0) + 1
    return { start: result.start, end: result.end, retrievedAt: result.retrievedAt, receivedDays: result.days.length, acceptedEtoDays: accepted.length, unknownEtoDays: unknown.length, cappedRadiationDays: accepted.filter(day => day.eto.warnings.length).length, etoTotalMm: unknown.length ? null : accepted.reduce((sum, day) => sum + day.eto.mmPerDay, 0), unknownReasons: reasons, unknownDateSamples: unknown.slice(0, 5).map(day => day.date) }
  })
  await check('publishedEquationExample', async () => {
    const result = fao56DailyEto({ date: '2001-07-06', latitudeDeg: 50.8, elevationM: 100, minC: 12.3, maxC: 21.5, actualVapourKpa: 1.409, wind2mMs: 2.08, pressureKpa: 100.1, solarMjM2Day: 22.07 })
    assert.equal(result.status, 'ok')
    assert.ok(Math.abs(result.mmPerDay - 3.88) < 0.05)
    return { source: 'FAO-56 chapter 4 example 18; published demonstration inputs, separate from NASA', etoMm: result.mmPerDay, publishedRoundedEtoMm: 3.88, etcAtEto4Kc1_2Mm: standardCropEt(4, 1.2) }
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
