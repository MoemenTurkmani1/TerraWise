/** Reviewed against public free-tier documentation on 2026-11-12.
 * Runtime API keys do not reveal account billing status. Activation requires
 * an operator to verify card-free Free accounts; this is not a billing detector. */
export const FREE_GEMINI_MODEL = 'gemini-3.5-flash-lite'
export interface ProviderEnvironment {
  AGRONOMIST_AI_PROVIDER?: string
  AGRONOMIST_AI_MODEL?: string
  AGRONOMIST_COST_MODE?: string
  AGRONOMIST_FREE_TIER_CONFIRMED?: string
  GEMINI_API_KEY?: string
}
export interface FreeProviderConfiguration {
  provider: 'gemini'
  model: typeof FREE_GEMINI_MODEL
  apiKey: string
}
export function resolveFreeProvider(env: ProviderEnvironment): FreeProviderConfiguration | null {
  if (env.AGRONOMIST_COST_MODE !== 'free-only' || env.AGRONOMIST_FREE_TIER_CONFIRMED !== 'true' ||
    env.AGRONOMIST_AI_PROVIDER !== 'gemini' || env.AGRONOMIST_AI_MODEL !== FREE_GEMINI_MODEL || !env.GEMINI_API_KEY?.trim()) return null
  return { provider: 'gemini', model: FREE_GEMINI_MODEL, apiKey: env.GEMINI_API_KEY.trim() }
}
