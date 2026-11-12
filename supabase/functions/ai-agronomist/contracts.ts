export type Language = 'en' | 'ar'
export type EvidenceCategory = 'farmer' | 'nasa' | 'calculated' | 'reference' | 'unknown'
export interface AgronomistRequest {
  fieldId: string
  question: string
  language: Language
  season: 'Spring' | 'Autumn'
  climateYear: number
  history: { role: 'user' | 'assistant'; content: string }[]
}
export interface ScientificSource { id: string; title: string; url: string; summary: string; scope: string; reviewedOn: string }
export interface Evidence { id: string; category: EvidenceCategory; label: string; value: string; sourceIds: string[] }
export interface FieldContext {
  evidence: Evidence[]
  missing: string[]
  limitations: string[]
  snapshot: { workspaceVersion: number; computedAt: string; climateYear: number; season: string }
}
export interface AgronomistAnswer {
  paragraphs: { text: string; evidenceIds: string[] }[]
  missingData: string[]
  followUpQuestions: string[]
}
export interface AgronomistResponse {
  answer: AgronomistAnswer
  context: FieldContext
  sources: ScientificSource[]
  mode: 'live'
  provider: 'gemini'
  model: 'gemini-3.5-flash-lite'
  costMode: 'free-only'
}
export interface AgronomistStatus { available: boolean; mode: 'configured' | 'unavailable'; readOnly: true; costMode: 'free-only'; provider: 'gemini' | null; model: 'gemini-3.5-flash-lite' | null }

export class AgentError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message) }
}
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export function parseRequest(value: unknown, now = new Date()): AgronomistRequest {
  if (!isRecord(value) || Object.keys(value).some(k => !['fieldId', 'question', 'language', 'season', 'climateYear', 'history'].includes(k))) throw new AgentError(400, 'INVALID_REQUEST', 'Unexpected request fields.')
  if (typeof value.fieldId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.fieldId)) throw new AgentError(400, 'INVALID_REQUEST', 'Choose a saved field.')
  if (typeof value.question !== 'string' || !value.question.trim() || value.question.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.question)) throw new AgentError(400, 'INVALID_REQUEST', 'Use a question of up to 1500 characters.')
  if (typeof value.language !== 'string' || !['en', 'ar'].includes(value.language) || typeof value.season !== 'string' || !['Spring', 'Autumn'].includes(value.season)) throw new AgentError(400, 'INVALID_REQUEST', 'Unsupported language or screening window.')
  if (typeof value.climateYear !== 'number' || !Number.isInteger(value.climateYear) || value.climateYear < 1984 || value.climateYear >= now.getUTCFullYear()) throw new AgentError(400, 'INVALID_REQUEST', 'Choose a complete historical year.')
  const history = value.history ?? []
  if (!Array.isArray(history) || history.length > 4 || !history.every(m => isRecord(m) && Object.keys(m).every(k => ['role', 'content'].includes(k)) && typeof m.role === 'string' && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.length <= 1800)) throw new AgentError(400, 'INVALID_REQUEST', 'Conversation history is invalid or too long.')
  return { fieldId: value.fieldId, question: value.question.trim(), language: value.language as Language, season: value.season as 'Spring' | 'Autumn', climateYear: value.climateYear, history: history as AgronomistRequest['history'] }
}
