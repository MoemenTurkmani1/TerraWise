export type WaterAvailability = 'rainfed' | 'limited' | 'reliable';
export type Priority = 'soil-health' | 'water-saving' | 'profitability' | 'production' | 'risk-reduction';
/** demo is retained only to recognize older saved records; new results never use it. */
export type DataSource = 'demo' | 'nasa-power' | 'unavailable';
export type InputProvenance = 'measured' | 'estimated' | 'unknown';

export interface FieldWaterInputs {
  fieldCapacityPercent: number | null;
  wiltingPointPercent: number | null;
  rootDepthM: number | null;
  initialDepletionMm: number | null;
  scheduleKind: 'unknown' | 'actual' | 'planned';
  scheduleStart: string;
  scheduleEnd: string;
  irrigationEvents: { date: string; appliedMm: number }[];
  growth: {
    cropId: string; plantedOn: string; source: string;
    initialDays: number | null; developmentDays: number | null; midDays: number | null; lateDays: number | null;
    kcInitial: number | null; kcMid: number | null; kcEnd: number | null;
  };
}
export interface Field {
  id: string;
  name: string;
  location: string;
  area: number;
  latitude: number;
  longitude: number;
  country?: string;
  areaUnit?: 'ha' | 'acre';
  elevationM?: number | null;
  locationSource?: 'manual' | 'map' | 'gps';
  soilType?: string;
  archived?: boolean;
  /** Explicit confirmation required when an edited legacy starter field is reused. */
  reviewedRealData?: boolean;
  soil: {
    ph: number | null;
    nitrogen: number | null;
    phosphorus: number | null;
    potassium: number | null;
    organicMatter: number | null;
    salinity?: number | null;
    texture?: string;
    sampleDate?: string;
    sampleDepthCm?: number | null;
    laboratory?: string;
    testMethod?: string;
    moisture?: number | null;
    provenance?: InputProvenance;
  };
  water: WaterAvailability;
  previousCrops: { cropId: string; season: string; year: number; plantedAt?: string; harvestedAt?: string; diseaseNotes?: string; residueManagement?: string }[];
  priorities: Priority[];
  irrigation?: { method: string; source: string; seasonalRestrictions: string };
  /** Optional user-entered data. Applied irrigation is not necessarily net infiltration. */
  waterInputs?: FieldWaterInputs;
  budget?: string;
  riskTolerance?: 'low' | 'medium' | 'high' | 'unknown';
  soilReport?: { id: string; filename: string; mimeType: string; size: number };
  image: string;
}

export interface ClimateMonth {
  month: string;
  temperature: number;
  /** Monthly precipitation total, millimetres. */
  rainfall: number;
  /** Daily average solar radiation, kWh/m²/day. */
  solar: number;
  /** Relative humidity, percent; absent where unavailable. */
  humidity?: number | null;
}

export interface ClimateProvenance {
  provider: 'NASA POWER';
  coordinates: { latitude: number; longitude: number };
  parameters: { code: string; unit: string; sourceUnit: string }[];
  period: { start: string; end: string };
  retrievedAt: string;
  quality: 'complete' | 'partial';
  missing: string[];
  cache: 'fresh' | 'cached';
}

export interface ClimateData {
  source: DataSource;
  year: number;
  monthly: ClimateMonth[];
  retrievedAt?: string;
  error?: string;
  provenance?: ClimateProvenance;
  /** Annual historical data, when an explicitly requested multi-year period is available. */
  history?: { year: number; monthly: ClimateMonth[] }[];
}

export interface Crop {
  id: string;
  name: string;
  family: string;
  type: string;
  image: string;
  waterNeed: 'low' | 'medium' | 'high';
  ph: [number, number];
  temperature: [number, number];
  seasons: string[];
  /** Illustrative sufficiency thresholds (mg/kg); not fertilizer prescriptions. */
  nutrients: { nitrogen: number; phosphorus: number; potassium: number };
  fixesNitrogen: boolean;
  description: string;
  scientificName?: string;
  soilNotes?: string;
  diseaseNotes?: string;
  durationNotes?: string;
  geographicApplicability?: string;
  referenceUpdated?: string;
  references?: { title: string; url: string }[];
}

export interface Recommendation {
  crop: Crop;
  /** Null means that an overall suitability score cannot be supported. */
  score: number | null;
  factors: { name: string; score: number | null; weight: number; explanation: string }[];
  reasons: string[];
  warnings: string[];
  missingInputs: string[];
  confidence: 'high' | 'medium' | 'low';
  dataSource: DataSource;
  /** Fraction of the seven core input categories supplied, not confidence or accuracy. */
  completeness?: number;
  /** Absent on older saved snapshots, which retain their original model. */
  decision?: 'eligible' | 'ineligible' | 'insufficient_evidence';
  constraints?: ConstraintResult[];
}

export interface ConstraintResult {
  id: string;
  status: 'compatible' | 'incompatible' | 'unknown';
  explanation: string;
  /** A reviewed, applicable rule identifier is required for a known result. */
  reviewedRuleId?: string;
}

export interface RotationStep {
  season: string;
  year: number;
  recommendation: Recommendation;
}
