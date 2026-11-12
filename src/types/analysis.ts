import type { ClimateData, Field, Recommendation } from '../types'
import { isField } from '../services/repository'

/** A saved analysis is a historical snapshot, not a live forecast. */
export interface AnalysisRecord {
  id: string
  createdAt: string
  field: Field
  climate: ClimateData
  season: 'Spring' | 'Autumn'
  recommendations: Recommendation[]
  modelVersion: string
}

export function isAnalysisRecord(value: unknown): value is AnalysisRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as AnalysisRecord
  if (typeof record.id !== 'string' || !record.id || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) || typeof record.modelVersion !== 'string') return false
  if (!isField(record.field)) return false
  if (!record.climate || !['demo', 'nasa-power'].includes(record.climate.source) || !Number.isInteger(record.climate.year) || !Array.isArray(record.climate.monthly) || record.climate.monthly.length !== 12) return false
  const validMonths = (months: unknown): months is ClimateData['monthly'] => Array.isArray(months) && months.length === 12 && months.every(month => month && typeof month.month === 'string' && [month.temperature, month.rainfall, month.solar].every(Number.isFinite))
  if (!validMonths(record.climate.monthly)) return false
  if (record.climate.history && (!Array.isArray(record.climate.history) || record.climate.history.length > 10 || !record.climate.history.every(item => item && Number.isInteger(item.year) && validMonths(item.monthly)))) return false
  const provenance = record.climate.provenance
  if (provenance && (provenance.provider !== 'NASA POWER' || !provenance.coordinates || !Number.isFinite(provenance.coordinates.latitude) || !Number.isFinite(provenance.coordinates.longitude) || !provenance.period || typeof provenance.period.start !== 'string' || typeof provenance.period.end !== 'string' || typeof provenance.retrievedAt !== 'string' || !Array.isArray(provenance.parameters) || !provenance.parameters.every(parameter => parameter && typeof parameter.code === 'string' && typeof parameter.unit === 'string') || !Array.isArray(provenance.missing) || !provenance.missing.every(item => typeof item === 'string'))) return false
  if (!['Spring', 'Autumn'].includes(record.season) || !Array.isArray(record.recommendations) || record.recommendations.length > 100) return false
  return record.recommendations.every(item => item && item.crop && typeof item.crop.id === 'string' && typeof item.crop.name === 'string' && typeof item.crop.family === 'string' && (item.score === null || (typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100)) && ['low', 'medium', 'high'].includes(item.confidence) && Array.isArray(item.factors) && item.factors.every(factor => factor && typeof factor.name === 'string' && typeof factor.explanation === 'string' && (factor.score === null || (typeof factor.score === 'number' && Number.isFinite(factor.score) && factor.score >= 0 && factor.score <= 100)) && Number.isFinite(factor.weight)) && Array.isArray(item.reasons) && item.reasons.every(reason => typeof reason === 'string') && Array.isArray(item.warnings) && item.warnings.every(warning => typeof warning === 'string') && Array.isArray(item.missingInputs) && item.missingInputs.every(input => typeof input === 'string') && (item.decision === undefined || ['eligible', 'ineligible', 'insufficient_evidence'].includes(item.decision)) && (item.constraints === undefined || (Array.isArray(item.constraints) && item.constraints.every(constraint => constraint && typeof constraint.id === 'string' && typeof constraint.explanation === 'string' && ['compatible', 'incompatible', 'unknown'].includes(constraint.status) && (constraint.reviewedRuleId === undefined || typeof constraint.reviewedRuleId === 'string')))))
}
