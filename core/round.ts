/**
 * The only rounding in the engine.
 *
 * Two rules live here and nowhere else:
 *
 *   `ceilCount` — anything we buy or hire rounds up. Docks are a purchase,
 *   operators are a hire. Anything we extrapolate about the customer stays
 *   continuous, so scaled resources never pass through this function.
 *
 *   `roundHalfUp` — display only. `calc.ts` must never import from this module
 *   for anything other than `ceilCount`; display rounding feeding back into
 *   arithmetic is how audit tables stop reconciling.
 */

/**
 * Relative tolerance for the ceiling. Guards the case where a quotient that is
 * mathematically a whole number lands a few ulps above it in binary floating
 * point — without that guard, 3.0000000000000004 docks would be purchased as 4.
 *
 * Relative rather than absolute, so it stays meaningful across the whole range
 * of dock counts. True fractional parts in this model are many orders of
 * magnitude larger than this.
 */
const CEIL_REL_EPS = 1e-12;

/**
 * Absolute tolerance for half-up display rounding.
 *
 * Necessary because the two headline percentages in this model sit exactly on a
 * half-way boundary and neither is representable in binary. 8760/2400 stores as
 * 3.6499999999999999112, so a naive round-half-up renders it 3.6 where the model
 * requires 3.7. Values within this tolerance of .5 round up.
 */
const HALF_UP_EPS = 1e-9;

/**
 * Round up to a whole unit of something we procure.
 *
 * Returns 0 for non-positive input rather than a negative count — a negative
 * dock count is not a thing, and validation rejects the inputs that would
 * produce one before this is ever reached.
 */
export function ceilCount(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (x <= 0) return 0;
  return Math.ceil(x - Math.abs(x) * CEIL_REL_EPS);
}

/**
 * Round half away from zero to `dp` decimal places, for display.
 *
 * Away from zero rather than toward positive infinity, so a negative return
 * percentage rounds symmetrically with its positive counterpart.
 */
export function roundHalfUp(x: number, dp = 0): number {
  if (!Number.isFinite(x)) return Number.NaN;
  const factor = 10 ** dp;
  const sign = x < 0 ? -1 : 1;
  const scaled = Math.abs(x) * factor;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const rounded = frac >= 0.5 - HALF_UP_EPS ? floor + 1 : floor;
  return (sign * rounded) / factor;
}

/** Round to the cent. Used by the parity test to compare monetary values. */
export function toCents(x: number): number {
  return roundHalfUp(x, 2);
}
