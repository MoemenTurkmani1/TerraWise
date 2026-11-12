import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Droplets, FileText, FlaskConical, History, Leaf, LocateFixed, MapPin, Plus, RefreshCw, Search, Sprout, Target, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import BestCrops from '../components/BestCrops'
import { useClimate } from '../hooks/useClimate'
import { Badge, Button, EmptyState, PageHeading, SourceNote } from '../components/ui'
import FieldMap from '../components/FieldMap'
import ClimateChart from '../components/ClimateChart'
import { useDemo } from '../context/DemoContext'
import WaterDemandSection from '../components/WaterDemandSection'
import FieldWaterInputs from './FieldWaterInputs'
import { crops } from '../data/crops'
import { sortedHistory } from '../lib/history'
import { canUseLocalReports, deleteSoilReport, loadSoilReport, saveSoilReport, verifySoilReport } from '../services/soilReports'
import { needsLegacyReview } from '../services/repository'
import type { ClimateData, Field, InputProvenance, Priority, WaterAvailability } from '../types'
import './Fields.css'

const waterLabels: Record<WaterAvailability, string> = { rainfed: 'Rainfed', limited: 'Limited irrigation', reliable: 'Reliable irrigation' }
const calendarSeasons = ['Winter', 'Spring', 'Summer', 'Autumn']
function useLocalReportsAllowed() {
  const demo = useDemo()
  const { user, loading, configurationError } = useAuth()
  const anyConfiguration = !!(import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)
  return !demo.active && canUseLocalReports({ authenticated: !!user, loading, configurationInvalid: anyConfiguration && !!configurationError })
}
function latestCropLabel(field: Field) {
  const latest = sortedHistory(field.previousCrops)[0]
  return latest ? `Last: ${crops.find(crop => crop.id === latest.cropId)?.name ?? latest.cropId}` : 'No crop history yet'
}
function previousSeasonDefault(): Field['previousCrops'][number] {
  const today = new Date()
  const currentSeason = Math.floor(today.getMonth() / 3)
  return { cropId: '', season: calendarSeasons[(currentSeason + 3) % 4], year: today.getFullYear() - (currentSeason === 0 ? 1 : 0) }
}
const priorityOptions: { id: Priority; title: string; description: string; icon: typeof Leaf }[] = [
  { id: 'soil-health', title: 'Build healthier soil', description: 'Favor family diversity and nitrogen-fixing crops.', icon: Leaf },
  { id: 'water-saving', title: 'Use less water', description: 'Prioritize crops with lower water requirements.', icon: Droplets },
  { id: 'profitability', title: 'Balance production needs', description: 'Favor strong agronomic fit. Market prices are not modeled.', icon: Target },
  { id: 'production', title: 'Support production', description: 'Explore fit for production; yield is not predicted.', icon: Sprout },
  { id: 'risk-reduction', title: 'Reduce risk', description: 'Consider rotation and suitability concerns.', icon: Target },
]

export function FieldListPage() {
  const demo = useDemo()
  const { fields } = useApp()
  const [search, setSearch] = useState('')
  const [water, setWater] = useState('all')
  const [archiveFilter, setArchiveFilter] = useState('active')
  const visible = fields.filter(field => `${field.name} ${field.location}`.toLowerCase().includes(search.toLowerCase()) && (water === 'all' || field.water === water) && (archiveFilter === 'all' || (archiveFilter === 'archived' ? !!field.archived : !field.archived)))
  return <>
    <PageHeading eyebrow="YOUR FARM, IN FOCUS" title="My fields" description="A little understanding of your land goes a long way."><Link to="/fields/new" className="btn btn-primary"><Plus size={17} /> Add a field</Link></PageHeading>
    <div className="field-list-toolbar"><label className="field-search"><Search size={17} /><span className="sr-only">Search fields</span><input placeholder="Search by field or location…" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="field-water-filter"><span className="sr-only">Filter by water availability</span><select className="select" value={water} onChange={event => setWater(event.target.value)}><option value="all">All water sources</option><option value="rainfed">Rainfed</option><option value="limited">Limited irrigation</option><option value="reliable">Reliable irrigation</option></select></label><label className="field-water-filter"><span className="sr-only">Filter by archive status</span><select className="select" aria-label="Filter by archive status" value={archiveFilter} onChange={event => setArchiveFilter(event.target.value)}><option value="active">Active fields</option><option value="archived">Archived fields</option><option value="all">All fields</option></select></label><span className="field-count" role="status">{visible.length} {visible.length === 1 ? 'field' : 'fields'} · {visible.filter(field => !needsLegacyReview(field)).reduce((sum, field) => sum + field.area, 0).toFixed(1)} ha</span></div>
    {visible.length > 0 ? <div className="fields-page-grid">{visible.map(field => <article key={field.id} className="card fields-page-card"><Link to={`/fields/${field.id}`}><div className="fields-page-photo"><img src={field.image} alt={`Agricultural landscape representing ${field.name}`} /><span>{needsLegacyReview(field) ? 'Review required' : formatArea(field)}</span></div><div className="fields-page-body"><div className="fields-card-title"><h2>{field.name}</h2><ChevronRight size={20} /></div><p className="fields-location"><MapPin size={14} />{needsLegacyReview(field) ? 'Unverified legacy field' : field.location}</p><div className="fields-card-metrics">{needsLegacyReview(field) ? <span>Review example-derived inputs</span> : <><span><FlaskConical size={15} />pH {field.soil.ph ?? 'Unknown'}</span><span><Droplets size={15} />{waterLabels[field.water]}</span></>}</div><div className="fields-card-bottom"><span><Sprout size={15} />{needsLegacyReview(field) ? 'Review crop history' : latestCropLabel(field)}</span><Badge tone={field.archived ? 'amber' : 'green'}>{field.archived ? 'Archived' : 'View field'}</Badge></div></div></Link><Link className="btn btn-primary field-card-action" to={`/recommendations?field=${field.id}`}>Best Crops</Link></article>)}</div> : <EmptyState icon={MapPin} title={fields.length ? (search ? 'No fields match your search' : 'No fields match your filters') : 'Your next season starts here'} description={fields.length ? 'Try a different name or water source.' : 'Add your first field to understand its soil, climate, and crop options.'}>{fields.length ? <Button variant="secondary" onClick={() => { setSearch(''); setWater('all'); setArchiveFilter('active') }}>Clear filters</Button> : <Link to="/fields/new" className="btn btn-primary"><Plus size={16} /> Add your first field</Link>}</EmptyState>}
    <p className="field-page-footnote"><Leaf size={15} /> {demo.active ? 'DEMO / SYNTHETIC fields and soil values. Real report storage is inaccessible.' : 'Field and soil values are supplied by you. Optional report attachments stay on this device.'}</p>
  </>
}

interface Draft {
  name: string; location: string; area: string; latitude: string; longitude: string;
  ph: string; nitrogen: string; phosphorus: string; potassium: string; organicMatter: string;
  water: WaterAvailability; waterSelected: boolean; previousCrops: Field['previousCrops']; priorities: Priority[]
  country: string; areaUnit: 'ha' | 'acre'; elevationM: string; locationSource: 'manual' | 'map' | 'gps'; soilType: string;
  salinity: string; moisture: string; sampleDepthCm: string; sampleDate: string; texture: string; laboratory: string; testMethod: string; provenance: InputProvenance;
  irrigationMethod: string; irrigationSource: string; seasonalRestrictions: string; budget: string; riskTolerance: NonNullable<Field['riskTolerance']>;
}
const ACRES_PER_HECTARE = 2.47105381467165
function formatArea(field: Field) {
  return field.areaUnit === 'acre' ? `${Number((field.area * ACRES_PER_HECTARE).toFixed(3))} acres` : `${field.area} ha`
}
function localToday() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) }
function optionalNumeric(value: string) { return value.trim() === '' ? null : Number(value) }
type ErrorMap = Record<string, string>
const soilInputs = [
  { id: 'ph', label: 'Soil pH', unit: '0–14', min: 0, max: 14, placeholder: 'e.g. 6.8', help: 'Acidity or alkalinity of your soil.' },
  { id: 'nitrogen', label: 'Available nitrogen (N)', unit: 'mg/kg', min: 0, max: 10000, placeholder: 'e.g. 32', help: 'Use a comparable available-N soil test.' },
  { id: 'phosphorus', label: 'Available phosphorus (P)', unit: 'mg/kg', min: 0, max: 10000, placeholder: 'e.g. 24', help: 'Lab extraction methods affect interpretation.' },
  { id: 'potassium', label: 'Available potassium (K)', unit: 'mg/kg', min: 0, max: 10000, placeholder: 'e.g. 180', help: 'Enter lab-reported available potassium.' },
  { id: 'organicMatter', label: 'Organic matter', unit: '%', min: 0, max: 100, placeholder: 'e.g. 2.4', help: 'Leave blank if your lab did not measure it.' },
] as const

function draftFromField(field?: Field, preferredAreaUnit: 'ha' | 'acre' = 'ha'): Draft {
  const areaUnit = field?.areaUnit ?? (field ? 'ha' : preferredAreaUnit)
  return { name: field?.name ?? '', location: field?.location ?? '', area: field ? String(Number((field.area * (areaUnit === 'acre' ? ACRES_PER_HECTARE : 1)).toFixed(8))) : '', latitude: field?.latitude.toString() ?? '', longitude: field?.longitude.toString() ?? '', country: field?.country ?? '', areaUnit, elevationM: field?.elevationM?.toString() ?? '', locationSource: field?.locationSource ?? 'manual', soilType: field?.soilType ?? '', ph: field?.soil.ph?.toString() ?? '', nitrogen: field?.soil.nitrogen?.toString() ?? '', phosphorus: field?.soil.phosphorus?.toString() ?? '', potassium: field?.soil.potassium?.toString() ?? '', organicMatter: field?.soil.organicMatter?.toString() ?? '', salinity: field?.soil.salinity?.toString() ?? '', moisture: field?.soil.moisture?.toString() ?? '', sampleDepthCm: field?.soil.sampleDepthCm?.toString() ?? '', sampleDate: field?.soil.sampleDate ?? '', texture: field?.soil.texture ?? '', laboratory: field?.soil.laboratory ?? '', testMethod: field?.soil.testMethod ?? '', provenance: field?.soil.provenance ?? 'unknown', water: field?.water ?? 'limited', waterSelected: !!field, irrigationMethod: field?.irrigation?.method ?? '', irrigationSource: field?.irrigation?.source ?? '', seasonalRestrictions: field?.irrigation?.seasonalRestrictions ?? '', budget: field?.budget ?? '', riskTolerance: field?.riskTolerance ?? 'unknown', previousCrops: field ? sortedHistory(field.previousCrops).map(history => ({ ...history })) : [], priorities: [...(field?.priorities ?? [])] }
}

interface StoredDraft { version: 1; base: string; draft: Draft; step: number; hadReport: boolean }
function readDraft(key: string, baseline: Draft, base: string): { saved?: StoredDraft; error?: string } {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid draft')
    const value = parsed as Partial<StoredDraft>
    if (value.version !== 1 || value.base !== base || !value.draft || typeof value.draft !== 'object' || !Number.isInteger(value.step) || value.step! < 0 || value.step! > 3 || typeof value.hadReport !== 'boolean') throw new Error('Unsupported draft')
    const candidate = value.draft
    for (const [keyName, expected] of Object.entries(baseline)) {
      const item = candidate[keyName as keyof Draft]
      if (Array.isArray(expected)) { if (!Array.isArray(item) || item.length > 100) throw new Error('Invalid draft list') }
      else if (typeof item !== typeof expected || (typeof item === 'string' && item.length > 5000)) throw new Error('Invalid draft value')
    }
    if (!['ha', 'acre'].includes(candidate.areaUnit) || !['manual', 'map', 'gps'].includes(candidate.locationSource) || !['rainfed', 'limited', 'reliable'].includes(candidate.water) || !['measured', 'estimated', 'unknown', 'synthetic'].includes(candidate.provenance) || !['low', 'medium', 'high', 'unknown'].includes(candidate.riskTolerance)) throw new Error('Invalid draft option')
    if (!candidate.priorities.every(priority => priorityOptions.some(option => option.id === priority))) throw new Error('Invalid draft priority')
    if (!candidate.previousCrops.every(entry => entry && typeof entry.cropId === 'string' && entry.cropId.length <= 500 && ['Winter', 'Spring', 'Summer', 'Autumn'].includes(entry.season) && Number.isInteger(entry.year) && ['plantedAt', 'harvestedAt', 'diseaseNotes', 'residueManagement'].every(name => { const item = entry[name as keyof typeof entry]; return item === undefined || (typeof item === 'string' && item.length <= 500) }))) throw new Error('Invalid draft history')
    return { saved: value as StoredDraft }
  } catch { return { error: 'An existing draft could not be read or the saved field has changed. It remains untouched until you discard it.' } }
}

export function FieldWizardPage() {
  const { id } = useParams()
  return <FieldWizard key={id ?? 'new'} />
}

function FieldWizard() {
  const { id } = useParams()
  const demo = useDemo()
  const { fields, saveField, setSelectedFieldId, preferences } = useApp()
  const existing = fields.find(field => field.id === id)
  const reportsAllowed = useLocalReportsAllowed()
  const draftsAllowed = reportsAllowed || demo.active
  const [baseline] = useState<Draft>(() => { const value = draftFromField(existing, preferences.areaUnit); return demo.active ? { ...value, provenance: 'synthetic' } : value })
  const draftKey = demo.active ? `terrawise.demo.draft.v1:${demo.farmId}:${id ?? 'new'}` : `terrawise.field-draft.v1:${id ?? 'new'}`
  const base = JSON.stringify(existing ?? null)
  const [recovery] = useState(() => draftsAllowed ? readDraft(draftKey, baseline, base) : {})
  const [draft, setDraft] = useState<Draft>(() => recovery.saved?.draft ?? baseline)
  const [step, setStep] = useState(() => recovery.saved?.hadReport ? 1 : recovery.saved?.step ?? 0)
  const [errors, setErrors] = useState<ErrorMap>({})
  const [reportConsent, setReportConsent] = useState(false)
  const [report, setReport] = useState<File | null>(null)
  const [reportUrl, setReportUrl] = useState('')
  const [reportError, setReportError] = useState(() => recovery.saved?.hadReport ? 'The selected file was not stored with the draft. Select it again, or clear this message to continue without it.' : '')
  const [missingPendingReport, setMissingPendingReport] = useState(!!recovery.saved?.hadReport)
  const [reportBusy, setReportBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [legacyConfirmed, setLegacyConfirmed] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [draftBlocked, setDraftBlocked] = useState(!!recovery.error)
  const [draftNotice, setDraftNotice] = useState(recovery.error ?? (recovery.saved ? 'Recovered the unsaved draft from this browser tab.' : ''))
  const [confirmDiscardDraft, setConfirmDiscardDraft] = useState(false)
  const [hasRecoveredDraft, setHasRecoveredDraft] = useState(!!recovery.saved)
  const stagedReport = useRef<{ file: File; metadata: NonNullable<Field['soilReport']> } | null>(null)
  const skipDraft = useRef(false)
  const [locationStatus, setLocationStatus] = useState('')
  const navigate = useNavigate()
  const steps = ['Your land', 'Soil & water', 'Crop history', 'Your priorities']
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))
  useEffect(() => { if (!report) { setReportUrl(''); return } setMissingPendingReport(false); const url = URL.createObjectURL(report); setReportUrl(url); return () => URL.revokeObjectURL(url) }, [report])
  useEffect(() => {
    if (!draftsAllowed || draftBlocked || skipDraft.current || (step === 0 && !report && JSON.stringify(draft) === JSON.stringify(baseline))) return
    try { sessionStorage.setItem(draftKey, JSON.stringify({ version: 1, base, draft, step, hadReport: !!report || missingPendingReport } satisfies StoredDraft)) }
    catch { setDraftNotice('Draft recovery is unavailable in this browser tab. Save the field before leaving.') }
  }, [base, baseline, draft, draftBlocked, draftKey, missingPendingReport, report, draftsAllowed, step])
  if (id && !existing) return <EmptyState title="This field isn’t here" description="It may have been removed from this device."><Link to="/fields" className="btn btn-secondary">Back to fields</Link></EmptyState>
  function validate(): ErrorMap {
    const next: ErrorMap = {}
    if (step === 0) {
      if (!draft.name.trim() || draft.name.trim().length > 500) next.name = 'Enter a field name from 1 to 500 characters.'
      if (!draft.location.trim() || draft.location.trim().length > 500) next.location = 'Enter a town or region from 1 to 500 characters.'
      const areaHa = Number(draft.area) / (draft.areaUnit === 'acre' ? ACRES_PER_HECTARE : 1)
      if (!draft.area.trim() || !Number.isFinite(areaHa) || areaHa < 0.001 || areaHa > 1_000_000) next.area = 'Enter an area equivalent to 0.001 to 1,000,000 hectares.'
      if (!draft.latitude.trim() || !Number.isFinite(Number(draft.latitude)) || Math.abs(Number(draft.latitude)) > 90) next.latitude = 'Enter latitude between −90 and 90.'
      if (!draft.longitude.trim() || !Number.isFinite(Number(draft.longitude)) || Math.abs(Number(draft.longitude)) > 180) next.longitude = 'Enter longitude between −180 and 180.'
      if (draft.elevationM !== '' && (!Number.isFinite(Number(draft.elevationM)) || Number(draft.elevationM) < -500 || Number(draft.elevationM) > 9000)) next.elevationM = 'Enter elevation between −500 and 9,000 metres, or leave blank.'
    }
    if (step === 1) {
      soilInputs.forEach(input => { const value = draft[input.id]; if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < input.min || Number(value) > input.max)) next[input.id] = `Enter a value from ${input.min} to ${input.max}, or leave blank.` })
      for (const [key, max] of [['salinity', 100], ['moisture', 100], ['sampleDepthCm', 1000]] as const) if (draft[key] !== '' && (!Number.isFinite(Number(draft[key])) || Number(draft[key]) < 0 || Number(draft[key]) > max)) next[key] = `Enter a value from 0 to ${max}, or leave blank.`
      if (draft.sampleDate && draft.sampleDate > localToday()) next.sampleDate = 'Sample date cannot be in the future.'
      if (!draft.waterSelected) next.water = 'Choose the water availability for this field.'
      if (reportBusy) next.report = 'Wait for report validation to finish.'
      if (reportError) next.report = 'Choose a valid report or clear the report error before continuing.'
    }
    if (step === 2 && draft.previousCrops.some(history => !history.cropId || !Number.isInteger(history.year) || history.year < 1900 || history.year > new Date().getFullYear() || (!!history.plantedAt && (history.plantedAt > localToday() || Number(history.plantedAt.slice(0, 4)) !== history.year)) || (!!history.harvestedAt && (history.harvestedAt > localToday() || Number(history.harvestedAt.slice(0, 4)) < history.year)) || (!!history.plantedAt && !!history.harvestedAt && history.plantedAt > history.harvestedAt))) next.history = 'Choose each previous crop and use valid past dates. Planting year must match the recorded year, and harvest cannot precede planting.'
    if (step === 3 && !draft.priorities.length) next.priorities = 'Choose at least one priority.'
    if (step === 3 && existing && needsLegacyReview(existing) && !legacyConfirmed) next.legacy = 'Review the former example values and confirm they now represent your field.'
    return next
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (reportBusy || saving) return
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) { setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0); return }
    if (step < 3) { setStep(current => current + 1); return }
    setSaving(true); setSaveError('')
    try {
      let soilReport = existing?.soilReport
      if (report && !reportsAllowed) throw new Error('Local report access is unavailable in this account. Return to the local workspace to access browser-local files.')
      if (report) {
        if (stagedReport.current?.file === report) soilReport = stagedReport.current.metadata
        else { soilReport = await saveSoilReport(report); stagedReport.current = { file: report, metadata: soilReport } }
      }
      const field: Field = { ...existing, ...(existing && needsLegacyReview(existing) ? { reviewedRealData: true } : {}), id: existing?.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: draft.name.trim(), location: draft.location.trim(), country: draft.country.trim(), area: Number(draft.area) / (draft.areaUnit === 'acre' ? ACRES_PER_HECTARE : 1), areaUnit: draft.areaUnit, latitude: Number(draft.latitude), longitude: Number(draft.longitude), elevationM: optionalNumeric(draft.elevationM), locationSource: draft.locationSource, soilType: draft.soilType.trim(), soil: { ...existing?.soil, ph: optionalNumeric(draft.ph), nitrogen: optionalNumeric(draft.nitrogen), phosphorus: optionalNumeric(draft.phosphorus), potassium: optionalNumeric(draft.potassium), organicMatter: optionalNumeric(draft.organicMatter), salinity: optionalNumeric(draft.salinity), texture: draft.texture, moisture: optionalNumeric(draft.moisture), sampleDate: draft.sampleDate, sampleDepthCm: optionalNumeric(draft.sampleDepthCm), laboratory: draft.laboratory.trim(), testMethod: draft.testMethod.trim(), provenance: draft.provenance }, water: draft.water, irrigation: { method: draft.irrigationMethod.trim(), source: draft.irrigationSource.trim(), seasonalRestrictions: draft.seasonalRestrictions.trim() }, budget: draft.budget.trim(), riskTolerance: draft.riskTolerance, previousCrops: draft.previousCrops, priorities: draft.priorities, soilReport, image: existing?.image ?? '/images/field-1.jpg' }
      await saveField(field)
      skipDraft.current = true
      try { if (draftsAllowed) sessionStorage.removeItem(draftKey) } catch { /* The field is saved; draft cleanup is best effort. */ }
      setSelectedFieldId(field.id)
      navigate(`/fields/${field.id}`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this field. Check your connection or browser storage and retry.')
    } finally { setSaving(false) }
  }
  async function discardDraft() {
    setSaving(true)
    try {
      if (stagedReport.current) await deleteSoilReport(stagedReport.current.metadata.id)
      sessionStorage.removeItem(draftKey)
      stagedReport.current = null; setDraft(baseline); setStep(0); setReport(null); setReportConsent(false); setReportError(''); setMissingPendingReport(false); setErrors({}); setSaveError(''); setDraftBlocked(false); setConfirmDiscardDraft(false); setHasRecoveredDraft(false)
      setDraftNotice('Unsaved draft discarded. Saved field data is unchanged.')
    } catch { setDraftNotice('The draft or pending local report could not be discarded. Please retry.') }
    finally { setSaving(false) }
  }
  const fieldInput = (key: 'name' | 'location' | 'area' | 'latitude' | 'longitude', label: string, placeholder: string, numeric = false) => <div className="form-field"><label htmlFor={key}>{label}</label><input className="input" id={key} required value={draft[key]} placeholder={placeholder} type={numeric ? 'number' : 'text'} maxLength={numeric ? undefined : 500} min={key === 'area' ? 0.001 * (draft.areaUnit === 'acre' ? ACRES_PER_HECTARE : 1) : key === 'latitude' ? -90 : key === 'longitude' ? -180 : undefined} max={key === 'area' ? 1_000_000 * (draft.areaUnit === 'acre' ? ACRES_PER_HECTARE : 1) : key === 'latitude' ? 90 : key === 'longitude' ? 180 : undefined} step="any" onChange={event => setDraft(current => ({ ...current, [key]: event.target.value, ...((key === 'latitude' || key === 'longitude') ? { locationSource: 'manual' as const } : {}) }))} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} autoComplete="off" />{errors[key] && <span className="field-form-error" id={`${key}-error`}>{errors[key]}</span>}</div>
  return <>
    <Link className="field-back-link" to={existing ? `/fields/${existing.id}` : '/fields'}><ArrowLeft size={16} /> Back to {existing ? 'field' : 'my fields'}</Link>
    <PageHeading eyebrow="MAKE IT PERSONAL" title={existing ? 'Edit your field' : 'Let’s get to know your land'} description="Good decisions begin with the details. Add what you know; you can fill in the rest later." />
    <div className="field-wizard-layout"><aside className="field-wizard-sidebar"><ol>{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'current' : step > index ? 'complete' : ''}><span>{step > index ? <Check size={16} /> : index + 1}</span><div><small>STEP {index + 1}</small><strong>{label}</strong></div></li>)}</ol><div className="wizard-sidebar-note"><Sprout size={25} /><h3>Made for your field.</h3><p>Your soil, water, and crop history help us explain which crops fit—and why.</p><Badge tone="neutral">Stored in your workspace</Badge></div></aside>
      <form className="card field-wizard-form" onSubmit={submit} noValidate>
        {draftsAllowed && <div className="field-draft-notice"><p role="status">{draftNotice || 'Unsaved form values are kept in this browser tab. Selected files must be chosen again after a reload.'}</p>{(hasRecoveredDraft || draftBlocked || step > 0 || JSON.stringify(draft) !== JSON.stringify(baseline) || !!report) && (confirmDiscardDraft ? <div><span>Discard this draft and any pending local report copy? Your saved field stays unchanged.</span><Button type="button" variant="secondary" disabled={saving} onClick={() => setConfirmDiscardDraft(false)}>Keep draft</Button><Button type="button" disabled={saving} onClick={() => void discardDraft()}>Discard draft</Button></div> : <Button type="button" variant="ghost" disabled={saving} onClick={() => setConfirmDiscardDraft(true)}>Discard draft</Button>)}</div>}
        {existing && needsLegacyReview(existing) && <div className="field-inline-note" role="alert"><FlaskConical size={18} /><span>This field originated from an example. Its current values are unverified and may be simulated. Replace every location, soil, water and crop-history entry that is not yours before confirming.</span></div>}<div className="field-wizard-step-label">STEP {step + 1} OF 4</div><h2>{['First, the lay of the land', 'A closer look at your soil', 'What grew here before?', 'What matters most to you?'][step]}</h2><p className="field-wizard-intro">{['Give your field a name and pinpoint its location for climate context.', 'Use your latest soil test. Unknown values stay unknown in the recommendation.', 'Past crops help identify family repetition and potential rotation breaks.', 'Choose one or more priorities to adjust the transparent scoring rules.'][step]}</p>
        {step === 0 && <><div className="form-grid">{fieldInput('name', 'Field name *', 'e.g. North Valley')}{fieldInput('location', 'Town / region *', 'e.g. Zahle, Bekaa Valley')}{fieldInput('area', draft.areaUnit === 'ha' ? 'Area (hectares) *' : 'Area (acres) *', 'e.g. 4.5', true)}<div className="form-field field-location-help"><MapPin size={21} /><span>Click the map or enter exact coordinates below. This is a point location, not a field boundary.</span></div>{fieldInput('latitude', 'Latitude *', '33.85', true)}{fieldInput('longitude', 'Longitude *', '35.9', true)}</div><FieldMap latitude={draft.latitude === '' ? Number.NaN : Number(draft.latitude)} longitude={draft.longitude === '' ? Number.NaN : Number(draft.longitude)} name={draft.name || 'Your field'} onLocationChange={(latitude, longitude) => setDraft(current => ({ ...current, latitude: String(latitude), longitude: String(longitude), locationSource: 'map' }))} /><p className="field-input-hint">Map tiles require an internet connection. The initial map is centered on an example region; click your field or enter coordinates.</p></>}
        {step === 1 && <><div className="field-inline-note"><FlaskConical size={18} /><span>All soil values are optional. Missing values reduce confidence; we never infer a soil test.</span></div><div className="form-grid">{soilInputs.map(input => <div className="form-field" key={input.id}><label htmlFor={input.id}>{input.label} <small>({input.unit})</small></label><input className="input" type="number" step="any" id={input.id} min={input.min} max={input.max} placeholder={input.placeholder} value={draft[input.id]} onChange={event => set(input.id, event.target.value)} aria-invalid={!!errors[input.id]} aria-describedby={`${input.id}-help${errors[input.id] ? ` ${input.id}-error` : ''}`} /><span className="field-input-hint" id={`${input.id}-help`}>{input.help}</span>{errors[input.id] && <span className="field-form-error" id={`${input.id}-error`}>{errors[input.id]}</span>}</div>)}</div><fieldset className="field-water-options"><legend>Water availability</legend>{(Object.keys(waterLabels) as WaterAvailability[]).map(value => <label key={value} className={draft.waterSelected && draft.water === value ? 'selected' : ''}><input type="radio" name="water" checked={draft.waterSelected && draft.water === value} onChange={() => setDraft(current => ({ ...current, water: value, waterSelected: true }))} aria-describedby={errors.water ? 'water-error' : undefined} /><Droplets size={17} /><span>{waterLabels[value]}</span></label>)}</fieldset>{errors.water && <p id="water-error" className="field-form-error" role="alert">{errors.water}</p>}</>}
        {step === 2 && <><div className="field-inline-note"><History size={18} /><span>Record earlier seasons, starting with the most recent. You can continue with no history; confidence will be lower.</span></div>{!draft.previousCrops.length && <div className="field-history-empty"><Sprout size={32} /><h3>A fresh start</h3><p>Add your previous crops to make rotation recommendations more useful.</p></div>}<div className="field-history-entries">{draft.previousCrops.map((history, index) => <div className="field-history-entry" key={index}><div className="form-field"><label htmlFor={`history-crop-${index}`}>Crop</label><select className="select" id={`history-crop-${index}`} value={history.cropId} onChange={event => set('previousCrops', draft.previousCrops.map((item, i) => i === index ? { ...item, cropId: event.target.value } : item))}><option value="">Select a crop</option>{crops.map(crop => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></div><div className="form-field"><label htmlFor={`history-season-${index}`}>Season</label><select className="select" id={`history-season-${index}`} value={history.season} onChange={event => set('previousCrops', draft.previousCrops.map((item, i) => i === index ? { ...item, season: event.target.value } : item))}>{['Spring', 'Summer', 'Autumn', 'Winter'].map(season => <option key={season}>{season}</option>)}</select></div><div className="form-field"><label htmlFor={`history-year-${index}`}>Year</label><input className="input" id={`history-year-${index}`} type="number" min="1900" max={new Date().getFullYear()} value={history.year || ''} aria-invalid={!!errors.history} aria-describedby={errors.history ? 'history-error' : undefined} onChange={event => set('previousCrops', draft.previousCrops.map((item, i) => i === index ? { ...item, year: Number(event.target.value) } : item))} /></div><Button type="button" variant="ghost" aria-label={`Remove crop history entry ${index + 1}`} onClick={() => set('previousCrops', draft.previousCrops.filter((_, i) => i !== index))}><Trash2 size={17} /></Button></div>)}</div>{errors.history && <p className="field-form-error" id="history-error" role="alert">{errors.history}</p>}<Button type="button" variant="secondary" onClick={() => set('previousCrops', [...draft.previousCrops, previousSeasonDefault()])}><Plus size={16} /> Add previous crop</Button></>}
        {step === 3 && <><div className="field-priority-options">{priorityOptions.map(option => <label key={option.id} className={draft.priorities.includes(option.id) ? 'selected' : ''}><input type="checkbox" name="priorities" value={option.id} checked={draft.priorities.includes(option.id)} onChange={() => set('priorities', draft.priorities.includes(option.id) ? draft.priorities.filter(priority => priority !== option.id) : [...draft.priorities, option.id])} aria-invalid={!!errors.priorities} aria-describedby={errors.priorities ? 'priorities-error' : undefined} /><option.icon size={22} /><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div>{errors.priorities && <p className="field-form-error" id="priorities-error" role="alert">{errors.priorities}</p>}<div className="field-review"><h3><CheckCircle2 size={18} /> Your field, at a glance</h3><dl><div><dt>Field</dt><dd>{draft.name}</dd></div><div><dt>Location</dt><dd>{draft.location}</dd></div><div><dt>Area</dt><dd>{draft.area} {draft.areaUnit === 'ha' ? 'ha' : 'acres'}</dd></div><div><dt>Soil inputs</dt><dd>{soilInputs.filter(input => draft[input.id] !== '').length} of 5 provided</dd></div><div><dt>Water</dt><dd>{waterLabels[draft.water]}</dd></div><div><dt>Previous crops</dt><dd>{draft.previousCrops.length} recorded</dd></div></dl></div></>}
        <SupplementalFields step={step} draft={draft} setDraft={setDraft} errors={errors} existing={existing} report={report} reportUrl={reportUrl} reportError={reportError} reportBusy={reportBusy} reportConsent={reportConsent} setReport={setReport} setReportError={setReportError} setReportBusy={setReportBusy} setReportConsent={setReportConsent} setMissingPendingReport={setMissingPendingReport} locationStatus={locationStatus} setLocationStatus={setLocationStatus} />
        {step === 3 && existing && needsLegacyReview(existing) && <><label className="field-report-consent"><input type="checkbox" checked={legacyConfirmed} onChange={event => setLegacyConfirmed(event.target.checked)} /> I reviewed the location, soil, water and crop history and replaced or cleared all example values.</label>{errors.legacy && <p className="field-form-error" role="alert">{errors.legacy}</p>}</>}{saveError && <p className="field-form-error" role="alert">{saveError}</p>}
        <div className="field-wizard-actions">{step > 0 ? <Button type="button" variant="secondary" disabled={saving} onClick={() => { setStep(current => current - 1); setErrors({}) }}><ArrowLeft size={16} /> Back</Button> : <Link to="/fields" className="btn btn-secondary">Cancel</Link>}<Button type="submit" disabled={reportBusy || saving}>{saving ? 'Saving…' : step === 3 ? <><Check size={16} /> {existing ? 'Save changes' : 'Save field'}</> : <>Continue <ArrowRight size={16} /></>}</Button></div>
      </form>
    </div>
  </>
}

interface SupplementalProps {
  step: number; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; errors: ErrorMap; existing?: Field;
  report: File | null; reportUrl: string; reportError: string; reportBusy: boolean; reportConsent: boolean;
  setReport: Dispatch<SetStateAction<File | null>>; setReportError: Dispatch<SetStateAction<string>>; setReportBusy: Dispatch<SetStateAction<boolean>>; setReportConsent: Dispatch<SetStateAction<boolean>>;
  setMissingPendingReport: Dispatch<SetStateAction<boolean>>;
  locationStatus: string; setLocationStatus: Dispatch<SetStateAction<string>>;
}
function SupplementalFields({ step, draft, setDraft, errors, existing, report, reportUrl, reportError, reportBusy, reportConsent, setReport, setReportError, setReportBusy, setReportConsent, setMissingPendingReport, locationStatus, setLocationStatus }: SupplementalProps) {
  const reportsAllowed = useLocalReportsAllowed()
  const demo = useDemo()
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })) }
  function locate() {
    if (!navigator.geolocation) { setLocationStatus('GPS is unavailable in this browser. Enter coordinates or choose a point on the map.'); return }
    setLocationStatus('Requesting your permission and device location…')
    navigator.geolocation.getCurrentPosition(position => {
      setDraft(current => ({ ...current, latitude: String(Number(position.coords.latitude.toFixed(5))), longitude: String(Number(position.coords.longitude.toFixed(5))), locationSource: 'gps' }))
      setLocationStatus('Device location added. Confirm that this point represents your field.')
    }, error => setLocationStatus(error.code === 1 ? 'Location permission was denied. You can enter coordinates or use the map.' : 'Device location is unavailable or timed out. You can enter coordinates or use the map.'), { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 })
  }
  async function chooseReport(file?: File) {
    setReport(null); setReportError('')
    if (!file) return
    if (!reportsAllowed || !reportConsent) { setReportError('Local report access and your consent are required before selecting a report.'); return }
    setReportBusy(true)
    try { const error = await verifySoilReport(file); if (error) setReportError(error); else setReport(file) }
    catch { setReportError('The selected file could not be read. Choose another file.') }
    finally { setReportBusy(false) }
  }
  function setAreaUnit(areaUnit: 'ha' | 'acre') {
    setDraft(current => {
      if (areaUnit === current.areaUnit) return current
      const number = Number(current.area)
      const area = current.area.trim() && Number.isFinite(number) ? String(Number((number * (areaUnit === 'acre' ? ACRES_PER_HECTARE : 1 / ACRES_PER_HECTARE)).toFixed(8))) : current.area
      return { ...current, areaUnit, area }
    })
  }
  const textInput = (key: 'country' | 'soilType' | 'laboratory' | 'testMethod' | 'texture' | 'irrigationMethod' | 'irrigationSource' | 'seasonalRestrictions' | 'budget', label: string, placeholder: string) => <label className="form-field">{label}<input className="input" value={draft[key]} maxLength={500} onChange={event => update(key, event.target.value)} placeholder={placeholder} /></label>
  const numberInput = (key: 'elevationM' | 'salinity' | 'moisture' | 'sampleDepthCm', label: string, min: number, max: number, hint: string) => <div className="form-field"><label htmlFor={key}>{label}</label><input id={key} className="input" type="number" step="any" min={min} max={max} value={draft[key]} onChange={event => update(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} placeholder={hint} />{errors[key] && <span id={`${key}-error`} className="field-form-error">{errors[key]}</span>}</div>
  if (step === 0) return <div className="field-extra-section"><div className="field-extra-title"><h3>More about your location</h3><p>All additional details are optional. GPS is used only when you choose it.</p></div><div className="form-grid"><label className="form-field">Area unit<select className="select" value={draft.areaUnit} onChange={event => setAreaUnit(event.target.value as Draft['areaUnit'])}><option value="ha">Hectares</option><option value="acre">Acres</option></select></label>{textInput('country', 'Country', 'e.g. Lebanon')}{numberInput('elevationM', 'Elevation (metres)', -500, 9000, 'Optional, if known')}{textInput('soilType', 'Soil type', 'e.g. calcareous')}</div><div className="field-gps-row"><Button type="button" variant="secondary" onClick={locate}><LocateFixed size={16} /> Use my current GPS location</Button><span>Location source: {draft.locationSource === 'gps' ? 'device GPS' : draft.locationSource === 'map' ? 'map point' : 'manual entry'}</span></div><p role="status" className="field-input-hint">{locationStatus}</p></div>
  if (step === 1) return <div className="field-extra-section"><div className="field-extra-title"><h3>Sampling and water details</h3><p>Leave unknown measurements blank. Values are provided by you; no soil chemistry is inferred from a photo.</p></div><div className="form-grid"><label className="form-field">Soil value provenance<select disabled={demo.active} className="select" value={draft.provenance} onChange={event => update('provenance', event.target.value as InputProvenance)}>{demo.active && <option value="synthetic">DEMO / SYNTHETIC</option>}<option value="unknown">Unknown / not specified</option><option value="measured">Measured (laboratory or instrument)</option><option value="estimated">Estimated by farmer</option></select></label>{numberInput('salinity', 'Salinity / EC (dS/m)', 0, 100, 'Optional')}{numberInput('moisture', 'Soil moisture (%)', 0, 100, 'Optional')}{textInput('texture', 'Soil texture', 'e.g. silty loam')}<div className="form-field"><label htmlFor="sampleDate">Sampling date</label><input id="sampleDate" type="date" className="input" max={localToday()} value={draft.sampleDate} onChange={event => update('sampleDate', event.target.value)} aria-invalid={!!errors.sampleDate} aria-describedby={errors.sampleDate ? 'sampleDate-error' : undefined} />{errors.sampleDate && <span id="sampleDate-error" className="field-form-error">{errors.sampleDate}</span>}</div>{numberInput('sampleDepthCm', 'Sampling depth (cm)', 0, 1000, 'Optional')}{textInput('laboratory', 'Laboratory', 'Optional')}{textInput('testMethod', 'N/P/K test method', 'e.g. Olsen P / lab extraction method')}{textInput('irrigationMethod', 'Irrigation method', 'e.g. drip, sprinkler')}{textInput('irrigationSource', 'Water source', 'e.g. well, rain, canal')}{textInput('seasonalRestrictions', 'Seasonal water restrictions', 'e.g. limited allocation in summer')}</div><div className="field-report-upload"><div className="field-extra-title"><h3><FileText size={18} /> Soil report</h3><p>Optional image or PDF, up to 5 MB. Files stay on this browser and are not synced to an account or sent to NASA. Uploading does not read or analyze values.</p></div>{!reportsAllowed ? <p className="field-input-hint">Local report attachments are unavailable in this account or while account settings load. They remain on the browser profile where they were added and are not synced to Supabase.</p> : existing?.soilReport ? <div className="field-inline-note"><FileText size={18} /><span>Attached: <strong>{existing.soilReport.filename}</strong>. To replace or permanently remove this local file, use the report controls on the field detail page. Save these edits first.</span></div> : <><label className="field-report-consent"><input type="checkbox" checked={reportConsent} onChange={event => { setReportConsent(event.target.checked); if (!event.target.checked) { setReport(null); setReportError(''); setMissingPendingReport(false) } }} /> I consent to storing this selected report on this device.</label><label className="form-field">Choose a PDF or image<input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={!reportConsent || reportBusy} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void chooseReport(file) }} /></label>{reportBusy && <p role="status" className="field-input-hint">Checking the report…</p>}{reportError && <div className="field-form-error" role="alert">{reportError} <button type="button" onClick={() => { setReportError(''); setMissingPendingReport(false) }}>Clear</button></div>}{report && <div className="field-report-preview"><p><FileText size={17} />{report.name} · {(report.size / 1024 / 1024).toFixed(2)} MB <button type="button" onClick={() => { setReport(null); setReportError(''); setMissingPendingReport(false) }}>Remove selection</button></p>{reportUrl && (report.type.startsWith('image/') ? <img src={reportUrl} alt="Preview of the selected soil report" /> : <iframe title="Preview of the selected soil report PDF" src={reportUrl} sandbox="" />)}{reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer">Open local preview</a>}</div>}</>}</div></div>
  if (step === 2 && draft.previousCrops.length) return <div className="field-extra-section"><div className="field-extra-title"><h3>Additional crop history</h3><p>Record dates and observations only when you know them.</p></div>{draft.previousCrops.map((history, index) => {
    const crop = crops.find(item => item.id === history.cropId)
    const setHistory = (change: Partial<Field['previousCrops'][number]>) => setDraft(current => ({ ...current, previousCrops: current.previousCrops.map((entry, i) => i === index ? { ...entry, ...change } : entry) }))
    return <fieldset className="field-history-more" key={index}><legend>{crop?.name ?? history.cropId} · {history.season} {history.year} · {crop?.family ?? 'family unknown'}</legend><div className="form-grid"><label className="form-field">Planting date<input className="input" type="date" max={localToday()} value={history.plantedAt ?? ''} onChange={event => setHistory({ plantedAt: event.target.value })} /></label><label className="form-field">Harvest date<input className="input" type="date" max={localToday()} value={history.harvestedAt ?? ''} onChange={event => setHistory({ harvestedAt: event.target.value })} /></label><label className="form-field">Known pests / disease notes<textarea className="input" maxLength={500} value={history.diseaseNotes ?? ''} onChange={event => setHistory({ diseaseNotes: event.target.value })} placeholder="Optional observations" /></label><label className="form-field">Residue management<textarea className="input" maxLength={500} value={history.residueManagement ?? ''} onChange={event => setHistory({ residueManagement: event.target.value })} placeholder="e.g. residues retained or removed" /></label></div></fieldset>
  })}</div>
  if (step === 3) return <div className="field-extra-section"><div className="field-extra-title"><h3>Planning constraints</h3><p>Budget and risk preference are recorded as context. Profit and yield are not estimated without validated local inputs.</p></div><div className="form-grid">{textInput('budget', 'Approximate budget and currency', 'Optional, e.g. USD 500')}<label className="form-field">Risk tolerance<select className="select" value={draft.riskTolerance} onChange={event => update('riskTolerance', event.target.value as Draft['riskTolerance'])}><option value="unknown">Unknown / not specified</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div></div>
  return null
}

export function FieldDetailPage() {
  const { id } = useParams()
  const { fields } = useApp()
  const field = fields.find(item => item.id === id)
  return field ? <FieldDetail key={field.id} field={field} /> : <EmptyState icon={MapPin} title="Field not found" description="This field may have been removed from this device."><Link to="/fields" className="btn btn-secondary">Back to my fields</Link></EmptyState>
}

function FieldDetail({ field }: { field: Field }) {
  const { deleteField, saveField } = useApp()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const reportsAllowed = useLocalReportsAllowed()
  const { climate, loading, error, refresh } = useClimate(field)
  const completeInputs = soilInputs.filter(input => field.soil[input.id] !== null).length
  async function toggleArchive() {
    setActionBusy(true); setActionError('')
    try { await saveField({ ...field, archived: !field.archived }) }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not change archive status. Please retry.') }
    finally { setActionBusy(false) }
  }
  async function removeField() {
    setActionBusy(true); setActionError('')
    try { await deleteField(field.id); navigate('/fields') }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not delete this field. Please retry.') }
    finally { setActionBusy(false) }
  }
  if (needsLegacyReview(field)) return <EmptyState icon={FlaskConical} title="Review this older field" description="This field was edited from an old example and may still contain simulated location, soil or crop history. Review and replace those values before using it."><Link to={`/fields/${field.id}/edit`} className="btn btn-primary">Review field <ArrowRight size={16} /></Link></EmptyState>
  return <>
    <Link className="field-back-link" to="/fields"><ArrowLeft size={16} /> Back to my fields</Link>
    <PageHeading eyebrow="FIELD OVERVIEW" title={field.name} description={`${field.location} · ${formatArea(field)}`}><Link className="btn btn-secondary" to={`/fields/${field.id}/edit`}>Edit field</Link>{field.archived ? <Button disabled={actionBusy} onClick={() => void toggleArchive()}><Archive size={16} />Restore field to analyze</Button> : <Link className="btn btn-primary" to={`/recommendations?field=${field.id}`}>Best Crops <ArrowRight size={16} /></Link>}</PageHeading>
    <BestCrops field={field} climate={climate} loading={loading} error={error} refresh={refresh} />
    <div className="field-detail-grid"><section className="card field-profile-card"><div className="field-profile-image"><img src={field.image} alt={`Agricultural landscape representing ${field.name}`} /><Badge tone="neutral">Field profile</Badge></div><div className="field-profile-content"><h2>Rooted in the details</h2><dl><div><dt><MapPin size={16} /> Coordinates</dt><dd>{field.latitude.toFixed(4)}, {field.longitude.toFixed(4)}</dd></div><div><dt><Droplets size={16} /> Water source</dt><dd>{waterLabels[field.water]}</dd></div><div><dt><FlaskConical size={16} /> Soil information</dt><dd>{completeInputs}/5 inputs recorded</dd></div></dl><div className="field-profile-priorities">{field.priorities.map(priority => <Badge key={priority} tone="green">{priorityOptions.find(option => option.id === priority)?.title}</Badge>)}</div></div></section>
    <section className="card field-detail-climate"><div className="field-section-title"><div><h2>Climate, through the seasons</h2><p>{climate.source === 'demo' ? 'DEMO / SYNTHETIC seasonal context; not NASA observations.' : climate.source === 'nasa-power' ? 'Historical gridded context—not field measurements or a forecast.' : 'Historical climate data unavailable.'}</p></div><Button variant="ghost" aria-label="Refresh climate data" onClick={refresh} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} /></Button></div><SourceNote source={climate.source} year={climate.year} cached={climate.provenance?.cache === 'cached'} partial={climate.provenance?.quality === 'partial'} />{loading && <p className="field-climate-status" role="status">Requesting historical NASA POWER data…</p>}{error && <p className="field-climate-error" role="status">{error}</p>}<ClimateChart climate={climate} /><ClimateDetails climate={climate} /></section></div>
    <section className="card field-soil-section"><div className="field-section-title"><div><h2>Below the surface</h2><p>{field.dataClassification === 'demo-synthetic' ? 'DEMO / SYNTHETIC soil inputs; all values are fictional.' : 'Soil values are supplied by you; identify measured and estimated inputs.'}</p></div><Badge tone={completeInputs === 5 ? 'green' : 'amber'}>{completeInputs === 5 ? 'All inputs recorded' : 'Missing soil inputs'}</Badge></div><div className="field-soil-metrics">{soilInputs.map(input => <div key={input.id}><span>{input.label}</span><strong>{field.soil[input.id] ?? '—'}<small>{input.id !== 'ph' && field.soil[input.id] !== null ? input.unit : ''}</small></strong><p>{field.soil[input.id] === null ? 'Not provided' : input.id === 'ph' ? 'Acidity / alkalinity' : 'Recorded value'}</p></div>)}</div><p className="field-soil-note">These inputs support illustrative screening, not fertilizer rates. Soil lab methods and local agronomic interpretation matter.</p></section>
    <FieldEvidence field={field} />
    <FieldWaterInputs key={field.id} field={field} />
    <WaterDemandSection key={`demand:${field.id}`} field={field} />
    <div className="field-detail-lower"><section className="card field-history-section"><div className="field-section-title"><div><h2>A history of growth</h2><p>Crop history informs family rotation constraints.</p></div><History size={21} /></div>{field.previousCrops.length ? <ol className="field-history-timeline">{sortedHistory(field.previousCrops).map((history, index) => { const crop = crops.find(item => item.id === history.cropId); return <li key={`${history.cropId}-${history.season}-${history.year}-${index}`}><span className="history-dot"><Sprout size={16} /></span><div><small>{history.season} {history.year}</small><strong>{crop?.name ?? history.cropId}</strong><span>{crop?.family ?? 'Family unknown'}</span>{history.plantedAt && <span>Planted: {history.plantedAt}</span>}{history.harvestedAt && <span>Harvested: {history.harvestedAt}</span>}{history.diseaseNotes && <span>Pests / diseases: {history.diseaseNotes}</span>}{history.residueManagement && <span>Residue management: {history.residueManagement}</span>}</div><Badge tone="neutral">Recorded</Badge></li> })}</ol> : <div className="field-small-empty"><Sprout size={29} /><p>No previous crops recorded. Add history to improve rotation screening.</p><Link to={`/fields/${field.id}/edit`} className="btn btn-secondary">Add crop history</Link></div>}{field.archived ? <p className="field-input-hint">Restore this field to plan a new rotation.</p> : <Link to={`/planner?field=${field.id}`} className="field-planner-link">Plan the next chapter <ArrowRight size={17} /></Link>}</section><section className="card field-map-section"><div className="field-section-title"><div><h2>Your place on the map</h2><p>{field.dataClassification === 'demo-synthetic' ? 'DEMO / SYNTHETIC point location; no NASA request is made.' : 'Point location used for NASA POWER requests.'}</p></div><MapPin size={21} /></div><FieldMap latitude={field.latitude} longitude={field.longitude} name={field.name} /><p className="field-input-hint">OpenStreetMap · Location marker represents a point, not field boundaries.</p></section></div>
    <section className="card field-delete-section" aria-labelledby="field-delete-heading"><div><h2 id="field-delete-heading">Manage this field</h2><p>Archive a field without losing its data, or permanently remove it and its saved plan.</p><Button variant="secondary" disabled={actionBusy} onClick={() => void toggleArchive()}><Archive size={15} />{field.archived ? 'Restore field' : 'Archive field'}</Button>{actionError && <p className="field-form-error" role="alert">{actionError}</p>}</div>{confirmDelete ? <div className="field-delete-confirmation" role="group" aria-label="Confirm field deletion"><p>Delete <strong>{field.name}</strong> and its saved plan? This cannot be undone. {reportsAllowed ? 'Remove any attached local report separately first.' : 'A browser-local report, if any, will remain on its original browser profile.'}</p><div><Button variant="secondary" autoFocus disabled={actionBusy} onClick={() => setConfirmDelete(false)}>Keep field</Button><Button className="field-delete-button" disabled={(reportsAllowed && !!field.soilReport) || actionBusy} onClick={() => void removeField()}><Trash2 size={15} /> Delete field</Button></div></div> : <Button variant="ghost" disabled={actionBusy} className="field-delete-trigger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Remove field</Button>}</section>
  </>
}

function ClimateDetails({ climate }: { climate: ClimateData }) {
  const source = climate.provenance
  if (climate.fixture) return <p className="field-input-hint climate-provenance">DEMO / SYNTHETIC fixture v{climate.fixture.version} · {climate.fixture.farmId} · {climate.fixture.coordinates.latitude}, {climate.fixture.coordinates.longitude}. Monthly °C, mm precipitation and kWh/m²/day radiation are fictional. Repeated annual scenarios are not a historical trend.</p>
  if (!source) return <p className="field-input-hint climate-provenance">{'Detailed provenance is unavailable.'}</p>
  const humidity = climate.monthly.flatMap(month => month.humidity == null ? [] : [month.humidity])
  return <details className="climate-provenance"><summary>Source, units and data quality</summary><dl>
    <div><dt>Provider</dt><dd>{source.provider}{source.cache === 'cached' ? ' · cached' : ''}</dd></div>
    <div><dt>Point</dt><dd>{source.coordinates.latitude}, {source.coordinates.longitude}</dd></div>
    <div><dt>Period</dt><dd>{source.period.start} – {source.period.end}</dd></div>
    <div><dt>Retrieved</dt><dd>{new Date(source.retrievedAt).toLocaleString()}</dd></div>
    <div><dt>Data quality</dt><dd>{source.quality}</dd></div>
    <div><dt>Units</dt><dd>{source.parameters.map(parameter => `${parameter.code}: ${parameter.unit} (source ${parameter.sourceUnit})`).join('; ')}</dd></div>
    <div><dt>Available humidity</dt><dd>{humidity.length ? `${(humidity.reduce((sum, value) => sum + value, 0) / humidity.length).toFixed(1)}% mean across ${humidity.length} available months` : 'Unavailable'}</dd></div>
  </dl>{source.missing.length > 0 && <p>Missing observations: {source.missing.join(', ')}</p>}<p>NASA POWER supplies gridded historical estimates. They may not represent conditions at this point on the farm.</p></details>
}

function FieldEvidence({ field }: { field: Field }) {
  const { saveField } = useApp()
  const reportsAllowed = useLocalReportsAllowed()
  const [reportUrl, setReportUrl] = useState('')
  const [reportStatus, setReportStatus] = useState('')
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const [busy, setBusy] = useState(false)
  const report = field.soilReport
  useEffect(() => {
    if (!reportsAllowed) { setReportUrl(''); setReportStatus('Browser-local reports are unavailable in an account workspace.'); return }
    if (!report) { setReportUrl(''); setReportStatus(''); return }
    let cancelled = false
    let url = ''
    setReportStatus('Loading local report…')
    void loadSoilReport(report.id).then(file => {
      if (cancelled) return
      if (!file) { setReportStatus('The local file is unavailable on this device. No soil values were inferred.'); return }
      url = URL.createObjectURL(file); setReportUrl(url); setReportStatus('Available on this device')
    }).catch(() => { if (!cancelled) setReportStatus('The local report could not be opened. Check browser storage.') })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [report?.id, reportsAllowed])

  async function removeReport() {
    if (!reportsAllowed || !report || busy) return
    setBusy(true); setReportStatus('Removing local report…')
    try {
      await deleteSoilReport(report.id)
      setReportUrl('')
      await saveField({ ...field, soilReport: undefined })
      setConfirmRemoval(false); setReportUrl(''); setReportStatus('Report removed from this browser.')
    } catch (error) { setReportStatus(error instanceof Error ? error.message : 'Could not remove the local report.') }
    finally { setBusy(false) }
  }

  const soil = field.soil
  return <section className="card field-evidence-section"><div className="field-section-title"><div><h2>Soil test and field context</h2><p>{field.dataClassification === 'demo-synthetic' ? 'DEMO / SYNTHETIC information. No measurements or laboratory results are claimed.' : 'Farmer-entered information. Unknown values are not filled automatically.'}</p></div><FlaskConical size={21} /></div><dl className="field-evidence-grid">
    <div><dt>Value provenance</dt><dd>{soil.provenance === 'synthetic' ? 'DEMO / SYNTHETIC — no measurement' : soil.provenance === 'measured' ? 'Measured, as entered' : soil.provenance === 'estimated' ? 'Farmer estimate' : 'Unknown / not specified'}</dd></div>
    <div><dt>Sampling date</dt><dd>{soil.sampleDate || 'Not provided'}</dd></div>
    <div><dt>Sampling depth</dt><dd>{soil.sampleDepthCm == null ? 'Not provided' : `${soil.sampleDepthCm} cm`}</dd></div>
    <div><dt>Laboratory</dt><dd>{soil.laboratory || 'Not provided'}</dd></div>
    <div><dt>N / P / K method</dt><dd>{soil.testMethod || 'Not provided'}</dd></div>
    <div><dt>Salinity / EC</dt><dd>{soil.salinity == null ? 'Not provided' : `${soil.salinity} dS/m`}</dd></div>
    <div><dt>Soil moisture</dt><dd>{soil.moisture == null ? 'Not provided' : `${soil.moisture}%`}</dd></div>
    <div><dt>Texture / soil type</dt><dd>{[soil.texture, field.soilType].filter(Boolean).join(' / ') || 'Not provided'}</dd></div>
    <div><dt>Country</dt><dd>{field.country || 'Not provided'}</dd></div>
    <div><dt>Elevation</dt><dd>{field.elevationM == null ? 'Not provided' : `${field.elevationM} m`}</dd></div>
    <div><dt>Location source</dt><dd>{field.locationSource || 'Not specified'}</dd></div>
    <div><dt>Irrigation method</dt><dd>{field.irrigation?.method || 'Not provided'}</dd></div>
    <div><dt>Water source</dt><dd>{field.irrigation?.source || 'Not provided'}</dd></div>
    <div><dt>Seasonal water restrictions</dt><dd>{field.irrigation?.seasonalRestrictions || 'Not provided'}</dd></div>
    <div><dt>Risk tolerance</dt><dd>{field.riskTolerance || 'Not specified'}</dd></div>
    <div><dt>Budget context</dt><dd>{field.budget || 'Not provided'}</dd></div>
  </dl><div className="field-report-detail"><h3><FileText size={17} /> Soil report</h3>{!reportsAllowed ? <p>{field.dataClassification === 'demo-synthetic' ? 'Real soil report attachments are disabled in Demo Mode to keep farmer files isolated.' : 'Browser-local reports cannot be opened or removed in an account workspace. They are not synced; return to the original local workspace to manage them.'}</p> : report ? <><p><strong>{report.filename}</strong> · {(report.size / 1024 / 1024).toFixed(2)} MB · {report.mimeType}</p><p role="status">{reportStatus} Reports remain local to this browser; uploading does not analyze soil.</p>{reportUrl && <div className="field-report-preview">{report.mimeType.startsWith('image/') ? <img src={reportUrl} alt="Preview of the saved soil report" /> : <iframe title="Preview of the saved soil report PDF" src={reportUrl} sandbox="" />}<a href={reportUrl} target="_blank" rel="noreferrer">Open report</a><a href={reportUrl} download={report.filename}>Download report</a></div>}{confirmRemoval ? <div className="field-report-actions"><p>Permanently delete this local report?</p><Button variant="secondary" disabled={busy} onClick={() => setConfirmRemoval(false)}>Keep report</Button><Button disabled={busy} onClick={() => void removeReport()}><Trash2 size={15} />Remove report</Button></div> : <Button variant="secondary" onClick={() => setConfirmRemoval(true)}><Trash2 size={15} />Remove report</Button>}</> : <p>No report attached. You can attach an image or PDF when editing this field.</p>}</div></section>
}
