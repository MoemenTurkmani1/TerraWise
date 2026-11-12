import type { ClimateData, Field, Recommendation } from '../types'
import { isAnalysisRecord, type AnalysisRecord } from '../types/analysis'
import { isUntouchedLegacySample, needsLegacyReview } from '../services/repository'
import { MODEL_VERSION } from './recommendations'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const validMonths = (values: ClimateData['monthly']) => values.length === 12 && values.every((month, i) =>
  month.month === months[i] && Number.isFinite(month.temperature) && month.temperature >= -90 && month.temperature <= 65
  && Number.isFinite(month.rainfall) && month.rainfall >= 0 && Number.isFinite(month.solar) && month.solar >= 0 && month.solar <= 20
  && (month.humidity == null || (Number.isFinite(month.humidity) && month.humidity >= 0 && month.humidity <= 100)))

/** Checks source consistency, not authenticity of locally editable browser data. */
export function hasTraceableClimate(field: Field, climate: ClimateData): boolean {
  const p = climate.provenance
  if (climate.source !== 'nasa-power' || !p || p.provider !== 'NASA POWER' || !validMonths(climate.monthly)) return false
  if (!Number.isInteger(climate.year) || climate.year < 1984 || climate.year >= new Date().getUTCFullYear()) return false
  if (p.coordinates.latitude !== field.latitude || p.coordinates.longitude !== field.longitude) return false
  const startYear = Number(p.period.start.slice(0, 4))
  if (!Number.isInteger(startYear) || startYear < 1984 || startYear > climate.year || climate.year - startYear > 9
    || p.period.start !== `${startYear}-01-01` || p.period.end !== `${climate.year}-12-31`) return false
  if (!Number.isFinite(Date.parse(p.retrievedAt)) || !['fresh', 'cached'].includes(p.cache) || !['complete', 'partial'].includes(p.quality)) return false
  if (climate.retrievedAt !== p.retrievedAt) return false
  const required: [string, string, string[]][] = [
    ['T2M', '\u00b0C', ['C', '\u00b0C', 'degC']],
    ['PRECTOTCORR', 'mm/month', ['mm/day', 'mm d-1']],
    ['ALLSKY_SFC_SW_DWN', 'kWh/m\u00b2/day', ['MJ/m^2/day', 'kW-hr/m^2/day', 'kWh/m^2/day', 'kWh/m2/day']],
  ]
  if (!required.every(([code, unit, sources]) => p.parameters.some(value => value.code === code && value.unit === unit && sources.includes(value.sourceUnit)))) return false
  if (climate.history) {
    if (climate.history.length !== climate.year - startYear + 1 || !climate.history.every((item, i) => item.year === startYear + i && validMonths(item.monthly))) return false
    if (JSON.stringify(climate.history.at(-1)!.monthly) !== JSON.stringify(climate.monthly)) return false
  } else if (startYear !== climate.year) return false
  return true
}

export function isVisibleAnalysis(value: unknown): value is AnalysisRecord {
  return isAnalysisRecord(value) && !isUntouchedLegacySample(value.field) && !needsLegacyReview(value.field)
    && hasTraceableClimate(value.field, value.climate)
}

/** New analyses must retain the current unknown overall/water assessments. */
export function canSaveAnalysis(value: unknown): value is AnalysisRecord {
  return isVisibleAnalysis(value) && value.modelVersion === MODEL_VERSION && value.recommendations.length > 0
    && value.recommendations.length <= 4 && value.recommendations.every(item => item.dataSource === 'nasa-power'
      && item.score === null && item.confidence === 'low' && item.decision === 'insufficient_evidence'
      && item.factors.some(factor => factor.name === 'Water fit' && factor.score === null))
}

/** Sanitize an exported copy; historical workspace records are never rewritten. */
export function exploratoryRecommendation(item: Recommendation, historical = false): Recommendation {
  return { ...item, score: null, confidence: 'low', decision: 'insufficient_evidence',
    factors: item.factors.map(factor => ({ ...factor, score: historical || factor.name === 'Water fit' ? null : factor.score })),
    reasons: historical ? ['Historical profile. Rerun the analysis to review current evidence.'] : item.reasons,
    constraints: item.constraints?.map(constraint => ({ ...constraint, status: 'unknown' })),
    warnings: [...new Set(['Exploratory evidence only. Water suitability and overall planting suitability are unknown.', ...item.warnings])],
  }
}

export function exportExploratoryAnalysis(record: AnalysisRecord) {
  return { ...record, evidenceStatus: 'exploratory', waterSuitability: 'unknown',
    recommendations: record.recommendations.map(item => exploratoryRecommendation(item, record.modelVersion !== MODEL_VERSION)) }
}
