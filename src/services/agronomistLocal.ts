/** No configurable external URL: developer opt-in routes only to this local origin. */
export function localAgronomistPath(dev: boolean, enabled: string | undefined, hostname: string): string | null {
  return dev && enabled === 'true' && ['localhost','127.0.0.1','[::1]'].includes(hostname) ? '/local-ai-agronomist' : null
}
