export function nativeCallback(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'terrawise:' || parsed.hostname !== 'auth' || !['/login', '/update-password'].includes(parsed.pathname)) return null
    const hash = new URLSearchParams(parsed.hash.slice(1))
    return { path: parsed.pathname, code: parsed.searchParams.get('code'), accessToken: hash.get('access_token'), refreshToken: hash.get('refresh_token') }
  } catch { return null }
}
