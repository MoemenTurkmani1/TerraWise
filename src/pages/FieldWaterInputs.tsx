import { useState, type FormEvent } from 'react'
import type { Field, FieldWaterInputs } from '../types'
import { cropWaterReferences } from '../data/cropWaterRequirements'
import { crops } from '../data/crops'
import { useApp } from '../context/AppContext'
import { isField } from '../services/repository'
import { totalAvailableWater } from '../lib/waterBalance'
import { Button } from '../components/ui'

const blank = (): FieldWaterInputs => ({
  fieldCapacityPercent: null, wiltingPointPercent: null, rootDepthM: null, initialDepletionMm: null,
  scheduleKind: 'unknown', scheduleStart: '', scheduleEnd: '', irrigationEvents: [],
  growth: { cropId: '', plantedOn: '', source: '', initialDays: null, developmentDays: null, midDays: null, lateDays: null, kcInitial: null, kcMid: null, kcEnd: null },
})
const numeric = (value: string) => value === '' ? null : Number(value)

export default function FieldWaterInputs({ field }: { field: Field }) {
  const { saveField } = useApp()
  const [data, setData] = useState<FieldWaterInputs>(() => structuredClone(field.waterInputs ?? blank()))
  const [events, setEvents] = useState(() => data.irrigationEvents.map(event => ({ date: event.date, amount: String(event.appliedMm) })))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const growth = data.growth
  const taw = totalAvailableWater(data.fieldCapacityPercent, data.wiltingPointPercent, data.rootDepthM)
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    if (events.some(item => !item.date || item.amount.trim() === '' || !Number.isFinite(Number(item.amount)))) { setError('Enter a date and applied depth for every irrigation event, or remove the incomplete event.'); return }
    if (data.scheduleKind !== 'unknown' && (!data.scheduleStart || !data.scheduleEnd)) { setError('Enter the start and end dates for the actual or planned schedule.'); return }
    if (events.some(item => data.scheduleKind !== 'unknown' && (item.date < data.scheduleStart || item.date > data.scheduleEnd))) { setError('Irrigation event dates must fall within the recorded schedule period.'); return }
    const waterInputs = { ...data, irrigationEvents: events.map(item => ({ date: item.date, appliedMm: Number(item.amount) })) }
    const next = { ...field, waterInputs }
    if (!isField(next)) { setError('Check water values, dates, stage lengths and soil capacity. Field capacity must exceed wilting point.'); return }
    setBusy(true)
    try { await saveField(next); setNotice('Water inputs saved. Unknown values remain unknown.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save water inputs.') }
    finally { setBusy(false) }
  }
  const soilNumbers = [
    ['fieldCapacityPercent', 'Field capacity (% volume)'], ['wiltingPointPercent', 'Permanent wilting point (% volume)'],
    ['rootDepthM', 'Effective rooting depth (m)'], ['initialDepletionMm', 'Initial root-zone depletion (mm)'],
  ] as const
  const stageNumbers = [
    ['initialDays', 'Initial stage (days)'], ['developmentDays', 'Development stage (days)'], ['midDays', 'Mid stage (days)'], ['lateDays', 'Late stage (days)'],
    ['kcInitial', 'Initial Kc'], ['kcMid', 'Mid-season Kc'], ['kcEnd', 'End-season Kc'],
  ] as const
  return <section className="card water-inputs-section"><h2>Water and crop-stage inputs</h2><p>{field.dataClassification === 'demo-synthetic' ? 'DEMO / SYNTHETIC inputs and planned irrigation events; no real measurements.' : 'Optional farmer-entered values. Leave unknown measurements blank.'} Applied irrigation is not necessarily the amount infiltrated into the root zone.</p>
    <form onSubmit={event => void save(event)}>
      <div className="form-grid">{soilNumbers.map(([key, label]) => <label className="form-field" key={key}>{label}<input className="input" type="number" min="0" step="any" value={data[key] ?? ''} onChange={event => setData(current => ({ ...current, [key]: numeric(event.target.value) }))} /></label>)}</div><p>Estimated total available water: {taw === null ? 'Unknown' : `${taw.toFixed(1)} mm`}. Assumes the entered volumetric soil values are uniform over the rooting depth; it is not current soil moisture.</p>
      <h3>Irrigation record</h3><p>Select actual or planned and specify the period only if the record is complete for that period. A blank schedule does not mean zero irrigation.</p>
      <div className="form-grid"><label className="form-field">Schedule type<select className="select" value={data.scheduleKind} onChange={event => setData(current => ({ ...current, scheduleKind: event.target.value as FieldWaterInputs['scheduleKind'] }))}><option value="unknown">Unknown / incomplete</option><option value="actual">Actual record</option><option value="planned">Planned schedule</option></select></label><label className="form-field">Record start<input className="input" type="date" value={data.scheduleStart} onChange={event => setData(current => ({ ...current, scheduleStart: event.target.value }))} /></label><label className="form-field">Record end<input className="input" type="date" value={data.scheduleEnd} onChange={event => setData(current => ({ ...current, scheduleEnd: event.target.value }))} /></label></div>
      {events.map((item, index) => <div className="form-grid" key={index}><label className="form-field">Irrigation date {index + 1}<input className="input" type="date" value={item.date} onChange={event => setEvents(current => current.map((entry, i) => i === index ? { ...entry, date: event.target.value } : entry))} /></label><label className="form-field">Applied depth {index + 1} (mm)<input className="input" type="number" min="0" step="any" value={item.amount} onChange={event => setEvents(current => current.map((entry, i) => i === index ? { ...entry, amount: event.target.value } : entry))} /></label><Button type="button" variant="ghost" onClick={() => setEvents(current => current.filter((_, i) => i !== index))}>Remove event {index + 1}</Button></div>)}
      <Button type="button" variant="secondary" onClick={() => setEvents(current => [...current, { date: '', amount: '' }])}>Add irrigation event</Button>
      <h3>Crop-stage coefficients</h3><p>Enter stages and Kc values only from your agronomist or an applicable source. AgriLumina cannot independently validate these inputs. FAO reference ranges require local climate and management adjustment.</p>
      <div className="form-grid"><label className="form-field">Crop<select aria-label="Water profile crop" className="select" value={growth.cropId} onChange={event => setData(current => ({ ...current, growth: { ...current.growth, cropId: event.target.value } }))}><option value="">Not selected</option>{crops.map(crop => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label><label className="form-field">Planting date<input className="input" type="date" value={growth.plantedOn} onChange={event => setData(current => ({ ...current, growth: { ...current.growth, plantedOn: event.target.value } }))} /></label><label className="form-field">Kc and stage source<input className="input" value={growth.source} maxLength={500} onChange={event => setData(current => ({ ...current, growth: { ...current.growth, source: event.target.value } }))} placeholder="Agronomist or source" /></label>{stageNumbers.map(([key, label]) => <label className="form-field" key={key}>{label}<input className="input" type="number" min="0" step="any" value={growth[key] ?? ''} onChange={event => setData(current => ({ ...current, growth: { ...current.growth, [key]: numeric(event.target.value) } }))} /></label>)}</div>
      <p><a href={cropWaterReferences.wheat.source} target="_blank" rel="noreferrer">FAO-56 crop coefficient tables and limitations</a></p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save water inputs'}</Button>
    </form>
  </section>
}
