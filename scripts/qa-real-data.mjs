import assert from 'node:assert/strict'
import { chromium, expect as playwrightExpect } from '@playwright/test'

// Isolated browser contexts; test-only POWER response is synthetic and is
// never loaded into the user's profile or shipped as an application fallback.
const base = process.env.BASE_URL || 'http://localhost:4173'
const executablePath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const expect = playwrightExpect.configure({ timeout: 15000 })
const browser = await chromium.launch({ executablePath, headless: true })
const nasa = '**/api/temporal/monthly/point**'
const nasaDaily = '**/api/temporal/daily/point**'

function fixture(url) {
  const query = new URL(url).searchParams
  const parameter = { T2M: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {}, RH2M: {} }
  for (let year = Number(query.get('start')); year <= Number(query.get('end')); year++) {
    for (let month = 1; month <= 12; month++) {
      const key = `${year}${String(month).padStart(2, '0')}`
      parameter.T2M[key] = 17; parameter.PRECTOTCORR[key] = 2; parameter.ALLSKY_SFC_SW_DWN[key] = 18; parameter.RH2M[key] = 60
    }
  }
  return { header: { fill_value: -999 }, parameters: { T2M: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day' }, RH2M: { units: '%' } }, properties: { parameter } }
}
function dailyFixture(url) {
  const query = new URL(url).searchParams
  const start = query.get('start'), end = query.get('end')
  const toTime = value => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)))
  const data = { T2M_MIN: 2, T2M_MAX: 22, T2MDEW: 0, WS2M: 2, PS: 100, ALLSKY_SFC_SW_DWN: 22, PRECTOTCORR: 2 }
  const unit = { T2M_MIN: 'C', T2M_MAX: 'C', T2MDEW: 'C', WS2M: 'm/s', PS: 'kPa', ALLSKY_SFC_SW_DWN: 'MJ/m^2/day', PRECTOTCORR: 'mm/day' }
  const selected = query.get('parameters').split(',')
  const parameter = Object.fromEntries(selected.map(name => [name, {}]))
  for (let time = toTime(start); time <= toTime(end); time += 86400000) {
    const key = new Date(time).toISOString().slice(0, 10).replaceAll('-', '')
    for (const name of selected) parameter[name][key] = data[name]
  }
  return { header: { fill_value: -999 }, parameters: Object.fromEntries(selected.map(name => [name, { units: unit[name] }])), properties: { parameter } }
}

async function open(page, path) { assert.equal((await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })).status(), 200) }
async function createField(page) {
  await open(page, '/fields/new')
  for (const [id, value] of Object.entries({ name: 'QA Farm', location: 'Test point', area: '2', latitude: '33.8467', longitude: '35.9019' })) await page.locator(`#${id}`).fill(value)
  await page.locator('#elevationM').fill('1000')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('#ph')).toHaveValue('')
  await page.locator('#ph').fill('15')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('#ph-error')).toBeVisible()
  await page.locator('#ph').fill('6.5')
  await page.getByLabel('Rainfed', { exact: true }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Add previous crop' }).click()
  await expect(page.locator('#history-crop-0')).toHaveValue('')
  await page.locator('#history-crop-0').selectOption('wheat')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="priorities"][value="soil-health"]').check()
  await page.getByRole('button', { name: 'Save field' }).click()
  await expect(page).toHaveURL(/\/fields\/[^/]+$/)
  const fields = await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.fields.v1')))
  assert.equal(fields.length, 1); assert.equal(fields[0].soil.nitrogen, null); assert.equal(fields[0].soil.ph, 6.5)
  return fields[0].id
}

try {
  for (const mode of ['failure', 'fixture', 'mobile-fixture']) {
    const context = await browser.newContext({ viewport: { width: mode === 'fixture' ? 1440 : 390, height: 900 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await context.route(nasa, route => mode === 'failure' ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(route.request().url())) }))
    await context.route(nasaDaily, route => mode === 'failure' ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dailyFixture(route.request().url())) }))
    await open(page, '/')
    await expect(page.getByText('Your farm starts here')).toBeVisible()
    await expect(page.locator('.dashboard-field-card')).toHaveCount(0)
    await expect(page.locator('.mini-score')).toHaveCount(0)
    const id = await createField(page)
    if (mode === 'failure') {
      await expect(page.getByText(/No historical data is available/).first()).toBeVisible()
      await expect(page.locator('.climate-data-table')).toHaveCount(0)
      await open(page, `/recommendations?field=${id}`)
      await expect(page.getByText(/Crop profiles require historical climate data/)).toBeVisible()
      await expect(page.locator('.suitability-score')).toHaveCount(0)
      await open(page, `/planner?field=${id}`)
      await expect(page.getByText('Climate data unavailable', { exact: true })).toBeVisible()
      await expect(page.locator('.rotation-season')).toHaveCount(0)
      await open(page, `/analysis?field=${id}`)
      await page.getByRole('button', { name: 'Run analysis' }).click()
      await expect(page.locator('[role="alert"]')).toContainText('No historical data is available')
      assert.equal(await page.evaluate(() => localStorage.getItem('terrawise.analyses.v1')), null)
    } else {
      await expect(page.locator('.field-detail-climate .source-note')).toContainText('NASA POWER')
      await expect(page.locator('.climate-data-table tbody tr')).toHaveCount(12)
      const inputs = page.locator('.water-inputs-section')
      await inputs.getByLabel('Field capacity (% volume)').fill('30')
      await inputs.getByLabel('Permanent wilting point (% volume)').fill('10')
      await inputs.getByLabel('Effective rooting depth (m)').fill('1')
      await inputs.getByLabel('Initial root-zone depletion (mm)').fill('25')
      const endYear = new Date().getUTCFullYear() - 1
      await inputs.getByLabel('Schedule type').selectOption('planned')
      await inputs.getByLabel('Record start').fill(`${endYear - 1}-11-01`)
      await inputs.getByLabel('Record end').fill(`${endYear}-06-30`)
      await inputs.getByRole('button', { name: 'Add irrigation event' }).click()
      await inputs.getByLabel('Irrigation date 1').fill(`${endYear}-03-01`)
      await inputs.getByLabel('Applied depth 1 (mm)').fill('10')
      await inputs.getByLabel('Water profile crop', { exact: true }).selectOption('wheat')
      await inputs.getByLabel('Planting date').fill(`${endYear - 1}-11-01`)
      await inputs.getByLabel('Kc and stage source').fill('Synthetic test source')
      for (const [label, value] of Object.entries({ 'Initial stage (days)': '1', 'Development stage (days)': '1', 'Mid stage (days)': '365', 'Late stage (days)': '1', 'Initial Kc': '0.4', 'Mid-season Kc': '1.15', 'End-season Kc': '0.3' })) await inputs.getByLabel(label, { exact: true }).fill(value)
      await inputs.getByRole('button', { name: 'Save water inputs' }).click()
      await expect(inputs.getByText('Water inputs saved. Unknown values remain unknown.')).toBeVisible()
      await page.reload()
      await expect(page.locator('.water-inputs-section').getByLabel('Field capacity (% volume)')).toHaveValue('30')
      assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.fields.v1'))))[0].waterInputs.irrigationEvents[0].appliedMm, 10)
      await open(page, `/recommendations?field=${id}`)
      await expect(page.getByText('No ranked recommendations: insufficient evidence')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Ranked two-factor screens' })).toBeVisible()
      await expect(page.locator('.alternative-crop')).toHaveCount(4)
      await expect(page.locator('.ecological-score')).toHaveCount(4)
      await expect(page.locator('.alternative-crop').first()).toContainText('pH + temperature screen only')
      await expect(page.locator('.alternative-crop').first()).toContainText('Overall suitability unknown')
      await expect(page.locator('.crop-comparison')).toContainText('Overall ranking is unavailable')
      await page.getByText('View other exploratory factors and limitations').first().click()
      await expect(page.locator('.alternative-crop').first()).toContainText('Unknown / unscored')
      await expect(page.locator('.alternative-crop').first()).toContainText('Water fit')
      await page.getByLabel('Season reference').selectOption('bekaa')
      await expect(page.getByRole('heading', { name: 'Bekaa wheat: historical reference' })).toBeVisible()
      await expect(page.locator('.local-water-evidence')).toContainText('Water suitability')
      await expect(page.locator('.local-water-evidence')).toContainText('Unknown / unscored')
      await expect(page.locator('.ecological-score')).toHaveCount(1)
      await page.getByRole('button', { name: 'Load daily historical temperatures' }).click()
      await expect(page.locator('.local-daily-result').filter({ hasText: 'Historical daily temperature context' })).toContainText('not on-farm measurements')
      await page.getByRole('button', { name: 'Calculate historical ETo' }).click()
      await expect(page.getByText(/ETo available for/)).toBeVisible()
      await expect(page.getByText(/using your supplied Kc profile/)).toBeVisible()
      await expect(page.getByText(/Planned irrigation applied/)).toContainText('10.0 mm')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.getByLabel('Planting window').selectOption('Spring')
      await expect(page.getByText(/Spring is outside its observed reference/)).toBeVisible()
      await open(page, `/planner?field=${id}`)
      await expect(page.locator('.rotation-season')).toHaveCount(4)
      await page.getByRole('button', { name: 'Save rotation' }).click()
      await expect(page.getByText('Your rotation is saved')).toBeVisible()
      await page.reload()
      await expect(page.locator('.rotation-season')).toHaveCount(4)
      await open(page, `/analysis?field=${id}`)
      await page.getByRole('button', { name: 'Run analysis' }).click()
      await expect(page).toHaveURL(/\/history\/[^/]+$/)
      await expect(page.locator('.analysis-report')).toContainText('NASA POWER')
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.analyses.v1')))
      assert.equal(saved[0].climate.source, 'nasa-power'); assert.equal(saved[0].recommendations.length, 4); assert.equal(saved[0].recommendations[0].completeness, 38); assert.equal(saved[0].recommendations[0].score, null); assert.equal(saved[0].recommendations[0].factors.find(f => f.name === 'Water fit').score, null)
      await page.evaluate(() => {
        const records = JSON.parse(localStorage.getItem('terrawise.analyses.v1'))
        records[0].modelVersion = 'terrawise-heuristic-v1.2'
        for (const item of records[0].recommendations) {
          item.score = 61
          item.factors = item.factors.map(factor => ({ ...factor, score: factor.score ?? 0 }))
          delete item.constraints
          delete item.decision
        }
        localStorage.setItem('terrawise.analyses.v1', JSON.stringify(records))
      })
      await page.reload()
      await expect(page.locator('.analysis-report')).toContainText('Historical confidence and completeness are unvalidated')
      await page.getByText('Factor evidence', { exact: true }).first().click()
      await expect(page.locator('.report-result').first()).toContainText('Unknown / unscored')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.analyses.v1'))[0].recommendations[0].score), 61)
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    assert.deepEqual(errors, [])
    console.log(`PASS ${mode}: empty workspace, field validation, persistence, climate and ${mode === 'failure' ? 'failure states on mobile' : 'two-factor screens, Bekaa reference, daily extremes, planner and history'}`)
    await context.close()
  }
  {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage(); let requests = 0
    await context.route(nasa, route => { requests++; return route.fulfill({ status: 503, body: 'unavailable' }) })
    await open(page, '/')
    await expect(page.getByText('Your farm starts here')).toBeVisible()
    await page.evaluate(() => localStorage.setItem('terrawise.fields.v1', JSON.stringify([{ id: 'north-field', name: 'Edited old example', location: 'Unverified location', area: 1, latitude: 33.8467, longitude: 35.9019, soil: { ph: 6.8, nitrogen: 28, phosphorus: 22, potassium: 165, organicMatter: 2.8 }, water: 'limited', previousCrops: [], priorities: ['soil-health'], image: '/images/field-1.jpg' }])))
    await open(page, '/fields')
    await expect(page.getByText('Unverified legacy field')).toBeVisible()
    await expect(page.locator('.fields-card-metrics')).not.toContainText('6.8')
    await page.getByRole('link', { name: /Edited old example/ }).click()
    await expect(page.getByRole('heading', { name: 'Review this older field' })).toBeVisible()
    assert.equal(requests, 0, 'unreviewed example field must not request NASA data')
    await page.getByRole('link', { name: 'Review field' }).click()
    await expect(page.getByText(/may be simulated/)).toBeVisible()
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(/confirm they now represent your field/)).toBeVisible()
    await page.getByLabel(/I reviewed the location/).check()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(/\/fields\/north-field$/)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.fields.v1'))[0].reviewedRealData), true)
    console.log('PASS legacy migration: edited example inputs remain stored, are gated from analysis, and require explicit review')
    await context.close()
  }
} finally { await browser.close() }
