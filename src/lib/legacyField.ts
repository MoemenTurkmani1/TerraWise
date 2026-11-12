import type { Field } from '../types'

/** Edited starter records may contain simulated inputs until reviewed. */
export function needsLegacyReview(field: Field): boolean {
  return ['north-field', 'riverside', 'hilltop'].includes(field.id) && field.reviewedRealData !== true
}
