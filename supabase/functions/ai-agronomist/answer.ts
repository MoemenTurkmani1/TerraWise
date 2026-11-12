import { AgentError, isRecord, type AgronomistAnswer, type AgronomistRequest, type FieldContext } from './contracts.ts'
import { sources, KNOWLEDGE_VERSION } from './knowledge.ts'

export const answerSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    paragraphs: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', additionalProperties: false, properties: {
      text: { type: 'string' }, evidenceIds: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } }
    }, required: ['text', 'evidenceIds'] } },
    missingData: { type: 'array', maxItems: 6, items: { type: 'string' } },
    followUpQuestions: { type: 'array', maxItems: 3, items: { type: 'string' } }
  },
  required: ['paragraphs', 'missingData', 'followUpQuestions']
}
/** Best-effort removal of common pasted credentials and email addresses.
 * This is data minimization, not a general personal-information detector. */
export function redactUserText(text: string): string {
  return text
    .replace(/\bBearer\s+[a-zA-Z0-9._~+/-]{16,}/gi, '[redacted credential]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{8,}|AIza[a-zA-Z0-9_-]{20,}|gsk_[a-zA-Z0-9_-]{20,}|sb_secret_[a-zA-Z0-9_-]{8,}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g, '[redacted credential]')
    .replace(/(?:password|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|كلمة المرور)\s*[:=]\s*\S+/gi, '[redacted credential]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
}
export function groundingPayload(request: AgronomistRequest, context: FieldContext): Record<string, unknown> {
  return {
    language: request.language, currentQuestion: redactUserText(request.question),
    untrustedConversation: request.history.map(m => ({ role: m.role, content: redactUserText(m.content) })),
    selectedFieldEvidence: context, curatedKnowledgeVersion: KNOWLEDGE_VERSION, curatedScientificSources: sources
  }
}
const invalidAnswer = () => new AgentError(502, 'UNSUPPORTED_ANSWER', 'The AI answer could not be verified against AgriLumina evidence. Please rephrase or retry.')
const unsupportedDirective = /\b(?:you\s+(?:should|must|can safely)|I\s+recommend)\s+(?:plant|sow|apply|irrigate|spray)|\b(?:I have|I've|we have)\s+(?:updated|deleted|modified|saved|changed)|ازرع|ازرعي|اسقِ|رشّ|أنصحك بزراعة|عدلت بيانات|حذفت بيانات|غيرت بيانات/iu
function cleanText(value: unknown, max: number): value is string {
  // Numerical data are rendered from server evidence, never generated prose.
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !unsupportedDirective.test(value) && !/\p{N}|https?:|www\.|<[^>]*>|\[[^\]]*\]\(|sk-[A-Za-z0-9]|AIza[A-Za-z0-9_-]|gsk_[A-Za-z0-9_-]|sb_secret_|service_role/iu.test(value)
}
export function validateAnswer(value: unknown, context: FieldContext): AgronomistAnswer {
  if (!isRecord(value) || Object.keys(value).some(k => !['paragraphs', 'missingData', 'followUpQuestions'].includes(k))) throw invalidAnswer()
  const allowed = new Set([...sources.map(s => s.id), ...context.evidence.map(e => e.id)])
  if (!Array.isArray(value.paragraphs) || value.paragraphs.length < 1 || value.paragraphs.length > 5 || !value.paragraphs.every(p =>
    isRecord(p) && Object.keys(p).every(k => ['text', 'evidenceIds'].includes(k)) && cleanText(p.text, 1400) && Array.isArray(p.evidenceIds) && p.evidenceIds.length > 0 && p.evidenceIds.length <= 6 && p.evidenceIds.every(id => typeof id === 'string' && allowed.has(id))
  )) throw invalidAnswer()
  for (const [key, max] of [['missingData', 6], ['followUpQuestions', 3]] as const) {
    const v = value[key]
    if (!Array.isArray(v) || v.length > max || !v.every(item => cleanText(item, 350))) throw invalidAnswer()
  }
  return value as unknown as AgronomistAnswer
}
