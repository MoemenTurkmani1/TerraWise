/** FAO ECOCROP species-level descriptive ranges, transcribed 12 Nov 2026.
 * Order: absolute minimum, optimal minimum, optimal maximum, absolute maximum.
 * They are broad screening ranges, not region/cultivar-validated limits. */
export type EcologicalRange = readonly [number, number, number, number]
export interface EcocropScreenRequirement {
  ph: EcologicalRange
  temperature: EcologicalRange
  source: string
  scientificName: string
}

export const ecocropScreenRequirements: Readonly<Record<string, EcocropScreenRequirement>> = {
  chickpea: { ph: [4.7, 6, 8.5, 9.5], temperature: [7, 15, 29, 35], scientificName: 'Cicer arietinum', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2479' },
  wheat: { ph: [5.5, 6, 7, 8.5], temperature: [6, 17, 25, 30], scientificName: 'Triticum durum', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=10582' },
  lentil: { ph: [4.5, 5.5, 7.5, 8.2], temperature: [5, 15, 29, 32], scientificName: 'Lens culinaris', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=7209' },
  barley: { ph: [6, 6.5, 7.5, 8], temperature: [2, 15, 20, 40], scientificName: 'Hordeum vulgare', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1232' },
  tomato: { ph: [5, 5.5, 6.8, 7.5], temperature: [7, 20, 27, 35], scientificName: 'Lycopersicon esculentum', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1379' },
  potato: { ph: [4.2, 5, 6.2, 8.5], temperature: [7, 15, 25, 30], scientificName: 'Solanum tuberosum', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1971' },
  sunflower: { ph: [5.5, 6, 7.5, 8], temperature: [5, 17, 34, 45], scientificName: 'Helianthus annuus', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1191' },
  fava: { ph: [4.5, 6, 7, 8.6], temperature: [5, 18, 28, 32], scientificName: 'Vicia faba', source: 'https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2146' },
}
