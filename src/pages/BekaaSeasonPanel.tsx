import { useEffect, useState } from 'react'
import type { Field } from '../types'
import { BEKAA_WHEAT_SOURCE, type LocalSeasonResult } from '../lib/localSeason'
import { fetchDailyExtremes, type DailyExtremes } from '../services/nasaPowerDaily'
import { Button } from '../components/ui'
import WaterClimatePanel from './WaterClimatePanel'

export default function BekaaSeasonPanel({ field, result }: { field: Field; result: LocalSeasonResult }) {
  const period = result.period
  const key = period ? `${field.latitude}:${field.longitude}:${period.start}:${period.end}` : ''
  const [request, setRequest] = useState<{ key: string; attempt: number } | null>(null)
  const [daily, setDaily] = useState<{ key: string; data?: DailyExtremes; error?: string } | null>(null)
  useEffect(() => {
    if (!period || !request || request.key !== key) return
    const controller = new AbortController()
    void fetchDailyExtremes(field.latitude, field.longitude, period.start, period.end, controller.signal)
      .then(data => { if (!controller.signal.aborted) setDaily({ key, data }) })
      .catch(error => { if (!controller.signal.aborted) setDaily({ key, error: error instanceof Error ? error.message : 'Daily data unavailable.' }) })
    return () => controller.abort()
  }, [field.latitude, field.longitude, key, period?.start, period?.end, request])
  const active = daily?.key === key ? daily : null
  const pending = !!request && request.key === key && !active
  function load() { setDaily(null); setRequest(old => ({ key, attempt: (old?.attempt ?? 0) + 1 })) }

  return <section className="card local-season-panel" aria-labelledby="bekaa-season-heading">
    <h2 id="bekaa-season-heading">Bekaa wheat: historical reference</h2>
    <p>You selected Bekaa Valley; TerraWise has not verified that the field is inside it. A published study describes wheat sown in November and harvested in June. It does not verify your field, cultivar, or exact planting date. The temperature screen uses one species range for every month and does not model winter dormancy; it may incorrectly exclude adapted winter wheat. <a href={BEKAA_WHEAT_SOURCE} target="_blank" rel="noreferrer">Read the Bekaa wheat study</a>.</p>
    {period ? <>
      <p>Reference period: {period.start} to {period.end}. This spans two calendar years; actual crop duration and planting date are not validated.</p>
      <dl className="local-water-evidence">
        <div><dt>Historical total precipitation</dt><dd>{result.water.rainfallMm === null ? 'Unknown' : `${result.water.rainfallMm} mm (NASA POWER estimate)`}</dd></div>
        <div><dt>Effective rainfall</dt><dd>Unknown</dd></div>
        <div><dt>Reference evapotranspiration (ETo)</dt><dd>See optional calculation below</dd></div>
        <div><dt>Crop water demand (ETc)</dt><dd>See optional calculation below</dd></div>
        <div><dt>Actual net irrigation supply</dt><dd>Unknown · farmer category: {field.water}</dd></div>
        <div><dt>Water suitability</dt><dd>Unknown / unscored</dd></div>
      </dl>
      <p>Total precipitation is not effective rainfall or irrigation supply. The qualitative irrigation category does not establish a volume. No water balance or irrigation requirement is calculated. Monthly and daily NASA products use different time standards.</p>
      <Button variant="secondary" disabled={pending} onClick={load}>{pending ? 'Loading daily historical temperatures…' : active ? 'Reload daily historical temperatures' : 'Load daily historical temperatures'}</Button>
      {pending && <p role="status">Loading historical NASA POWER daily data…</p>}
      {active?.error && <p role="alert">{active.error} No substitute daily values were generated.</p>}
      {active?.data && <div className="local-daily-result"><strong>Historical daily temperature context · NASA POWER</strong><p>Coldest 2 m minimum: {active.data.coldest.celsius.toFixed(1)}°C on {active.data.coldest.date}; hottest 2 m maximum: {active.data.hottest.celsius.toFixed(1)}°C on {active.data.hottest.date}. Days with minimum at or below 0°C: {active.data.freezingDays}.</p><p>Daily intervals use local solar time; retrieved {new Date(active.data.retrievedAt).toLocaleString()}. Gridded historical temperatures are not on-farm measurements, frost observations, a forecast, or crop-specific heat/frost damage thresholds.</p></div>}
      <WaterClimatePanel field={field} period={period} />
    </> : <p>The reference period and daily checks require the Autumn selection and two complete historical years for this field.</p>}
  </section>
}
