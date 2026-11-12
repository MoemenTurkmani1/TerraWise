import { createServer } from 'vite'
import { existsSync } from 'node:fs'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
try {
  const { localAgentEnvironment } = await server.ssrLoadModule('/scripts/localAgronomist.ts')
  const { resolveFreeProvider } = await server.ssrLoadModule('/supabase/functions/ai-agronomist/providerConfig.ts')
  const env = localAgentEnvironment(process.cwd())
  console.log('Server secrets file: ' + (existsSync('supabase/functions/.env.local') ? 'present' : 'missing'))
  for (const name of ['GEMINI_API_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) console.log(name + ': ' + (env[name]?.trim() ? 'present (value hidden)' : 'missing'))
  console.log('Free-only provider configuration: ' + (resolveFreeProvider(env) ? 'accepted; account entitlement still requires manual verification' : 'incomplete or not confirmed'))
  console.log('Local route: ' + (server.config.env.VITE_AGRONOMIST_LOCAL === 'true' ? 'enabled for Vite development only' : 'disabled'))
  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
    try {
      const response = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/ai-agronomist', { method: 'OPTIONS', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' }, signal: AbortSignal.timeout(12000) })
      console.log('Hosted function preflight: HTTP ' + response.status)
      if (response.status === 404) console.log('Hosted ai-agronomist function endpoint is missing. Local development does not require deployment.')
      else console.log('Preflight alone does not verify authenticated access, hosted secrets, quotas or live AI.')
    } catch { console.log('Hosted function preflight: unreachable; no response details logged.') }
  }
} finally { await server.close() }
