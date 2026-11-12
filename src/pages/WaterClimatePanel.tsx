import { summarizeWaterClimate } from '../lib/waterSummary'
import { useDemo } from '../context/DemoContext'
import { demoWaterClimate } from '../data/demo'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Field } from '../types'
import { fetchWaterClimate, type WaterClimateSeries } from '../services/nasaPowerWater'
import { completeGrowthProfile, cropKcOnDate, standardCropEt } from '../lib/cropWater'
import { Button } from '../components/ui'
import WaterBalanceCalculator from './WaterBalanceCalculator'

export default function WaterClimatePanel({ field, period }: { field: Field; period: { start: string; end: string } }) {
  const demo = useDemo()
  const key = `${field.latitude}:${field.longitude}:${field.elevationM ?? 'unknown'}:${period.start}:${period.end}`
  const [request, setRequest] = useState<{ key: string; count: number } | null>(null)
  const [result, setResult] = useState<{ key: string; data?: WaterClimateSeries; error?: string } | null>(null)
  useEffect(() => {
    if (!request || request.key !== key) return
    const controller = new AbortController()
    void (async () => demo.active ? demoWaterClimate(field, period.start, period.end) : await fetchWaterClimate(field.latitude, field.longitude, field.elevationM ?? null, period.start, period.end, controller.signal))()
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : 'Water climate unavailable.' }) })
    return () => controller.abort()
  }, [key, request, field.latitude, field.longitude, field.elevationM, period.start, period.end, demo.active, field])
  const active = result?.key === key ? result : null
  const pending = !!request && request.key === key && !active
  const days = active?.data?.days ?? []
  const etoDays = days.flatMap(day => day.eto.status === 'ok' ? [day.eto.mmPerDay] : [])
  const summary = summarizeWaterClimate(field, period, active?.data)
  const etoTotal = days.length > 0 && etoDays.length === days.length ? summary.etoMm : null
  const growth = completeGrowthProfile(field.waterInputs?.growth)
  const cropEt = growth && (growth.cropId === 'wheat' || (demo.active && growth.cropId === 'tomato')) ? days.map(day => standardCropEt(day.eto.status === 'ok' ? day.eto.mmPerDay : null, cropKcOnDate(growth, day.date))) : []
  const cropTotal = days.length > 0 && cropEt.length === days.length && cropEt.every(value => value !== null) ? cropEt.reduce<number>((sum, value) => sum + value!, 0) : null
  const schedule = field.waterInputs
  const covered = schedule && schedule.scheduleKind !== 'unknown' && schedule.scheduleStart <= period.start && schedule.scheduleEnd >= period.end
  const applied = covered ? schedule.irrigationEvents.filter(event => event.date >= period.start && event.date <= period.end).reduce((sum, event) => sum + event.appliedMm, 0) : null
  function load() { setResult(null); setRequest(old => ({ key, count: (old?.count ?? 0) + 1 })) }
  return <div className="local-daily-result"><strong>FAO-56 water-demand estimate</strong>
    <p>{demo.active ? 'DEMO / SYNTHETIC daily temperature, humidity, wind, pressure and solar inputs are passed to the existing FAO-56 engine. Results are calculated test outputs, not NASA data, actual crop water use or an irrigation prescription.' : 'Requires field elevation and daily NASA temperature, dew point, wind, pressure and solar radiation. These are gridded historical estimates, not a forecast or an irrigation prescription.'}</p>
    <Button variant="secondary" disabled={pending} onClick={load}>{pending ? 'Loading water climate…' : active ? 'Reload FAO-56 estimate' : 'Calculate historical ETo'}</Button>
    {pending && <p role="status">Loading NASA POWER water-climate inputs…</p>}
    {active?.error && <p role="alert">{active.error} No substitute values were used.</p>}
    {active?.data && <><p>{demo.active ? 'DEMO / SYNTHETIC daily fixtures v1 · calculated' : 'NASA POWER daily inputs · local solar time · retrieved'} {new Date(active.data.retrievedAt).toLocaleString()}. ETo available for {etoDays.length} of {days.length} days.</p>
      <p><strong>Reference ETo:</strong> {etoTotal === null ? 'Unknown for the full period; missing elevation or one or more daily inputs failed quality checks.' : `${etoTotal.toFixed(1)} mm for the historical period`}</p>
      <p><strong>{demo.active ? 'Standard-condition crop ETc:' : 'Standard-condition wheat ETc:'}</strong> {cropTotal === null ? 'Unknown. A complete, sourced supported stage/Kc profile (wheat; tomato also available in Demo Mode) covering the entire period and valid daily ETo are required.' : `${cropTotal.toFixed(1)} mm for the historical period, using your supplied Kc profile (not independently validated).`}</p>
      {days.some(day => day.eto.status === 'ok' && day.eto.warnings.length) && <p>Some solar-to-clear-sky radiation ratios were capped at 1 under the FAO calculation.</p>}
    </>}
    <p><strong>{demo.active ? 'DEMO / SYNTHETIC · ' : ''}{schedule?.scheduleKind === 'planned' ? 'Planned irrigation applied' : 'Recorded irrigation applied'}:</strong> {applied === null ? 'Unknown for this period; a complete dated schedule is required.' : `${applied.toFixed(1)} mm. Applied depth is not measured net infiltration.`}</p>
    <p><strong>Effective rainfall and water suitability:</strong> insufficient data. A daily root-zone balance needs runoff, net infiltration, capillary rise, actual crop evapotranspiration, drainage and a locally reviewed stress threshold. No missing flux is assumed to be zero.</p>
    <Link to={`/fields/${field.id}`}>Review or enter water and crop-stage inputs</Link>
    {summary.unknownDays.length > 0 && <details><summary>Why some days are unavailable ({summary.unknownDays.length})</summary>{summary.unknownDays.map(day => <p key={day.date}>{day.date}: {day.reason}</p>)}<p>Full-period ETo and ETc totals remain unknown.</p></details>}<WaterBalanceCalculator />
  </div>
}
