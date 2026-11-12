import { describe, expect, it } from 'vitest'
import { nativeCallback } from './nativeAuth'
describe('native authentication callback boundary', () => {
  it('accepts registered auth routes', () => {
    expect(nativeCallback('terrawise://auth/update-password#access_token=fixture&refresh_token=fixture2')).toMatchObject({ path: '/update-password', accessToken: 'fixture' })
    expect(nativeCallback('terrawise://auth/login?code=fixture')).toMatchObject({ path: '/login', code: 'fixture' })
  })
  it.each(['https://example.com/login', 'terrawise://evil/login', 'terrawise://auth/settings', 'javascript:alert(1)', 'bad-url'])('ignores untrusted callback %s', url => { expect(nativeCallback(url)).toBeNull() })
})
