/// <reference types="vite/client" />
import { isDemoSessionActive } from '../lib/demoSession'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createConfiguredSupabaseClient, selectPublicKey, validateSupabaseConfiguration } from './supabaseClient'

export { validateSupabaseConfiguration } from './supabaseClient'

const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const publicKey = selectPublicKey(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const supabaseConfigurationError = validateSupabaseConfiguration(projectUrl, publicKey)
export const supabase: SupabaseClient | null = supabaseConfigurationError || isDemoSessionActive() ? null : createConfiguredSupabaseClient(projectUrl, publicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
