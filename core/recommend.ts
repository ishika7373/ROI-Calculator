import type { Tier } from './types.js';

/**
 * The recommendation rule. Deterministic, stated in the README, never improvised.
 *
 * These are rule-derived assessments of what the model shows at the inputs given.
 * They are not guarantees, forecasts or predictions of outcome.
 */
export const TIER_TEXT: Readonly<Record<Tier, string>> = Object.freeze({
  strong: 'Strong case, proceed to scoped study',
  viable: 'Viable, validate assumptions on site',
  'no-standalone': 'Labour case does not stand alone at these inputs',
  marginal: 'Marginal on labour alone, requires additional value pools to justify',
});

/** Ranking used only to decide whether the target scenario improves on the current one. */
const TIER_RANK: Readonly<Record<Tier, number>> = Object.freeze({
  strong: 3,
  viable: 2,
  marginal: 1,
  'no-standalone': 0,
});

export function tierRank(tier: Tier): number {
  return TIER_RANK[tier];
}

/**
 * Evaluation order matters and is fixed:
 *
 *   1. costRatio <= 0.35 AND paybackMonths <= 12  -> strong
 *   2. costRatio <= 0.60 AND paybackMonths <= 24  -> viable
 *   3. costRatio >= 1.0                           -> no standalone labour case
 *   4. otherwise                                  -> marginal
 *
 * Both conditions are required in tiers 1 and 2 — not either. A null payback means
 * the model does not save money, which implies a cost ratio at or above 1.0, so
 * such a row falls to tier 3 rather than qualifying on cost ratio alone.
 */
export function tierFor(costRatio: number, paybackMonths: number | null): Tier {
  if (!Number.isFinite(costRatio)) return 'marginal';

  if (paybackMonths !== null && costRatio <= 0.35 && paybackMonths <= 12) return 'strong';
  if (paybackMonths !== null && costRatio <= 0.6 && paybackMonths <= 24) return 'viable';
  if (costRatio >= 1.0) return 'no-standalone';
  return 'marginal';
}

export function recommendationFor(tier: Tier): string {
  return TIER_TEXT[tier];
}
