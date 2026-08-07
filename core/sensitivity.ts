import type { Params, ScenarioMetrics, SensitivityRow } from './types.js';
import { SENSITIVITY_RATIOS } from './defaults.js';
import { ceilCount } from './round.js';

/**
 * Sweep docks-per-operator, holding everything else at the scenario given.
 *
 * Only the operator term moves: the dock count is a function of manual hours and
 * the substitution factor, neither of which the ratio touches. Reported for the
 * current-area scenario, which is the basis Sheet 1 and the recommendation use.
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
      costRatio: autoCost / metrics.manualCost,
    };
  });
}
