import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
const base = process.env.BASE_URL || 'http://127.0.0.1:4173'
const origin = new URL(base).origin
const launch = () => chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
let browser
const output = 'test-results/branding'
await mkdir(output, { recursive: true })
const field = { id: 'branding-compatibility-field', name: 'Branding compatibility field', location: 'Test location', area: 1, latitude: 33.85, longitude: 35.9, soil: { ph: 6.5, nitrogen: null, phosphorus: null, potassium: null, organicMatter: null }, water: 'limited', previousCrops: [], priorities: ['soil-health'], image: '/images/field-1.jpg' }
try {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'))
  assert.equal(manifest.name, 'AgriLumina'); assert.equal(manifest.short_name, 'AgriLumina')
  const native = JSON.parse(await readFile('capacitor.config.json', 'utf8'))
  assert.equal(native.appName, 'AgriLumina'); assert.equal(native.appId, 'com.terrawise.app')
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
  assert.equal(pkg.name, 'agrilumina'); assert.equal(lock.packages[''].name, pkg.name)
  for (const [mode, width] of [['desktop', 1440], ['mobile', 390]]) {
    browser = await launch()
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const page = await context.newPage(); const errors = []
    page.on('pageerror', error => errors.push(error.message))
    async function visit(path) {
      await page.goto(base + path)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(page).toHaveTitle('AgriLumina')
      await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /AgriLumina/)
      assert.doesNotMatch(await page.locator('body').innerText(), /Terra\s*Wise/i)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${mode} overflow at ${path}`)
    }
    for (const path of ['/about', '/login', '/signup', '/forgot-password', '/update-password']) {
      await visit(path)
      await expect(page.getByRole('link', { name: 'AgriLumina home' }).first()).toBeVisible()
      if (path === '/login') await page.screenshot({ path: `${output}/${mode}-login.png`, fullPage: true })
    }
    await visit('/')
    await page.evaluate(value => {
      localStorage.setItem('terrawise.fields.v1', JSON.stringify([value]))
      localStorage.setItem('terrawise.preferences', JSON.stringify({ name: 'Brand QA Farmer', climateMode: 'live', language: 'en', areaUnit: 'ha' }))
    }, field)
    await page.reload()
    await expect(page.getByRole('heading', { name: field.name, exact: true }).first()).toBeVisible()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.fields.v1'))[0].id), field.id)
    for (const path of ['/fields', `/fields/${field.id}`, '/settings', '/analysis', '/history', '/agronomist']) await visit(path)
    await expect(page.locator('.ag-chat-top')).toContainText('AgriLumina Agronomist')
    await visit('/about')
    await page.getByRole('button', { name: 'Try Demo Farm', exact: true }).click()
    await visit('/')
    await expect(page.locator('.demo-banner')).toBeVisible()
    await page.screenshot({ path: `${output}/${mode}-dashboard.png`, fullPage: true })
    if (mode === 'mobile') {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().x)).toBe(0)
      await expect(page.getByRole('link', { name: 'AgriLumina home' })).toBeVisible()
      await page.screenshot({ path: `${output}/mobile-navigation.png` })
      await page.keyboard.press('Escape')
    }
    for (const path of ['/recommendations', '/planner', '/history', '/agronomist']) await visit(path)
    await page.goto(base + '/settings')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export workspace JSON' }).click()
    assert.equal((await downloadPromise).suggestedFilename(), 'agrilumina-DEMO-SYNTHETIC-workspace.json')
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('terrawise.fields.v1'))[0].id), field.id)
    assert.deepEqual(errors, [])
    console.log(`PASS ${mode}: AgriLumina branding, title/meta, auth pages, field/dashboard/AI/science views, export filename, legacy-key data preservation and no page errors`)
    await context.close(); await browser.close()
  }
} finally { await browser?.close() }
