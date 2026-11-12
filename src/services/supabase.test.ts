import { describe, expect, it } from 'vitest'
import { validateSupabaseConfiguration } from './supabase'
import { createConfiguredSupabaseClient, selectPublicKey } from './supabaseClient'

const jwt = (role: string) => `header.${btoa(JSON.stringify({ role })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}.signature`

describe('public Supabase client configuration', () => {
  it('accepts only an HTTPS project URL and a public key (or localhost for development)', () => {
    expect(validateSupabaseConfiguration('https://example.supabase.co', 'sb_publishable_public')).toBeNull()
    expect(validateSupabaseConfiguration('http://localhost:54321', jwt('anon'))).toBeNull()
    expect(validateSupabaseConfiguration('http://example.supabase.co', jwt('anon'))).toMatch(/HTTPS/)
    expect(validateSupabaseConfiguration('https://user:pass@example.supabase.co', jwt('anon'))).toMatch(/HTTPS/)
  })
  it('rejects missing, malformed and privileged browser credentials', () => {
    expect(validateSupabaseConfiguration('', '')).toMatch(/not configured/)
    expect(validateSupabaseConfiguration('https://example.supabase.co', '')).toMatch(/both/)
    expect(validateSupabaseConfiguration('https://example.supabase.co', 'sb_secret_private')).toMatch(/secret key/)
    expect(validateSupabaseConfiguration('https://example.supabase.co', jwt('service_role'))).toMatch(/anon/)
    expect(validateSupabaseConfiguration('https://example.supabase.co', 'not-a-key')).toMatch(/publishable/)
  })
  it('uses a nonempty publishable key first and falls back to the public anon key', () => {
    expect(selectPublicKey('  sb_publishable_test  ', 'fallback')).toBe('sb_publishable_test')
    expect(selectPublicKey('  ', '  anon-test  ')).toBe('anon-test')
    expect(selectPublicKey()).toBe('')
  })
  it('rejects privileged keys before a reusable client can be created', () => {
    expect(() => createConfiguredSupabaseClient('https://example.supabase.co', 'sb_secret_not-real', {})).toThrow(/secret key/)
  })
})
