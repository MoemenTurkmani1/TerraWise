import type { FieldWaterInputs } from '../types'

export interface GrowthStageProfile {
  cropId: string
  plantedOn: string
  initialDays: number
  developmentDays: number
  midDays: number
  lateDays: number
  kcInitial: number
  kcMid: number
  kcEnd: number
  source: string
}
export function completeGrowthProfile(input: FieldWaterInputs['growth'] | undefined): GrowthStageProfile | null {
  if (!input || !input.cropId.trim() || !input.plantedOn || !input.source.trim()) return null
  const stages = [input.initialDays, input.developmentDays, input.midDays, input.lateDays]
  const coefficients = [input.kcInitial, input.kcMid, input.kcEnd]
  if (!stages.every(value => value !== null && Number.isInteger(value) && value > 0) || !coefficients.every(value => value !== null && Number.isFinite(value) && value >= 0)) return null
  return input as GrowthStageProfile
}

/** FAO-56 single Kc curve: linear development and late-stage transitions.
 * Values and duration must be explicitly supplied with a traceable source. */
export function cropKcOnDate(profile: GrowthStageProfile | null, date: string): number | null {
  if (!profile || !profile.cropId || !profile.source.trim()) return null
  const stages = [profile.initialDays, profile.developmentDays, profile.midDays, profile.lateDays]
  const coefficients = [profile.kcInitial, profile.kcMid, profile.kcEnd]
  if (!stages.every(value => Number.isInteger(value) && value > 0) || !coefficients.every(value => Number.isFinite(value) && value >= 0)) return null
  const parse = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN
    const time = Date.parse(`${s}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === s ? time : NaN
  }
  const offset = (parse(date) - parse(profile.plantedOn)) / 86400000
  if (!Number.isInteger(offset) || offset < 0 || offset >= stages.reduce((sum, days) => sum + days, 0)) return null
  if (offset < profile.initialDays) return profile.kcInitial
  if (offset < profile.initialDays + profile.developmentDays) return profile.kcInitial + (profile.kcMid - profile.kcInitial) * (offset - profile.initialDays + 1) / profile.developmentDays
  if (offset < profile.initialDays + profile.developmentDays + profile.midDays) return profile.kcMid
  return profile.kcMid + (profile.kcEnd - profile.kcMid) * (offset - profile.initialDays - profile.developmentDays - profile.midDays + 1) / profile.lateDays
}

export function standardCropEt(etoMm: number | null, kc: number | null): number | null {
  return etoMm === null || kc === null || !Number.isFinite(etoMm) || !Number.isFinite(kc) || etoMm < 0 || kc < 0 ? null : etoMm * kc
}
