import { AgentError } from './contracts.ts'
export type Fetcher = typeof fetch
export async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new AgentError(502, 'UPSTREAM_ERROR', 'A service returned no data.')
  const reader = response.body.getReader()
  let total = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) { await reader.cancel(); throw new AgentError(413, 'PAYLOAD_TOO_LARGE', 'Data exceeds the supported size.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { bytes.set(c, offset); offset += c.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown }
  catch { throw new AgentError(502, 'UPSTREAM_ERROR', 'A service returned invalid data.') }
}
export async function fetchJson(fetcher: Fetcher, url: string, init: RequestInit, signal: AbortSignal, timeoutMs: number, maxBytes = 2_000_000): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const timer = setTimeout(cancel, timeoutMs)
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' })
    // Never expose upstream error bodies, which can contain credentials or request content.
    const data = response.ok ? await readJsonBounded(response, maxBytes) : null
    if (!response.ok) await response.body?.cancel()
    return { response, data }
  } catch (error) {
    if (controller.signal.aborted) throw new AgentError(504, 'TIMEOUT', 'A service timed out. Please retry.')
    if (error instanceof AgentError) throw error
    throw new AgentError(502, 'UPSTREAM_ERROR', 'An upstream service is unavailable.')
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel) }
}
export async function readRequestBody(request: Request, signal: AbortSignal): Promise<unknown> {
  const length = Number(request.headers.get('content-length'))
  if (length > 16_384) throw new AgentError(413, 'PAYLOAD_TOO_LARGE', 'The question is too long.')
  const reader = request.body?.getReader()
  if (!reader) throw new AgentError(400, 'INVALID_REQUEST', 'A JSON request body is required.')
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw new AgentError(504, 'TIMEOUT', 'The request timed out.')
      if (done) break
      total += value.length
      if (total > 16_384) { await reader.cancel(); throw new AgentError(413, 'PAYLOAD_TOO_LARGE', 'The question is too long.') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) { bytes.set(c, offset); offset += c.length }
    try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown }
    catch { throw new AgentError(400, 'INVALID_REQUEST', 'The request body must be valid JSON.') }
  } finally { reader.releaseLock(); signal.removeEventListener('abort', cancel) }
}
