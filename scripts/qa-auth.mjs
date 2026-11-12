import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

// Synthetic HTTP fixtures only. This does not verify a real provider or RLS.
const origin = process.env.BASE_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const errors = []
const workspaces = new Map()
let rejectWrites = false
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
    if (method === 'GET') { workspaceReads++; return json(route, 200, workspaces.has(owner) ? [workspaces.get(owner)] : []) }
    if (rejectWrites) return json(route, 503, { message: 'Synthetic service outage' })
    const body = request.postDataJSON()
    if (method === 'POST') {
      if (body.owner_id !== owner) return json(route, 403, { message: 'Mock owner mismatch' })
      if (workspaces.has(owner)) return json(route, 409, { code: '23505', message: 'Duplicate workspace' })
      workspaces.set(owner, body); return json(route, 201, { version: body.version })
    }
    if (method === 'PATCH') {
      const prior = workspaces.get(owner), expected = Number(url.searchParams.get('version')?.replace(/^eq\./, ''))
      if (!prior || prior.version !== expected) return json(route, 200, [])
      workspaces.set(owner, { ...prior, ...body }); return json(route, 200, [{ version: body.version }])
    }
  }
  return json(route, 404, { message: `Unexpected mock request ${method} ${url.pathname}` })
})

// Do not send synthetic field coordinates to the real NASA endpoint.
await page.route('**/api/temporal/monthly/point**', route => route.fulfill({ status: 503, body: 'Synthetic test outage' }))

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
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
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
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Alice private field', exact: true })).toBeVisible()
  await logout()
  await page.goto(origin)
  await expect(page.getByText('Guest test field', { exact: true }).first()).toBeVisible()
  await login('bob@example.test')
  await expect(page.getByText('Alice private field')).toHaveCount(0)
  await logout()
  await login('alice@example.test')
  await expect(page.getByRole('heading', { name: 'Alice private field', exact: true })).toBeVisible()
  rejectWrites = true
  await page.goto(`${origin}/fields/${workspaces.get(users['alice@example.test'].id).fields[0].id}/edit`)
  await page.locator('#name').fill('Unsaved test name')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: /Could not save|not confirmed|outage/i }).first()).toBeVisible({ timeout: 15000 })
  assert.equal(workspaces.get(users['alice@example.test'].id).fields[0].name, 'Alice private field')
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
  assert.deepEqual(errors, [])
  console.log('PASS: synthetic session reload and logout, guest isolation, two-user workspaces, save failures, and stale-version conflict. Live Supabase/RLS still needs separate API tests.')
} finally { await browser.close() }
