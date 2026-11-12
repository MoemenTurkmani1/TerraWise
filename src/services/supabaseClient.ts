import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import { validateSupabaseConfiguration } from './supabasePublicConfig'
export { validateSupabaseConfiguration, selectPublicKey } from './supabasePublicConfig'

export function createConfiguredSupabaseClient(url: string, key: string, options: SupabaseClientOptions<'public'>): SupabaseClient {
  const error = validateSupabaseConfiguration(url, key)
  if (error) throw new Error(error)
  return createClient(url, key, options)
}
