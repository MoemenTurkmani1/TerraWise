import { beforeEach, describe, expect, it, vi } from 'vitest'
const { invoke, getSession } = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke }, auth: { getSession } } }))
import { AgronomistClientError, askAgronomist, getAgronomistStatus } from './agronomist'

const input = { fieldId: 'saved-field', question: 'What does ETo mean?', language: 'en' as const, season: 'Spring' as const, climateYear: 2025, history: [] }
function response() {
  return { mode: 'live', provider: 'gemini', model: 'gemini-3.5-flash-lite', costMode: 'free-only', answer: { paragraphs: [{ text: 'Review the entered soil pH with a local agronomist.', evidenceIds: ['soil-ph'] }], missingData: ['Drainage is unknown.'], followUpQuestions: [] },
    context: { evidence: [{ id: 'soil-ph', label: 'Soil pH', category: 'farmer', value: '6.5 pH', sourceIds: [] }], missing: ['Drainage'], limitations: ['Provisional evidence only.'],
      snapshot: { workspaceVersion: 1, computedAt: '2026-11-12T12:00:00Z', climateYear: 2025, season: 'Spring' } }, sources: [] }
}
beforeEach(() => invoke.mockReset())
describe('browser agronomist service', () => {
  it('calls the authenticated function with selectors and user text only', async () => {
    const data = response()
    invoke.mockResolvedValue({ data, error: null })
    const signal = new AbortController().signal
    expect(await askAgronomist(input, signal)).toBe(data)
    expect(invoke).toHaveBeenCalledWith('ai-agronomist', { method: 'POST', body: input, signal, timeout: 50_000 })
    expect(Object.keys(invoke.mock.calls[0][1].body)).not.toContain('context')
  })
  it('marks a missing or unconfigured endpoint unavailable without a demo answer', async () => {
    invoke.mockResolvedValue({ data: { available: false, mode: 'unavailable', readOnly: true, costMode: 'free-only', provider: null, model: null }, error: null })
    expect((await getAgronomistStatus(new AbortController().signal)).available).toBe(false)
    invoke.mockResolvedValue({ data: null, error: new Error('Network unavailable') })
    await expect(askAgronomist(input, new AbortController().signal)).rejects.toMatchObject({ code: 'ENDPOINT_UNAVAILABLE' })
  })
  it('preserves safe server error codes and retry intervals without upstream text', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'private upstream text' } }), { status: 429, headers: { 'Retry-After': '45' } }) } })
    await expect(askAgronomist(input, new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 45, message: 'RATE_LIMITED' })
  })
  it('uses a safe cooldown when a free-quota response has no readable retry header', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: { code: 'FREE_QUOTA_EXHAUSTED' } }), { status: 429 }) } })
    await expect(askAgronomist(input, new AbortController().signal)).rejects.toMatchObject({ code: 'FREE_QUOTA_EXHAUSTED', retryAfter: 300 })
  })
  it('rejects malformed rendering data, unknown citations and cancellation', async () => {
    const missingNestedField = response()
    Reflect.deleteProperty(missingNestedField.answer, 'missingData')
    const invalidCitation = response()
    invalidCitation.answer.paragraphs[0].evidenceIds = ['unknown-reference']
    const invalidTimestamp = response()
    invalidTimestamp.context.snapshot.computedAt = 'invalid'
    for (const data of [{ mode: 'demo', answer: {} }, missingNestedField, invalidCitation, invalidTimestamp]) {
      invoke.mockResolvedValue({ data, error: null })
      await expect(askAgronomist(input, new AbortController().signal)).rejects.toBeInstanceOf(AgronomistClientError)
    }
    const controller = new AbortController(); controller.abort()
    await expect(askAgronomist(input, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('refuses to activate an older OpenAI-only endpoint or render its unmarked answers', async () => {
    invoke.mockResolvedValue({ data: { available: true, mode: 'configured', readOnly: true }, error: null })
    await expect(getAgronomistStatus(new AbortController().signal)).rejects.toMatchObject({ code: 'FREE_CONFIGURATION_REQUIRED' })
    const legacy = response()
    Reflect.deleteProperty(legacy, 'costMode')
    invoke.mockResolvedValue({ data: legacy, error: null })
    await expect(askAgronomist(input, new AbortController().signal)).rejects.toMatchObject({ code: 'UNSUPPORTED_ANSWER' })
  })
  it('bounds multibyte Arabic history without changing the farmer question or stored conversation', async () => {
    invoke.mockResolvedValue({ data: response(), error: null })
    const request = { ...input, language: 'ar' as const, question: 'ري'.repeat(700),
      history: Array.from({ length: 4 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: 'ز'.repeat(1800) })) }
    await askAgronomist(request, new AbortController().signal)
    const body = invoke.mock.calls[0][1].body
    expect(new TextEncoder().encode(JSON.stringify(body)).byteLength).toBeLessThanOrEqual(16_000)
    expect(body.history).toHaveLength(2)
    expect(body.question).toBe(request.question)
    expect(request.history).toHaveLength(4)
  })
})

it('uses only the same-origin local path with the real session token in development', async () => {
  vi.stubEnv('VITE_AGRONOMIST_LOCAL', 'true')
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
  const localFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: false, mode: 'unavailable', readOnly: true, costMode: 'free-only', provider: null, model: null }), { status: 200 }))
  vi.stubGlobal('fetch', localFetch)
  getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-session-token' } }, error: null })
  try {
    await getAgronomistStatus(new AbortController().signal)
    expect(localFetch).toHaveBeenCalledWith('/local-ai-agronomist', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer synthetic-session-token' }) }))
    expect(invoke).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})