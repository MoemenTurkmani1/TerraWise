import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import { localAgronomistPlugin } from './localAgronomist'
afterEach(() => vi.unstubAllEnvs())
describe('local AI HTTP boundary', () => {
  it('runs the real handler, refuses unauthenticated and untrusted-origin requests, and bounds bodies', async () => {
    vi.stubEnv('VITE_AGRONOMIST_LOCAL', 'true')
    const server = await createServer({ configFile: false, root: process.cwd(), mode: 'development', logLevel: 'silent', plugins: [localAgronomistPlugin()], server: { host: '127.0.0.1', port: 0 } })
    try {
      await server.listen()
      const address = server.httpServer!.address()
      if (!address || typeof address === 'string') throw new Error('Local test listener unavailable')
      const url = `http://127.0.0.1:${address.port}/local-ai-agronomist`
      const denied = await fetch(url)
      expect(denied.status).toBe(401)
      expect(await denied.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } })
      const foreign = await fetch(url, { headers: { Origin: 'https://untrusted.example' } })
      expect(foreign.status).toBe(403)
      const huge = await fetch(url, { method: 'POST', body: 'x'.repeat(17000) })
      expect(huge.status).toBe(413)
      expect(await huge.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } })
    } finally { await server.close() }
  }, 20000)
})