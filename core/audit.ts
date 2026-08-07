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
      'utilisation',
      'Dock utilisation',
      'share of operating hours that are actually productive, after weather, daylight, charge cycles and maintenance',
      'percent',
      (m) => `${n(m.utilisationUsed * 100)}% of ${n(m.hoursPerDock)} operating hours`,
      (m) => m.utilisationUsed,
    ),
    line(
      'productiveHoursPerDock',
      'Productive hours per dock per year',
      'hours per dock × utilisation × substitution factor',
      'hours',
      (m) =>
        `${n(m.hoursPerDock)} × ${n(m.utilisationUsed)} × ${n(params.subFactor)} = ${n(m.productiveHoursPerDock)}`,
      (m) => m.productiveHoursPerDock,
    ),
    line(
      'addressableShare',
      'Addressable share of manual work',
      'share of manual inspection hours that aerial inspection can displace at all',
      'percent',
      (m) =>
        `${n(m.addressableShare * 100)}% (the remainder is confined space, thickness readings, tactile work, permits and reporting)`,
      (m) => m.addressableShare,
    ),
    line(
      'addressableHours',
      'Addressable manual hours',
      'manual hours × addressable share',
      'hours',
      (m) => `${n(m.manualHours)} × ${n(m.addressableShare)} = ${n(m.addressableHours)}`,
      (m) => m.addressableHours,
    ),
    line(
      'addressableManualCost',
      'Addressable manual cost',
      'manual cost × addressable share, the only part autonomous inspection can save',
      'currency',
      (m) => `${n(m.manualCost)} × ${n(m.addressableShare)} = ${n(m.addressableManualCost)}`,
      (m) => m.addressableManualCost,
    ),
    line(
      'nonAddressableManualCost',
      'Non-addressable manual cost',
      'manual cost − addressable manual cost, which the customer keeps paying',
      'currency',
      (m) => `${n(m.manualCost)} − ${n(m.addressableManualCost)} = ${n(m.nonAddressableManualCost)}`,
      (m) => m.nonAddressableManualCost,
    ),
    line(
      'docksExact',
      'Docks required, before rounding',
      'addressable manual hours ÷ productive hours per dock',
      'countExact',
      (m) => `${n(m.addressableHours)} ÷ ${n(m.productiveHoursPerDock)} = ${n(m.docksExact)}`,
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
      'addressable manual cost − autonomous cost',
      'currency',
      (m) => `${n(m.addressableManualCost)} − ${n(m.autoCost)} = ${n(m.saving)}`,
      (m) => m.saving,
    ),
    line(
      'costRatio',
      'Cost ratio, addressable scope',
      'autonomous cost ÷ addressable manual cost',
      'percent',
      (m) => `${n(m.autoCost)} ÷ ${n(m.addressableManualCost)} = ${n(m.costRatio)}`,
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
      'implementation for this fleet ÷ (annual saving ÷ 12)',
      'months',
      (m) =>
        m.paybackMonths === null
          ? 'no payback at these inputs, the model does not save money here'
          : `${n(m.implCost)} ÷ (${n(m.saving)} ÷ 12) = ${n(m.paybackMonths)}`,
      (m) => m.paybackMonths,
    ),
    line(
      'totalProgrammeCost',
      'Total inspection programme cost, after',
      'autonomous cost + non-addressable manual cost, what the customer still pays in total',
      'currency',
      (m) => `${n(m.autoCost)} + ${n(m.nonAddressableManualCost)} = ${n(m.totalProgrammeCost)}`,
      (m) => m.totalProgrammeCost,
    ),
    line(
      'programmeCostRatio',
      'Total programme cost ratio',
      'total programme cost after ÷ total manual cost before',
      'percent',
      (m) => `${n(m.totalProgrammeCost)} ÷ ${n(m.manualCost)} = ${n(m.programmeCostRatio)}`,
      (m) => m.programmeCostRatio,
    ),
    line(
      'implCost',
      'Implementation for this fleet',
      'programme base + docks × implementation per dock',
      'currency',
      (m) =>
        `${n(params.implBase)} + ${n(m.docks)} × ${n(params.implPerDock)} = ${n(m.implCost)}`,
      (m) => m.implCost,
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
