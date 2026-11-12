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
    if (method === 'GET') return json(route, 200, workspaces.has(owner) ? [workspaces.get(owner)] : [])
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
  await page.getByRole('button', { name: 'Save field', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({ timeout: 15000 })
}
try {
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'North Field', exact: true })).toBeVisible()
  await login('alice@example.test')
  await expect(page.getByText('North Field', { exact: true })).toHaveCount(0)
  await createField('Alice private field')
  assert.equal(workspaces.get(users['alice@example.test'].id).fields[0].name, 'Alice private field')
  await logout()
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'North Field', exact: true })).toBeVisible()
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
  assert.deepEqual(errors, [])
  console.log('PASS: synthetic account sessions, separate guest and two-user workspaces, account field persistence, and visible save failure. A real Supabase project/RLS still needs separate integration testing.')
} finally { await browser.close() }
