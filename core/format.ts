import { roundHalfUp } from './round.js';

/**
 * Display formatting. Nothing in this module ever feeds a calculation.
 *
 * `calc.ts` does not import from here, by design. Every rounding decision below
 * is about how a number is shown to a customer, never about what it is.
 */

/** Shown wherever a required answer is missing. Never a zero, never a bare dash. */
export const INCOMPLETE = 'model incomplete';

/** Shown where the model genuinely has no payback to report. */
export const NO_PAYBACK = 'no payback at these inputs';

export function formatCurrency(x: number | null, currency = 'USD', dp = 0): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(roundHalfUp(x, dp));
}

/** Percentages carry one decimal place, 22.8%, 20.5%. */
export function formatPercent(x: number | null, dp = 1): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return `${roundHalfUp(x * 100, dp).toFixed(dp)}%`;
}

/** Return on spend carries no decimal place, 340%. */
export function formatReturn(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return `${roundHalfUp(x * 100, 0).toFixed(0)}%`;
}

export function formatMonths(x: number | null): string {
  if (x === null) return NO_PAYBACK;
  if (!Number.isFinite(x)) return INCOMPLETE;
  return roundHalfUp(x, 1).toFixed(1);
}

export function formatMultiple(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return `${roundHalfUp(x, 1).toFixed(1)}x`;
}

export function formatCount(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return roundHalfUp(x, 0).toLocaleString('en-US');
}

/**
 * Fractional resources are shown to two decimal places with the fraction visible.
 * The treatment is deliberate and is not hidden behind a rounded display.
 */
export function formatResources(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return roundHalfUp(x, 2).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatHours(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return roundHalfUp(x, 0).toLocaleString('en-US');
}

export function formatRate(x: number | null, currency = 'USD'): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return formatCurrency(x, currency, 2);
}

export function formatFactor(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return INCOMPLETE;
  return roundHalfUp(x, 4).toString();
}
