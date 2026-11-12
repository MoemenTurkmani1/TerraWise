import type { Field } from '../types';
import { assertRealData, assertRealSession } from '../lib/demoSession';
export { needsLegacyReview } from '../lib/legacyField';

export const FIELD_STORAGE_KEY = 'terrawise.fields.v1';

// Hide only untouched legacy starter records. Edited records and the underlying
// stored data are not automatically deleted; no identifying values are seeded.
export function isUntouchedLegacySample(field: Field): boolean {
  const fingerprints: Record<string, string> = { 'north-field': '4a6e8391', riverside: '79190b8a', hilltop: 'c40e3b09' };
  let hash = 2166136261;
  for (const char of JSON.stringify(field)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return fingerprints[field.id] === (hash >>> 0).toString(16);
}

/** Replace this adapter with a server-backed implementation when Supabase is
 * configured. Put authorization/RLS on the server; never ship service-role keys.
 */
export interface FieldRepository {
  getAll(): Field[];
  saveAll(fields: Field[]): void;
}

function validNumber(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function validText(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 500; }
function optionalText(value: unknown): boolean { return value === undefined || (typeof value === 'string' && value.length <= 500); }
function optionalNumber(value: unknown, min: number, max: number): boolean { return value === undefined || value === null || validNumber(value, min, max); }
function optionalDate(value: unknown): boolean {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isField(value: unknown): value is Field {
  if (!value || typeof value !== 'object') return false;
  const field = value as Field;
  if (!validText(field.id) || !validText(field.name) || !validText(field.location) || typeof field.image !== 'string') return false;
  if (!validNumber(field.area, 0.001, 1_000_000) || !validNumber(field.latitude, -90, 90) || !validNumber(field.longitude, -180, 180)) return false;
  if (!['rainfed', 'limited', 'reliable'].includes(field.water) || !field.soil || typeof field.soil !== 'object') return false;
  if (field.dataClassification !== undefined && field.dataClassification !== 'demo-synthetic') return false;
  if (field.demoFarmId !== undefined && !['bekaa', 'north', 'coast'].includes(field.demoFarmId)) return false;
  const soil = field.soil;
  if (!(soil.ph === null || validNumber(soil.ph, 0, 14)) || !(soil.organicMatter === null || validNumber(soil.organicMatter, 0, 100))) return false;
  if (![soil.nitrogen, soil.phosphorus, soil.potassium].every((entry) => entry === null || validNumber(entry, 0, 100_000))) return false;
  if (!optionalNumber(soil.salinity, 0, 100) || !optionalNumber(soil.moisture, 0, 100) || !optionalNumber(soil.sampleDepthCm, 0, 1000)) return false;
  if (!optionalText(soil.texture) || !optionalText(soil.laboratory) || !optionalText(soil.testMethod) || !optionalDate(soil.sampleDate)) return false;
  if (soil.provenance !== undefined && !['measured', 'estimated', 'unknown', 'synthetic'].includes(soil.provenance)) return false;
  if (field.areaUnit !== undefined && !['ha', 'acre'].includes(field.areaUnit)) return false;
  if (field.locationSource !== undefined && !['manual', 'map', 'gps'].includes(field.locationSource)) return false;
  if (field.archived !== undefined && typeof field.archived !== 'boolean') return false;
  if (field.reviewedRealData !== undefined && typeof field.reviewedRealData !== 'boolean') return false;
  if (!optionalNumber(field.elevationM, -500, 9000) || !optionalText(field.country) || !optionalText(field.soilType) || !optionalText(field.budget)) return false;
  if (field.riskTolerance !== undefined && !['low', 'medium', 'high', 'unknown'].includes(field.riskTolerance)) return false;
  if (field.irrigation !== undefined && (!field.irrigation || typeof field.irrigation !== 'object' || !optionalText(field.irrigation.method) || !optionalText(field.irrigation.source) || !optionalText(field.irrigation.seasonalRestrictions))) return false;
  if (field.waterInputs !== undefined) {
    const water = field.waterInputs;
    if (!water || typeof water !== 'object' || !optionalNumber(water.fieldCapacityPercent, 0, 100) || !optionalNumber(water.wiltingPointPercent, 0, 100) || !optionalNumber(water.rootDepthM, 0, 20) || !optionalNumber(water.initialDepletionMm, 0, 20000)) return false;
    if (water.fieldCapacityPercent !== null && water.wiltingPointPercent !== null && water.fieldCapacityPercent <= water.wiltingPointPercent) return false;
    if (!['unknown', 'actual', 'planned'].includes(water.scheduleKind) || !optionalDate(water.scheduleStart) || !optionalDate(water.scheduleEnd) || (water.scheduleStart && water.scheduleEnd && water.scheduleStart > water.scheduleEnd)) return false;
    if (!Array.isArray(water.irrigationEvents) || water.irrigationEvents.length > 1000 || !water.irrigationEvents.every(event => event && typeof event.date === 'string' && event.date !== '' && optionalDate(event.date) && validNumber(event.appliedMm, 0, 10000))) return false;
    const growth = water.growth;
    if (!growth || typeof growth !== 'object' || !optionalText(growth.cropId) || !optionalDate(growth.plantedOn) || !optionalText(growth.source)) return false;
    if (![growth.initialDays, growth.developmentDays, growth.midDays, growth.lateDays].every(value => value === null || (validNumber(value, 1, 366) && Number.isInteger(value)))) return false;
    if (![growth.kcInitial, growth.kcMid, growth.kcEnd].every(value => value === null || validNumber(value, 0, 10))) return false;
  }
  if (field.soilReport !== undefined && (!field.soilReport || !validText(field.soilReport.id) || !validText(field.soilReport.filename) || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(field.soilReport.mimeType) || !validNumber(field.soilReport.size, 1, 5 * 1024 * 1024))) return false;
  if (!Array.isArray(field.priorities) || !field.priorities.every((entry) => ['soil-health', 'water-saving', 'profitability', 'production', 'risk-reduction'].includes(entry))) return false;
  if (!Array.isArray(field.previousCrops) || !field.previousCrops.every((entry) => entry && validText(entry.cropId) && validText(entry.season) && validNumber(entry.year, 1900, 2200) && Number.isInteger(entry.year) && optionalDate(entry.plantedAt) && optionalDate(entry.harvestedAt) && optionalText(entry.diseaseNotes) && optionalText(entry.residueManagement))) return false;
  return true;
}

export const fieldRepository: FieldRepository = {
  getAll() {
    assertRealSession();
    if (typeof localStorage === 'undefined') return [];
    const saved = localStorage.getItem(FIELD_STORAGE_KEY);
    if (saved === null) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(saved); } catch { throw new Error('Saved fields could not be read. Existing browser data was left untouched.'); }
    if (!Array.isArray(parsed) || !parsed.every(isField) || new Set(parsed.map((field) => field.id)).size !== parsed.length) throw new Error('Saved fields have an unsupported format. Existing browser data was left untouched.');
    assertRealData(parsed);
    return parsed;
  },
  saveAll(fields) {
    assertRealSession();
    assertRealData(fields);
    if (!fields.every(isField) || new Set(fields.map((field) => field.id)).size !== fields.length) throw new Error('Field values are invalid and could not be saved.');
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable; fields could not be saved.');
    try { localStorage.setItem(FIELD_STORAGE_KEY, JSON.stringify(fields)); } catch { throw new Error('Browser storage is full or unavailable. Export your data before closing this tab.'); }
  },
};
