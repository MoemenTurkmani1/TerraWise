import { describe, expect, it } from 'vitest'
import { localAgronomistPath } from './agronomistLocal'
import { isLoopbackRequest } from '../../scripts/localAgronomist'
describe('local AI transport boundary', () => {
  it('requires development mode, opt-in and a loopback origin', () => {
    expect(localAgronomistPath(true, 'true', 'localhost')).toBe('/local-ai-agronomist')
    expect(localAgronomistPath(false, 'true', 'localhost')).toBeNull()
    expect(localAgronomistPath(true, undefined, 'localhost')).toBeNull()
    expect(localAgronomistPath(true, 'true', 'example.com')).toBeNull()
  })
  it('rejects network clients and host-header rebinding', () => {
    expect(isLoopbackRequest('127.0.0.1','localhost:5173')).toBe(true)
    expect(isLoopbackRequest('192.168.1.10','localhost:5173')).toBe(false)
    expect(isLoopbackRequest('127.0.0.1','attacker.example:5173')).toBe(false)
    expect(isLoopbackRequest(undefined,'localhost:5173')).toBe(false)
  })
})
