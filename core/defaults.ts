import type { DiscoveryInputs, Params } from './types.js';

/**
 * Autonomous-side defaults.
 *
 * Every one of these is a placeholder. None is derived from real commercial data,
 * none is an industry benchmark, and all must be replaced with real figures before
 * this model is shown to a customer. The README and the web app footer both say so.
 */
export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  // Availability. The dock is installed on the asset and can in principle
  // operate at any hour, which is why the raw figure is 24 x 365.
  dockHours: 24,
  dockDays: 365,

  // Utilisation. What fraction of those 8,760 hours is actually productive.
  // Composed of three effects that multiply: weather and daylight limits on an
  // outdoor industrial site (~0.45), the battery charge duty cycle where a
  // drone flies roughly half of any given cycle (~0.5), and maintenance plus
  // connectivity downtime (~0.9). 0.45 x 0.5 x 0.9 is approximately 0.20, and
  // 0.25 is the mildly optimistic end of that range. This is the parameter that
  // stops one dock displacing 3.65 full-time people.
  utilisation: 0.25,

  // Addressable share. Aerial inspection reaches external visual and thermal
  // work: structures, flare stacks, tank exteriors, flowlines, roofs. It does
  // not reach confined space entry, ultrasonic thickness measurement, tactile
  // inspection, permit to work, or the reporting and planning around them.
  // A third of the programme is the defensible starting point.
  addressableShare: 0.35,

  // Substitution. Labour hours displaced per productive drone hour, held at
  // parity so utilisation and addressable share carry the argument rather than
  // being hidden inside a single fudge factor.
  subFactor: 1.0,

  // Annual cost to run one dock: platform subscription, maintenance, spares,
  // connectivity, and amortised hardware replacement.
  dockCost: 52_000,

  // Fully loaded annual cost of a certified remote pilot or operations analyst.
  opCost: 100_000,

  // Docks one operator can supervise. Lower today while procedures are new,
  // higher once the operation is mature and exception-based.
  ratioNow: 5,
  ratioScale: 7,

  // Implementation, split so it scales with the fleet. The base covers work
  // done once regardless of size: cloud and ERP integration, security review,
  // programme management, pilot. The per-dock figure covers work repeated for
  // every unit: site survey, civils and mounting, power and network, regulatory
  // and BVLOS approval, commissioning, and crew training.
  implBase: 175_000,
  implPerDock: 75_000,

  currency: 'USD',
});

/**
 * Discovery defaults.
 *
 * These populate the batch fixture and the reset-to-defaults control. The web app
 * itself pre-fills nothing on the discovery side, the customer's own numbers
 * produce the baseline, which is the entire point of the exercise.
 */
export const DEFAULT_DISCOVERY: Readonly<Required<Pick<DiscoveryInputs,
  'area' | 'resources' | 'salary' | 'targetArea' | 'shiftHours' | 'workDays'>>> = Object.freeze({
  // A large refinery's inspectable asset footprint, doubling under an expansion.
  area: 2_400_000,
  targetArea: 4_800_000,
  // A dedicated inspection and integrity crew, at a market fully loaded rate.
  resources: 40,
  salary: 120_000,
  // 250 working days, not 300: leave, training and turnaround shutdowns are real.
  shiftHours: 8,
  workDays: 250,
});

/** The docks-per-operator ratios swept by the sensitivity table. */
export const SENSITIVITY_RATIOS: readonly number[] = Object.freeze([3, 5, 7, 9]);

/**
 * The two-dimensional sensitivity grid.
 *
 * Utilisation and addressable share are the genuinely uncertain assumptions in
 * this model, and they are the two a customer engineer will push hardest on.
 * Every other parameter is either a commercial figure we can quote or a
 * discovery answer the customer gave us.
 */
export const SENSITIVITY_UTILISATION: readonly number[] = Object.freeze([0.15, 0.20, 0.25, 0.30, 0.35]);
export const SENSITIVITY_ADDRESSABLE: readonly number[] = Object.freeze([0.25, 0.30, 0.35, 0.40, 0.45]);

/** Payback bands used to colour the sensitivity grid, in months. */
export const PAYBACK_BANDS = Object.freeze({ strong: 12, viable: 24, marginal: 48 });

/** Default area unit, used for labelling only. The model is dimensionless. */
export const DEFAULT_AREA_UNIT = 'sq ft';

/**
 * Scale factors outside this band are warned about but still priced.
 *
 * The band catches a unit mismatch, square feet against acres is a factor near
 * 43,560, without refusing a genuine tenfold expansion, which is a real scenario.
 */
export const SCALE_FACTOR_MIN = 0.1;
export const SCALE_FACTOR_MAX = 50;


/**
 * The parameters as originally specified, before the model was calibrated
 * against real deployment economics.
 *
 * Utilisation and addressable share at 1.0 collapse the model back to its
 * original form, so the published acceptance figures remain provable. Kept so
 * the arithmetic can be verified independently of the calibration, not because
 * these numbers describe a real deployment. They do not: they imply a dock that
 * never stops and a manual programme that is entirely displaceable by a drone.
 */
export const UNCALIBRATED_PARAMS: Readonly<Params> = Object.freeze({
  dockHours: 24,
  dockDays: 365,
  utilisation: 1.0,
  addressableShare: 1.0,
  subFactor: 1.0,
  dockCost: 45_000,
  opCost: 80_000,
  ratioNow: 4,
  ratioScale: 6,
  implBase: 250_000,
  implPerDock: 0,
  currency: 'USD',
});

/** The discovery inputs the original acceptance figures were published against. */
export const UNCALIBRATED_DISCOVERY = Object.freeze({
  area: 60_000,
  resources: 100,
  salary: 80_000,
  targetArea: 120_000,
  shiftHours: 8,
  workDays: 300,
});
