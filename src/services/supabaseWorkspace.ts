import { supabase } from './supabase'
import type { Field, RotationStep } from '../types'
import type { AnalysisRecord } from '../types/analysis'

export interface WorkspacePreferences { name: string; climateMode: 'demo' | 'live'; language: 'en' | 'ar'; areaUnit: 'ha' | 'acre' }
export interface WorkspaceData { fields: Field[]; plans: Record<string, RotationStep[]>; preferences: WorkspacePreferences; analysisRecords: AnalysisRecord[] }
export interface RemoteWorkspace { data: unknown; version: number }

/** Reads and writes are scoped twice: the query includes owner_id and the
 * database must also enforce auth.uid() via RLS. The version predicate prevents
 * one browser tab silently overwriting a newer version from another tab. */
export async function readRemoteWorkspace(ownerId: string): Promise<RemoteWorkspace | null> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('terrawise_workspaces').select('fields,plans,preferences,analyses,version').eq('owner_id', ownerId).maybeSingle()
  if (error) throw new Error(`Could not load the account workspace: ${error.message}`)
  if (!data) return null
  if (!Number.isSafeInteger(data.version) || data.version < 1) throw new Error('The account workspace version is invalid. No data was changed.')
  return { version: data.version, data: { fields: data.fields, plans: data.plans, preferences: data.preferences, analysisRecords: data.analyses } }
}

export async function writeRemoteWorkspace(ownerId: string, workspace: WorkspaceData, version: number): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const payload = { fields: workspace.fields, plans: workspace.plans, preferences: workspace.preferences, analyses: workspace.analysisRecords, updated_at: new Date().toISOString() }
  if (version === 0) {
    const { data, error } = await supabase.from('terrawise_workspaces').insert({ owner_id: ownerId, ...payload, version: 1 }).select('version').single()
    if (error) {
      if (error.code === '23505') throw new Error('The account workspace changed in another tab. Export unsaved data, then reload to review the newer version.')
      throw new Error(`Could not save the account workspace: ${error.message}`)
    }
    if (!data || data.version !== 1) throw new Error('The account workspace was not confirmed by the server.')
    return data.version
  }
  const { data, error } = await supabase.from('terrawise_workspaces').update({ ...payload, version: version + 1 }).eq('owner_id', ownerId).eq('version', version).select('version').maybeSingle()
  if (error) throw new Error(`Could not save the account workspace: ${error.message}`)
  if (!data || data.version !== version + 1) throw new Error('The account workspace changed in another tab. Export unsaved data, then reload to review the newer version.')
  return data.version
}
