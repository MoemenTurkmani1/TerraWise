import { describe, expect, it } from 'vitest'
import { assertNoBrowserSecrets } from './supabaseConfigGuard'

describe('build-time browser secret guard', () => {
  it('permits a public key and server-only secrets', () => {
    expect(() => assertNoBrowserSecrets({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' })).not.toThrow()
  })
  it('rejects secret names, secret keys and service-role JWTs without printing their values', () => {
    const token = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`
    for (const env of [{ VITE_SUPABASE_SERVICE_ROLE_KEY: 'do-not-print' }, { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-print' }, { VITE_SOMETHING: token }]) {
      try { assertNoBrowserSecrets(env); throw new Error('guard did not reject the secret') } catch (error) { expect((error as Error).message).toContain('Unsafe browser environment'); expect((error as Error).message).not.toContain('do-not-print'); expect((error as Error).message).not.toContain(token) }
    }
  })
})
