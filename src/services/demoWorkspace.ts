import type { Field, Recommendation } from '../types'
import type { WorkspaceData } from './supabaseWorkspace'
import { isField } from './repository'
import { isAnalysisRecord } from '../types/analysis'
import { crops } from '../data/crops'
import { createDemoWorkspace, demoClimateFor } from '../data/demo'
import { DEMO_FARM_IDS, demoWorkspaceKey, type DemoFarmId } from '../lib/demoSession'
import { hasSyntheticClimate } from '../lib/demoEvidence'
import { historySerial } from '../lib/history'

function validDemoProfile(value: unknown, field: Field): value is Recommendation {
  const snapshot: unknown = { id: 'demo:validation', createdAt: '2025-01-01T00:00:00Z', modelVersion: 'validation', field,
    climate: demoClimateFor(field), season: 'Autumn', recommendations: [value] }
  if (!isAnalysisRecord(snapshot)) return false
  const item = snapshot.recommendations[0]
  return crops.some(crop => crop.id === item.crop.id) && item.dataSource === 'demo' && item.score === null
    && item.confidence === 'low' && item.decision === 'insufficient_evidence'
    && item.factors.length === 6 && item.factors.some(factor => factor.name === 'Water fit' && factor.score === null)
    && item.factors.every(factor => factor.weight >= 0 && factor.weight <= 1 && (factor.score === null || (factor.score >= 0 && factor.score <= 100)))
    && Math.abs(item.factors.reduce((sum, factor) => sum + factor.weight, 0) - 1) < 0.000001
    && !!item.constraints?.length && item.constraints.every(constraint => constraint.status === 'unknown')
}
export function validateDemoWorkspace(value: unknown, farmId: DemoFarmId): value is WorkspaceData {
  if (!value || typeof value !== 'object') return false
  const data = value as WorkspaceData
  if (data.dataClassification !== 'demo-synthetic' || !Array.isArray(data.fields) || !data.fields.every(field => isField(field) && field.dataClassification === 'demo-synthetic' && field.demoFarmId === farmId && field.soil.provenance === 'synthetic' && !field.soilReport)) return false
  if (new Set(data.fields.map(field => field.id)).size !== data.fields.length) return false
  if (!data.preferences || data.preferences.climateMode !== 'demo' || typeof data.preferences.name !== 'string' || !data.preferences.name.trim() || data.preferences.name.length > 60 || !['en', 'ar'].includes(data.preferences.language) || !['ha', 'acre'].includes(data.preferences.areaUnit)) return false
  if (!data.plans || typeof data.plans !== 'object' || Array.isArray(data.plans)) return false
  for (const [id, steps] of Object.entries(data.plans)) {
    const field = data.fields.find(field => field.id === id)
    if (!field || !Array.isArray(steps) || steps.length < 1 || steps.length > 8) return false
    let previous = Math.max(-1, ...field.previousCrops.map(historySerial))
    for (const step of steps) {
      if (!step || !['Spring', 'Autumn'].includes(step.season) || !Number.isInteger(step.year) || step.year < 1900 || step.year > 2201 || !validDemoProfile(step.recommendation, field)) return false
      const serial = historySerial(step)
      if (serial <= previous) return false
      previous = serial
    }
  }
  return Array.isArray(data.analysisRecords) && data.analysisRecords.every(record => isAnalysisRecord(record)
    && record.field.demoFarmId === farmId && record.field.soil.provenance === 'synthetic'
    && hasSyntheticClimate(record.field, record.climate) && record.recommendations.length > 0 && record.recommendations.length <= 4
    && record.recommendations.every(item => validDemoProfile(item, record.field)))
}
export function readDemoWorkspace(storage: Storage, farmId: DemoFarmId): WorkspaceData {
  const raw = storage.getItem(demoWorkspaceKey(farmId))
  if (raw === null) return createDemoWorkspace(farmId)
  const value: unknown = JSON.parse(raw)
  if (!validateDemoWorkspace(value, farmId)) throw new Error('Saved DEMO data is invalid. Use Reset Demo Data to restore the synthetic fixtures.')
  return value
}
export function writeDemoWorkspace(storage: Storage, farmId: DemoFarmId, data: WorkspaceData) {
  if (!validateDemoWorkspace(data, farmId)) throw new Error('Only labeled synthetic records with unknown overall suitability can be saved in Demo Mode.')
  storage.setItem(demoWorkspaceKey(farmId), JSON.stringify(data))
}
export function resetDemoStorage(storage: Storage, drafts?: Storage) {
  DEMO_FARM_IDS.forEach(farmId => storage.removeItem(demoWorkspaceKey(farmId)))
  if (drafts) {
    const keys = Array.from({ length: drafts.length }, (_, i) => drafts.key(i)).filter((key): key is string => !!key && key.startsWith('terrawise.demo.draft.v1:'))
    keys.forEach(key => drafts.removeItem(key))
  }
}
