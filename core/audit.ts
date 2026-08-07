import type { AuditLine, Params, ScenarioMetrics } from './types.js';

/**
 * The audit trail.
 *
 * A customer engineer must be able to recompute the entire model on paper from
 * these lines alone. Each carries the formula in words, the same formula with this
 * site's actual numbers substituted, and the computed value, for both scenarios.
 */

/** Compact number rendering for the working-out strings. Not used in any calculation. */
function n(x: number): string {
  if (!Number.isFinite(x)) return ', ';
  const abs = Math.abs(x);
  if (Number.isInteger(x)) return x.toLocaleString('en-US');
  const dp = abs < 10 ? 4 : 2;
  return x.toLocaleString('en-US', { maximumFractionDigits: dp });
}

export function buildAudit(
  current: ScenarioMetrics,
  target: ScenarioMetrics,
  params: Params,
  areaUnit: string,
): AuditLine[] {
  const line = (
    key: string,
    label: string,
    formula: string,
    kind: AuditLine['kind'],
    working: (m: ScenarioMetrics) => string,
    value: (m: ScenarioMetrics) => number | null,
  ): AuditLine => ({
    key,
    label,
    formula,
    currentWorking: working(current),
    targetWorking: working(target),
    current: value(current),
    target: value(target),
    kind,
  });

  return [
    line(
      'areaUsed',
      `Area priced (${areaUnit})`,
      'the area this scenario is priced at',
      'area',
      (m) => `${n(m.areaUsed)} ${areaUnit}`,
      (m) => m.areaUsed,
    ),
    line(
      'scaleFactor',
      'Scale factor',
      'target area ÷ current area (1.0 at the current area by definition)',
      'factor',
      (m) =>
        m.scenario === 'current'
          ? '1.0 by definition, this is the present state'
          : `${n(target.areaUsed)} ÷ ${n(current.areaUsed)} = ${n(m.scaleFactor)}`,
      (m) => m.scaleFactor,
    ),
    line(
      'resources',
      'Manual resources',
      'resources today, scaled by the scale factor at the target area',
      'resources',
      (m) =>
        m.scenario === 'current'
          ? `${n(m.resources)} as supplied by the customer`
          : `${n(current.resources)} × ${n(m.scaleFactor)} = ${n(m.resources)} (kept fractional, an extrapolation of the customer's headcount, not a purchase)`,
      (m) => m.resources,
    ),
    line(
      'manualHours',
      'Manual hours per year',
      'resources × shift hours per day × working days per year',
      'hours',
      (m) =>
        `${n(m.resources)} × ${n(m.shiftHoursUsed)} × ${n(m.workDaysUsed)} = ${n(m.manualHours)}`,
      (m) => m.manualHours,
    ),
    line(
      'manualCost',
      'Manual cost per year',
      'resources × fully loaded cost per resource per year',
      'currency',
      (m) => `${n(m.resources)} × ${n(m.salaryUsed)} = ${n(m.manualCost)}`,
      (m) => m.manualCost,
    ),
    line(
      'hourlyRate',
      'Effective hourly rate',
      'salary ÷ (shift hours per day × working days per year)',
      'rate',
      (m) =>
        `${n(m.salaryUsed)} ÷ (${n(m.shiftHoursUsed)} × ${n(m.workDaysUsed)}) = ${n(m.hourlyRate)}`,
      (m) => m.hourlyRate,
    ),
    line(
      'hoursPerDock',
      'Hours per dock per year',
      'dock operating hours per day × dock operating days per year',
      'hours',
      () => `${n(params.dockHours)} × ${n(params.dockDays)} = ${n(current.hoursPerDock)}`,
      (m) => m.hoursPerDock,
    ),
    line(
      'docksExact',
      'Docks required, before rounding',
      'manual hours ÷ (hours per dock × substitution factor)',
      'countExact',
      (m) =>
        `${n(m.manualHours)} ÷ (${n(m.hoursPerDock)} × ${n(params.subFactor)}) = ${n(m.docksExact)}`,
      (m) => m.docksExact,
    ),
    line(
      'docks',
      'Docks required',
      'docks before rounding, rounded up, a dock is a purchase, so part of one is a whole one',
      'count',
      (m) => `round up ${n(m.docksExact)} = ${n(m.docks)}`,
      (m) => m.docks,
    ),
    line(
      'operatorsExact',
      'Operators required, before rounding',
      'whole docks ÷ docks per operator (never the fractional dock count)',
      'countExact',
      (m) => `${n(m.docks)} ÷ ${n(m.ratioUsed)} = ${n(m.operatorsExact)}`,
      (m) => m.operatorsExact,
    ),
    line(
      'operators',
      'Operators required',
      'operators before rounding, rounded up, an operator is a hire',
      'count',
      (m) => `round up ${n(m.operatorsExact)} = ${n(m.operators)}`,
      (m) => m.operators,
    ),
    line(
      'autoCost',
      'Autonomous cost per year',
      'docks × cost per dock per year + operators × cost per operator per year',
      'currency',
      (m) =>
        `${n(m.docks)} × ${n(params.dockCost)} + ${n(m.operators)} × ${n(params.opCost)} = ${n(m.autoCost)}`,
      (m) => m.autoCost,
    ),
    line(
      'saving',
      'Annual saving',
      'manual cost − autonomous cost',
      'currency',
      (m) => `${n(m.manualCost)} − ${n(m.autoCost)} = ${n(m.saving)}`,
      (m) => m.saving,
    ),
    line(
      'costRatio',
      'Cost ratio',
      'autonomous cost ÷ manual cost',
      'percent',
      (m) => `${n(m.autoCost)} ÷ ${n(m.manualCost)} = ${n(m.costRatio)}`,
      (m) => m.costRatio,
    ),
    line(
      'returnPct',
      'Return on autonomous spend',
      'annual saving ÷ autonomous cost',
      'percent',
      (m) =>
        m.returnPct === null
          ? 'no autonomous spend to return against'
          : `${n(m.saving)} ÷ ${n(m.autoCost)} = ${n(m.returnPct)}`,
      (m) => m.returnPct,
    ),
    line(
      'paybackMonths',
      'Payback',
      'one-time implementation cost ÷ (annual saving ÷ 12)',
      'months',
      (m) =>
        m.paybackMonths === null
          ? 'no payback at these inputs, the model does not save money here'
          : `${n(params.implCost)} ÷ (${n(m.saving)} ÷ 12) = ${n(m.paybackMonths)}`,
      (m) => m.paybackMonths,
    ),
    line(
      'hoursMultiple',
      'Hours multiple',
      'hours per dock per year ÷ (shift hours per day × working days per year)',
      'multiple',
      (m) =>
        `${n(m.hoursPerDock)} ÷ (${n(m.shiftHoursUsed)} × ${n(m.workDaysUsed)}) = ${n(m.hoursMultiple)}`,
      (m) => m.hoursMultiple,
    ),
    line(
      'manualCostPerArea',
      `Manual cost per ${areaUnit}`,
      'manual cost ÷ area priced, a display metric, not a driver of the model',
      'perArea',
      (m) => `${n(m.manualCost)} ÷ ${n(m.areaUsed)} = ${n(m.manualCostPerArea)}`,
      (m) => m.manualCostPerArea,
    ),
    line(
      'autoCostPerArea',
      `Autonomous cost per ${areaUnit}`,
      'autonomous cost ÷ area priced, a display metric, not a driver of the model',
      'perArea',
      (m) => `${n(m.autoCost)} ÷ ${n(m.areaUsed)} = ${n(m.autoCostPerArea)}`,
      (m) => m.autoCostPerArea,
    ),
    line(
      'savingPerArea',
      `Annual saving per ${areaUnit}`,
      'annual saving ÷ area priced, a display metric, not a driver of the model',
      'perArea',
      (m) => `${n(m.saving)} ÷ ${n(m.areaUsed)} = ${n(m.savingPerArea)}`,
      (m) => m.savingPerArea,
    ),
  ];
}
