import type { Field, ClimateData, FieldWaterInputs } from '../../../src/types.ts'
import { crops } from '../../../src/data/crops.ts'
import { ecocropScreenRequirements } from '../../../src/data/ecocropScreen.ts'
import { screenCrops } from '../../../src/lib/ecologicalScreen.ts'
import { needsLegacyReview } from '../../../src/lib/legacyField.ts'
import { completeGrowthProfile, cropKcOnDate, standardCropEt } from '../../../src/lib/cropWater.ts'
import { datesBetween } from '../../../src/services/nasaPowerDaily.ts'
import type { WaterClimateSeries } from '../../../src/services/nasaPowerWater.ts'
import { AgentError, isRecord, type AgronomistRequest, type FieldContext, type EvidenceCategory } from './contracts.ts'

const finite = (v: unknown, min: number, max: number): number | null => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null
const date = (v: unknown): string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v ? v : ''
const cropIds = new Set(crops.map(c => c.id))

/** Project only numerical/enum agronomic inputs. Names, notes, laboratory names,
 * files, addresses, free-text sources, and all other fields never enter a prompt. */
export function sanitizeField(raw: unknown): Field {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isRecord(raw.soil)) throw new AgentError(422, 'INVALID_FIELD', 'Review this field in My fields.')
  const latitude = finite(raw.latitude, -90, 90), longitude = finite(raw.longitude, -180, 180)
  if (latitude === null || longitude === null) throw new AgentError(422, 'INVALID_FIELD', 'Valid field coordinates are required.')
  const soil = raw.soil
  const texture = typeof soil.texture === 'string' && ['Sand', 'Sandy loam', 'Loam', 'Silt loam', 'Clay loam', 'Clay', 'Silt', 'Sandy clay', 'Sandy clay loam', 'Silty clay', 'Silty clay loam'].some(t => t.toLowerCase() === soil.texture!.toString().toLowerCase()) ? String(soil.texture).toLowerCase() : undefined
  const field: Field = {
    id: raw.id, name: '', location: '', area: finite(raw.area, 0, 1_000_000) ?? 0,
    latitude, longitude, elevationM: finite(raw.elevationM, -500, 9000), reviewedRealData: raw.reviewedRealData === true,
    soil: { ph: finite(soil.ph, 0, 14), nitrogen: finite(soil.nitrogen, 0, 100_000), phosphorus: finite(soil.phosphorus, 0, 100_000), potassium: finite(soil.potassium, 0, 100_000), organicMatter: finite(soil.organicMatter, 0, 100), salinity: finite(soil.salinity, 0, 100), texture,
      provenance: soil.provenance === 'measured' || soil.provenance === 'estimated' ? soil.provenance : 'unknown', sampleDate: date(soil.sampleDate), sampleDepthCm: finite(soil.sampleDepthCm, 0, 1000) },
    // This value is used only as a qualitative entry, never as a water quantity.
    water: raw.water === 'reliable' || raw.water === 'limited' ? raw.water : 'rainfed',
    previousCrops: Array.isArray(raw.previousCrops) ? raw.previousCrops.slice(0, 24).flatMap(h =>
      isRecord(h) && typeof h.cropId === 'string' && cropIds.has(h.cropId) && typeof h.year === 'number' && Number.isInteger(h.year) && h.year >= 1900 && h.year <= 2200 && ['Spring', 'Autumn', 'Summer', 'Winter'].includes(String(h.season))
        ? [{ cropId: h.cropId, year: h.year, season: String(h.season) }] : []) : [],
    priorities: [], image: ''
  }
  // Retain invalid/missing water as unknown outside the scientific Field type.
  if (!['reliable', 'limited', 'rainfed'].includes(String(raw.water))) throw new AgentError(422, 'INVALID_FIELD', 'Review the field water-availability entry.')
  if (isRecord(raw.waterInputs)) {
    const w = raw.waterInputs
    const g = isRecord(w.growth) ? w.growth : {}
    const stage = (v: unknown) => { const n = finite(v, 1, 366); return n !== null && Number.isInteger(n) ? n : null }
    const growth: FieldWaterInputs['growth'] = {
      cropId: typeof g.cropId === 'string' && cropIds.has(g.cropId) ? g.cropId : '', plantedOn: date(g.plantedOn),
      source: typeof g.source === 'string' && g.source.trim().length > 0 && g.source.length <= 2000 ? 'Farmer supplied source; not independently verified' : '',
      initialDays: stage(g.initialDays), developmentDays: stage(g.developmentDays), midDays: stage(g.midDays), lateDays: stage(g.lateDays),
      kcInitial: finite(g.kcInitial, 0, 2.5), kcMid: finite(g.kcMid, 0, 2.5), kcEnd: finite(g.kcEnd, 0, 2.5)
    }
    if ([growth.initialDays, growth.developmentDays, growth.midDays, growth.lateDays].reduce<number>((n, v) => n + (v ?? 0), 0) > 500) growth.source = ''
    const events = Array.isArray(w.irrigationEvents) && w.irrigationEvents.length <= 1000 && w.irrigationEvents.every(e => isRecord(e) && !!date(e.date) && finite(e.appliedMm, 0, 10000) !== null)
      ? w.irrigationEvents.map(e => ({ date: date(e.date), appliedMm: Number(e.appliedMm) })) : null
    field.waterInputs = {
      fieldCapacityPercent: finite(w.fieldCapacityPercent, 0, 100), wiltingPointPercent: finite(w.wiltingPointPercent, 0, 100),
      rootDepthM: finite(w.rootDepthM, 0.01, 10), initialDepletionMm: finite(w.initialDepletionMm, 0, 5000),
      scheduleKind: events && (w.scheduleKind === 'actual' || w.scheduleKind === 'planned') ? w.scheduleKind : 'unknown',
      scheduleStart: date(w.scheduleStart), scheduleEnd: date(w.scheduleEnd), irrigationEvents: events ?? [], growth
    }
  }
  return field
}

export function authorizeWorkspace(raw: unknown, ownerId: string, fieldId: string): { field: Field; version: number; savedAnalyses: number } {
  if (!isRecord(raw) || raw.owner_id !== ownerId || !Array.isArray(raw.fields)) throw new AgentError(404, 'FIELD_NOT_FOUND', 'This saved field is unavailable in your account.')
  const matches = raw.fields.filter(f => isRecord(f) && f.id === fieldId && f.archived !== true)
  if (matches.length !== 1) throw new AgentError(404, 'FIELD_NOT_FOUND', 'This saved field is unavailable in your account.')
  const field = sanitizeField(matches[0])
  if (needsLegacyReview(field)) throw new AgentError(422, 'FIELD_REVIEW_REQUIRED', 'Review this older example-derived field before requesting field advice.')
  const savedAnalyses = Array.isArray(raw.analyses) ? raw.analyses.filter(a => isRecord(a) && isRecord(a.field) && a.field.id === fieldId).length : 0
  return { field, version: typeof raw.version === 'number' && Number.isSafeInteger(raw.version) && raw.version > 0 ? raw.version : 0, savedAnalyses }
}
export function screeningPeriod(request: AgronomistRequest): { start: string; end: string } {
  const year = String(request.climateYear)
  return request.season === 'Spring' ? { start: year + '-03-01', end: year + '-06-30' } : { start: year + '-09-01', end: year + '-12-31' }
}
export function buildContext(field: Field, version: number, savedAnalyses: number, request: AgronomistRequest, climate: ClimateData | null, water: WaterClimateSeries | null, now: string): FieldContext {
  const ar = request.language === 'ar'
  const context: FieldContext = { evidence: [], missing: [], limitations: [
    ar ? 'الفحص أولي ويشمل الحموضة والحرارة التاريخية فقط. ليس توصية زراعة كاملة.' : 'The provisional screen covers pH and historical temperature only. It is not a complete planting recommendation.',
    ar ? 'فترة الواجهة ليست موسماً زراعياً مثبتاً. البيانات التاريخية ليست توقعات جوية.' : 'The interface window is not a validated growing season. Historical estimates are not a forecast.',
    ar ? 'إمدادات المياه والأمطار الفعالة وملاءمة الري غير معروفة؛ يلزم ميزان مائي ومراجعة محلية.' : 'Water supply, effective rainfall and irrigation suitability are unknown; a root-zone balance and local review are required.'
  ], snapshot: { workspaceVersion: version, computedAt: now, climateYear: request.climateYear, season: request.season } }
  const add = (id: string, category: EvidenceCategory, en: string, arabic: string, value: string, sourceIds: string[] = []) => { context.evidence.push({ id, category, label: ar ? arabic : en, value, sourceIds }) }
  const missing = (en: string, arabic: string) => { context.missing.push(ar ? arabic : en) }
  const measured = field.soil.provenance === 'measured'
  add('soil-provenance', 'farmer', 'Soil provenance', 'مصدر بيانات التربة', ar ? measured ? 'أدخلها المزارع كقياسات؛ لم تتحقق AgriLumina من المختبر' : field.soil.provenance === 'estimated' ? 'تقديرات المزارع' : 'مصدر القياس غير مؤكد' : measured ? 'Farmer marked as measured; laboratory not verified by AgriLumina' : field.soil.provenance === 'estimated' ? 'Farmer estimate' : 'Measurement provenance unconfirmed')
  const soilEntries: [keyof Field['soil'], string, string, string][] = [
    ['ph', 'Soil pH', 'حموضة التربة', 'pH'], ['nitrogen', 'Soil nitrogen', 'نيتروجين التربة', 'mg/kg'],
    ['phosphorus', 'Soil phosphorus', 'فوسفور التربة', 'mg/kg'], ['potassium', 'Soil potassium', 'بوتاسيوم التربة', 'mg/kg'],
    ['organicMatter', 'Organic matter', 'المادة العضوية', '%'], ['salinity', 'Soil salinity entry', 'قيمة ملوحة التربة المدخلة', 'dS/m']
  ]
  for (const [key, en, arabic, unit] of soilEntries) {
    const v = field.soil[key]
    if (typeof v === 'number') add('soil-' + key, 'farmer', en, arabic, String(v) + ' ' + unit)
    else { add('soil-' + key, 'unknown', en, arabic, ar ? 'غير معروف' : 'Unknown'); missing(en + ' measurement or provenance.', 'قياس أو مصدر: ' + arabic) }
  }
  if (field.soil.texture) add('soil-texture', 'farmer', 'Soil texture', 'نسيج التربة', field.soil.texture)
  else missing('Validated soil texture.', 'نسيج التربة المثبت.')
  if (field.soil.sampleDate) add('soil-sample', 'farmer', 'Soil sampling date', 'تاريخ عينة التربة', field.soil.sampleDate)
  missing('Laboratory extraction methods, salinity extract type, drainage and nutrient interpretation.', 'طرق التحليل ونوع مستخلص الملوحة والصرف وتفسير العناصر الغذائية.')
  if (field.elevationM !== null && field.elevationM !== undefined) add('elevation', 'farmer', 'Entered elevation', 'الارتفاع المدخل', String(field.elevationM) + ' m')
  else missing('Field elevation for ETo.', 'ارتفاع الحقل لحساب ETo.')
  const waterLabel = ar ? ({ rainfed: 'بعلي', limited: 'محدود', reliable: 'موثوق حسب المزارع' }[field.water]) : field.water
  add('water-label', 'farmer', 'Qualitative water entry', 'وصف توفر المياه', waterLabel)
  add('water-supply', 'unknown', 'Available irrigation volume', 'كمية المياه المتاحة للري', ar ? 'غير معروفة؛ الوصف النوعي ليس حجماً مقاساً' : 'Unknown; the qualitative label is not a measured supply')
  missing('Measured available water, water quality, irrigation efficiency and effective rainfall.', 'كمية المياه المقاسة ونوعيتها وكفاءة الري والأمطار الفعالة.')
  add('rotation-history', 'farmer', 'Recognized crop history', 'سجل المحاصيل المعروفة', field.previousCrops.length ? field.previousCrops.map(h => h.cropId + ' / ' + h.season + ' / ' + h.year).join('; ') : ar ? 'لا يوجد سجل معروف' : 'No recognized history', ['rotation'])
  missing('Cultivar, locally validated sowing dates and disease-specific rotation history.', 'الصنف ومواعيد الزراعة المثبتة محلياً وسجل أمراض الدورة الزراعية.')
  add('saved-analysis', 'calculated', 'Saved analysis handling', 'التعامل مع التحليلات المحفوظة', String(savedAnalyses) + (ar ? ' لقطات في هذا الحساب؛ القيم القديمة غير موثوقة كحسابات خادم ولم تُستخدم. أُعيد الحساب من المدخلات الحالية.' : ' account snapshots; old browser-saved values are not trusted as server calculations and are withheld. Current inputs are recomputed.'))
  add('overall-suitability', 'unknown', 'Overall crop suitability', 'الملاءمة الزراعية الشاملة', ar ? 'أدلة غير كافية' : 'Insufficient evidence')
  for (const [id, r] of Object.entries(ecocropScreenRequirements)) add('range-' + id, 'reference', 'Reference ranges: ' + id, 'المجالات المرجعية: ' + id, 'pH [' + r.ph.join(', ') + ']; °C [' + r.temperature.join(', ') + ']; absolute min / optimal min / optimal max / absolute max', ['ecocrop-' + id])
  if (climate) {
    for (const m of climate.monthly) add('climate-' + m.month, 'nasa', m.month + ' historical mean / rainfall', m.month + ' المتوسط التاريخي / المطر', m.temperature.toFixed(2) + ' °C; ' + m.rainfall.toFixed(1) + ' mm/month', ['nasa-power', 'nasa-method'])
    add('climate-period', 'nasa', 'NASA period and retrieval', 'فترة ناسا وتاريخ الاسترجاع', request.climateYear + '-01-01 / ' + request.climateYear + '-12-31; ' + climate.retrievedAt, ['nasa-power'])
    const screen = screenCrops(field, climate, request.season)
    for (const item of screen.ranked) add('screen-' + item.crop.id, 'calculated', 'Provisional screen: ' + item.crop.name, 'الفحص الأولي: ' + item.crop.name, 'score ' + item.score + '/100; pH ' + item.phScore + '/100; temperature ' + item.temperatureScore + '/100; limiting ' + item.limitingMonth + ' ' + item.limitingTemperature + ' °C; low confidence', ['ecocrop-' + item.crop.id, 'nasa-power'])
    for (const item of screen.excluded) add('excluded-' + item.crop.id, 'calculated', 'Screen excluded: ' + item.crop.name, 'استبعاد بالفحص: ' + item.crop.name, ar ? 'عند أو خارج المجال المطلق للحموضة أو الحرارة؛ ليس حكماً نهائياً على المحصول' : 'At/outside absolute pH or temperature range; not a complete crop verdict', ['ecocrop-' + item.crop.id, 'nasa-power'])
    context.limitations.push(...screen.unavailable)
  } else {
    add('climate-unavailable', 'unknown', 'NASA historical climate', 'المناخ التاريخي من ناسا', ar ? 'تعذر استرجاع بيانات صالحة؛ لم تستعمل قيم بديلة' : 'Validated historical data unavailable; no substitute values used')
    missing('Validated NASA historical climate; no crop screen can be produced.', 'بيانات ناسا التاريخية الصالحة؛ لا يمكن إصدار فحص محاصيل.')
  }
  const period = screeningPeriod(request)
  const expectedDates = datesBetween(period.start, period.end)
  if (water && (water.start !== period.start || water.end !== period.end || water.days.length !== expectedDates.length || water.days.some((d, i) => d.date !== expectedDates[i]))) water = null
  const eto = water?.days.map(d => d.eto.status === 'ok' ? d.eto.mmPerDay : null) ?? []
  const total = eto.length > 0 && eto.every(v => v !== null) ? eto.reduce<number>((sum, v) => sum + v!, 0) : null
  add('eto', total === null ? 'unknown' : 'calculated', 'FAO reference ETo for interface period', 'ETo المرجعي لفترة الواجهة', total === null ? ar ? 'غير معروف للفترة الكاملة؛ راجع الارتفاع ومدخلات الطقس اليومية' : 'Unknown for the complete period; review elevation and daily weather inputs' : total.toFixed(1) + ' mm; ' + period.start + ' / ' + period.end + '; NASA retrieved ' + water!.retrievedAt, ['fao-eto', 'nasa-method'])
  const growth = completeGrowthProfile(field.waterInputs?.growth)
  const ets = water && growth ? water.days.map(d => standardCropEt(d.eto.status === 'ok' ? d.eto.mmPerDay : null, cropKcOnDate(growth, d.date))) : []
  const etc = ets.length > 0 && ets.every(v => v !== null) ? ets.reduce<number>((sum, v) => sum + v!, 0) : null
  add('etc', etc === null ? 'unknown' : 'calculated', 'Standard-condition crop ETc', 'ETc للمحصول بالظروف القياسية', etc === null ? ar ? 'غير معروف؛ يلزم منحنى نمو ومعامل محصول موثق يغطي كامل الفترة' : 'Unknown; requires a complete sourced growth/Kc profile covering the whole period' : growth!.cropId + ': ' + etc.toFixed(1) + ' mm; ' + period.start + ' / ' + period.end + (ar ? '؛ بمعاملات المزارع غير المثبتة مستقلاً' : '; farmer-supplied coefficients not independently validated'), ['fao-kc'])
  if (total === null) missing('Complete quality-checked daily weather and elevation for full-period ETo.', 'طقس يومي صالح وارتفاع لحساب ETo لكامل الفترة.')
  if (etc === null) missing('Sourced crop stage durations, planting date and Kc coefficients covering the period.', 'مدد مراحل النمو وتاريخ الزراعة ومعاملات Kc موثقة تغطي الفترة.')
  if (growth) add('growth-profile', 'farmer', 'Entered crop-stage profile', 'مراحل النمو المدخلة', growth.cropId + '; planted ' + growth.plantedOn + '; stage days [' + [growth.initialDays, growth.developmentDays, growth.midDays, growth.lateDays].join(', ') + ']; Kc [' + [growth.kcInitial, growth.kcMid, growth.kcEnd].join(', ') + ']; source recorded but not independently validated', ['fao-kc'])
  const w = field.waterInputs
  const scheduleCovered = w && w.scheduleKind !== 'unknown' && !!w.scheduleStart && !!w.scheduleEnd && w.scheduleStart <= period.start && w.scheduleEnd >= period.end
  const applied = scheduleCovered ? w.irrigationEvents.filter(e => e.date >= period.start && e.date <= period.end).reduce((sum, e) => sum + e.appliedMm, 0) : null
  add('applied-irrigation', applied === null ? 'unknown' : 'farmer',
    w?.scheduleKind === 'planned' ? 'Planned applied irrigation' : 'Recorded applied irrigation',
    w?.scheduleKind === 'planned' ? 'الري المخطط تطبيقه' : 'الري المسجل تطبيقه',
    applied === null ? ar ? 'غير معروف؛ يلزم سجل مؤرخ يغطي الفترة' : 'Unknown; a dated schedule covering the period is required'
      : applied.toFixed(1) + ' mm; ' + period.start + ' / ' + period.end + (ar ? '؛ حسب تغطية السجل التي أعلنها المزارع؛ ليس إمداداً متاحاً أو تسرباً صافياً' : '; farmer-declared schedule coverage; not available supply or net infiltration'))
  for (const [key, en, arabic, unit] of [
    ['fieldCapacityPercent', 'Field capacity', 'السعة الحقلية', '%'], ['wiltingPointPercent', 'Wilting point', 'نقطة الذبول', '%'],
    ['rootDepthM', 'Root depth', 'عمق الجذور', 'm'], ['initialDepletionMm', 'Initial root-zone depletion', 'النقص المائي الابتدائي', 'mm']
  ] as const) if (w && w[key] !== null) add('water-' + key, 'farmer', en, arabic, String(w[key]) + ' ' + unit)
  missing('Reviewed root-zone capacity and daily runoff, net infiltration, capillary rise, drainage and actual crop water use.', 'سعة منطقة الجذور والتدفقات اليومية للجريان والتسرب والصعود الشعري والصرف والاستهلاك الفعلي، مع مراجعة محلية.')
  if (water?.days.some(d => d.eto.status === 'ok' && d.eto.warnings.length)) context.limitations.push(ar ? 'قُيدت بعض نسب الإشعاع حسب طريقة الفاو.' : 'Some solar-to-clear-sky radiation ratios were capped by the FAO method.')
  return context
}
