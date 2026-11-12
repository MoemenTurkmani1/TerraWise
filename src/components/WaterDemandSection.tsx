import { useDemo } from '../context/DemoContext'
import { useState } from 'react'
import type { Field } from '../types'
import { completeGrowthProfile } from '../lib/cropWater'
import { dailyPowerUrl } from '../services/nasaPowerDaily'
import WaterClimatePanel from '../pages/WaterClimatePanel'

function initialPeriod(field: Field) {
  const growth = completeGrowthProfile(field.waterInputs?.growth)
  if (growth) {
    const length = growth.initialDays + growth.developmentDays + growth.midDays + growth.lateDays
    const time = Date.parse(`${growth.plantedOn}T00:00:00Z`)
    if (Number.isFinite(time) && length <= 366) {
      const end = new Date(time + (length - 1) * 86400000).toISOString().slice(0, 10)
      if (growth.plantedOn >= '1981-01-01' && end < new Date().toISOString().slice(0, 10)) return { start: growth.plantedOn, end }
    }
  }
  const year = new Date().getUTCFullYear() - 1
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

export default function WaterDemandSection({ field }: { field: Field }) {
  const demo = useDemo()
  const [period, setPeriod] = useState(() => initialPeriod(field))
  const latest = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  let error = ''
  try { dailyPowerUrl(field.latitude, field.longitude, period.start, period.end) }
  catch (caught) { error = caught instanceof Error ? caught.message : 'Choose a valid completed historical period.' }
  return <section className="card water-demand-section" id="water-calculations" aria-labelledby="water-demand-heading">
    <div className="section-heading"><div><h2 id="water-demand-heading">Historical water demand</h2><p>{demo.active ? 'DEMO / SYNTHETIC inputs · FAO-56 ETo and wheat/tomato ETc.' : 'FAO-56 ETo and standard-condition wheat ETc, using your field inputs.'}</p></div><span className="badge badge-amber">Water suitability unknown</span></div>
    <p>Choose a completed period of up to 366 days. A saved complete historical growth profile supplies the initial dates; otherwise the last complete year is shown. These estimates are separate from crop suitability.</p>
    <div className="form-grid water-period-inputs"><label className="form-field">Water calculation start<input className="input" type="date" min="1981-01-01" max={latest} value={period.start} aria-invalid={!!error} aria-describedby={error ? 'water-period-error' : undefined} onChange={event => setPeriod(current => ({ ...current, start: event.target.value }))} /></label><label className="form-field">Water calculation end<input className="input" type="date" min="1981-01-01" max={latest} value={period.end} aria-invalid={!!error} aria-describedby={error ? 'water-period-error' : undefined} onChange={event => setPeriod(current => ({ ...current, end: event.target.value }))} /></label></div>
    {error ? <p className="form-error" id="water-period-error" role="alert">{error}</p> : <WaterClimatePanel key={`${field.id}:${period.start}:${period.end}`} field={field} period={period} />}
  </section>
}
