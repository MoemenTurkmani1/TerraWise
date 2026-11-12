import { chromium, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
const base = process.env.BASE_URL || 'http://127.0.0.1:5173'
const origin = new URL(base).origin
const out = 'test-results/demo'
await mkdir(out, { recursive: true })
const options = process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : process.platform === 'win32' ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}
const browser = await chromium.launch({ ...options, headless: true })
const protectedData = {
  'terrawise.fields.v1': '[]',
  'terrawise.preferences': JSON.stringify({ name: 'Real QA Farmer', climateMode: 'live', language: 'en', areaUnit: 'ha' }),
  'terrawise.plans': '{}',
  'terrawise.analyses.v1': '[]',
  'sb-demo-isolation-auth-token': 'preserve-real-session-sentinel',
}
const farms = [
  { id: 'bekaa', field: 'DEMO · Wheat Terrace', secondary: 'DEMO · Dryland Pulse Strip', name: 'DEMO Bekaa Farmer' },
  { id: 'north', field: 'DEMO · Tomato Garden', secondary: 'DEMO · Potato Rotation Plot', name: 'DEMO North Farmer' },
  { id: 'coast', field: 'DEMO · Coastal Tomato Plot', secondary: 'DEMO · Sandy Legume Strip', name: 'DEMO Coastal Farmer' },
]
try {
  for (const mobile of [false, true]) {
    const layout = mobile ? 'mobile' : 'desktop'
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 }, isMobile: mobile, deviceScaleFactor: 1, serviceWorkers: 'block' })
    let strictDemo = false
    const external = [], errors = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      if (strictDemo) external.push(route.request().url())
      return route.fulfill({ status: 503, body: 'External services disabled by local demo QA.' })
    })
    await context.addInitScript(values => {
      if (sessionStorage.getItem('qa-demo-initialized')) return
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
      sessionStorage.setItem('terrawise.field-draft.v1:new', 'preserve-real-draft')
      sessionStorage.setItem('qa-demo-initialized', 'yes')
    }, protectedData)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const banner = page.getByRole('region', { name: 'Local demo controls' })
    async function fit(label) {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `No horizontal overflow: ${layout} ${label}` }).toBe(true)
    }
    async function protect() {
      const values = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(protectedData))
      expect(values, 'real guest records and auth storage stay byte-for-byte unchanged').toEqual(protectedData)
      expect(await page.evaluate(() => sessionStorage.getItem('terrawise.field-draft.v1:new'))).toBe('preserve-real-draft')
    }
    async function nav(label) {
      if (mobile) await page.getByRole('button', { name: 'Open menu', exact: true }).click()
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click()
    }
    async function shot(name) { await page.screenshot({ path: `${out}/${layout}-${name}.png`, fullPage: true }) }
    try {
      await page.goto(`${base}/login`)
      await expect(page.getByRole('button', { name: 'Try Demo Farm' })).toBeVisible()
      strictDemo = true
      await page.getByRole('button', { name: 'Try Demo Farm' }).click()
      await expect(banner).toBeVisible()
      await expect(page.locator('.dashboard-field-card')).toHaveCount(2)
      await fit('dashboard')
      await shot('dashboard')
      console.log(`PASS ${layout}: one-click demo entry`)
      for (const farm of farms) {
        await banner.getByRole('combobox', { name: 'Demo farm' }).selectOption(farm.id)
        await expect(page.locator('.dashboard-field-card')).toHaveCount(2)
        await expect(page.locator('.dashboard-recent .history-item')).toHaveCount(2)
        await expect(page.locator('.source-nasa-power')).toHaveCount(0)
        await page.locator('.dashboard-field-card').filter({ hasText: farm.field }).getByRole('link').first().click()
        await expect(page.getByRole('heading', { name: farm.field, exact: true })).toBeVisible()
        await expect(page.getByText('DEMO / SYNTHETIC — no measurement', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Calculate historical ETo', exact: true }).click()
        await expect(page.locator('#water-calculations')).toContainText(/Reference ETo:\s*\d+\.\d mm/)
        await expect(page.locator('#water-calculations')).toContainText(/Standard-condition crop ETc:\s*\d+\.\d mm/)
        await expect(page.locator('#water-calculations')).toContainText('DEMO / SYNTHETIC daily fixtures')
        await expect(page.locator('#water-calculations')).toContainText('Effective rainfall and water suitability:')
        await expect(page.locator('#water-calculations')).toContainText('insufficient data')
        await page.getByLabel('Initial root-zone depletion (mm)', { exact: true }).fill('30')
        await page.getByRole('button', { name: 'Save water inputs', exact: true }).click()
        await expect(page.getByText('Water inputs saved. Unknown values remain unknown.')).toBeVisible()
        await page.reload()
        await expect(page.getByLabel('Initial root-zone depletion (mm)', { exact: true })).toHaveValue('30')
        await page.getByText('Check one day of supplied water-balance data', { exact: true }).click()
        await page.getByRole('button', { name: 'Evaluate supplied balance', exact: true }).click()
        await expect(page.locator('.water-balance-calculator')).toContainText('Insufficient data:')
        await page.getByRole('button', { name: 'Load synthetic balance example', exact: true }).click()
        await page.getByRole('button', { name: 'Evaluate supplied balance', exact: true }).click()
        await expect(page.locator('.water-balance-calculator')).toContainText('Calculated end-of-day depletion: 15.0 mm')
        await page.getByLabel('Actual crop ET (mm)', { exact: true }).fill('')
        await page.getByRole('button', { name: 'Evaluate supplied balance', exact: true }).click()
        await expect(page.locator('.water-balance-calculator')).toContainText('Insufficient data:')
        await page.getByText('View monthly data', { exact: true }).click()
        await expect(page.locator('.climate-data-table caption')).toContainText('DEMO / SYNTHETIC fixture')
        await expect(page.locator('.leaflet-tile')).toHaveCount(0)
        await fit(`${farm.id} field`)
        if (farm.id === 'bekaa') await shot('field-and-water')
        await nav('Crop recommendations')
        await expect(page.getByRole('heading', { name: 'Crop recommendations', exact: true })).toBeVisible()
        await expect(page.locator('.ecological-score').first()).toBeVisible()
        await expect(page.locator('.alternative-crop').first()).toContainText('Overall suitability unknown')
        await page.getByLabel('Planting window', { exact: true }).selectOption('Spring')
        await expect(page.locator('.ecological-score').first()).toBeVisible()
        await fit(`${farm.id} screening`)
        if (farm.id === 'bekaa') {
          await shot('crop-screening')
          await page.getByLabel('Planting window', { exact: true }).selectOption('Autumn')
          await page.getByText('Optional regional study reference', { exact: true }).click()
          await page.getByLabel('Season reference', { exact: true }).selectOption('bekaa')
          await expect(page.locator('.local-season-panel')).toContainText('DEMO / SYNTHETIC fixture')
          await page.getByRole('button', { name: 'Load daily historical temperatures', exact: true }).click()
          await expect(page.locator('.local-season-panel')).toContainText('Daily temperature context · DEMO / SYNTHETIC fixture')
        }
        await nav('Rotation planner')
        await expect(page.locator('.rotation-season')).toHaveCount(4)
        const before = await page.locator('.rotation-change select').first().inputValue()
        await page.getByRole('button', { name: 'Generate plan', exact: true }).click()
        const select = page.locator('.rotation-change select').first()
        const candidate = await select.locator('option').evaluateAll((options, current) => options.find(option => option.value !== current).value, before)
        await select.selectOption(candidate)
        await page.getByRole('button', { name: 'Save rotation', exact: true }).click()
        await expect(page.getByText('Your rotation is saved', { exact: true })).toBeVisible()
        await page.reload()
        await expect(page.locator('.rotation-change select').first()).toHaveValue(candidate)
        await expect(page.locator('.rotation-match').first()).toHaveText('Suitability unknown')
        await fit(`${farm.id} planner`)
        if (farm.id === 'bekaa') await shot('planner')
        await nav('Analyze my land')
        await page.getByLabel('Historical climate period', { exact: true }).selectOption('3')
        await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
        await expect(page).toHaveURL(/\/history\/[^/]+$/)
        await expect(page.getByRole('heading', { name: `${farm.field} analysis`, exact: true })).toBeVisible()
        await expect(page.locator('.report-card').nth(1)).toContainText('DEMO / SYNTHETIC offline fixture (not NASA)')
        await expect(page.locator('.annual-history > div')).toHaveCount(3)
        await expect(page.locator('.report-result')).toHaveCount(4)
        await fit(`${farm.id} report`)
        if (farm.id === 'bekaa') {
          await page.emulateMedia({ media: 'print' })
          await expect(banner).toBeVisible()
          await page.emulateMedia({ media: 'screen' })
          await shot('analysis')
        }
        await nav('Analysis history')
        await expect(page.locator('.history-item')).toHaveCount(3)
        await page.locator('.history-item').last().click()
        await page.getByRole('button', { name: 'Delete analysis', exact: true }).click()
        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        await expect(page.locator('.history-item')).toHaveCount(2)
        await page.goto(`${base}/settings`)
        await page.getByLabel('Display name', { exact: true }).fill(`DEMO QA ${farm.id}`)
        await page.getByRole('button', { name: 'Save profile', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
        await page.reload()
        await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(`DEMO QA ${farm.id}`)
        const pending = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Export workspace JSON', exact: true }).click()
        const download = await pending
        expect(download.suggestedFilename()).toBe('agrilumina-DEMO-SYNTHETIC-workspace.json')
        const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
        expect(exported.dataClassification).toBe('demo-synthetic')
        expect(exported.fields.every(field => field.dataClassification === 'demo-synthetic' && field.soil.provenance === 'synthetic')).toBe(true)
        expect(exported.analysisRecords.every(record => record.climate.source === 'demo' && !record.climate.provenance)).toBe(true)
        await fit(`${farm.id} settings`)
        await protect()
        console.log(`PASS ${layout}: ${farm.id} climate, ETo/ETc, water inputs, screening, planner, analysis, history, export and isolation`)
      }
      // Exercise a missing-data fixture: no pH, nutrients, elevation, stages or schedule.
      await page.goto(`${base}/recommendations?field=demo:coast:secondary`)
      await expect(page.getByRole('heading', { name: 'Insufficient Data', exact: true })).toBeVisible()
      await expect(page.locator('.ecological-score')).toHaveCount(0)
      await page.goto(`${base}/fields/demo:coast:secondary`)
      await page.getByRole('button', { name: 'Calculate historical ETo', exact: true }).click()
      await expect(page.locator('#water-calculations')).toContainText('Unknown for the full period')
      await expect(page.locator('#water-calculations')).toContainText('Unknown for this period; a complete dated schedule is required.')
      // Create, edit and delete a field through the normal wizard; every save is retagged.
      await page.goto(`${base}/fields/new`)
      await page.getByLabel('Field name *', { exact: true }).fill('QA New Plot')
      await page.getByLabel('Town / region *', { exact: true }).fill('Synthetic coast')
      await page.getByLabel('Area (hectares) *', { exact: true }).fill('0.7')
      await page.getByLabel('Latitude *', { exact: true }).fill('33.72')
      await page.getByLabel('Longitude *', { exact: true }).fill('35.45')
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await expect(page.getByRole('option', { name: 'DEMO / SYNTHETIC', exact: true })).toHaveCount(1)
      await page.getByLabel('Rainfed', { exact: true }).check()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('checkbox', { name: /Use less water/ }).check()
      await page.getByRole('button', { name: 'Save field', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'DEMO · QA New Plot', exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'Edit field', exact: true }).click()
      await page.getByLabel('Field name *', { exact: true }).fill('QA Edited Plot')
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'DEMO · QA Edited Plot', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Archive field', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Restore field to analyze', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Restore field to analyze', exact: true }).click()
      await page.getByRole('button', { name: 'Remove field', exact: true }).click()
      await page.getByRole('button', { name: 'Delete field', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'My fields', exact: true })).toBeVisible()
      await page.goto(`${base}/agronomist`)
      await expect(page.getByText(/AI Agronomist is unavailable in local Demo Mode/)).toBeVisible()
      await page.goto(`${base}/data-sources`)
      await expect(page.getByText(/This workspace uses DEMO \/ SYNTHETIC climate fixtures/)).toBeVisible()
      // Reset all farms, not the farmer's real workspace.
      await banner.getByRole('button', { name: 'Reset Demo Data', exact: true }).click()
      for (const farm of farms) {
        await banner.getByRole('combobox', { name: 'Demo farm' }).selectOption(farm.id)
        await expect(page.locator('.dashboard-field-card')).toHaveCount(2)
        await page.goto(`${base}/settings`)
        await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(farm.name)
        await page.goto(`${base}/fields/demo:${farm.id}:main`)
        await expect(page.getByLabel('Initial root-zone depletion (mm)', { exact: true })).toHaveValue('25')
      }
      await protect()
      expect(external, 'Demo Mode makes no external account, NASA, map, or AI requests').toEqual([])
      expect(errors, 'No browser exceptions during complete demo workflow').toEqual([])
      strictDemo = false
      await banner.getByRole('button', { name: 'Exit Demo', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Try Demo Farm', exact: true })).toBeVisible()
      await protect()
      await page.goto(base)
      await expect(page.locator('.dashboard-field-card')).toHaveCount(0)
      await expect(page.getByText(/Welcome back, Real QA Farmer/)).toBeVisible()
      console.log(`PASS ${layout}: missing-data handling, field CRUD, AI boundary, reset, exit, preserved real workspace; zero external demo requests`)
    } catch (error) {
      await shot('FAILURE')
      console.error(await page.locator('body').innerText())
      throw error
    } finally { await context.close() }
  }
  console.log('PASS: complete AgriLumina desktop/mobile demo QA. Screenshots: test-results/demo/')
} finally { await browser.close() }
