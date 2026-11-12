import { localAgronomistPath } from './agronomistLocal'
import { assertRealSession } from '../lib/demoSession'
import { supabase } from './supabase'
import { isAgronomistResponse } from './agronomistResponse'
import type { AgronomistRequest, AgronomistResponse, AgronomistStatus } from '../../supabase/functions/ai-agronomist/contracts'
export type { AgronomistResponse, AgronomistStatus }

export class AgronomistClientError extends Error {
  constructor(public code: string, public retryAfter = 0) { super(code) }
}
async function invoke<T>(method: 'GET' | 'POST', signal: AbortSignal, body?: AgronomistRequest): Promise<T> {
  assertRealSession()
  if (body?.fieldId.startsWith('demo:')) throw new AgronomistClientError('AUTH_REQUIRED')
  if (!supabase) throw new AgronomistClientError('AUTH_REQUIRED')
  const localPath = localAgronomistPath(import.meta.env.DEV, import.meta.env.VITE_AGRONOMIST_LOCAL, typeof window === 'undefined' ? '' : window.location.hostname)
  let result: { data: T | null; error: unknown }
  if (localPath) {
    const session = await supabase.auth.getSession()
    if (session.error || !session.data.session) throw new AgronomistClientError('AUTH_REQUIRED')
    try {
      const response = await fetch(localPath, { method, headers: { Authorization: 'Bearer ' + session.data.session.access_token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.any([signal, AbortSignal.timeout(50_000)]) })
      result = response.ok ? { data: await response.json() as T, error: null } : { data: null, error: { context: response } }
    } catch { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); throw new AgronomistClientError('ENDPOINT_UNAVAILABLE') }
  } else result = await supabase.functions.invoke<T>('ai-agronomist', { method, body, signal, timeout: 50_000 })
  const { data, error } = result
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (error) {
    const response = typeof error === 'object' && error !== null && 'context' in error && error.context instanceof Response ? error.context : null
    let code = response?.status === 401 ? 'AUTH_REQUIRED' : 'ENDPOINT_UNAVAILABLE'
    let retry = 0
    if (response) {
      retry = Math.max(0, Number(response.headers.get('retry-after')) || 0)
      try {
        const problem: unknown = await response.json()
        if (problem && typeof problem === 'object' && 'error' in problem) {
          const detail = problem.error
          if (detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string') code = detail.code
        }
      } catch { /* Gateway errors need not have a JSON body. */ }
    }
    if (code === 'FREE_QUOTA_EXHAUSTED' && !retry) retry = 300
    throw new AgronomistClientError(code, retry)
  }
  if (!data) throw new AgronomistClientError('ENDPOINT_UNAVAILABLE')
  return data
}
export async function getAgronomistStatus(signal: AbortSignal): Promise<AgronomistStatus> {
  const status = await invoke<AgronomistStatus>('GET', signal)
  if (typeof status.available !== 'boolean' || status.readOnly !== true || !['configured', 'unavailable'].includes(status.mode)) throw new AgronomistClientError('ENDPOINT_UNAVAILABLE')
  if (status.costMode !== 'free-only' || (status.available && (status.provider !== 'gemini' || status.model !== 'gemini-3.5-flash-lite'))) throw new AgronomistClientError('FREE_CONFIGURATION_REQUIRED')
  return status
}
export async function askAgronomist(request: AgronomistRequest, signal: AbortSignal): Promise<AgronomistResponse> {
  const bounded = { ...request, history: [...request.history] }
  while (bounded.history.length && new TextEncoder().encode(JSON.stringify(bounded)).byteLength > 16_000) bounded.history.splice(0, 2)
  const result = await invoke<unknown>('POST', signal, bounded)
  if (!isAgronomistResponse(result)) throw new AgronomistClientError('UNSUPPORTED_ANSWER')
  return result
}
