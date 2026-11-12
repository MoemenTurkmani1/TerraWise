// Convert server messages to a small set of fixed labels; never expose the
// response body, which can contain configuration or user data.
export function classifyPermission(code, message) {
  if (code !== '42501') return null
  if (typeof message !== 'string') return 'insufficient privilege'
  if (/permission denied for table\s+(?:(?:"?public"?\.)?"?terrawise_workspaces"?)/i.test(message)) return 'workspace table privilege denied'
  if (/permission denied for (?:column|schema)\b/i.test(message)) return 'schema or column privilege denied'
  if (/row.level security/i.test(message)) return 'row-level security policy denial'
  return 'insufficient privilege'
}

export function interpretWorkspace({ status, code, permission }) {
  if (status === null) return { reached: false, message: 'Workspace probe could not reach the API.' }
  if ((status === 401 || status === 403) && code === '42501') {
    return {
      reached: true,
      message: `PostgreSQL returned 42501: ${permission ?? 'insufficient privilege'}. Anonymous access was denied. This is consistent with the workspace migration; it does not verify authenticated access or RLS policies.`,
    }
  }
  if (status === 404 && code === 'PGRST205') return { reached: true, message: 'Workspace table is absent from the API schema cache; verify the migration and exposed schema.' }
  if (status === 200 || status === 206) return { reached: true, message: 'The anonymous zero-row query was accepted. Review anonymous grants and policies; this does not establish whether any rows are accessible.' }
  if (status === 401 || status === 403) return { reached: false, message: 'Workspace request was rejected without a recognizable PostgreSQL permission code. Authentication, API-key, gateway, or other authorization issues require investigation.' }
  return { reached: false, message: 'Unexpected workspace response; the cause is not established.' }
}
