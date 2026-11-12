import type { ClimateData, Field } from '../types';

/** Entirely simulated examples. These values are not NASA observations or soil tests. */
export const demoClimate: ClimateData = {
  source: 'demo',
  year: 2025,
  monthly: [
    { month: 'Jan', temperature: 6.2, rainfall: 105, solar: 2.6 },
    { month: 'Feb', temperature: 7.8, rainfall: 84, solar: 3.4 },
    { month: 'Mar', temperature: 11.4, rainfall: 67, solar: 4.6 },
    { month: 'Apr', temperature: 15.8, rainfall: 35, solar: 5.7 },
    { month: 'May', temperature: 20.4, rainfall: 14, solar: 6.7 },
    { month: 'Jun', temperature: 24.1, rainfall: 3, solar: 7.8 },
    { month: 'Jul', temperature: 26.7, rainfall: 0, solar: 8.1 },
    { month: 'Aug', temperature: 26.3, rainfall: 1, solar: 7.4 },
    { month: 'Sep', temperature: 23.1, rainfall: 6, solar: 6.1 },
    { month: 'Oct', temperature: 18.2, rainfall: 34, solar: 4.5 },
    { month: 'Nov', temperature: 12.2, rainfall: 61, solar: 3.1 },
    { month: 'Dec', temperature: 7.6, rainfall: 98, solar: 2.4 },
  ],
};

export const demoFields: Field[] = [
  { id: 'north-field', name: 'North Field', location: 'Zahlé, Bekaa Valley', area: 4.2, latitude: 33.8467, longitude: 35.9019, soil: { ph: 6.8, nitrogen: 28, phosphorus: 22, potassium: 165, organicMatter: 2.8 }, water: 'limited', previousCrops: [{ cropId: 'wheat', season: 'Autumn', year: 2025 }, { cropId: 'tomato', season: 'Spring', year: 2026 }], priorities: ['soil-health', 'water-saving'], image: '/images/field-1.jpg' },
  { id: 'riverside', name: 'Riverside Plot', location: 'Chtaura, Bekaa Valley', area: 2.8, latitude: 33.8183, longitude: 35.8547, soil: { ph: 7.2, nitrogen: 42, phosphorus: 28, potassium: 185, organicMatter: 3.4 }, water: 'reliable', previousCrops: [{ cropId: 'barley', season: 'Autumn', year: 2025 }, { cropId: 'chickpea', season: 'Spring', year: 2026 }], priorities: ['profitability', 'soil-health'], image: '/images/field-2.jpg' },
  { id: 'hilltop', name: 'Hilltop Field', location: 'Rayak, Bekaa Valley', area: 5.5, latitude: 33.8494, longitude: 35.9872, soil: { ph: 7.5, nitrogen: 19, phosphorus: 16, potassium: 125, organicMatter: 1.9 }, water: 'rainfed', previousCrops: [{ cropId: 'potato', season: 'Spring', year: 2025 }, { cropId: 'wheat', season: 'Autumn', year: 2025 }], priorities: ['water-saving', 'soil-health'], image: '/images/field-3.jpg' },
];
