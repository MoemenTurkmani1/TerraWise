import type { Field } from '../types'
import type { WaterClimateSeries } from '../services/nasaPowerWater'
import { datesBetween } from '../services/nasaPowerDaily'
import { completeGrowthProfile, cropKcOnDate, standardCropEt } from './cropWater'

/** A complete input series can still have unknown ETo days. Never sum across gaps. */
export function summarizeWaterClimate(field: Field, period: { start: string; end: string }, series?: WaterClimateSeries) {
  const expected = datesBetween(period.start, period.end)
  const days = series?.days ?? []
  const matching = series?.start === period.start && series.end === period.end && days.length === expected.length
    && days.every((day, i) => day.date === expected[i])
  const accepted = days.filter(day => day.eto.status === 'ok' && Number.isFinite(day.eto.mmPerDay) && day.eto.mmPerDay >= 0)
  const etoMm = matching && accepted.length === expected.length
    ? accepted.reduce((sum, day) => sum + (day.eto.status === 'ok' ? day.eto.mmPerDay : 0), 0) : null
  const profile = completeGrowthProfile(field.waterInputs?.growth)
  const cropDays = profile?.cropId === 'wheat' ? days.map(day => standardCropEt(day.eto.status === 'ok' ? day.eto.mmPerDay : null, cropKcOnDate(profile, day.date))) : []
  const etcMm = etoMm !== null && cropDays.length === expected.length && cropDays.every(value => value !== null)
    ? cropDays.reduce<number>((sum, value) => sum + value!, 0) : null
  const schedule = field.waterInputs
  const covered = schedule && schedule.scheduleKind !== 'unknown' && !!schedule.scheduleStart && !!schedule.scheduleEnd
    && schedule.scheduleStart <= period.start && schedule.scheduleEnd >= period.end
  const appliedMm = covered ? schedule.irrigationEvents.filter(event => event.date >= period.start && event.date <= period.end).reduce((sum, event) => sum + event.appliedMm, 0) : null
  return { expectedDays: expected.length, receivedDays: days.length, availableEtoDays: accepted.length, etoMm, etcMm, appliedMm,
    unknownDays: days.flatMap(day => day.eto.status === 'insufficient_data' ? [{ date: day.date, reason: day.eto.reason }] : []),
    waterSuitability: 'unknown' as const }
}
