/** FAO-56 table 12 reference values are not locally calibrated defaults.
 * Ranges remain ranges; no frozen-soil, maturity or wetting condition is assumed. */
export interface CropWaterReference {
  cropId: string
  stages: readonly ['initial', 'development', 'mid', 'late']
  kcInitial: readonly [number, number] | null
  kcMid: readonly [number, number] | null
  kcEnd: readonly [number, number] | null
  source: string
  limitations: string
}
export const cropWaterReferences: Readonly<Record<string, CropWaterReference>> = {
  wheat: {
    cropId: 'wheat', stages: ['initial', 'development', 'mid', 'late'],
    kcInitial: [0.4, 0.7], kcMid: [1.15, 1.15], kcEnd: [0.25, 0.4],
    source: 'https://www.fao.org/4/X0490E/x0490e0b.htm',
    limitations: 'FAO-56 winter wheat table: initial depends on frozen soil; end varies with harvest/moisture. Values require local climate and wetting adjustments; not auto-selected.',
  },
}
