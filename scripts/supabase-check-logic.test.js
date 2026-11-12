import { describe, expect, it } from 'vitest'
import { classifyPermission, interpretWorkspace } from './supabase-check-logic.mjs'

describe('read-only Supabase probe classification', () => {
  it.each([401, 403])('recognizes HTTP %i and PostgreSQL 42501 as database permission responses', status => {
    const permission = classifyPermission('42501', 'permission denied for table terrawise_workspaces')
    expect(permission).toBe('workspace table privilege denied')
    const result = interpretWorkspace({ status, code: '42501', permission })
    expect(result.reached).toBe(true)
    expect(result.message).toContain('does not verify authenticated access or RLS')
  })
  it('does not treat an unclassified 401 as a successful database response', () => {
    expect(interpretWorkspace({ status: 401, code: null }).reached).toBe(false)
    expect(interpretWorkspace({ status: 401, code: 'PGRST301' }).reached).toBe(false)
  })
  it('distinguishes schema cache misses and zero-row anonymous successes', () => {
    expect(interpretWorkspace({ status: 404, code: 'PGRST205' })).toMatchObject({ reached: true, message: expect.stringContaining('schema cache') })
    expect(interpretWorkspace({ status: 200, code: null }).message).toContain('does not establish')
  })
  it('only returns fixed labels for server messages', () => {
    expect(classifyPermission('42501', 'new row violates row-level security policy')).toBe('row-level security policy denial')
    expect(classifyPermission('42501', 'sensitive server text')).toBe('insufficient privilege')
    expect(classifyPermission('PGRST301', 'sensitive server text')).toBeNull()
  })
})
