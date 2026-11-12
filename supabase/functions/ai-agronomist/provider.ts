import { AgentError, type AgronomistAnswer, type AgronomistRequest, type FieldContext } from './contracts.ts'
import { fetchJson, type Fetcher } from './http.ts'
import { validateAnswer } from './answer.ts'
import { geminiProvider, type AgronomistProvider } from './gemini.ts'
import { FREE_GEMINI_MODEL, type FreeProviderConfiguration } from './providerConfig.ts'
export { validateAnswer, redactUserText } from './answer.ts'

/** Explicit adapter registry. There is no OpenAI or paid-provider fallback. */
const providers: Readonly<Record<string, AgronomistProvider>> = Object.freeze({ gemini: geminiProvider })
export function providerPayload(model: string, request: AgronomistRequest, context: FieldContext): Record<string, unknown> {
  if (model !== FREE_GEMINI_MODEL) throw new AgentError(503, 'FREE_CONFIGURATION_REQUIRED', 'Only the reviewed free model is enabled.')
  return geminiProvider.payload(request, context)
}
export async function askProvider(fetcher: Fetcher, config: FreeProviderConfiguration, request: AgronomistRequest, context: FieldContext, signal: AbortSignal): Promise<AgronomistAnswer> {
  if (config.provider !== 'gemini' || config.model !== FREE_GEMINI_MODEL || !config.apiKey) throw new AgentError(503, 'FREE_CONFIGURATION_REQUIRED', 'A verified free-tier configuration is required.')
  const adapter = providers[config.provider]
  const payload = adapter.payload(request, context)
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 80_000) throw new AgentError(413, 'INPUT_LIMIT_EXCEEDED', 'The agronomic context exceeds the supported free request size.')
  const { response, data } = await fetchJson(fetcher, adapter.endpoint(config), {
    method: 'POST', headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, signal, 25_000, 100_000)
  if (!response.ok) {
    if (response.status === 429) {
      const delay = Number(response.headers.get('retry-after'))
      throw new AgentError(429, 'FREE_QUOTA_EXHAUSTED', 'The free AI quota is exhausted. Wait for it to reset; no paid fallback is enabled.', Number.isInteger(delay) && delay > 0 ? Math.min(delay, 86400) : 300)
    }
    if (response.status === 403) throw new AgentError(503, 'FREE_ACCESS_UNAVAILABLE', 'Free AI access is unavailable for this account, key or region.')
    throw new AgentError(503, 'AI_UNAVAILABLE', 'The free AI service is unavailable. No alternative model was called.')
  }
  return validateAnswer(adapter.parse(data, config), context)
}
