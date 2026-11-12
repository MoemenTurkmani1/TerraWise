import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Check, CloudSun, Database, Download, LogOut, ShieldCheck, Sprout, Workflow } from 'lucide-react'
import { useApp, type Preferences } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { Badge, Button, PageHeading } from '../components/ui'
import { isUntouchedLegacySample, needsLegacyReview } from '../services/repository'

export default function SettingsPage() {
  const { preferences, updatePreferences, fields, plans, analysisRecords, syncState } = useApp()
  const auth = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(preferences.name)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setName(preferences.name), [preferences.name])
  async function savePreference(value: Partial<Preferences>) {
    setError('')
    try { await updatePreferences(value); return true }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save your preference.'); return false }
  }
  async function saveName(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || busy) return
    setBusy(true); setSaved(await savePreference({ name: name.trim() })); setBusy(false)
  }
  function download() {
    const realAnalyses = analysisRecords.filter(record => record.climate.source === 'nasa-power' && !isUntouchedLegacySample(record.field) && !needsLegacyReview(record.field))
    const realPlans = Object.fromEntries(Object.entries(plans).filter(([id, steps]) => fields.some(field => field.id === id && !needsLegacyReview(field)) && steps.every(step => step.recommendation.dataSource === 'nasa-power')))
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), fields: fields.filter(field => !needsLegacyReview(field)), plans: realPlans, analysisRecords: realAnalyses, preferences, note: 'Soil report files and legacy simulated results are not included.' }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'terrawise-workspace.json'; link.click(); URL.revokeObjectURL(url)
  }
  async function signOut() {
    if (syncState === 'syncing') { setError('Wait for the current account save to finish before signing out.'); return }
    if (syncState === 'error' && !confirmSignOut) { setConfirmSignOut(true); return }
    setError(''); setBusy(true)
    try { await auth.signOut(); navigate('/login') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign out.') }
    finally { setBusy(false) }
  }
  return <><PageHeading eyebrow="MAKE IT YOURS" title="Workspace settings" description="A few thoughtful details to make TerraWise work for you." />
    {error && <p className="notice notice-warning" role="alert">{error}</p>}
    <div className="settings-grid">
      <section className="card settings-card"><div className="settings-section-icon"><Sprout size={22} /></div><h2>{auth.user ? 'Your account profile' : 'Your local profile'}</h2><p>{auth.user ? `Signed in as ${auth.user.email ?? 'your account'}. Your display name is part of your account workspace.` : 'This display name is stored in this browser. Local mode does not create an account.'}</p><form onSubmit={event => void saveName(event)}><label className="form-field">Display name<input className="input" value={name} onChange={event => { setName(event.target.value); setSaved(false) }} required maxLength={60} /></label><Button type="submit" disabled={!name.trim() || busy}>{saved ? <><Check size={16} />Saved</> : 'Save profile'}</Button></form>{auth.user ? <>{confirmSignOut && syncState === 'error' ? <div className="reset-confirm"><p><strong>Some changes are not confirmed by the server. Export or retry before leaving.</strong></p><div className="button-row"><Button variant="secondary" onClick={() => setConfirmSignOut(false)}>Stay here</Button><Button onClick={() => void signOut()} disabled={busy}>Sign out without saving</Button></div></div> : <Button variant="secondary" onClick={() => void signOut()} disabled={busy || syncState === 'syncing'} className="settings-signout"><LogOut size={16} />Sign out</Button>}{syncState === 'syncing' && <p className="small-muted">Wait for the current save to finish before signing out.</p>}</> : <p>{auth.configured ? <Link to="/login" className="text-link">Sign in to an account <ArrowRight size={14} /></Link> : 'Account sign-in is available once a Supabase project is configured.'}</p>}</section>
      <section className="card settings-card"><div className="settings-section-icon"><CloudSun size={22} /></div><h2>Climate data source</h2><p>NASA mode requests historical climate for your field coordinates. Analysis can request one, three, or five complete years.</p><p>NASA POWER historical gridded estimates. If unavailable, only an exact-location, dated NASA cache may be used; otherwise no climate values are displayed.</p><Link to="/data-sources" className="text-link">Understand the data <ArrowUpRight size={14} /></Link></section>
      <section className="card settings-card"><div className="settings-section-icon"><Database size={22} /></div><h2>Your workspace data</h2><p>{auth.user ? 'Your account workspace uses the configured service. The sync state below shows whether recent changes were confirmed.' : 'Fields, plans, and analyses are saved on this device, in this browser. Export a copy before clearing browser data.'}</p><div className="settings-data-summary"><span>{fields.filter(field => !needsLegacyReview(field)).length} fields</span><span>{Object.entries(plans).filter(([id, steps]) => fields.some(field => field.id === id && !needsLegacyReview(field)) && steps.every(step => step.recommendation.dataSource === 'nasa-power')).length} saved plans</span><span>{analysisRecords.filter(record => record.climate.source === 'nasa-power' && !isUntouchedLegacySample(record.field) && !needsLegacyReview(record.field)).length} analyses</span><Badge tone="neutral">{auth.user ? syncState : 'Browser storage'}</Badge></div><Button variant="secondary" onClick={download}><Download size={16} />Export workspace JSON</Button><p className="small-muted">The JSON export excludes unreviewed legacy entries, simulated results and locally stored soil report files.</p></section>
      <section className="card settings-card"><div className="settings-section-icon"><Workflow size={22} /></div><h2>Units and privacy</h2><p>Stored field areas use hectares; choose the starting unit for new field forms.</p><label className="form-field">Default unit for new fields<select className="select" value={preferences.areaUnit} onChange={event => void savePreference({ areaUnit: event.target.value === 'acre' ? 'acre' : 'ha' })}><option value="ha">Hectares</option><option value="acre">Acres</option></select></label><p className="small-muted">Soil report attachments are stored only on this browser in local mode. They are not uploaded or analyzed. Authenticated accounts cannot access those local files.</p></section>
      <section className="card settings-card"><div className="settings-section-icon"><ShieldCheck size={22} /></div><h2>Account and data control</h2><p>{auth.user ? 'Contact the operator of your configured Supabase project to request account deletion. Account deletion is not available from this interface.' : 'The guest workspace is local to this browser. Real accounts require a configured Supabase project and database policies.'}</p><Link to="/data-sources" className="text-link">Read about data sources <ArrowRight size={14} /></Link></section>
    </div>
  </>
}
