import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Field, Recommendation, RotationStep } from '../types'
import { isAnalysisRecord, type AnalysisRecord } from '../types/analysis'
import { crops } from '../data/crops'
import { FIELD_STORAGE_KEY, fieldRepository, isField, isUntouchedLegacySample } from '../services/repository'
import { readRemoteWorkspace, writeRemoteWorkspace, type WorkspaceData, type WorkspacePreferences } from '../services/supabaseWorkspace'
import { historySerial } from '../lib/history'
import { useAuth } from './AuthContext'

export type Preferences = WorkspacePreferences
interface AppState {
  fields: Field[]; selectedFieldId: string; setSelectedFieldId: (id: string) => void;
  saveField: (field: Field) => Promise<void>; deleteField: (id: string) => Promise<void>;
  plans: Record<string, RotationStep[]>; savePlan: (id: string, steps: RotationStep[]) => Promise<void>;
  preferences: Preferences; updatePreferences: (value: Partial<Preferences>) => Promise<void>;
  analysisRecords: AnalysisRecord[]; saveAnalysis: (record: AnalysisRecord) => Promise<void>; deleteAnalysis: (id: string) => Promise<void>;
  storageError: string | null;
  syncState: 'local' | 'loading' | 'syncing' | 'synced' | 'error'; retrySync: () => Promise<void>;
}
const AppContext = createContext<AppState | null>(null)
type StorageArea = 'fields' | 'plans' | 'preferences' | 'analyses'
type StorageIssues = Partial<Record<StorageArea, string>>
const emptyPlans = (): Record<string, RotationStep[]> => Object.create(null) as Record<string, RotationStep[]>
const copyPlans = (value: Record<string, RotationStep[]>) => Object.assign(emptyPlans(), value)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isNumber = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const isText = (value: unknown): value is string => typeof value === 'string' && value.length <= 10_000
const isTextArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)

function validRecommendation(value: unknown): value is Recommendation {
  if (!isRecord(value)) return false
  const storedCrop = value.crop
  if (!isRecord(storedCrop) || !crops.some(crop => crop.id === storedCrop.id)) return false
  if (!(value.score === null || isNumber(value.score, 0, 100)) || !['demo', 'nasa-power'].includes(String(value.dataSource)) || !['low', 'medium', 'high'].includes(String(value.confidence))) return false
  if (value.dataSource === 'demo' && value.confidence !== 'low') return false
  if (!isTextArray(value.reasons) || !isTextArray(value.warnings) || !isTextArray(value.missingInputs)) return false
  if (!Array.isArray(value.factors) || value.factors.length !== 6) return false
  const factors = value.factors
  if (!factors.every(factor => isRecord(factor) && isText(factor.name) && isText(factor.explanation) && (factor.score === null || isNumber(factor.score, 0, 100)) && isNumber(factor.weight, 0, 1))) return false
  if (value.decision !== undefined && !['eligible', 'ineligible', 'insufficient_evidence'].includes(String(value.decision))) return false
  if (value.constraints !== undefined && (!Array.isArray(value.constraints) || !value.constraints.every(item => isRecord(item) && isText(item.id) && isText(item.explanation) && ['compatible', 'incompatible', 'unknown'].includes(String(item.status)) && (item.reviewedRuleId === undefined || isText(item.reviewedRuleId))))) return false
  return Math.abs(factors.reduce((sum: number, factor: { weight: number }) => sum + factor.weight, 0) - 1) < 0.000001
}

function validSteps(value: unknown): value is RotationStep[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return false
  return value.every((step, index) => {
    if (!isRecord(step) || !['Spring', 'Autumn'].includes(String(step.season)) || !isNumber(step.year, 1900, 2201) || !Number.isInteger(step.year) || !validRecommendation(step.recommendation)) return false
    if (index === 0) return true
    const previous = value[index - 1] as RotationStep
    return historySerial({ year: step.year, season: String(step.season) }) > historySerial(previous) && step.recommendation.dataSource === previous.recommendation.dataSource
  })
}

function readInitialState() {
  const issues: StorageIssues = {}
  let fields: Field[]
  let preferences: Preferences = { name: 'Farmer', climateMode: 'live', language: 'en', areaUnit: 'ha' }
  const plans = emptyPlans()
  let analysisRecords: AnalysisRecord[] = []
  try { fields = fieldRepository.getAll() }
  catch (error) {
    fields = []
    issues.fields = `${error instanceof Error ? error.message : 'Saved fields are unavailable.'} Existing browser data was left untouched.`
  }
  try {
    const raw = localStorage.getItem('terrawise.preferences')
    if (raw !== null) {
      const value: unknown = JSON.parse(raw)
      if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60 || !['demo', 'live'].includes(String(value.climateMode))) throw new Error('Invalid preferences')
      preferences = { name: value.name, climateMode: 'live', language: value.language === 'ar' ? 'ar' : 'en', areaUnit: value.areaUnit === 'acre' ? 'acre' : 'ha' }
    }
  } catch { issues.preferences = 'Saved preferences could not be read. Default preferences are shown without changing browser data.' }
  try {
    const value: unknown = JSON.parse(localStorage.getItem('terrawise.plans') || '{}')
    if (!isRecord(value)) throw new Error('Invalid plans')
    for (const [fieldId, steps] of Object.entries(value)) {
      if (!fields.some(field => field.id === fieldId)) continue
      if (!validSteps(steps)) { issues.plans = 'Some saved rotations have an unsupported format and were skipped. Existing browser data was left untouched.'; continue }
      plans[fieldId] = steps.map(step => ({ ...step, recommendation: { ...step.recommendation, crop: crops.find(crop => crop.id === step.recommendation.crop.id)! } }))
    }
  } catch { issues.plans = 'Saved rotations could not be read. New previews are shown without changing browser data.' }
  try {
    const raw = localStorage.getItem('terrawise.analyses.v1')
    if (raw !== null) {
      const value: unknown = JSON.parse(raw)
      if (!Array.isArray(value) || !value.every(isAnalysisRecord)) throw new Error('Invalid analyses')
      analysisRecords = value
    }
  } catch { issues.analyses = 'Saved analyses could not be read. Existing browser data was left untouched.' }
  return { fields, preferences, plans, analysisRecords, issues }
}
function parseRemote(value: unknown): WorkspaceData {
  if (!isRecord(value) || !Array.isArray(value.fields) || !value.fields.every(isField) || new Set(value.fields.map(field => field.id)).size !== value.fields.length || !isRecord(value.plans) || !isRecord(value.preferences) || !Array.isArray(value.analysisRecords) || !value.analysisRecords.every(isAnalysisRecord)) throw new Error('The account workspace has an unsupported format. No data was changed.')
  const p = value.preferences
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60 || !['demo', 'live'].includes(String(p.climateMode))) throw new Error('Account preferences have an unsupported format. No data was changed.')
  const plans = emptyPlans()
  for (const [id, steps] of Object.entries(value.plans)) {
    if (!value.fields.some(field => field.id === id) || !validSteps(steps)) throw new Error('A saved account rotation has an unsupported format. No data was changed.')
    plans[id] = steps.map(step => ({ ...step, recommendation: { ...step.recommendation, crop: crops.find(crop => crop.id === step.recommendation.crop.id)! } }))
  }
  return { fields: value.fields, plans, preferences: { name: p.name, climateMode: 'live', language: p.language === 'ar' ? 'ar' : 'en', areaUnit: p.areaUnit === 'acre' ? 'acre' : 'ha' }, analysisRecords: value.analysisRecords }
}

/** The key causes a complete workspace remount when a user signs in, signs out,
 * or switches accounts. Guest records never become an authenticated workspace. */
export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.loading) return <div className="page-loading" role="status"><span className="loading-leaf" /><p>Checking your session…</p></div>
  if (auth.authError) return <div className="page-loading" role="alert"><p>{auth.authError}</p><p>Your account data has not been replaced.</p><div className="button-row"><button className="btn btn-primary" onClick={auth.retryInitialization}>Retry session</button><button className="btn btn-secondary" onClick={auth.enterDemo}>Continue in local workspace</button></div></div>
  return <WorkspaceProvider key={auth.user?.id ?? 'guest'} ownerId={auth.user?.id ?? null} displayName={typeof auth.user?.user_metadata?.display_name === 'string' ? auth.user.user_metadata.display_name : 'Farmer'}>{children}</WorkspaceProvider>
}

function WorkspaceProvider({ children, ownerId, displayName }: { children: ReactNode; ownerId: string | null; displayName: string }) {
  const auth = useAuth()
  // The provider is remounted for a different owner. Keep the initial name
  // stable for this owner so a token refresh or metadata change cannot reload
  // the workspace over pending, unsaved changes.
  const initialDisplayName = useRef(displayName)
  const [initial] = useState(() => ownerId ? { fields: [] as Field[], plans: emptyPlans(), preferences: { name: displayName.slice(0, 60) || 'Farmer', climateMode: 'live' as const, language: 'en' as const, areaUnit: 'ha' as const }, analysisRecords: [] as AnalysisRecord[], issues: {} as StorageIssues } : readInitialState())
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => ({ fields: initial.fields, plans: initial.plans, preferences: initial.preferences, analysisRecords: initial.analysisRecords }))
  const snapshot = useRef(workspace)
  const [selectedFieldId, setSelectedFieldId] = useState(() => initial.fields[0]?.id || '')
  const [issues, setIssues] = useState<StorageIssues>(initial.issues)
  const unreadableAreas = useRef(new Set(Object.keys(initial.issues)))
  const [syncState, setSyncState] = useState<AppState['syncState']>(ownerId ? 'loading' : 'local')
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const revision = useRef(0)
  const pending = useRef(0)
  const active = useRef(true)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const storageError = Object.values(issues).join(' ') || null
  function setIssue(area: StorageArea, message?: string) {
    setIssues(current => { const next = { ...current }; if (message) next[area] = message; else delete next[area]; return next })
  }
  function apply(next: WorkspaceData) { snapshot.current = next; setWorkspace(next) }

  useEffect(() => {
    active.current = true
    if (!ownerId) return () => { active.current = false }
    let cancelled = false
    setLoadFailed(false); setSyncState('loading')
    void readRemoteWorkspace(ownerId).then(remote => {
      if (cancelled) return
      const next = remote ? parseRemote(remote.data) : { fields: [], plans: emptyPlans(), preferences: { name: initialDisplayName.current.slice(0, 60) || 'Farmer', climateMode: 'live' as const, language: 'en' as const, areaUnit: 'ha' as const }, analysisRecords: [] }
      revision.current = remote?.version ?? 0
      apply(next); setSelectedFieldId(next.fields[0]?.id || ''); setIssues({}); setSyncState('synced')
    }).catch(error => {
      if (cancelled) return
      setLoadFailed(true); setSyncState('error'); setIssue('fields', error instanceof Error ? error.message : 'The account workspace could not be loaded.')
    })
    return () => { cancelled = true; active.current = false }
  }, [ownerId, loadAttempt])

  async function commit(next: WorkspaceData, areas: StorageArea[]) {
    if (ownerId) {
      // Optimistic display is accompanied by an explicit syncing/error state.
      // The single write queue preserves ordering, including a retry after failure.
      apply(next); pending.current += 1; setSyncState('syncing')
      const operation = queue.current.then(async () => { revision.current = await writeRemoteWorkspace(ownerId, next, revision.current) })
      queue.current = operation.catch(() => {})
      try {
        await operation
        pending.current -= 1
        if (active.current && pending.current === 0) { setIssues(current => { const updated = { ...current }; delete updated.fields; return updated }); setSyncState('synced') }
      } catch (error) {
        pending.current -= 1
        const message = error instanceof Error ? error.message : 'The account workspace could not be saved.'
        if (active.current) { setIssue('fields', `${message} Changes on this screen are not confirmed by the server.`); setSyncState('error') }
        throw error
      }
      return
    }
    if (areas.some(area => unreadableAreas.current.has(area))) throw new Error('Saved browser data could not be read safely. Existing data was not overwritten; recover or export it before saving changes.')
    const keys: Record<StorageArea, string> = { fields: FIELD_STORAGE_KEY, plans: 'terrawise.plans', preferences: 'terrawise.preferences', analyses: 'terrawise.analyses.v1' }
    // The backing workspace retains legacy records; only the view hides them.
    const values: Record<StorageArea, unknown> = { fields: next.fields, plans: next.plans, preferences: next.preferences, analyses: next.analysisRecords }
    const backups = new Map<string, string | null>()
    try {
      for (const area of areas) { const key = keys[area]; backups.set(key, localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify(values[area])) }
      apply(next); setIssues(current => { const updated = { ...current }; areas.forEach(area => delete updated[area]); return updated })
    } catch {
      for (const [key, old] of backups) { try { if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old) } catch { /* Surface the storage error; no silent success. */ } }
      const message = 'Could not save to browser storage. Check storage permissions and try again.'
      setIssue(areas[0], message)
      throw new Error(message)
    }
  }

  async function saveField(field: Field) {
    if (!isField(field)) throw new Error('Field values are invalid and could not be saved.')
    const current = snapshot.current
    const fields = current.fields.some(item => item.id === field.id) ? current.fields.map(item => item.id === field.id ? field : item) : [...current.fields, field]
    await commit({ ...current, fields }, ['fields']); setSelectedFieldId(field.id)
  }
  async function deleteField(id: string) {
    const current = snapshot.current, fields = current.fields.filter(field => field.id !== id), plans = copyPlans(current.plans)
    delete plans[id]
    await commit({ ...current, fields, plans }, ['fields', 'plans']); setSelectedFieldId(fields[0]?.id || '')
  }
  async function savePlan(id: string, steps: RotationStep[]) {
    if (!validSteps(steps)) throw new Error('The rotation is invalid and could not be saved.')
    const current = snapshot.current, plans = copyPlans(current.plans); plans[id] = steps
    await commit({ ...current, plans }, ['plans'])
  }
  async function updatePreferences(value: Partial<Preferences>) {
    const current = snapshot.current, preferences = { ...current.preferences, ...value }
    if (!preferences.name.trim() || preferences.name.length > 60 || !['demo', 'live'].includes(preferences.climateMode) || !['en', 'ar'].includes(preferences.language) || !['ha', 'acre'].includes(preferences.areaUnit)) throw new Error('Preferences are invalid.')
    await commit({ ...current, preferences }, ['preferences'])
  }
  async function saveAnalysis(record: AnalysisRecord) {
    if (!isAnalysisRecord(record)) throw new Error('The analysis is invalid and could not be saved.')
    const current = snapshot.current
    await commit({ ...current, analysisRecords: [...current.analysisRecords.filter(item => item.id !== record.id), record] }, ['analyses'])
  }
  async function deleteAnalysis(id: string) {
    const current = snapshot.current
    await commit({ ...current, analysisRecords: current.analysisRecords.filter(item => item.id !== id) }, ['analyses'])
  }
  async function retrySync() { if (ownerId) await commit(snapshot.current, ['fields', 'plans', 'preferences', 'analyses']) }

  if (ownerId && syncState === 'loading') return <div className="page-loading" role="status"><span className="loading-leaf" /><p>Loading your private workspace…</p></div>
  if (ownerId && loadFailed) return <div className="page-loading" role="alert"><p>{storageError}</p><p>Your account data was not replaced.</p><div className="button-row"><button className="btn btn-primary" onClick={() => setLoadAttempt(value => value + 1)}>Retry</button><button className="btn btn-secondary" onClick={() => { void auth.signOut().catch(error => setIssue('fields', error instanceof Error ? error.message : 'Sign out failed.')) }}>Sign out</button></div></div>
  const visibleFields = workspace.fields.filter(field => !isUntouchedLegacySample(field))
  const visiblePlans = Object.fromEntries(Object.entries(workspace.plans).filter(([id]) => visibleFields.some(field => field.id === id)))
  return <AppContext.Provider value={{ ...workspace, fields: visibleFields, plans: visiblePlans, selectedFieldId, setSelectedFieldId, saveField, deleteField, savePlan, updatePreferences, saveAnalysis, deleteAnalysis, storageError, syncState, retrySync }}>{children}</AppContext.Provider>
}
export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('useApp requires AppProvider'); return context }
