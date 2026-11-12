import { afterEach, describe, expect, it, vi } from 'vitest'
const factory = vi.hoisted(() => vi.fn(() => ({})))
vi.mock('@supabase/supabase-js', () => ({ createClient: factory }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); factory.mockClear() })
describe('demo startup account isolation', () => {
  it('does not construct a Supabase client even when valid public config exists', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_qa')
    vi.stubGlobal('sessionStorage', { getItem: () => 'bekaa' })
    const { supabase, supabaseConfigurationError } = await import('./supabase')
    expect(supabaseConfigurationError).toBeNull()
    expect(supabase).toBeNull()
    expect(factory).not.toHaveBeenCalled()
  })
})
