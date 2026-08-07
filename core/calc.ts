import type { Params, ScenarioKey, ScenarioMetrics } from './types.js';
import { ceilCount } from './round.js';

/**
 * The model. This is the only arithmetic in the repository.
 *
 * Nothing here imports `format.ts`. Display rounding must never feed back into a
 * calculation, that is how an audit table stops reconciling with its own inputs.
 */

export interface ScenarioArgs {
  scenario: ScenarioKey;
  /** Resources at this scenario's area. Fractional at the target area, by design. */
  resources: number;
  salary: number;
  shiftHours: number;
  workDays: number;
  /** The area this scenario is priced at. Used only as a display denominator. */
  areaUsed: number;
  /** 1 for current, `targetArea / area` for target. */
  scaleFactor: number;
  /** `ratioNow` for current, `ratioScale` for target. May be fractional. */
  ratio: number;
  params: Params;
}

export function computeScenario(args: ScenarioArgs): ScenarioMetrics {
  const { scenario, resources, salary, shiftHours, workDays, areaUsed, scaleFactor, ratio, params } =
    args;

  const manualHours = resources * shiftHours * workDays;
  const manualCost = resources * salary;
  const hourlyRate = salary / (shiftHours * workDays);
  const hoursPerDock = params.dockHours * params.dockDays;

  // Only part of the manual programme is within reach of aerial inspection.
  // Confined space entry, thickness readings, tactile work and permits are not.
  const addressableHours = manualHours * params.addressableShare;
  const addressableManualCost = manualCost * params.addressableShare;
  const nonAddressableManualCost = manualCost - addressableManualCost;

  // dockHours x dockDays is availability, not output. Utilisation takes out the
  // hours lost to weather, daylight, charge cycles, maintenance and comms;
  // subFactor converts a productive drone hour into labour hours displaced.
  const productiveHoursPerDock = hoursPerDock * params.utilisation * params.subFactor;

  // A dock is a purchase, so it rounds up. The whole-dock count is what the
  // operator ratio is then applied to, a ratio is never applied to a fractional
  // dock count, and the exact figure is carried through for the audit trail.
  const docksExact = addressableHours / productiveHoursPerDock;
  const docks = ceilCount(docksExact);

  // An operator is a hire, so they round up too, from the whole-dock count above.
  const operatorsExact = docks / ratio;
  const operators = ceilCount(operatorsExact);

  const autoCost = docks * params.dockCost + operators * params.opCost;

  // Compared against the addressable scope only. The customer keeps paying for
  // the work a drone cannot do, so counting it as saved would be a fiction.
  const saving = addressableManualCost - autoCost;
  const costRatio = autoCost / addressableManualCost;

  // What the whole inspection programme costs once autonomous is in place.
  const totalProgrammeCost = autoCost + nonAddressableManualCost;
  const programmeCostRatio = totalProgrammeCost / manualCost;

  // Implementation scales with the fleet. A flat figure is what produces a
  // payback measured in weeks for a deployment of dozens of docks.
  const implCost = params.implBase + docks * params.implPerDock;

  // Negative return is a real answer and is reported as one. Null only when there
  // is no autonomous spend to return against.
  const returnPct = autoCost === 0 ? null : saving / autoCost;

  // No payback to report when the model does not save money. Not Infinity, not a
  // negative month count that reads like a date.
  const paybackMonths = saving > 0 ? implCost / (saving / 12) : null;

  const hoursMultiple = hoursPerDock / (shiftHours * workDays);

  // Display metrics. The model does not price per unit area, these divide by it,
  // which is where a unit mismatch surfaces as a visibly absurd number.
  const manualCostPerArea = manualCost / areaUsed;
  const autoCostPerArea = autoCost / areaUsed;
  const savingPerArea = saving / areaUsed;

  return {
    scenario,
    areaUsed,
    scaleFactor,
    ratioUsed: ratio,
    resources,
    salaryUsed: salary,
    shiftHoursUsed: shiftHours,
    workDaysUsed: workDays,
    manualHours,
    manualCost,
    hourlyRate,
    hoursPerDock,
    productiveHoursPerDock,
    addressableShare: params.addressableShare,
    utilisationUsed: params.utilisation,
    addressableHours,
    addressableManualCost,
    nonAddressableManualCost,
    docksExact,
    docks,
    operatorsExact,
    operators,
    autoCost,
    saving,
    costRatio,
    totalProgrammeCost,
    programmeCostRatio,
    implCost,
    returnPct,
    paybackMonths,
    hoursMultiple,
    manualCostPerArea,
    autoCostPerArea,
    savingPerArea,
  };
}
