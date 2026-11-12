import { AgentError, isRecord, type AgronomistRequest, type FieldContext } from './contracts.ts'
import { answerSchema, groundingPayload } from './answer.ts'
import { SYSTEM_INSTRUCTION } from './knowledge.ts'
import type { FreeProviderConfiguration } from './providerConfig.ts'

export interface AgronomistProvider {
  id: 'gemini'
  payload(request: AgronomistRequest, context: FieldContext): Record<string, unknown>
  endpoint(config: FreeProviderConfiguration): string
  parse(data: unknown, config: FreeProviderConfiguration): unknown
}
const invalid = () => new AgentError(502, 'UNSUPPORTED_ANSWER', 'The AI answer could not be verified against AgriLumina evidence. Please rephrase or retry.')
export const geminiProvider: AgronomistProvider = {
  id: 'gemini',
  endpoint: config => 'https://generativelanguage.googleapis.com/v1beta/models/' + config.model + ':generateContent',
  payload: (request, context) => ({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(groundingPayload(request, context)) }] }],
    generationConfig: { candidateCount: 1, maxOutputTokens: 1400, responseMimeType: 'application/json', responseJsonSchema: answerSchema }
    // No tools, search grounding, cache creation, sessions, or paid add-ons.
  }),
  parse(data, config) {
    if (!isRecord(data) || (isRecord(data.promptFeedback) && data.promptFeedback.blockReason) ||
      !Array.isArray(data.candidates) || data.candidates.length !== 1) throw invalid()
    // Never accept a provider-reported substitution to another model family.
    if (data.modelVersion !== undefined && (typeof data.modelVersion !== 'string' ||
      (data.modelVersion !== config.model && !data.modelVersion.startsWith(config.model + '-')))) throw invalid()
    const candidate = data.candidates[0]
    if (!isRecord(candidate) || candidate.finishReason !== 'STOP' || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) throw invalid()
    const parts = candidate.content.parts
    if (!parts.length || parts.length > 32 || !parts.every(p => isRecord(p) && typeof p.text === 'string' && !p.functionCall && !p.executableCode)) throw invalid()
    const output = parts.filter(p => p.thought !== true).map(p => p.text).join('')
    try { return JSON.parse(output) as unknown } catch { throw invalid() }
  }
}
