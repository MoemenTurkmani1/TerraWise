import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'

/** This module has no Vite, React, or browser-storage dependency.
 * Each platform supplies its own URL, public key, and auth storage options. */
export function validateSupabaseConfiguration(url: string, key: string): string | null {
  if (!url && !key) return 'Supabase is not configured. Local workspace is available; cloud authentication requires configuration.'
  if (!url || !key) return 'Provide both the Supabase project URL and publishable or anon key.'
  try {
    const parsed = new URL(url)
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]'
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash) return 'The Supabase URL must be an HTTPS project URL or a local development URL.'
  } catch { return 'The Supabase project URL is invalid.' }
  if (key.startsWith('sb_secret_')) return 'A secret key cannot be used in browser code. Configure a publishable key instead.'
  if (key.split('.').length === 3) {
    try {
      const payload = key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
      const claims: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
      if (!claims || typeof claims !== 'object' || !('role' in claims) || (claims as { role?: unknown }).role !== 'anon') return 'Only a public anon JWT is allowed in browser code.'
    } catch { return 'The Supabase anon key is malformed.' }
  } else if (!key.startsWith('sb_publishable_')) return 'Use a Supabase publishable key or public anon JWT.'
  return null
}

export function selectPublicKey(publishable?: string, anon?: string): string {
  return publishable?.trim() || anon?.trim() || ''
}

export function createConfiguredSupabaseClient(url: string, key: string, options: SupabaseClientOptions<'public'>): SupabaseClient {
  const error = validateSupabaseConfiguration(url, key)
  if (error) throw new Error(error)
  return createClient(url, key, options)
}
