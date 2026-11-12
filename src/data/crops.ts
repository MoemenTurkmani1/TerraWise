import type { Crop } from '../types';

/** Starter reference ranges are deliberately broad, configurable, and uncalibrated.
 * These preliminary rules support northern Mediterranean exploration, not planting prescriptions.
 */
const starterCrops: Crop[] = [
  { id: 'chickpea', name: 'Chickpea', family: 'Fabaceae', type: 'Legume', image: '/images/chickpea.jpg', waterNeed: 'low', ph: [6, 8], temperature: [10, 25], seasons: ['Spring', 'Autumn'], nutrients: { nitrogen: 15, phosphorus: 20, potassium: 100 }, fixesNitrogen: true, description: 'A water-conscious legume that can support nitrogen cycling when properly inoculated.' },
  { id: 'wheat', name: 'Durum wheat', family: 'Poaceae', type: 'Cereal', image: '/images/wheat.jpg', waterNeed: 'medium', ph: [6, 8], temperature: [8, 24], seasons: ['Autumn', 'Spring'], nutrients: { nitrogen: 40, phosphorus: 20, potassium: 120 }, fixesNitrogen: false, description: 'A familiar cereal that provides a useful rotation break after broadleaf crops.' },
  { id: 'lentil', name: 'Lentil', family: 'Fabaceae', type: 'Legume', image: '/images/lentil.jpg', waterNeed: 'low', ph: [6, 8], temperature: [8, 24], seasons: ['Autumn', 'Spring'], nutrients: { nitrogen: 15, phosphorus: 20, potassium: 100 }, fixesNitrogen: true, description: 'A cool-season pulse suited to modest water availability and well-drained soils.' },
  { id: 'barley', name: 'Barley', family: 'Poaceae', type: 'Cereal', image: '/images/barley.jpg', waterNeed: 'low', ph: [6, 8.5], temperature: [7, 25], seasons: ['Autumn', 'Spring'], nutrients: { nitrogen: 30, phosphorus: 18, potassium: 100 }, fixesNitrogen: false, description: 'A resilient cereal option with relatively modest water requirements.' },
  { id: 'tomato', name: 'Tomato', family: 'Solanaceae', type: 'Vegetable', image: '/images/tomato.jpg', waterNeed: 'high', ph: [6, 7.5], temperature: [18, 30], seasons: ['Spring'], nutrients: { nitrogen: 45, phosphorus: 25, potassium: 180 }, fixesNitrogen: false, description: 'A warm-season crop that needs dependable irrigation and close nutrient management.' },
  { id: 'potato', name: 'Potato', family: 'Solanaceae', type: 'Vegetable', image: '/images/potato.jpg', waterNeed: 'high', ph: [5, 6.5], temperature: [12, 24], seasons: ['Spring'], nutrients: { nitrogen: 40, phosphorus: 25, potassium: 180 }, fixesNitrogen: false, description: 'A demanding tuber crop; avoid following other nightshades and confirm local disease risks.' },
  { id: 'sunflower', name: 'Sunflower', family: 'Asteraceae', type: 'Oilseed', image: '/images/sunflower.jpg', waterNeed: 'medium', ph: [6, 8], temperature: [18, 30], seasons: ['Spring'], nutrients: { nitrogen: 30, phosphorus: 20, potassium: 130 }, fixesNitrogen: false, description: 'A warm-season broadleaf break crop; yield depends on water timing and establishment.' },
  { id: 'fava', name: 'Fava bean', family: 'Fabaceae', type: 'Legume', image: '/images/fava.jpg', waterNeed: 'medium', ph: [6, 8], temperature: [8, 22], seasons: ['Autumn', 'Spring'], nutrients: { nitrogen: 15, phosphorus: 22, potassium: 120 }, fixesNitrogen: true, description: 'A cool-season legume with soil-building potential when residues are returned.' },
];

// Kew verifies the botanical names; the extension source discusses general
// family rotation. Neither source validates these starter numeric thresholds.
const metadata: Record<string, { name: string; url: string }> = {
  chickpea: { name: 'Cicer arietinum', url: 'https://powo.science.kew.org/taxon/486336-1' },
  wheat: { name: 'Triticum turgidum subsp. durum', url: 'https://powo.science.kew.org/taxon/77188896-1' },
  lentil: { name: 'Vicia lens (syn. Lens culinaris)', url: 'https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A30001819-2' },
  barley: { name: 'Hordeum vulgare', url: 'https://powo.science.kew.org/taxon/405391-1' },
  tomato: { name: 'Solanum lycopersicum', url: 'https://powo.science.kew.org/taxon/316947-2' },
  potato: { name: 'Solanum tuberosum', url: 'https://powo.science.kew.org/taxon/821337-1' },
  sunflower: { name: 'Helianthus annuus', url: 'https://powo.science.kew.org/taxon/119003-2' },
  fava: { name: 'Vicia faba', url: 'https://powo.science.kew.org/taxon/524737-1' },
};

export const crops: Crop[] = starterCrops.map(crop => ({
  ...crop,
  scientificName: metadata[crop.id].name,
  soilNotes: 'Illustrative pH and nutrient screens only. Texture, drainage, salinity and local laboratory methods require review.',
  durationNotes: 'Duration and planting dates vary with cultivar and location; crop overlaps are not modeled.',
  diseaseNotes: crop.family === 'Poaceae'
    ? 'Wheat and barley share some soilborne disease risks. Check local disease history and crop-specific return intervals.'
    : crop.id === 'sunflower'
      ? 'Some diseases can affect unrelated hosts, including sunflower and certain other broadleaf crops; check local disease history.'
      : crop.family === 'Solanaceae'
        ? 'Tomato and potato belong to the same family. Review shared pests and disease-specific return intervals locally.'
        : 'Legumes can share pest or disease risks. Check the recorded crop history and locally recommended return intervals.',
  geographicApplicability: 'Illustrative northern Mediterranean planting windows; not validated for other regions.',
  referenceUpdated: '2026-11-11',
  references: [
    { title: 'Kew Plants of the World Online: botanical identification', url: metadata[crop.id].url },
    { title: 'University of Minnesota Extension: crop-family rotation (Minnesota)', url: 'https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/living-soil-healthy-garden' },
    { title: 'University of Minnesota Extension: small-grain rotation and shared hosts (Minnesota)', url: 'https://extension.umn.edu/agriculture/crop-production/small-grains/small-grain-crop-rotations' },
    { title: 'FAO: crop diversification and rotation principles', url: 'https://www.fao.org/conservation-agriculture/in-practice/species-diversification/en/' },
    { title: 'FAO: indicative crop water needs and limitations', url: 'https://www.fao.org/4/S2022E/s2022e07.htm' },
    { title: 'University of Minnesota Extension: interpreting soil-test indexes and methods', url: 'https://extension.umn.edu/agriculture/crop-production/nutrient-management-for-minnesota-crops/understanding-the-soil-test-report' },
  ],
}));
