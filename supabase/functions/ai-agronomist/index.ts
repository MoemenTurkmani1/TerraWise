import { createAgronomistHandler, type AgentEnvironment } from './handler.ts'

// No dependency on the browser SDK, admin client, or service-role credentials.
const runtime = (globalThis as unknown as {
  Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
}).Deno
const names: (keyof AgentEnvironment)[] = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEYS',
  'AGRONOMIST_AI_PROVIDER', 'AGRONOMIST_AI_MODEL', 'GEMINI_API_KEY',
  'AGRONOMIST_COST_MODE', 'AGRONOMIST_FREE_TIER_CONFIRMED', 'AGRONOMIST_GLOBAL_RPM', 'AGRONOMIST_GLOBAL_RPD', 'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN', 'AGRONOMIST_ALLOWED_ORIGINS'
]
const environment = Object.fromEntries(names.map(name => [name, runtime.env.get(name)])) as AgentEnvironment
runtime.serve(createAgronomistHandler(environment))
