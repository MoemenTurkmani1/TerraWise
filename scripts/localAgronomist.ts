import { loadEnv, type Plugin } from 'vite'
import { resolve } from 'node:path'
import type { IncomingMessage } from 'node:http'

export const LOCAL_AI_PATH = '/local-ai-agronomist'
const names = ['AGRONOMIST_AI_PROVIDER','AGRONOMIST_AI_MODEL','GEMINI_API_KEY','AGRONOMIST_COST_MODE','AGRONOMIST_FREE_TIER_CONFIRMED','AGRONOMIST_GLOBAL_RPM','AGRONOMIST_GLOBAL_RPD','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','AGRONOMIST_ALLOWED_ORIGINS']
export function localAgentEnvironment(root: string, port = 5173): Record<string, string> {
  const publicEnv = loadEnv('development', root, 'VITE_')
  const secrets = loadEnv('development', resolve(root, 'supabase/functions'), '')
  return { ...Object.fromEntries(names.map(name => [name, secrets[name] ?? ''])),
    SUPABASE_URL: publicEnv.VITE_SUPABASE_URL ?? '',
    SUPABASE_PUBLISHABLE_KEY: publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY || publicEnv.VITE_SUPABASE_ANON_KEY || '',
    AGRONOMIST_ALLOWED_ORIGINS: secrets.AGRONOMIST_ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}` }
}
export function isLoopbackRequest(address: string | undefined, host: string | undefined): boolean {
  if (!address || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false
  try { const u = new URL('http://' + host); return ['localhost','127.0.0.1','[::1]'].includes(u.hostname) } catch { return false }
}
async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = []; let total = 0
  for await (const chunk of req) { const bytes = Buffer.from(chunk); total += bytes.length; if (total > 16_384) throw new Error('BODY_LIMIT'); chunks.push(bytes) }
  return Buffer.concat(chunks)
}
/** Runs the same authenticated Edge handler locally. Never part of a production build. */
export function localAgronomistPlugin(): Plugin {
  return { name: 'terrawise-local-ai', apply: 'serve', configureServer(server) {
    if (server.config.env.VITE_AGRONOMIST_LOCAL !== 'true') return
    let handler: ((request: Request) => Promise<Response>) | undefined
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== LOCAL_AI_PATH) return next()
      if (!isLoopbackRequest(req.socket.remoteAddress, req.headers.host)) { res.writeHead(403).end(); return }
      try {
        if (!handler) {
          const module = await server.ssrLoadModule('/supabase/functions/ai-agronomist/handler.ts')
          handler = module.createAgronomistHandler(localAgentEnvironment(server.config.root, server.config.server.port))
        }
        const body = req.method === 'POST' ? await readBody(req) : undefined
        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value)
        const controller = new AbortController()
        res.on('close', () => { if (!res.writableEnded) controller.abort() })
        const response = await handler!(new Request('http://' + req.headers.host + LOCAL_AI_PATH, { method: req.method, headers, body: body ? new TextDecoder().decode(body) : undefined, signal: controller.signal }))
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
        res.end(await response.text())
      } catch (error) {
        const oversized = error instanceof Error && error.message === 'BODY_LIMIT'
        res.writeHead(oversized ? 413 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ error: { code: oversized ? 'PAYLOAD_TOO_LARGE' : 'ENDPOINT_UNAVAILABLE' } }))
      }
    })
  } }
}
