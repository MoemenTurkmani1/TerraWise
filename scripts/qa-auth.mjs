import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

// Synthetic HTTP fixtures only. This does not verify a real provider or RLS.
const origin = process.env.BASE_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
const page = await context.newPage()
const errors = []
const workspaces = new Map()
let rejectWrites = false
let rejectReads = false
let workspaceReads = 0
page.on('pageerror', error => errors.push(error.message))
const users = {
  'alice@example.test': { id: '11111111-1111-4111-8111-111111111111', name: 'Alice' },
  'bob@example.test': { id: '22222222-2222-4222-8222-222222222222', name: 'Bob' },
}
const b64 = object => Buffer.from(JSON.stringify(object)).toString('base64url')
const token = id => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })}.signature`
const json = (route, status, value) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
await page.route('https://mock-terrawise.supabase.co/**', async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method()
  if (url.pathname === '/auth/v1/token' && method === 'POST') {
    const body = request.postDataJSON(), entry = users[body.email]
    if (!entry || body.password !== 'password123') return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
    const user = { id: entry.id, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: {}, user_metadata: { display_name: entry.name }, created_at: '2024-01-01T00:00:00Z' }
    return json(route, 200, { access_token: token(entry.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${entry.id}`, user })
  }
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' })
  if (url.pathname === '/rest/v1/terrawise_workspaces') {
    const authorization = request.headers().authorization || '', jwt = authorization.replace(/^Bearer /, '')
    let owner = ''
    try { owner = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sub } catch { return json(route, 401, { message: 'Missing mock identity' }) }
    const requested = url.searchParams.get('owner_id')?.replace(/^eq\./, '')
    if (requested && requested !== owner) return json(route, 403, { message: 'Mock owner mismatch' })
    if (method === 'GET') { workspaceReads++; if (rejectReads) return json(route, 503, { message: 'Synthetic read outage' }); return json(route, 200, workspaces.has(owner) ? [workspaces.get(owner)] : []) }
    if (rejectWrites) return json(route, 503, { message: 'Synthetic service outage' })
    const body = request.postDataJSON()
    if (method === 'POST') {
      if (body.owner_id !== owner) return json(route, 403, { message: 'Mock owner mismatch' })
      if (workspaces.has(owner)) return json(route, 409, { code: '23505', message: 'Duplicate workspace' })
      workspaces.set(owner, body); return json(route, 201, { version: body.version })
    }
    if (method === 'PATCH') {
      const prior = workspaces.get(owner), expected = Number(url.searchParams.get('version')?.replace(/^eq\./, ''))
      if (!prior || prior.version !== expected) return json(route, 406, { code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested' })
      workspaces.set(owner, { ...prior, ...body }); return json(route, 200, { version: body.version })
    }
  }
  return json(route, 404, { message: `Unexpected mock request ${method} ${url.pathname}` })
})

// Do not send synthetic field coordinates to the real NASA endpoint.
await page.route('**/api/temporal/monthly/point**', route => {
  const query = new URL(route.request().url()).searchParams
  const parameter = { T2M: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {}, RH2M: {} }
  for (let year = Number(query.get('start')); year <= Number(query.get('end')); year++) {
    for (let month = 1; month <= 12; month++) {
      const date = `${year}${String(month).padStart(2, '0')}`
      parameter.T2M[date] = 17; parameter.PRECTOTCORR[date] = 2
      parameter.ALLSKY_SFC_SW_DWN[date] = 18; parameter.RH2M[date] = 60
    }
  }
  return json(route, 200, { header: { fill_value: -999 }, parameters: { T2M: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day' }, RH2M: { units: '%' } }, properties: { parameter } })
})

async function login(email) {
  await page.goto(`${origin}/login`)
  await page.getByLabel('Email address').fill(email)
  await page.locator('input[autocomplete="current-password"]').fill('password123')
  await page.getByRole('button', { name: /^Sign in/ }).click()
  await expect(page.getByRole('heading', { name: /Good things start with a plan/ })).toBeVisible({ timeout: 15000 })
}
async function logout() {
  await page.goto(`${origin}/settings`)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByLabel('Email address')).toBeVisible()
}
async function createField(name) {
  await page.goto(`${origin}/fields/new`)
  await page.locator('#name').fill(name)
  await page.locator('#location').fill('Test location')
  await page.locator('#area').fill('1')
  await page.locator('#latitude').fill('33.8')
  await page.locator('#longitude').fill('35.9')
  await page.locator('#elevationM').fill('1000')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('#ph').fill('6.5')
  await page.getByRole('radio', { name: 'Limited irrigation' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="priorities"][value="soil-health"]').check()
  await page.getByRole('button', { name: 'Save field', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 15000 })
}
try {
  await page.goto(origin)
  await createField('Guest test field')
  await login('alice@example.test')
  await expect(page.getByText('Guest test field', { exact: true })).toHaveCount(0)
  await createField('Alice private field')
  assert.equal(workspaces.get(users['alice@example.test'].id).fields[0].name, 'Alice private field')
  assert.equal(workspaces.get(users['alice@example.test'].id).fields.length, 1, 'Guest fields must not be copied to the account')
  const aliceId = users['alice@example.test'].id
  const aliceFieldId = workspaces.get(aliceId).fields[0].id
  assert.equal(workspaces.get(aliceId).fields[0].elevationM, 1000)
  assert.equal(workspaces.get(aliceId).fields[0].soil.ph, 6.5)
  assert.equal(workspaces.get(aliceId).fields[0].soil.nitrogen, null)
  const water = page.locator('.water-inputs-section')
  const waterValues = {
    'Field capacity (% volume)': '30', 'Permanent wilting point (% volume)': '10',
    'Effective rooting depth (m)': '1', 'Initial root-zone depletion (mm)': '25',
    'Initial stage (days)': '20', 'Development stage (days)': '30',
    'Mid stage (days)': '150', 'Late stage (days)': '42',
    'Initial Kc': '0.4', 'Mid-season Kc': '1.15', 'End-season Kc': '0.3',
  }
  for (const [label, value] of Object.entries(waterValues)) await water.getByLabel(label, { exact: true }).fill(value)
  await water.getByLabel('Schedule type').selectOption('planned')
  await water.getByLabel('Record start').fill('2024-11-01')
  await water.getByLabel('Record end').fill('2025-06-30')
  for (const [index, date, depth] of [[1, '2025-03-01', '10'], [2, '2025-03-02', '0']]) {
    await water.getByRole('button', { name: 'Add irrigation event' }).click()
    await water.getByLabel(`Irrigation date ${index}`).fill(date)
    await water.getByLabel(`Applied depth ${index} (mm)`).fill(depth)
  }
  await water.getByLabel('Water profile crop', { exact: true }).selectOption('wheat')
  await water.getByLabel('Planting date').fill('2024-11-01')
  await water.getByLabel('Kc and stage source').fill('Synthetic account integration source')
  await water.getByRole('button', { name: 'Save water inputs' }).click()
  await expect(water.getByText('Water inputs saved. Unknown values remain unknown.')).toBeVisible()
  const expectedWater = {
    fieldCapacityPercent: 30, wiltingPointPercent: 10, rootDepthM: 1, initialDepletionMm: 25,
    scheduleKind: 'planned', scheduleStart: '2024-11-01', scheduleEnd: '2025-06-30',
    irrigationEvents: [{ date: '2025-03-01', appliedMm: 10 }, { date: '2025-03-02', appliedMm: 0 }],
    growth: { cropId: 'wheat', plantedOn: '2024-11-01', source: 'Synthetic account integration source', initialDays: 20, developmentDays: 30, midDays: 150, lateDays: 42, kcInitial: 0.4, kcMid: 1.15, kcEnd: 0.3 },
  }
  assert.deepEqual(workspaces.get(aliceId).fields[0].waterInputs, expectedWater)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Alice private field', exact: true })).toBeVisible()
  for (const [label, value] of Object.entries(waterValues)) await expect(water.getByLabel(label, { exact: true })).toHaveValue(value)
  await expect(water.getByLabel('Schedule type')).toHaveValue('planned')
  await expect(water.getByLabel('Record start')).toHaveValue('2024-11-01')
  await expect(water.getByLabel('Record end')).toHaveValue('2025-06-30')
  await expect(water.getByLabel('Applied depth 2 (mm)')).toHaveValue('0')
  await expect(water.getByLabel('Water profile crop', { exact: true })).toHaveValue('wheat')
  await expect(water.getByLabel('Planting date')).toHaveValue('2024-11-01')
  await expect(water.getByLabel('Kc and stage source')).toHaveValue(expectedWater.growth.source)
  await expect(water).toContainText('200.0 mm')
  await page.goto(`${origin}/planner?field=${aliceFieldId}`)
  await expect(page.locator('.rotation-season')).toHaveCount(4)
  await page.getByRole('button', { name: 'Save rotation' }).click()
  await expect(page.getByText('Your rotation is saved')).toBeVisible()
  assert.equal(workspaces.get(aliceId).plans[aliceFieldId].length, 4)
  await page.goto(`${origin}/analysis?field=${aliceFieldId}`)
  await page.getByRole('button', { name: 'Run analysis' }).click()
  await expect(page.locator('.analysis-report')).toContainText('NASA POWER')
  assert.equal(workspaces.get(aliceId).analyses.length, 1)
  assert.deepEqual(workspaces.get(aliceId).analyses[0].field.waterInputs, expectedWater)
  assert.equal(workspaces.get(aliceId).analyses[0].recommendations.every(item => item.score === null), true)
  await page.reload()
  await expect(page.locator('.analysis-report')).toContainText('NASA POWER')
  await page.goto(`${origin}/settings`)
  await page.getByLabel('Display name').fill('Alice workspace profile')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  await page.getByLabel('Default unit for new fields').selectOption('acre')
  await expect.poll(() => workspaces.get(aliceId).preferences.areaUnit).toBe('acre')
  await page.reload()
  await expect(page.getByLabel('Display name')).toHaveValue('Alice workspace profile')
  await expect(page.getByLabel('Default unit for new fields')).toHaveValue('acre')
  await expect(page.locator('.settings-data-summary')).toContainText('1 saved plans')
  await expect(page.locator('.settings-data-summary')).toContainText('1 analyses')
  assert.deepEqual(workspaces.get(aliceId).fields[0].waterInputs, expectedWater)
  const aliceSaved = structuredClone(workspaces.get(aliceId))
  await logout()
  await page.goto(origin)
  await expect(page.getByText('Guest test field', { exact: true }).first()).toBeVisible()
  const guest = await page.evaluate(() => ({ fields: JSON.parse(localStorage.getItem('terrawise.fields.v1')), plans: localStorage.getItem('terrawise.plans'), analyses: localStorage.getItem('terrawise.analyses.v1'), preferences: localStorage.getItem('terrawise.preferences') }))
  assert.equal(guest.fields.length, 1)
  assert.equal(guest.fields[0].name, 'Guest test field')
  assert.equal(guest.fields[0].waterInputs, undefined)
  assert.equal(guest.plans, null); assert.equal(guest.analyses, null); assert.equal(guest.preferences, null)
  await login('bob@example.test')
  await expect(page.getByText('Alice private field')).toHaveCount(0)
  await page.goto(`${origin}/settings`)
  await expect(page.getByLabel('Display name')).toHaveValue('Bob')
  await expect(page.getByLabel('Default unit for new fields')).toHaveValue('ha')
  await expect(page.locator('.settings-data-summary')).toContainText('0 saved plans')
  await expect(page.locator('.settings-data-summary')).toContainText('0 analyses')
  await createField('Bob private field')
  await water.getByRole('button', { name: 'Save water inputs' }).click()
  await expect(water.getByText('Water inputs saved. Unknown values remain unknown.')).toBeVisible()
  const bobWater = workspaces.get(users['bob@example.test'].id).fields[0].waterInputs
  assert.equal(bobWater.fieldCapacityPercent, null)
  assert.equal(bobWater.initialDepletionMm, null)
  assert.equal(bobWater.scheduleKind, 'unknown')
  assert.equal(bobWater.growth.kcMid, null)
  assert.deepEqual(workspaces.get(aliceId), aliceSaved, 'Bob must not alter any Alice workspace data')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bob private field', exact: true })).toBeVisible()
  await expect(water.getByLabel('Field capacity (% volume)')).toHaveValue('')
  await expect(page.getByText('Alice private field')).toHaveCount(0)
  await logout()
  await login('alice@example.test')
  await expect(page.getByRole('heading', { name: 'Alice private field', exact: true })).toBeVisible()
  // A failed account load must not expose guest data or overwrite remote data.
  rejectReads = true
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Synthetic read outage')
  await expect(page.getByText('Guest test field', { exact: true })).toHaveCount(0)
  assert.deepEqual(workspaces.get(aliceId), aliceSaved)
  rejectReads = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice private field', exact: true })).toBeVisible()
  rejectWrites = true
  await page.goto(`${origin}/fields/${workspaces.get(users['alice@example.test'].id).fields[0].id}/edit`)
  await page.locator('#name').fill('Unsaved test name')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: /Could not save|not confirmed|outage/i }).first()).toBeVisible({ timeout: 15000 })
  assert.deepEqual(workspaces.get(aliceId), aliceSaved)
  // A metadata event for the same account must not reload over unsaved edits.
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Unsaved test name', { exact: true })).toHaveCount(0)
  const readsBeforeRefresh = workspaceReads
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => /^sb-.*-auth-token$/.test(item))
    if (!key) throw new Error('Synthetic session was not persisted')
    const session = JSON.parse(localStorage.getItem(key))
    session.user.user_metadata.display_name = 'Changed synthetic metadata'
    session.user.email = 'changed-synthetic@example.test'
    const channel = new BroadcastChannel(key)
    channel.postMessage({ event: 'USER_UPDATED', session })
    channel.close()
  })
  await expect(page.getByText(/changed-synthetic@example\.test/)).toBeVisible()
  assert.equal(workspaceReads, readsBeforeRefresh, 'Metadata changes must not reload the workspace over unsaved edits')
  await expect(page.getByRole('alert').filter({ hasText: /not confirmed/i }).first()).toBeVisible()
  // Simulate another browser saving a newer version; do not overwrite it.
  rejectWrites = false
  await page.goto(`${origin}/fields/${workspaces.get(users['alice@example.test'].id).fields[0].id}/edit`)
  await expect(page.locator('#name')).toHaveValue('Alice private field')
  const current = workspaces.get(users['alice@example.test'].id)
  workspaces.set(users['alice@example.test'].id, { ...current, version: current.version + 1, fields: current.fields.map(field => ({ ...field, name: 'Newer simulated change' })) })
  await page.locator('#name').fill('Stale simulated change')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: /changed in another tab/i }).first()).toBeVisible({ timeout: 15000 })
  assert.equal(workspaces.get(users['alice@example.test'].id).fields[0].name, 'Newer simulated change')
  assert.deepEqual(workspaces.get(aliceId).fields[0].waterInputs, expectedWater)
  assert.deepEqual(workspaces.get(aliceId).plans, aliceSaved.plans)
  assert.deepEqual(workspaces.get(aliceId).analyses, aliceSaved.analyses)
  assert.deepEqual(errors, [])
  console.log('PASS: synthetic account persistence for fields, soil/elevation, full water/Kc/irrigation inputs, plans, analyses and preferences; reload/logout, guest and two-account separation, unknown values, read/write failures, metadata refresh and stale-version conflict. Live Supabase persistence and RLS remain unverified by this mock check.')
} finally { await browser.close() }
