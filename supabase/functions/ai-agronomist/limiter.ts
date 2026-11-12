import { AgentError, isRecord } from './contracts.ts'
import { fetchJson, type Fetcher } from './http.ts'
export interface QuotaEnvironment { AGRONOMIST_GLOBAL_RPM?: string; AGRONOMIST_GLOBAL_RPD?: string }
export interface QuotaLimits { globalPerMinute: number; globalPerDay: number }
export const DEFAULT_FREE_LIMITS: QuotaLimits = Object.freeze({ globalPerMinute: 2, globalPerDay: 20 })
export function resolveQuotaLimits(env: QuotaEnvironment): QuotaLimits | null {
  const parse = (value: string | undefined, max: number) => value === undefined || value === '' ? max : /^[1-9][0-9]*$/.test(value) && Number(value) <= max ? Number(value) : null
  const globalPerMinute = parse(env.AGRONOMIST_GLOBAL_RPM, 2), globalPerDay = parse(env.AGRONOMIST_GLOBAL_RPD, 20)
  return globalPerMinute === null || globalPerDay === null ? null : { globalPerMinute, globalPerDay }
}
/** Atomic across isolates. Existing per-user keys remain; project minute/day
 * limits are stricter for the free deployment. There is no local fallback. */
export const LIMIT_SCRIPT = String.raw`
for i=1,4 do
  if tonumber(redis.call('GET',KEYS[i]) or '0') >= tonumber(ARGV[i]) then
    return {0,tonumber(ARGV[i+8])}
  end
end
for i=1,4 do
  local count=redis.call('INCR',KEYS[i])
  if count == 1 then redis.call('EXPIRE',KEYS[i],tonumber(ARGV[i+4])) end
end
return {1,0}
`
export async function consumeQuota(fetcher: Fetcher, redisUrl: string, redisToken: string, projectUrl: string, userId: string, signal: AbortSignal, now = Date.now(), limits: QuotaLimits = DEFAULT_FREE_LIMITS): Promise<void> {
  const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(n => n.toString(16).padStart(2, '0')).join('')
  const project = (await hash(projectUrl)).slice(0, 16), user = await hash(projectUrl + ':' + userId)
  const minute = Math.floor(now / 60_000), day = Math.floor(now / 86_400_000)
  const minuteRetry = 60 - Math.floor(now / 1000) % 60, dayRetry = 86400 - Math.floor(now / 1000) % 86400
  const prefix = 'tw:{agronomist-' + project + '}:'
  const command = ['EVAL', LIMIT_SCRIPT, '4', prefix + user + ':m:' + minute, prefix + user + ':d:' + day, prefix + 'global:m:' + minute, prefix + 'global:d:' + day,
    '4', '30', String(limits.globalPerMinute), String(limits.globalPerDay), '120', '172800', '120', '172800', String(minuteRetry), String(dayRetry), String(minuteRetry), String(dayRetry)]
  let result: Awaited<ReturnType<typeof fetchJson>>
  try {
    result = await fetchJson(fetcher, redisUrl, {
      method: 'POST', headers: { Authorization: 'Bearer ' + redisToken, 'Content-Type': 'application/json' }, body: JSON.stringify(command)
    }, signal, 4000, 10_000)
  } catch { throw new AgentError(503, 'LIMITER_UNAVAILABLE', 'The free usage limiter is unavailable. AI requests are paused.') }
  const { response, data } = result
  if (!response.ok || !isRecord(data) || data.error || !Array.isArray(data.result) || data.result.length !== 2 || ![0, 1].includes(data.result[0]) || !Number.isInteger(data.result[1])) throw new AgentError(503, 'LIMITER_UNAVAILABLE', 'The free usage limiter is unavailable or its quota is exhausted. AI requests are paused.')
  if (data.result[0] === 0) throw new AgentError(429, 'RATE_LIMITED', 'The agronomist usage limit was reached. Please wait for it to reset.', Math.max(1, Math.min(86400, data.result[1])))
}
