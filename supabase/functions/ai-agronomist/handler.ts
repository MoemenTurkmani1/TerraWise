import { validateSupabaseConfiguration } from '../../../src/services/supabasePublicConfig.ts'
import { powerRequestUrl, parsePeriod } from '../../../src/services/nasaPower.ts'
import { waterPowerUrl, parseWaterClimate } from '../../../src/services/nasaPowerWater.ts'
import { AgentError, isRecord, parseRequest, type AgronomistStatus } from './contracts.ts'
import { authorizeWorkspace, buildContext, screeningPeriod } from './context.ts'
import { sources } from './knowledge.ts'
import { askProvider } from './provider.ts'
import { resolveFreeProvider, type ProviderEnvironment } from './providerConfig.ts'
import { consumeQuota, resolveQuotaLimits, type QuotaEnvironment } from './limiter.ts'
import { fetchJson, readRequestBody, type Fetcher } from './http.ts'

export interface AgentEnvironment extends ProviderEnvironment, QuotaEnvironment {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_PUBLISHABLE_KEY?: string
  SUPABASE_PUBLISHABLE_KEYS?: string
  UPSTASH_REDIS_REST_URL?: string
  UPSTASH_REDIS_REST_TOKEN?: string
  AGRONOMIST_ALLOWED_ORIGINS?: string
}
function config(env: AgentEnvironment) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, '') ?? ''
  let namedPublicKey = ''
  try {
    const keys: unknown = JSON.parse(env.SUPABASE_PUBLISHABLE_KEYS || '{}')
    if (isRecord(keys) && typeof keys.default === 'string') namedPublicKey = keys.default
  } catch { /* A public single-key/legacy configuration can still be used. */ }
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || namedPublicKey || env.SUPABASE_ANON_KEY || ''
  const origins = (env.AGRONOMIST_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const originsValid = origins.length > 0 && origins.every(s => { try { const u = new URL(s); return u.origin === s && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) } catch { return false } })
  let redisValid = false
  try { const u = new URL(env.UPSTASH_REDIS_REST_URL ?? ''); redisValid = u.protocol === 'https:' && u.hostname.endsWith('.upstash.io') && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' } catch { /* unavailable */ }
  const provider = resolveFreeProvider(env)
  const quota = resolveQuotaLimits(env)
  return {
    supabaseUrl, publicKey, origins, originsValid,
    authConfigured: !validateSupabaseConfiguration(supabaseUrl, publicKey),
    available: provider !== null && quota !== null && redisValid && !!env.UPSTASH_REDIS_REST_TOKEN && originsValid,
    provider, quota
  }
}
export function createAgronomistHandler(env: AgentEnvironment, fetcher: Fetcher = fetch, now: () => number = Date.now) {
  const settings = config(env)
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Expose-Headers': 'Retry-After'
    })
    if (origin && settings.origins.includes(origin)) headers.set('Access-Control-Allow-Origin', origin)
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    const controller = new AbortController()
    const abort = () => controller.abort()
    const timer = setTimeout(abort, 45_000)
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) controller.abort()
    try {
      if (!settings.originsValid) throw new AgentError(503, 'AI_UNAVAILABLE', 'The agronomist endpoint is not configured.')
      if (origin && !settings.origins.includes(origin)) throw new AgentError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (!['GET', 'POST'].includes(request.method)) throw new AgentError(405, 'METHOD_NOT_ALLOWED', 'Only read-only agronomist requests are supported.')
      const authorization = request.headers.get('authorization') ?? ''
      if (!/^Bearer [a-zA-Z0-9._~-]{20,8192}$/.test(authorization)) throw new AgentError(401, 'AUTH_REQUIRED', 'Sign in to use your field agronomist.')
      if (!settings.authConfigured) throw new AgentError(503, 'AI_UNAVAILABLE', 'Account authentication is not configured.')
      const accountHeaders = { apikey: settings.publicKey, Authorization: authorization, Accept: 'application/json' }
      // Online Auth verification: never trust a decoded JWT or browser-supplied owner.
      const auth = await fetchJson(fetcher, settings.supabaseUrl + '/auth/v1/user', { headers: accountHeaders }, controller.signal, 5000, 100_000)
      if ([401, 403].includes(auth.response.status)) throw new AgentError(401, 'AUTH_REQUIRED', 'Your session expired. Please sign in again.')
      if (!auth.response.ok || !isRecord(auth.data) || typeof auth.data.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(auth.data.id)) throw new AgentError(503, 'AUTH_UNAVAILABLE', 'Your session could not be verified.')
      const ownerId = auth.data.id
      if (request.method === 'GET') return reply({ available: settings.available, mode: settings.available ? 'configured' : 'unavailable', readOnly: true, costMode: 'free-only', provider: settings.provider?.provider ?? null, model: settings.provider?.model ?? null } satisfies AgronomistStatus)
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AgentError(415, 'INVALID_REQUEST', 'Use an application/json request.')
      const input = parseRequest(await readRequestBody(request, controller.signal), new Date(now()))
      const workspaceUrl = new URL(settings.supabaseUrl + '/rest/v1/terrawise_workspaces')
      workspaceUrl.search = new URLSearchParams({ select: 'owner_id,fields,analyses,version', owner_id: 'eq.' + ownerId, limit: '1' }).toString()
      // Public key + the caller's JWT preserve RLS, plus explicit owner and field checks.
      const workspace = await fetchJson(fetcher, workspaceUrl.toString(), { headers: accountHeaders }, controller.signal, 5000)
      if (!workspace.response.ok) throw new AgentError(workspace.response.status === 401 ? 401 : 503, workspace.response.status === 401 ? 'AUTH_REQUIRED' : 'WORKSPACE_UNAVAILABLE', 'The account workspace could not be read.')
      if (!Array.isArray(workspace.data) || workspace.data.length !== 1) throw new AgentError(404, 'FIELD_NOT_FOUND', 'This saved field is unavailable in your account.')
      const authorized = authorizeWorkspace(workspace.data[0], ownerId, input.fieldId)
      if (!settings.available) throw new AgentError(503, 'AI_UNAVAILABLE', 'Free AI is unavailable until card-free Free accounts and the server configuration are confirmed.')
      await consumeQuota(fetcher, env.UPSTASH_REDIS_REST_URL!, env.UPSTASH_REDIS_REST_TOKEN!, settings.supabaseUrl, ownerId, controller.signal, now(), settings.quota!)
      const { field, version, savedAnalyses } = authorized
      const period = screeningPeriod(input)
      const climateTasks = await Promise.allSettled([
        (async () => {
          const result = await fetchJson(fetcher, powerRequestUrl(field.latitude, field.longitude, input.climateYear), { headers: { Accept: 'application/json' } }, controller.signal, 8000)
          if (!result.response.ok) throw new Error('NASA unavailable')
          return parsePeriod(result.data, field.latitude, field.longitude, input.climateYear, input.climateYear, new Date(now()).toISOString(), 'fresh')
        })(),
        (async () => {
          if (field.elevationM === null || field.elevationM === undefined) return null
          const result = await fetchJson(fetcher, waterPowerUrl(field.latitude, field.longitude, period.start, period.end), { headers: { Accept: 'application/json' } }, controller.signal, 8000)
          if (!result.response.ok) throw new Error('NASA unavailable')
          return parseWaterClimate(result.data, field.latitude, field.elevationM, period.start, period.end, new Date(now()).toISOString())
        })()
      ])
      // A missing scientific input stays unknown. No climate or AI fallback data.
      const monthly = climateTasks[0].status === 'fulfilled' ? climateTasks[0].value : null
      const water = climateTasks[1].status === 'fulfilled' ? climateTasks[1].value : null
      const context = buildContext(field, version, savedAnalyses, input, monthly, water, new Date(now()).toISOString())
      const answer = await askProvider(fetcher, settings.provider!, input, context, controller.signal)
      return reply({ mode: 'live', provider: settings.provider!.provider, model: settings.provider!.model, costMode: 'free-only', answer, context, sources })
    } catch (error) {
      const failure = error instanceof AgentError ? error : new AgentError(500, 'INTERNAL_ERROR', 'The agronomist could not complete this question. Please retry.')
      if (failure.retryAfter) headers.set('Retry-After', String(failure.retryAfter))
      // Do not log request bodies, tokens, account identifiers, or provider responses.
      return reply({ error: { code: failure.code, message: failure.message } }, failure.status)
    } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort) }
  }
}
