import { useDemo } from '../context/DemoContext'
import { useState, type FormEvent } from 'react'
import { evaluateWaterBalance, type WaterBalanceInputs } from '../lib/waterBalance'
import { Button } from '../components/ui'

const fields: readonly [Exclude<keyof WaterBalanceInputs, 'thresholdSource'>, string][] = [
  ['previousDepletionMm', 'Previous root-zone depletion (mm)'],
  ['totalAvailableWaterMm', 'Total available water (mm)'],
  ['rainfallMm', 'Precipitation (mm)'],
  ['runoffMm', 'Runoff (mm)'],
  ['netIrrigationMm', 'Net infiltrated irrigation (mm)'],
  ['capillaryRiseMm', 'Capillary rise (mm)'],
  ['actualEtMm', 'Actual crop ET (mm)'],
  ['deepPercolationMm', 'Deep percolation (mm)'],
  ['allowableDepletionFraction', 'Allowable depletion fraction (0–1)'],
]
const empty = (): WaterBalanceInputs => ({ previousDepletionMm: null, totalAvailableWaterMm: null, rainfallMm: null, runoffMm: null, netIrrigationMm: null, capillaryRiseMm: null, actualEtMm: null, deepPercolationMm: null, allowableDepletionFraction: null, thresholdSource: '' })

export default function WaterBalanceCalculator() {
  const demo = useDemo()
  const [values, setValues] = useState<WaterBalanceInputs>(empty)
  const [checked, setChecked] = useState(false)
  const result = checked ? evaluateWaterBalance(values) : null
  function submit(event: FormEvent) { event.preventDefault(); setChecked(true) }
  return <details className="water-balance-calculator"><summary>Check one day of supplied water-balance data</summary>
    <p>All values must refer to the same day and root zone. Enter measured or defensibly estimated fluxes and an applicable threshold source; the app does not verify them. Do not use standard-condition ETc as observed actual ET. Nothing in this form is saved.</p>
    {demo.active && <Button variant="secondary" onClick={() => { setValues({ previousDepletionMm: 25, totalAvailableWaterMm: 84, rainfallMm: 5, runoffMm: 1, netIrrigationMm: 10, capillaryRiseMm: 0, actualEtMm: 4, deepPercolationMm: 0, allowableDepletionFraction: 0.45, thresholdSource: 'DEMO / SYNTHETIC test threshold, not a reviewed agronomic recommendation' }); setChecked(false) }}>Load synthetic balance example</Button>}
    <form onSubmit={submit}><div className="form-grid">{fields.map(([key, label]) => <label className="form-field" key={key}>{label}<input className="input" type="number" min="0" step="any" value={values[key] ?? ''} onChange={event => { const value = event.target.value; setValues(current => ({ ...current, [key]: value === '' ? null : Number(value) })); setChecked(false) }} /></label>)}<label className="form-field">Threshold source<input className="input" value={values.thresholdSource} maxLength={500} onChange={event => { setValues(current => ({ ...current, thresholdSource: event.target.value })); setChecked(false) }} /></label></div>
      <Button type="submit" variant="secondary">Evaluate supplied balance</Button>
      {result?.status === 'insufficient_data' && <p role="status">Insufficient data: {result.reason}</p>}
      {result?.status === 'assessed' && <p role="status">Calculated end-of-day depletion: {result.depletionMm.toFixed(1)} mm; supplied threshold: {result.readilyAvailableMm.toFixed(1)} mm. Depletion is {result.assessment === 'above_supplied_threshold' ? 'above' : 'within'} the supplied threshold. This is a single-day calculation using unverified inputs, not an irrigation prescription or overall suitability score.</p>}
    </form>
  </details>
}
