import { existsSync } from 'node:fs'
import { loadEnv } from 'vite'
import { classifyPermission, interpretWorkspace } from './supabase-check-logic.mjs'

// Read-only checks. Deliberately never print configuration, URLs, responses,
// exception details, project data, or credentials.
if (!existsSync('.env.local')) {
  console.error('Cannot check Supabase: .env.local is missing from the project folder.')
  process.exit(1)
}

let env
try { env = loadEnv('development', process.cwd(), '') }
catch {
  console.error('Cannot read environment configuration. Check the .env.local syntax.')
  process.exit(1)
}
const url = (env.VITE_SUPABASE_URL || '').trim()
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim() || (env.VITE_SUPABASE_ANON_KEY || '').trim()
let safe = false
try {
  const parsed = new URL(url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  safe = (parsed.protocol === 'https:' || (local && parsed.protocol === 'http:')) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
  if (key.startsWith('sb_publishable_')) safe &&= true
  else if (key.split('.').length === 3) {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
    safe &&= claims?.role === 'anon'
  } else safe = false
} catch { safe = false }
if (!safe) {
  console.error('Cannot check Supabase: the URL or public key is missing or invalid. Only a publishable key or legacy anon key is allowed.')
  process.exit(1)
}
async function request(path) {
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}${path}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    })
    let code = null
    let permission = null
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json().catch(() => null)
      if (data && typeof data.code === 'string' && /^(PGRST\d{3}|42501)$/.test(data.code)) code = data.code
      permission = classifyPermission(code, data?.message)
    }
    return { status: response.status, code, permission }
  } catch { return { status: null, code: null, permission: null } }
}
const [auth, rest, workspace] = await Promise.all([
  request('/auth/v1/settings'),
  request('/rest/v1/'),
  request('/rest/v1/terrawise_workspaces?select=owner_id&limit=0'),
])
console.log(`Authentication endpoint: ${auth.status === null ? 'unreachable' : `HTTP ${auth.status}`}`)
console.log(`Database API root: ${rest.status === null ? 'unreachable' : `HTTP ${rest.status}`}${rest.code ? ` (${rest.code})` : ''}`)
console.log(`Anonymous workspace probe: ${workspace.status === null ? 'unreachable' : `HTTP ${workspace.status}`}${workspace.code ? ` (${workspace.code})` : ''}`)
if (rest.status === 401 || rest.status === 403) console.log('The API root denied public access. This can be expected and is not an authenticated workspace test.')
const result = interpretWorkspace(workspace)
const dataApiReached = rest.status === 200 || result.reached
if (auth.status === 200 && dataApiReached) {
  console.log('The authentication and database API endpoints responded. Authenticated workspace access, RLS isolation, and storage are not verified.')
} else {
  console.log('Endpoint connectivity was not fully verified. Check the project status, public configuration, and network.')
}
if (auth.status !== 200 || !result.reached) process.exitCode = 1
console.log(result.message)
