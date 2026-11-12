import type { AgronomistResponse } from '../../supabase/functions/ai-agronomist/contracts'

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = 3000): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const strings = (v: unknown, count: number): v is string[] => Array.isArray(v) && v.length <= count && v.every(s => text(s))

/** Validate the entire rendering contract before the UI reads nested fields.
 * Gateway/deployment mismatches must produce an error state, not crash chat. */
export function isAgronomistResponse(value: unknown): value is AgronomistResponse {
  if (!record(value) || value.mode !== 'live' || value.costMode !== 'free-only' || value.provider !== 'gemini' || value.model !== 'gemini-3.5-flash-lite' || !record(value.answer) || !record(value.context) || !Array.isArray(value.sources) || value.sources.length > 50) return false
  const { answer, context, sources } = value
  if (!sources.every(s => record(s) && ['id', 'title', 'url', 'summary', 'scope', 'reviewedOn'].every(k => text(s[k])))) return false
  const sourceIds = new Set(sources.map(s => s.id as string))
  if (sourceIds.size !== sources.length) return false
  if (!Array.isArray(context.evidence) || context.evidence.length > 200 || !strings(context.missing, 60) || !strings(context.limitations, 60) || context.limitations.length === 0) return false
  if (!context.evidence.every(e => record(e) && text(e.id, 100) && text(e.label, 300) && text(e.value) &&
    typeof e.category === 'string' && ['farmer', 'nasa', 'calculated', 'reference', 'unknown'].includes(e.category) &&
    strings(e.sourceIds, 10) && e.sourceIds.every((id: string) => sourceIds.has(id)))) return false
  const evidenceIds = new Set(context.evidence.map(e => e.id as string))
  if (evidenceIds.size !== context.evidence.length) return false
  const allowedIds = new Set([...sourceIds, ...evidenceIds])
  if (!Array.isArray(answer.paragraphs) || answer.paragraphs.length < 1 || answer.paragraphs.length > 5 || !strings(answer.missingData, 6) || !strings(answer.followUpQuestions, 3)) return false
  if (!answer.paragraphs.every(p => record(p) && text(p.text, 1400) && strings(p.evidenceIds, 6) && p.evidenceIds.length > 0 && p.evidenceIds.every((id: string) => allowedIds.has(id)))) return false
  const snapshot = context.snapshot
  return record(snapshot) && typeof snapshot.workspaceVersion === 'number' && Number.isSafeInteger(snapshot.workspaceVersion) && snapshot.workspaceVersion >= 0 &&
    text(snapshot.computedAt, 100) && Number.isFinite(Date.parse(snapshot.computedAt)) &&
    typeof snapshot.climateYear === 'number' && Number.isInteger(snapshot.climateYear) && snapshot.climateYear >= 1984 &&
    (snapshot.season === 'Spring' || snapshot.season === 'Autumn')
}
