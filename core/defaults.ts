import type { DiscoveryInputs, Params } from './types.js';

/**
 * Autonomous-side defaults.
 *
 * Every one of these is a placeholder. None is derived from real commercial data,
 * none is an industry benchmark, and all must be replaced with real figures before
 * this model is shown to a customer. The README and the web app footer both say so.
 */
export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  dockHours: 24,
  dockDays: 365,
  subFactor: 1.0,
  dockCost: 45_000,
  opCost: 80_000,
  ratioNow: 4,
  ratioScale: 6,
  implCost: 250_000,
  currency: 'USD',
});

/**
 * Discovery defaults.
 *
 * These populate the batch fixture and the reset-to-defaults control. The web app
 * itself pre-fills nothing on the discovery side — the customer's own numbers
 * produce the baseline, which is the entire point of the exercise.
 */
export const DEFAULT_DISCOVERY: Readonly<Required<Pick<DiscoveryInputs,
  'area' | 'resources' | 'salary' | 'targetArea' | 'shiftHours' | 'workDays'>>> = Object.freeze({
  area: 60_000,
  resources: 100,
  salary: 80_000,
  targetArea: 120_000,
  shiftHours: 8,
  workDays: 300,
});

/** The docks-per-operator ratios swept by the sensitivity table. */
export const SENSITIVITY_RATIOS: readonly number[] = Object.freeze([2, 4, 6, 8]);

/** Default area unit, used for labelling only. The model is dimensionless. */
export const DEFAULT_AREA_UNIT = 'sq ft';

/**
 * Scale factors outside this band are warned about but still priced.
 *
 * The band catches a unit mismatch — square feet against acres is a factor near
 * 43,560 — without refusing a genuine tenfold expansion, which is a real scenario.
 */
export const SCALE_FACTOR_MIN = 0.1;
export const SCALE_FACTOR_MAX = 50;
