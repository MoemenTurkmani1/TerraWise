import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceData } from './supabaseWorkspace'

const state = vi.hoisted(() => ({ data: null as unknown, error: null as null | { message: string; code?: string }, predicates: [] as [string, unknown][], inserted: null as unknown, updated: null as unknown }))
vi.mock('./supabase', () => {
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { state.predicates.push([key, value]); return builder },
    insert: (value: unknown) => { state.inserted = value; return builder },
    update: (value: unknown) => { state.updated = value; return builder },
    single: async () => ({ data: state.data, error: state.error }),
    maybeSingle: async () => ({ data: state.data, error: state.error }),
  }
  return { supabase: { from: () => builder } }
})
import { readRemoteWorkspace, writeRemoteWorkspace } from './supabaseWorkspace'

const workspace: WorkspaceData = { fields: [], plans: {}, preferences: { name: 'Farmer', climateMode: 'demo', language: 'en', areaUnit: 'ha' }, analysisRecords: [] }
beforeEach(() => { state.data = null; state.error = null; state.predicates = []; state.inserted = null; state.updated = null })

describe('owner-isolated, versioned workspace adapter', () => {
  it('always scopes a read to the authenticated owner', async () => {
    expect(await readRemoteWorkspace('owner-a')).toBeNull()
    expect(state.predicates).toContainEqual(['owner_id', 'owner-a'])
    state.error = { message: 'permission denied' }
    await expect(readRemoteWorkspace('owner-a')).rejects.toThrow('permission denied')
  })
  it('does not treat a concurrent first-write conflict as saved', async () => {
    state.error = { code: '23505', message: 'duplicate key' }
    await expect(writeRemoteWorkspace('owner-a', workspace, 0)).rejects.toThrow('changed in another tab')
    expect(state.inserted).toMatchObject({ owner_id: 'owner-a', version: 1 })
  })
  it('does not overwrite when the stored version has changed', async () => {
    await expect(writeRemoteWorkspace('owner-a', workspace, 4)).rejects.toThrow('changed in another tab')
    expect(state.predicates).toEqual([['owner_id', 'owner-a'], ['version', 4]])
    expect(state.updated).toMatchObject({ version: 5 })
  })
  it('accepts a write only after the server confirms the next version', async () => {
    state.data = { version: 5 }
    await expect(writeRemoteWorkspace('owner-a', workspace, 4)).resolves.toBe(5)
  })
})
