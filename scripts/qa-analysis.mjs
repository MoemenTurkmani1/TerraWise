import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect as playwrightExpect } from '@playwright/test'

// Isolated contexts never open the developer's profile or existing records.
// NASA responses below are synthetic test fixtures, not observations.
const base = process.env.BASE_URL || 'http://localhost:4173'
const executablePath = process.env.BROWSER_PATH || process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const expect = playwrightExpect.configure({ timeout: 15_000 })
const browser = await chromium.launch({ executablePath, headless: true })
await mkdir('test-results', { recursive: true })

async function scenario(name, viewport, run) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await run(page, context)
    assert.deepEqual(errors, [], `${name}: no application exceptions`)
    console.log(`PASS ${name}`)
  } catch (error) {
    await page.screenshot({ path: `test-results/analysis-${name.replaceAll(/[^a-z0-9]+/gi, '-')}-failure.png`, fullPage: true }).catch(() => {})
    throw error
  } finally { await context.close() }
}

async function open(page, path) {
  const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
  assert.equal(response?.status(), 200, `${path} must return the application shell`)
}

async function noOverflow(page, label) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${label} must fit the viewport` }).toBe(true)
}

async function runAnalysis(page) {
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
  await expect(page).toHaveURL(/\/history\/[a-zA-Z0-9-]+$/)
  await expect(page.getByRole('heading', { name: / analysis$/ })).toBeVisible()
}

function fixture(start, end) {
  const data = { T2M: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {}, RH2M: {} }
  for (let year = start; year <= end; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}${String(month).padStart(2, '0')}`
      data.T2M[key] = 12 + (year - start) * 2
      data.PRECTOTCORR[key] = 2
      data.ALLSKY_SFC_SW_DWN[key] = 18
      data.RH2M[key] = 65
    }
  }
  return {
    header: { fill_value: -999, title: 'SYNTHETIC BROWSER TEST FIXTURE; NOT NASA OBSERVATIONS' },
    parameters: { T2M: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day' }, RH2M: { units: '%' } },
    properties: { parameter: data },
  }
}

const nasaPattern = 'https://power.larc.nasa.gov/api/temporal/monthly/point**'

try {
  await scenario('demo-history-desktop', { width: 1440, height: 1000 }, async page => {
    await open(page, '/analysis?field=north-field&season=Spring')
    await expect(page.getByRole('heading', { name: 'Analyze your land' })).toBeVisible()
    await expect(page.locator('.analysis-inputs select').nth(0)).toHaveValue('north-field')
    await expect(page.getByLabel('Planting window')).toHaveValue('Spring')
    await expect(page.getByRole('radio', { name: 'Simulated demo climate' })).toBeChecked()
    await runAnalysis(page)
    const originalReportUrl = page.url()
    await expect(page.getByRole('heading', { name: 'North Field analysis' })).toBeVisible()
    await expect(page.locator('.analysis-report')).toContainText('Simulated demo data')
    await expect(page.locator('.analysis-report')).toContainText('Simulated; not NASA observations')
    await expect(page.locator('.report-result')).toHaveCount(5)
    await noOverflow(page, 'desktop analysis report')
    await page.screenshot({ path: 'test-results/analysis-desktop.png', fullPage: true })

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.analyses.v1') || '[]'))
    assert.equal(saved.length, 1, 'analysis should persist once')
    assert.equal(saved[0].field.name, 'North Field')
    assert.equal(saved[0].field.soil.ph, 6.8)
    assert.equal(saved[0].season, 'Spring')
    assert.equal(saved[0].climate.source, 'demo')
    assert.match(saved[0].modelVersion, /^terrawise-heuristic-/)
    assert(saved[0].recommendations.length > 0, 'analysis should retain ranked candidates')

    // Simulate a later field edit, in this isolated test browser only. The
    // earlier report must remain the snapshot captured when it was run.
    await page.evaluate(record => {
      const changed = structuredClone(record.field)
      changed.name = 'Updated North Field'
      changed.soil.ph = 5.1
      localStorage.setItem('terrawise.fields.v1', JSON.stringify([changed]))
    }, saved[0])
    await page.reload()
    await expect(page.getByRole('heading', { name: 'North Field analysis' })).toBeVisible()
    await expect(page.locator('.report-card').first()).toContainText('6.8')
    await expect(page.locator('.report-card').first()).not.toContainText('5.1')

    // Invoke the actual print button while intercepting the native dialog.
    await page.evaluate(() => { window.__terrawisePrintCalls = 0; window.print = () => { window.__terrawisePrintCalls += 1 } })
    await page.getByRole('button', { name: 'Print / save PDF' }).click()
    assert.equal(await page.evaluate(() => window.__terrawisePrintCalls), 1)
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.report-print-only').first()).toBeVisible()
    await expect(page.locator('.topbar')).toBeHidden()
    await page.emulateMedia({ media: 'screen' })

    await page.getByRole('link', { name: 'Back to history' }).click()
    await expect(page.getByRole('heading', { name: 'Analysis history' })).toBeVisible()
    await page.reload()
    await expect(page.locator('.history-item')).toHaveCount(1)
    await page.locator('.history-item').first().click()
    await expect(page.getByRole('heading', { name: 'North Field analysis' })).toBeVisible()
    await page.getByRole('link', { name: 'Rerun with current inputs' }).click()
    await expect(page.locator('.analysis-inputs select').nth(0)).toHaveValue('north-field')
    await expect(page.getByLabel('Planting window')).toHaveValue('Spring')
    await runAnalysis(page)
    await expect(page.getByRole('heading', { name: 'Updated North Field analysis' })).toBeVisible()
    await expect(page.locator('.report-card').first()).toContainText('5.1')
    await page.goto(originalReportUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Delete analysis' }).click()
    await expect(page.getByText('Delete this saved analysis?')).toBeVisible()
    await page.getByRole('button', { name: 'Keep', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'North Field analysis' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete analysis' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page).toHaveURL(/\/history$/)
    await expect(page.locator('.history-item')).toHaveCount(1)
    await expect(page.locator('.history-item').first()).toContainText('Updated North Field')
    await page.reload()
    await expect(page.locator('.history-item')).toHaveCount(1)
  })

  await scenario('nasa-multiyear-and-cached', { width: 1440, height: 1000 }, async page => {
    const requests = []
    let fail = false
    await page.route(nasaPattern, async route => {
      const url = new URL(route.request().url())
      requests.push(url)
      if (fail) return route.abort('failed')
      const start = Number(url.searchParams.get('start'))
      const end = Number(url.searchParams.get('end'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(start, end)) })
    })
    await open(page, '/analysis?field=north-field')
    await page.getByRole('radio', { name: 'NASA POWER historical climate' }).check()
    await page.getByLabel('Historical climate period').selectOption('3')
    await runAnalysis(page)
    const end = await page.evaluate(() => new Date().getUTCFullYear() - 1)
    const start = end - 2
    assert.equal(requests.length, 1, 'one NASA request should be made by the analysis')
    const url = requests[0]
    assert.equal(url.searchParams.get('community'), 'AG')
    assert.equal(url.searchParams.get('format'), 'JSON')
    assert.equal(url.searchParams.get('latitude'), '33.8467')
    assert.equal(url.searchParams.get('longitude'), '35.9019')
    assert.equal(url.searchParams.get('start'), String(start))
    assert.equal(url.searchParams.get('end'), String(end))
    assert.deepEqual(url.searchParams.get('parameters')?.split(',').sort(), ['ALLSKY_SFC_SW_DWN', 'PRECTOTCORR', 'RH2M', 'T2M'].sort())
    await expect(page.locator('.analysis-report')).toContainText('NASA POWER · historical')
    await expect(page.locator('.analysis-report')).toContainText(`${start}-01-01`)
    await expect(page.locator('.analysis-report')).toContainText(`${end}-12-31`)
    await expect(page.locator('.analysis-report')).toContainText('33.8467, 35.9019')
    await expect(page.locator('.analysis-report')).toContainText('PRECTOTCORR: mm/month')
    await expect(page.locator('.analysis-report')).toContainText('RH2M: %')
    await expect(page.locator('.annual-history > div')).toHaveCount(3)
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.analyses.v1') || '[]')[0])
    assert.equal(first.climate.provenance.provider, 'NASA POWER')
    assert.equal(first.climate.provenance.quality, 'complete')
    assert.equal(first.climate.provenance.cache, 'fresh')
    assert.equal(first.climate.history.length, 3)
    assert.equal(first.climate.monthly[0].temperature, 16)
    assert.equal(first.climate.monthly[0].rainfall, 62)
    assert.equal(first.climate.monthly[0].solar, 5)
    assert.equal(first.climate.monthly[0].humidity, 65)

    // A failed request for exactly the same coordinates/period may use only
    // the verified dated cache, retaining the original retrieval timestamp.
    fail = true
    await page.getByRole('link', { name: 'Rerun with current inputs' }).click()
    await page.getByLabel('Historical climate period').selectOption('3')
    await runAnalysis(page)
    await expect(page.locator('.analysis-report')).toContainText('NASA POWER · historical · cached')
    await expect(page.locator('.analysis-report')).toContainText('Showing cached NASA POWER historical data retrieved')
    const all = await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.analyses.v1') || '[]'))
    const cached = all[all.length - 1]
    assert.equal(cached.climate.provenance.cache, 'cached')
    assert.equal(cached.climate.retrievedAt, first.climate.retrievedAt)
    assert.equal(cached.climate.source, 'nasa-power')
  })

  await scenario('nasa-failure-mobile', { width: 390, height: 844 }, async page => {
    await page.route(nasaPattern, route => route.abort('failed'))
    await open(page, '/analysis?field=north-field')
    await noOverflow(page, 'mobile analysis form')
    await page.getByRole('radio', { name: 'NASA POWER historical climate' }).check()
    await runAnalysis(page)
    await expect(page.locator('.analysis-report')).toContainText('Simulated demo data')
    await expect(page.locator('.analysis-report')).toContainText('Showing simulated Bekaa demo climate')
    await expect(page.locator('.analysis-report')).toContainText('not observations for this location')
    await expect(page.locator('.source-nasa-power')).toHaveCount(0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.analyses.v1') || '[]')[0])
    assert.equal(saved.climate.source, 'demo')
    assert.equal(saved.climate.provenance, undefined)
    await noOverflow(page, 'mobile analysis report')
    await page.screenshot({ path: 'test-results/analysis-mobile.png', fullPage: true })
  })

  await scenario('production-offline-shell', { width: 390, height: 844 }, async (page, context) => {
    await open(page, '/')
    const manifest = await page.request.get(`${base}/offline-assets.json`)
    const assets = await manifest.json().catch(() => null)
    if (!Array.isArray(assets)) {
      const viteClient = await page.request.get(`${base}/@vite/client`)
      if ((viteClient.headers()['content-type'] || '').includes('javascript')) {
        console.log('SKIP production offline shell: Vite development server does not generate the production asset manifest')
        return
      }
      throw new Error('Production server is missing the generated offline asset manifest')
    }
    assert(assets.length > 0 && assets.every(path => typeof path === 'string' && path.startsWith('/assets/')), 'production offline manifest must enumerate static assets')
    await page.waitForFunction(() => 'serviceWorker' in navigator && !!navigator.serviceWorker.controller, null, { timeout: 30_000 })
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await context.setOffline(true)
    await open(page, '/analysis?field=north-field')
    await expect(page.getByRole('heading', { name: 'Analyze your land' })).toBeVisible()
    await noOverflow(page, 'offline mobile analysis')
    // The static shell is offline-capable. NASA data remains explicitly demo
    // on an offline request when no verified cache exists for this context.
    await page.getByRole('radio', { name: 'NASA POWER historical climate' }).check()
    await runAnalysis(page)
    await expect(page.locator('.analysis-report')).toContainText('Simulated demo data')
    await expect(page.locator('.analysis-report')).toContainText('not observations for this location')
    await expect(page.locator('.source-nasa-power')).toHaveCount(0)
    await context.setOffline(false)
  })
} finally { await browser.close() }
