import type { Params, ScenarioMetrics, SensitivityRow, Tier } from './types.js';
import {
  SENSITIVITY_ADDRESSABLE,
  SENSITIVITY_RATIOS,
  SENSITIVITY_UTILISATION,
} from './defaults.js';
import { ceilCount } from './round.js';
import { tierFor } from './recommend.js';

/**
 * Sensitivity.
 *
 * Two sweeps, because two different questions get asked in a discovery call.
 *
 * The one-dimensional sweep answers "what if we cannot supervise that many docks
 * per operator", which moves the operator term only.
 *
 * The two-dimensional grid answers the harder question: utilisation and
 * addressable share are the only two assumptions in this model that are neither
 * a commercial figure we can quote nor an answer the customer gave us. They are
 * where the case is actually won or lost, and a customer engineer will push on
 * both. The grid shows the whole surface rather than one point on it.
 */

export function sensitivity(
  metrics: ScenarioMetrics,
  params: Params,
  ratios: readonly number[] = SENSITIVITY_RATIOS,
): SensitivityRow[] {
  return ratios.map((ratio) => {
    const operators = ceilCount(metrics.docks / ratio);
    const autoCost = metrics.docks * params.dockCost + operators * params.opCost;
    return {
      ratio,
      docks: metrics.docks,
      operators,
      autoCost,
      costRatio: autoCost / metrics.addressableManualCost,
    };
  });
}

export interface GridCell {
  utilisation: number;
  addressableShare: number;
  docks: number;
  operators: number;
  autoCost: number;
  saving: number;
  costRatio: number;
  paybackMonths: number | null;
  tier: Tier;
  /** True where this cell is the scenario currently on screen. */
  isCurrent: boolean;
}

export interface SensitivityGrid {
  utilisations: readonly number[];
  addressableShares: readonly number[];
  cells: GridCell[][];
  /**
   * The utilisation at which payback lands exactly on the horizon, at the
   * addressable share currently in use.
   *
   * Solved rather than picked off the swept grid, so it is a real figure with
   * real headroom against it rather than whichever coarse gridline happened to
   * clear the bar. `null` when no utilisation up to 100% clears the horizon.
   */
  breakEvenUtilisation: number | null;
  horizonMonths: number;
}

/**
 * Recompute the whole model across the utilisation and addressable-share grid.
 *
 * Every cell runs the same arithmetic as the headline figure, so a cell can be
 * read out loud and defended. Nothing is interpolated between cells.
 */
export function sensitivityGrid(
  metrics: ScenarioMetrics,
  params: Params,
  opts: {
    utilisations?: readonly number[];
    addressableShares?: readonly number[];
    horizonMonths?: number;
  } = {},
): SensitivityGrid {
  const utilisations = opts.utilisations ?? SENSITIVITY_UTILISATION;
  const addressableShares = opts.addressableShares ?? SENSITIVITY_ADDRESSABLE;
  const horizonMonths = opts.horizonMonths ?? 24;

  const hoursPerDock = params.dockHours * params.dockDays;

  const cellFor = (utilisation: number, addressableShare: number): GridCell => {
    const addressableHours = metrics.manualHours * addressableShare;
    const addressableManualCost = metrics.manualCost * addressableShare;
    const productive = hoursPerDock * utilisation * params.subFactor;

    const docks = ceilCount(addressableHours / productive);
    const operators = ceilCount(docks / metrics.ratioUsed);
    const autoCost = docks * params.dockCost + operators * params.opCost;
    const saving = addressableManualCost - autoCost;
    const costRatio = autoCost / addressableManualCost;
    const implCost = params.implBase + docks * params.implPerDock;
    const paybackMonths = saving > 0 ? implCost / (saving / 12) : null;

    return {
      utilisation,
      addressableShare,
      docks,
      operators,
      autoCost,
      saving,
      costRatio,
      paybackMonths,
      tier: tierFor(costRatio, paybackMonths),
      isCurrent:
        Math.abs(utilisation - metrics.utilisationUsed) < 1e-9 &&
        Math.abs(addressableShare - metrics.addressableShare) < 1e-9,
    };
  };

  const cells = utilisations.map((u) => addressableShares.map((a) => cellFor(u, a)));

  // Solve for the utilisation where payback lands on the horizon, at the
  // addressable share actually in use. This is the number to quote when asked
  // "how wrong can we be about utilisation before this stops working".
  //
  // Bisection rather than a scan of the grid: the grid is coarse, and reporting
  // whichever gridline happened to clear the bar makes the headroom look like
  // zero whenever the live scenario sits on a gridline. Payback falls as
  // utilisation rises, but the dock and operator ceilings make it a step
  // function, so this finds the boundary rather than assuming smoothness.
  const clears = (u: number): boolean => {
    const c = cellFor(u, metrics.addressableShare);
    return c.paybackMonths !== null && c.paybackMonths <= horizonMonths;
  };

  let breakEvenUtilisation: number | null = null;
  if (clears(1)) {
    let lo = 0.001;
    let hi = 1;
    if (clears(lo)) {
      breakEvenUtilisation = lo;
    } else {
      // Invariant: lo never clears, hi always clears.
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (clears(mid)) hi = mid;
        else lo = mid;
      }
      breakEvenUtilisation = hi;
    }
  }

  return { utilisations, addressableShares, cells, breakEvenUtilisation, horizonMonths };
}
