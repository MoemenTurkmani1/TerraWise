/** Shared by Vite at build/start time. No secret value is logged or returned. */
export function assertNoBrowserSecrets(env: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue
    const secretName = /SERVICE_ROLE|SECRET|PRIVATE_KEY/i.test(name)
    const secretPrefix = value.startsWith('sb_secret_')
    let privilegedJwt = false
    if (value.split('.').length === 3) {
      try {
        const encoded = value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
        const claims: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')))
        privilegedJwt = !!claims && typeof claims === 'object' && 'role' in claims && (claims as { role?: unknown }).role === 'service_role'
      } catch { /* Invalid unrelated values are handled by their own configuration. */ }
    }
    if (secretName || secretPrefix || privilegedJwt) throw new Error(`Unsafe browser environment variable ${name}. Remove privileged credentials from all VITE_ variables before starting or building TerraWise.`)
  }
}
