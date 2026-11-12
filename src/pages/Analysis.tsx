import { isVisibleAnalysis } from '../lib/analysisEvidence'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CircleAlert, CloudSun, FileText, FlaskConical, History, Leaf, Printer, RefreshCw, Sprout, Trash2 } from 'lucide-react'
import { useDemo } from '../context/DemoContext'
import { demoClimateFor } from '../data/demo'
import { useApp } from '../context/AppContext'
import { MODEL_VERSION, assessCrops } from '../lib/recommendations'
import { fetchClimateRange } from '../services/nasaPower'
import { isField, isUntouchedLegacySample, needsLegacyReview } from '../services/repository'
import { Badge, Button, EmptyState, PageHeading, SourceNote } from '../components/ui'
import type { AnalysisRecord } from '../types/analysis'
import { isAnalysisRecord } from '../types/analysis'
import type { ClimateData } from '../types'
import './Analysis.css'

type Status = 'waiting' | 'working' | 'done' | 'warning' | 'error'
const tick = () => new Promise(resolve => window.setTimeout(resolve, 0))
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

export function AnalysisPage() {
  const demo = useDemo()
  const { fields, selectedFieldId, saveAnalysis } = useApp()
  const [params] = useSearchParams()
  const activeFields = fields.filter(field => !field.archived && !needsLegacyReview(field))
  const initial = activeFields.find(field => field.id === params.get('field'))?.id ?? activeFields.find(field => field.id === selectedFieldId)?.id ?? activeFields[0]?.id ?? ''
  const [fieldId, setFieldId] = useState(initial)
  const [season, setSeason] = useState<'Spring' | 'Autumn'>(params.get('season') === 'Spring' ? 'Spring' : 'Autumn')
  const [years, setYears] = useState('1')
  const [steps, setSteps] = useState<Status[]>(['waiting', 'waiting', 'waiting'])
  const [running, setRunning] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [message, setMessage] = useState('')
  const [climateResult, setClimateResult] = useState<ClimateData | null>(null)
  const controller = useRef<AbortController | null>(null)
  const commitStarted = useRef(false)
  const navigate = useNavigate()
  const field = activeFields.find(item => item.id === fieldId)
  useEffect(() => () => controller.current?.abort(), [])
  function mark(index: number, status: Status) { setSteps(current => current.map((value, i) => i === index ? status : value)) }
  async function run() {
    if (!field || running) return
    const abort = new AbortController(); controller.current = abort
    commitStarted.current = false; setCommitting(false); setRunning(true); setMessage(''); setClimateResult(null); setSteps(['working', 'waiting', 'waiting'])
    try {
      await tick()
      if (abort.signal.aborted) return
      if (!isField(field)) throw new Error('Some field inputs are invalid. Review your field before running an analysis.')
      mark(0, 'done'); mark(1, 'working')
      const end = new Date().getUTCFullYear() - 1
      const start = Math.max(1984, end - Number(years) + 1)
      const climate = demo.active ? demoClimateFor(field, Number(years), end) : await fetchClimateRange(field.latitude, field.longitude, start, end, abort.signal)
      if (abort.signal.aborted) return
      setClimateResult(climate); mark(1, climate.error || climate.provenance?.quality === 'partial' ? 'warning' : 'done'); mark(2, 'working')
      await tick()
      if (abort.signal.aborted) return
      const recommendations = assessCrops(field, climate, season).slice(0, 4)
      if (!recommendations.length) throw new Error('Crop profiles are unavailable. Review your inputs or try again.')
      const record: AnalysisRecord = { id: makeId(), createdAt: new Date().toISOString(), field: structuredClone(field), climate: structuredClone(climate), season, recommendations: structuredClone(recommendations), modelVersion: MODEL_VERSION }
      commitStarted.current = true; setCommitting(true)
      await saveAnalysis(record)
      if (abort.signal.aborted) return
      mark(2, 'done')
      navigate(`/history/${record.id}`)
    } catch (error) {
      if (!abort.signal.aborted) { setSteps(current => current.map(value => value === 'working' ? 'error' : value)); setMessage(error instanceof Error ? error.message : 'Analysis could not be completed. Please try again.') }
    } finally { if (controller.current === abort) { controller.current = null; setCommitting(false); setRunning(false) } }
  }
  const labels = ['Validate your field and soil', demo.active ? 'Load DEMO / SYNTHETIC climate fixtures' : 'Retrieve historical NASA POWER climate', 'Save exploratory crop evidence']
  return <div className="analysis-page"><PageHeading eyebrow="FROM YOUR LAND TO A CLEARER PLAN" title="Analyze your land" description="Review your inputs, retrieve the selected climate data, and save an explainable analysis." />
    {!field ? <EmptyState icon={Sprout} title="Start with a field" description="Create a field before running an analysis."><Link to="/fields/new" className="btn btn-primary">Add a field <ArrowRight size={16} /></Link></EmptyState> : <div className="analysis-layout"><section className="card analysis-setup"><div className="analysis-section-title"><FlaskConical size={22} /><div><h2>Choose your inputs</h2><p>These values remain editable on your field profile.</p></div></div><div className="analysis-inputs"><label className="form-field">Field<select className="select" disabled={running} value={fieldId} onChange={event => setFieldId(event.target.value)}>{activeFields.map(item => <option key={item.id} value={item.id}>{item.name} · {item.area} ha</option>)}</select></label><label className="form-field">Planting window<select className="select" disabled={running} value={season} onChange={event => setSeason(event.target.value as 'Spring' | 'Autumn')}><option>Autumn</option><option>Spring</option></select></label><p>Climate source: {demo.active ? 'DEMO / SYNTHETIC offline fixtures; not NASA data.' : 'NASA POWER historical gridded estimates.'}</p><label className="form-field">Historical climate period<select aria-label="Historical climate period" className="select" disabled={running} value={years} onChange={event => setYears(event.target.value)}><option value="1">Last complete year</option><option value="3">Last 3 complete years</option><option value="5">Last 5 complete years</option></select></label></div><div className="analysis-input-note"><CloudSun size={18} /><p>{demo.active ? 'Synthetic climate fixtures are loaded locally. No field data is sent to NASA or Supabase.' : 'NASA POWER receives this field’s latitude and longitude.'} Historical gridded data are not on-farm measurements or a forecast. Factor comparisons use the latest full year; earlier years provide context. No overall score is currently available. <Link to="/settings">Climate settings</Link></p></div><div className="analysis-input-actions"><Link to={`/fields/${field.id}/edit`} className="btn btn-secondary">Review field inputs</Link><Button onClick={run} disabled={running}>{running ? 'Analysis in progress…' : 'Run analysis'} <ArrowRight size={16} /></Button>{running && <Button variant="ghost" disabled={committing} onClick={() => { if (commitStarted.current) return; controller.current?.abort(); setRunning(false); setMessage('Analysis cancelled; no result was saved.'); setSteps(['waiting', 'waiting', 'waiting']) }}>Cancel</Button>}</div></section>
    <section className="card analysis-progress" aria-live="polite"><h2>What happens next</h2><p>Each step reflects actual processing on this device.</p><ol>{labels.map((label, index) => <li key={label} className={`analysis-step step-${steps[index]}`}><span>{steps[index] === 'done' ? <Check size={16} /> : steps[index] === 'warning' || steps[index] === 'error' ? <CircleAlert size={16} /> : index + 1}</span><div><strong>{label}</strong><small>{steps[index] === 'waiting' ? 'Waiting' : steps[index] === 'working' ? 'In progress' : steps[index] === 'done' ? 'Complete' : steps[index] === 'warning' ? 'Complete with source limitations' : 'Could not complete'}</small></div></li>)}</ol>{climateResult && <div className="analysis-source"><SourceNote source={climateResult.source} year={climateResult.year} cached={climateResult.provenance?.cache === 'cached'} partial={climateResult.provenance?.quality === 'partial'} />{climateResult.error && <p>{climateResult.error}</p>}</div>}{message && <p className="analysis-message" role="alert">{message}</p>}</section></div>}
  </div>
}

export function HistoryPage() {
  const demo = useDemo()
  const { analysisRecords } = useApp()
  const [search, setSearch] = useState('')
  const records = analysisRecords.filter(record => isAnalysisRecord(record) && (demo.active ? record.climate.source === 'demo' : isVisibleAnalysis(record)) && !isUntouchedLegacySample(record.field) && !needsLegacyReview(record.field)).filter(record => !search.trim() || (record.field.name + ' ' + record.season + ' ' + record.createdAt).toLowerCase().includes(search.trim().toLowerCase())).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return <><PageHeading eyebrow="THE STORY SO FAR" title="Analysis history" description="Review the inputs, climate source and crop evidence saved at the time of each analysis."><Link className="btn btn-primary" to="/analysis"><Sprout size={16} />New analysis</Link></PageHeading><div className="history-toolbar"><label className="form-field">Search analysis history<input className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Field name, season or date" /></label><p role="status">{records.length} saved exploratory analyses</p>{search && <Button variant="secondary" onClick={() => setSearch(String())}>Clear search</Button>}</div>{records.length ? <div className="history-list">{records.map(record => <Link className="card history-item" key={record.id} to={`/history/${record.id}`}><span className="history-item-icon"><FileText size={20} /></span><span><strong>{record.field.name}</strong><small>{record.season} planting · {new Date(record.createdAt).toLocaleString()}</small><SourceNote source={record.climate.source} year={record.climate.year} cached={record.climate.provenance?.cache === 'cached'} partial={record.climate.provenance?.quality === 'partial'} /></span><span className="history-item-score">{record.recommendations[0]?.crop.name ?? 'No profiles'}<small>Saved exploratory profile</small></span><ArrowRight size={18} /></Link>)}</div> : <EmptyState icon={History} title={search ? "No analyses match your search" : "No saved analyses yet"} description="Run an analysis to keep a dated snapshot of the inputs, climate source and crop matches."><Link className="btn btn-primary" to="/analysis">Analyze a field <ArrowRight size={16} /></Link></EmptyState>}</>
}

export function AnalysisDetailPage() {
  const demo = useDemo()
  const { id } = useParams()
  const { analysisRecords, deleteAnalysis, fields } = useApp()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const record = analysisRecords.find(item => item.id === id && isAnalysisRecord(item) && (demo.active ? item.climate.source === 'demo' : isVisibleAnalysis(item)) && !isUntouchedLegacySample(item.field) && !needsLegacyReview(item.field))
  if (!record) return <EmptyState icon={FileText} title="Analysis not found" description="This saved analysis is unavailable in the current workspace."><Link className="btn btn-secondary" to="/history">Back to history</Link></EmptyState>
  const field = record.field, climate = record.climate
  const currentField = fields.find(item => item.id === field.id && !item.archived)
  const soil = field.soil
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const annual = climate.history?.map(item => ({ year: item.year, temperature: average(item.monthly.map(month => month.temperature)), rain: item.monthly.reduce((sum, month) => sum + month.rainfall, 0) })) ?? []
  async function remove() { try { await deleteAnalysis(record!.id); navigate('/history') } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Could not delete this analysis.') } }
  return <article className="analysis-report"><Link className="field-back-link report-no-print" to="/history"><ArrowLeft size={16} /> Back to history</Link><PageHeading eyebrow="A SNAPSHOT, NOT A FORECAST" title={`${field.name} analysis`} description={`${record.season} planting window · Saved ${new Date(record.createdAt).toLocaleString()}`}><Button variant="secondary" className="report-no-print" onClick={() => window.print()}><Printer size={16} />Print / save PDF</Button>{currentField && <Link className="btn btn-primary report-no-print" to={`/analysis?field=${field.id}&season=${record.season}`}><RefreshCw size={16} />Rerun with current inputs</Link>}</PageHeading>
    <div className="analysis-report-banner"><Leaf size={21} /><div><strong>Exploratory evidence, not a ranking</strong><p>Water fit and critical rules are unknown. Numeric scores and reasons from older snapshots are withheld because the previous model treated unknown water as zero. Original records remain unchanged; consult an agronomist.</p></div><Badge tone="neutral">{record.modelVersion}</Badge></div>
    <div className="analysis-report-grid"><section className="card report-card"><h2>Field and soil at analysis time</h2><dl><div><dt>Location</dt><dd>{field.location} · {field.latitude}, {field.longitude}</dd></div><div><dt>Area</dt><dd>{field.area} ha</dd></div><div><dt>Water availability</dt><dd>{field.water}</dd></div><div><dt>Soil pH</dt><dd>{soil.ph ?? 'Not provided'}</dd></div><div><dt>N / P / K</dt><dd>{[soil.nitrogen, soil.phosphorus, soil.potassium].map(value => value ?? 'Unknown').join(' / ')} mg/kg</dd></div><div><dt>Organic matter</dt><dd>{soil.organicMatter == null ? 'Not provided' : `${soil.organicMatter}%`}</dd></div><div><dt>Input provenance</dt><dd>{soil.provenance ?? 'Not specified'}</dd></div><div><dt>Sampled</dt><dd>{soil.sampleDate || 'Not provided'}</dd></div><div><dt>Soil method</dt><dd>{soil.testMethod || 'Not provided'}</dd></div><div><dt>Priorities</dt><dd>{field.priorities.join(', ').replaceAll('-', ' ') || 'None recorded'}</dd></div></dl></section>
    <section className="card report-card"><h2>Climate data and traceability</h2><SourceNote source={climate.source} year={climate.year} cached={climate.provenance?.cache === 'cached'} partial={climate.provenance?.quality === 'partial'} /><dl><div><dt>Provider</dt><dd>{climate.fixture ? 'DEMO / SYNTHETIC offline fixture (not NASA)' : climate.provenance?.provider ?? 'Not provided'}</dd></div><div><dt>Period</dt><dd>{climate.provenance ? `${climate.provenance.period.start} – ${climate.provenance.period.end}` : 'Not provided'}</dd></div><div><dt>Fixture metadata</dt><dd>{climate.fixture ? `${climate.fixture.kind} v${climate.fixture.version} · ${climate.fixture.farmId} · ${climate.fixture.coordinates.latitude}, ${climate.fixture.coordinates.longitude}` : 'Not a synthetic fixture'}</dd></div><div><dt>Retrieval time</dt><dd>{climate.retrievedAt ? new Date(climate.retrievedAt).toLocaleString() : 'Not provided'}</dd></div><div><dt>Coordinates</dt><dd>{climate.provenance ? `${climate.provenance.coordinates.latitude}, ${climate.provenance.coordinates.longitude}` : 'Not provided'}</dd></div><div><dt>Quality</dt><dd>{climate.provenance?.quality ?? 'Not provided'}</dd></div><div><dt>Parameters and units</dt><dd>{climate.provenance?.parameters.map(parameter => `${parameter.code}: ${parameter.unit}`).join('; ') ?? 'Not provided'}</dd></div></dl>{climate.error && <p className="analysis-message">{climate.error}</p>}{!!climate.provenance?.missing.length && <p className="analysis-message">Missing observations: {climate.provenance.missing.join(', ')}</p>}{annual.length > 1 && <div className="annual-history"><h3>Historical annual context</h3><p>Annual temperature is the simple mean of monthly means; annual precipitation is the sum of monthly totals. This is not a drought or heat forecast.</p>{annual.map(item => <div key={item.year}><strong>{item.year}</strong><span>{item.temperature.toFixed(1)} °C mean</span><span>{Math.round(item.rain)} mm precipitation</span></div>)}</div>}</section></div>
    <section className="card report-results"><div className="analysis-section-title"><Sprout size={22} /><div><h2>Saved crop evidence</h2><p>At most four profiles, in alphabetical order for new analyses. Overall suitability is unknown; profiles are not ranked recommendations.</p></div></div>{record.recommendations.slice(0, 4).map((item, index) => <div className="report-result" key={`${item.crop.id}-${index}`}><div><span aria-hidden="true">•</span><strong>{item.crop.name}</strong><small>{item.crop.family} · {record.modelVersion === MODEL_VERSION ? `${item.confidence} confidence · ${item.completeness}% tracked inputs` : 'Historical confidence and completeness are unvalidated'}</small></div><strong>Overall suitability unknown</strong>{record.modelVersion === MODEL_VERSION ? <ul>{item.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>Historical reasons are withheld because they used the previous scoring model. Run a new analysis to review current evidence.</p>}{item.warnings.length > 0 && <details><summary>Risks and limitations ({item.warnings.length})</summary>{item.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}<details><summary>Factor evidence</summary>{item.factors.map(factor => <p key={factor.name}>{factor.name}: {factor.score === null || record.modelVersion !== MODEL_VERSION ? 'Unknown / unscored' : `${factor.score}/100 (provisional factor)`}; previous weight {Math.round(factor.weight * 100)}%. {record.modelVersion === MODEL_VERSION ? factor.explanation : 'Historical factor withheld; rerun the analysis to use the current evidence model.'}</p>)}</details><div className="report-print-only"><strong>Factor evidence and risks</strong>{item.factors.map(factor => <p key={factor.name}>{factor.name}: {factor.score === null || record.modelVersion !== MODEL_VERSION ? 'Unknown / unscored' : `${factor.score}/100 (provisional factor)`}; previous weight {Math.round(factor.weight * 100)}%. {record.modelVersion === MODEL_VERSION ? factor.explanation : 'Historical factor withheld; rerun the analysis to use the current evidence model.'}</p>)}{item.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>{item.missingInputs.length > 0 && <p>Missing inputs: {item.missingInputs.join(', ')}</p>}</div>)}<div className="report-actions report-no-print">{currentField && <Link to={`/planner?field=${field.id}&season=${record.season}`} className="btn btn-secondary">Explore rotation alternatives <ArrowRight size={16} /></Link>}{confirmDelete ? <div className="report-delete"><span>Delete this saved analysis?</span><Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep</Button><Button onClick={() => void remove()}><Trash2 size={15} />Delete</Button></div> : <Button variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Delete analysis</Button>}</div>{deleteError && <p className="analysis-message" role="alert">{deleteError}</p>}</section>
  </article>
}
