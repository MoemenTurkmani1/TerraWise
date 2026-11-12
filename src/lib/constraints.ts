import type { ConstraintResult, Recommendation } from '../types'

/** A known conclusion requires an explicitly reviewed, applicable rule.
 * This framework supplies no crop thresholds or claims of scientific review. */
export function evaluateConstraint(input: {
  id: string
  conclusion: 'compatible' | 'incompatible' | 'unknown'
  explanation: string
  reviewedRuleId?: string
}): ConstraintResult {
  const reviewedRuleId = input.reviewedRuleId?.trim()
  if (!reviewedRuleId || input.conclusion === 'unknown') {
    return { id: input.id, status: 'unknown', explanation: input.explanation }
  }
  return { id: input.id, status: input.conclusion, explanation: input.explanation, reviewedRuleId }
}

export function constraintDecision(constraints: ConstraintResult[]): 'eligible' | 'ineligible' | 'insufficient_evidence' {
  if (constraints.some(item => item.status === 'incompatible' && !!item.reviewedRuleId?.trim())) return 'ineligible'
  if (!constraints.length || constraints.some(item => item.status !== 'compatible' || !item.reviewedRuleId?.trim() || !item.id.trim() || !item.explanation.trim())) return 'insufficient_evidence'
  return 'eligible'
}

/** Candidates must have the same known factors and approved weights; no
 * renormalization, missing-factor substitution, or fabricated filler crops. */
function isRankable(item: Recommendation): boolean {
  if (item.decision !== 'eligible' || item.score === null || !Number.isFinite(item.score) || !item.constraints || constraintDecision(item.constraints) !== 'eligible' || !item.factors.length) return false
  if (!item.factors.every(f => f.score !== null && Number.isFinite(f.score) && f.score >= 0 && f.score <= 100 && Number.isFinite(f.weight) && f.weight >= 0 && f.weight <= 1)) return false
  if (Math.abs(item.factors.reduce((sum, f) => sum + f.weight, 0) - 1) > 0.000001) return false
  return item.score === Math.round(item.factors.reduce((sum, f) => sum + f.score! * f.weight, 0))
}

export function rankEligible(candidates: Recommendation[]): Recommendation[] {
  const eligible = candidates.filter(isRankable)
  if (!eligible.length) return []
  const signature = (item: Recommendation) => JSON.stringify(item.factors.map(f => [f.name, f.weight]))
  const common = signature(eligible[0])
  // Refuse a mixed-evidence ranking rather than silently picking a denominator.
  if (eligible.some(item => signature(item) !== common)) return []
  return eligible.slice().sort((a, b) => b.score! - a.score! || a.crop.name.localeCompare(b.crop.name)).slice(0, 4)
}

/** Compare only actual factor values; no ordering is asserted for incomplete
 * candidates or a mismatch in the factor set. */
export function compareEvidence(a: Recommendation, b: Recommendation): string[] {
  const comparisons = a.factors.flatMap(left => {
    const right = b.factors.find(factor => factor.name === left.name)
    if (!right || left.score === null || right.score === null) return []
    const difference = left.score - right.score
    return [`${left.name}: ${a.crop.name} ${left.score}/100; ${b.crop.name} ${right.score}/100 (${difference === 0 ? 'equal' : `${Math.abs(difference)} points ${difference > 0 ? 'higher' : 'lower'} for ${a.crop.name}`}).`]
  })
  if (!isRankable(a) || !isRankable(b) || a.score === null || b.score === null) {
    return ['Overall ranking is unavailable: critical evidence or reviewed rules are missing.', ...comparisons]
  }
  if (JSON.stringify(a.factors.map(f => [f.name, f.weight])) !== JSON.stringify(b.factors.map(f => [f.name, f.weight]))) return ['Overall ranking is unavailable: factor evidence is not comparable.', ...comparisons]
  return [`${a.crop.name} ${a.score === b.score ? 'ties' : a.score > b.score ? 'ranks above' : 'ranks below'} ${b.crop.name} by ${Math.abs(a.score - b.score)} overall points.`, ...comparisons]
}
