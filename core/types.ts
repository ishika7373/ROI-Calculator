/**
 * Shared types for the ROI calculation engine.
 *
 * This module, and every other file under /core, is pure: no DOM, no file IO,
 * no framework imports, no dependencies. Both the web app and the batch CLI
 * import the same compiled code, which is what makes the parity test meaningful
 * rather than ceremonial.
 */

/** A value as it arrives from a spreadsheet cell, a URL query string or a form field. */
export type Raw = number | string | null | undefined;

/** The six discovery questions the salesperson asks out loud. */
export interface DiscoveryInputs {
  /** Current survey area. */
  area: Raw;
  /** Manual resources deployed today. */
  resources: Raw;
  /** Fully loaded cost per resource per year. */
  salary: Raw;
  /** Target future area, in the same unit as `area`. */
  targetArea: Raw;
  /** Shift hours per day. */
  shiftHours: Raw;
  /** Working days per year. */
  workDays: Raw;
  /** Optional unit label for `area`. Defaults to square feet. */
  areaUnit?: Raw;
  /** Optional unit label for `targetArea`. Assumed to match `areaUnit` when absent. */
  targetAreaUnit?: Raw;
}

/**
 * The autonomous-side parameters. These are supplied by us, not by the customer.
 *
 * Every default is a placeholder. None is derived from real commercial data and
 * all must be replaced with real figures before this is shown to a customer.
 */
export interface Params {
  /** Dock operating hours per day. */
  dockHours: number;
  /** Dock operating days per year. */
  dockDays: number;
  /**
   * Fraction of a dock's operating hours that are actually productive.
   *
   * 24 x 365 is availability, not output. Weather and daylight limits, the
   * battery charge duty cycle, maintenance and connectivity all take hours out.
   * This is the parameter that stops the model claiming a dock never stops.
   */
  utilisation: number;
  /**
   * Fraction of the customer's manual inspection hours that autonomous aerial
   * inspection can displace at all.
   *
   * Confined space entry, NDT thickness readings, tactile inspection, permit to
   * work and reporting are not addressable by a drone. Assuming otherwise is the
   * difference between a defensible case and a fantasy.
   */
  addressableShare: number;
  /** Substitution factor, labour hours displaced per productive drone hour. */
  subFactor: number;
  /** Cost per dock per year. */
  dockCost: number;
  /** Cost per operator per year. */
  opCost: number;
  /** Docks per operator today. May be fractional, see `ceilCount`. */
  ratioNow: number;
  /** Docks per operator at scale. May be fractional. */
  ratioScale: number;
  /** One-time programme cost independent of fleet size: integration, security review, pilot. */
  implBase: number;
  /**
   * One-time cost per dock deployed: site survey, civils, power and network,
   * permits and regulatory approval, commissioning, training.
   *
   * Implementation that does not scale with the fleet is the single largest
   * cause of an implausibly short payback.
   */
  implPerDock: number;
  /** ISO currency code used for labelling only. The model itself is unit-agnostic. */
  currency: string;
}

export type ScenarioKey = 'current' | 'target';

/** Every intermediate and output value for one scenario. */
export interface ScenarioMetrics {
  scenario: ScenarioKey;
  /** The area this scenario is priced at, `area` for current, `targetArea` for target. */
  areaUsed: number;
  /** 1 for the current scenario; `targetArea / area` for the target scenario. */
  scaleFactor: number;
  /** `ratioNow` for the current scenario, `ratioScale` for the target scenario. */
  ratioUsed: number;

  /**
   * Manual resources at this scenario's area. Deliberately NOT rounded: this is an
   * extrapolation of the customer's own headcount, not a purchase we make.
   */
  resources: number;

  /** The discovery inputs this scenario was computed from, carried for the audit trail. */
  salaryUsed: number;
  shiftHoursUsed: number;
  workDaysUsed: number;

  manualHours: number;
  manualCost: number;
  hourlyRate: number;
  /** Theoretical dock availability, dockHours x dockDays. */
  hoursPerDock: number;
  /** Availability after utilisation and substitution, the hours that actually count. */
  productiveHoursPerDock: number;

  /** Share of manual hours a drone can address, echoed for the audit trail. */
  addressableShare: number;
  utilisationUsed: number;
  /** Manual hours within reach of autonomous inspection. */
  addressableHours: number;
  /** Cost of the addressable portion of the manual programme. */
  addressableManualCost: number;
  /** Cost of the manual work a drone cannot do, which the customer keeps paying. */
  nonAddressableManualCost: number;

  /** Docks before rounding up. Carried for the audit trail so the ceiling is visible. */
  docksExact: number;
  /** Docks after rounding up. A dock is a purchase, so it rounds up. */
  docks: number;
  /** Operators before rounding up, derived from the whole-dock count. */
  operatorsExact: number;
  /** Operators after rounding up. An operator is a hire, so they round up. */
  operators: number;

  autoCost: number;
  /**
   * Addressable manual cost less autonomous cost.
   *
   * Deliberately NOT total manual cost less autonomous cost: the customer keeps
   * paying for the work a drone cannot do, and pretending otherwise is exactly
   * the error that produces a saving in the millions and a payback in weeks.
   */
  saving: number;
  /** Autonomous cost as a share of the addressable manual cost. */
  costRatio: number;
  /** Total inspection programme cost once autonomous is in place. */
  totalProgrammeCost: number;
  /** Total programme cost after, as a share of total manual cost before. */
  programmeCostRatio: number;
  /** Implementation for this scenario: base plus per-dock, so it scales with the fleet. */
  implCost: number;
  /** `null` only when autoCost is zero. Negative is a valid, meaningful answer. */
  returnPct: number | null;
  /** `null` when saving is zero or negative, there is no payback to report. */
  paybackMonths: number | null;
  hoursMultiple: number;

  /** Display metrics. The model does not price per unit area; these divide by it. */
  manualCostPerArea: number;
  autoCostPerArea: number;
  savingPerArea: number;
}

import type { SensitivityGrid } from './sensitivity.js';

/** One row of the docks-per-operator sensitivity sweep. */
export interface SensitivityRow {
  ratio: number;
  docks: number;
  operators: number;
  autoCost: number;
  costRatio: number;
}

/** A reason a row cannot be calculated. Collected, never short-circuited. */
export interface Issue {
  field: string;
  reason: string;
}

/** A row that calculates but deserves a flag. Warnings never block calculation. */
export interface Warning {
  code: string;
  message: string;
}

/** The deterministic recommendation tiers, in evaluation order. */
export type Tier = 'strong' | 'viable' | 'no-standalone' | 'marginal';

export type AuditKind =
  /** A whole procured count, docks, operators. Rendered without decimals. */
  | 'count'
  /** A pre-ceiling count. Fractional by nature, rendered with decimals. */
  | 'countExact'
  /** Manual resources. Fractional at the target area, and shown that way. */
  | 'resources'
  | 'currency'
  | 'hours'
  | 'ratio'
  | 'percent'
  | 'months'
  | 'multiple'
  | 'area'
  | 'rate'
  | 'perArea'
  | 'factor';

/**
 * One line of the audit table. A customer engineer must be able to recompute the
 * whole model on paper from these lines alone.
 */
export interface AuditLine {
  key: string;
  label: string;
  /** The formula in plain text, in words, with no numbers substituted. */
  formula: string;
  /** The same formula with this row's actual current-area numbers substituted. */
  currentWorking: string;
  /** The same formula with this row's actual target-area numbers substituted. */
  targetWorking: string;
  current: number | null;
  target: number | null;
  kind: AuditKind;
}

export interface ModelOk {
  status: 'ok';
  current: ScenarioMetrics;
  target: ScenarioMetrics;
  sensitivity: SensitivityRow[];
  /** Two-dimensional sweep over the model's only genuinely uncertain assumptions. */
  grid: SensitivityGrid;
  /** Tier for the current-area scenario. Sheet 1 and the recommendation use this. */
  tierCurrent: Tier;
  tierTarget: Tier;
  /** True when the target-area scenario lands in a strictly better tier. */
  tierImprovesAtTarget: boolean;
  /** True when the target-area scenario lands in a strictly worse tier. */
  tierWeakensAtTarget: boolean;
  recommendation: string;
  audit: AuditLine[];
  issues: [];
  warnings: Warning[];
  params: Params;
  areaUnit: string;
}

export interface ModelIncomplete {
  status: 'model incomplete';
  current: null;
  target: null;
  sensitivity: [];
  grid: null;
  tierCurrent: null;
  tierTarget: null;
  tierImprovesAtTarget: false;
  tierWeakensAtTarget: false;
  recommendation: null;
  audit: [];
  issues: Issue[];
  warnings: Warning[];
  params: Params;
  areaUnit: string;
}

/**
 * A discriminated union rather than nullable numbers, so that neither mode can
 * accidentally render or write a zero where an answer is missing. The field does
 * not exist to be read, a guess is unavailable at the type level.
 */
export type ModelResult = ModelOk | ModelIncomplete;
