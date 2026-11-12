import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

// Synthetic browser fixtures. No real auth, AI, NASA or database requests.
const base = process.env.BASE_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const id = '11111111-1111-4111-8111-111111111111'
const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url')
const token = b64({ alg: 'HS256' }) + '.' + b64({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.synthetic'
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'farmer@example.test', app_metadata: {}, user_metadata: { display_name: 'Farmer' }, created_at: '2025-01-01T00:00:00Z' }
const field = { id: 'qa-field', name: 'Bekaa test field', location: 'Synthetic location', area: 1, latitude: 33.8, longitude: 35.9, water: 'limited', soil: { ph: 6.5, nitrogen: null, phosphorus: null, potassium: null, organicMatter: null, provenance: 'measured' }, previousCrops: [], priorities: [], image: '/images/field-1.jpg' }
const workspace = { owner_id: id, fields: [field, { ...field, id: 'qa-other', name: 'Coastal test field' }], plans: {}, analyses: [], preferences: { name: 'Farmer', climateMode: 'live', language: 'en', areaUnit: 'ha' }, version: 1 }
let requests = [], writes = 0, configured = false, failOnce = false, freeQuotaOnce = false
const json = (route, data, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Expose-Headers': 'Retry-After', ...headers } })
await page.route('https://mock-terrawise.supabase.co/**', async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method()
  if (url.pathname === '/auth/v1/token') return json(route, { access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user })
  if (url.pathname === '/auth/v1/user') return json(route, user)
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
  if (url.pathname === '/rest/v1/terrawise_workspaces') {
    if (method !== 'GET') { writes++; return json(route, { version: workspace.version + 1 }) }
    return json(route, [workspace])
  }
  if (url.pathname === '/functions/v1/ai-agronomist') {
    assert.match(request.headers().authorization, /^Bearer /)
    if (method === 'GET') return json(route, { available: configured, mode: configured ? 'configured' : 'unavailable', readOnly: true, costMode: 'free-only', provider: configured ? 'gemini' : null, model: configured ? 'gemini-3.5-flash-lite' : null })
    const body = request.postDataJSON()
    requests.push(body)
    assert.deepEqual(Object.keys(body).sort(), ['climateYear', 'fieldId', 'history', 'language', 'question', 'season'].sort())
    if (freeQuotaOnce) { freeQuotaOnce = false; return json(route, { error: { code: 'FREE_QUOTA_EXHAUSTED' } }, 429, { 'Retry-After': '2' }) }
    if (failOnce) { failOnce = false; return json(route, { error: { code: 'TIMEOUT' } }, 504) }
    await new Promise(resolve => setTimeout(resolve, 250))
    const ar = body.language === 'ar'
    return json(route, {
      mode: 'live', provider: 'gemini', model: 'gemini-3.5-flash-lite', costMode: 'free-only',
      answer: { paragraphs: [{ text: ar ? 'حموضة التربة وحدها لا تكفي للحكم على ملاءمة البطاطا. يلزم التحقق من الصرف والمياه والتاريخ المرضي محلياً.' : 'Soil pH alone cannot establish potato suitability. Review drainage, water supply and crop history with a local agronomist.', evidenceIds: ['soil-ph', 'fao-soil-ph'] }], missingData: [ar ? 'بيانات الصرف ونوعية المياه غير مكتملة.' : 'Drainage and water quality remain unknown.'], followUpQuestions: [ar ? 'شو بعد ناقصني للري؟' : 'What irrigation data do I still need?'] },
      context: { evidence: [
        { id: 'soil-ph', label: ar ? 'حموضة التربة' : 'Soil pH', value: '6.5 pH', category: 'farmer', sourceIds: [] },
        { id: 'nasa', label: ar ? 'ناسا التاريخية' : 'Historical NASA estimate', value: '18 °C', category: 'nasa', sourceIds: [] },
        { id: 'screen', label: ar ? 'الفحص الأولي' : 'Provisional screening', value: 'low confidence', category: 'calculated', sourceIds: [] },
        { id: 'range', label: ar ? 'مجال مرجعي' : 'Reference range', value: '5–6.2 pH optimal', category: 'reference', sourceIds: [] },
        { id: 'water', label: ar ? 'المياه المتاحة' : 'Water supply', value: ar ? 'غير معروف' : 'Unknown', category: 'unknown', sourceIds: [] }
      ], missing: [ar ? 'نوعية مياه الري غير معروفة.' : 'Irrigation water quality is unknown.'], limitations: [ar ? 'هذا فحص أولي وليس توصية زراعة كاملة.' : 'This is provisional screening, not a complete planting recommendation.'], snapshot: { workspaceVersion: 1, computedAt: new Date().toISOString(), climateYear: body.climateYear, season: body.season } },
      sources: [{ id: 'fao-soil-ph', title: 'FAO Soils Portal', url: 'https://www.fao.org/soils-portal/', summary: 'Synthetic fixture', scope: 'General soil chemistry', reviewedOn: '2026-11-12' }]
    })
  }
  return json(route, { error: 'Unexpected synthetic request' }, 404)
})
// Dashboard climate requests after login are intercepted, never sent to NASA.
await page.route('https://power.larc.nasa.gov/**', route => json(route, { error: 'Synthetic NASA outage' }, 503))
await page.route(/https:\/\/(?:api\.openai\.com|generativelanguage\.googleapis\.com|api\.groq\.com)\//, () => { throw new Error('Browser attempted to call the AI provider') })
try {
  await page.goto(base + '/agronomist')
  await expect(page.getByRole('heading', { name: 'Your AI Agronomist' })).toBeVisible()
  await expect(page.getByText('Sign in to ask about your own fields.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask agronomist', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email address').fill('farmer@example.test')
  await page.locator('input[autocomplete="current-password"]').fill('synthetic-password')
  await page.getByRole('button', { name: /^Sign in/ }).click()
  await expect(page.getByRole('heading', { name: /Good things start with a plan/ })).toBeVisible()
  await page.goto(base + '/agronomist')
  await expect(page.getByText('Live AI is unavailable. The server connection needs to be configured.')).toBeVisible()
  await expect(page.getByLabel('Your field')).toHaveValue('qa-field')
  configured = true
  await page.getByRole('button', { name: 'Check connection again' }).click()
  await expect(page.getByText('Server configured · ready to ask')).toBeVisible()
  await page.getByRole('button', { name: 'Is my soil suitable for potatoes?', exact: true }).click()
  await expect(page.getByLabel('Your agricultural question')).toHaveValue('Is my soil suitable for potatoes?')
  const writesBefore = writes
  await page.getByRole('button', { name: 'Ask agronomist', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Reviewing your field evidence' })).toBeVisible()
  await expect(page.getByText('Soil pH alone cannot establish potato suitability.', { exact: false })).toBeVisible()
  await expect(page.locator('.ag-citations a')).toHaveAttribute('href', 'https://www.fao.org/soils-portal/')
  await expect(page.getByText('This is provisional screening, not a complete planting recommendation.')).toBeVisible()
  assert.equal(writes, writesBefore)
  assert.equal(requests[0].fieldId, 'qa-field')
  await mkdir('test-results', { recursive: true })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: 'test-results/agronomist-desktop.png', fullPage: true })
  failOnce = true
  await page.getByLabel('Your agricultural question').fill('What does ETo mean?')
  await page.getByRole('button', { name: 'Ask agronomist', exact: true }).click()
  await expect(page.getByText('The request timed out. Please retry.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry question', exact: true }).click()
  await expect(page.locator('.ag-turn')).toHaveCount(2)
  freeQuotaOnce = true
  await page.getByLabel('Your agricultural question').fill('What data are missing for irrigation?')
  await page.getByRole('button', { name: 'Ask agronomist', exact: true }).click()
  await expect(page.getByText(/The free AI quota has been reached/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry question', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry question', exact: true })).toBeEnabled({ timeout: 5000 })
  await page.getByLabel('Your field').selectOption('qa-other')
  await expect(page.locator('.ag-turn')).toHaveCount(0)
  await page.getByLabel('Response language').selectOption('ar')
  await expect(page.locator('.ag-page')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'مستشارك الزراعي الذكي' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'شو بتعني حموضة التربة عندي؟', exact: true }).click()
  await page.getByRole('button', { name: 'اسأل المستشار', exact: true }).click()
  await expect(page.getByText(/حموضة التربة وحدها لا تكفي/)).toBeVisible()
  assert.equal(requests.at(-1).language, 'ar')
  assert.equal(requests.at(-1).fieldId, 'qa-other')
  assert.deepEqual(requests.at(-1).history, [])
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page must not overflow')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: 'test-results/agronomist-arabic-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'مسح المحادثة', exact: true }).click()
  await expect(page.locator('.ag-turn')).toHaveCount(0)
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('Agronomist browser QA passed: guest/account access, unavailable service, field selection, citations, loading, retry, free-quota cooldown, read-only behavior, context reset and Arabic mobile layout. Synthetic services only.')
} finally { await browser.close() }
