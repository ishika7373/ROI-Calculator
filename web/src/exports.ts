import type { ModelResult, Params } from '../../core/index.js';
import type { ScoredSite } from './scoring.js';

/** Quote a CSV field only when it needs it, and never let a value break the row. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function download(filename: string, data: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV of the current scenario, including the full audit trail. */
export function scenarioCsv(result: ModelResult, params: Params, label: string): string {
  const rows: unknown[][] = [
    ['Autonomous Inspection ROI: scenario export'],
    ['Scenario', label],
    ['Generated', new Date().toISOString()],
    [],
    ['Autonomous parameters (supplied by us: placeholders, not commercial figures)'],
    ['Dock hours per day', params.dockHours],
    ['Operating days per year', params.dockDays],
    ['Substitution factor', params.subFactor],
    ['Cost per dock per year', params.dockCost],
    ['Cost per operator per year', params.opCost],
    ['Docks per operator now', params.ratioNow],
    ['Docks per operator at scale', params.ratioScale],
    ['Implementation, programme base', params.implBase],
    ['Implementation per dock', params.implPerDock],
    ['Dock utilisation', params.utilisation],
    ['Addressable share', params.addressableShare],
    ['Currency', params.currency],
    [],
  ];

  if (result.status !== 'ok') {
    rows.push(['Status', 'model incomplete']);
    rows.push(['Reason', 'field']);
    for (const issue of result.issues) rows.push([issue.reason, issue.field]);
    return toCsv(rows);
  }

  rows.push(['Status', 'calculated']);
  rows.push(['Recommendation', result.recommendation]);
  rows.push(['Tier (current area)', result.tierCurrent]);
  rows.push(['Tier (target area)', result.tierTarget]);
  if (result.tierImprovesAtTarget) rows.push(['Note', 'tier improves at target']);
  if (result.tierWeakensAtTarget) rows.push(['Note', 'tier weakens at target']);
  for (const w of result.warnings) rows.push(['Warning', w.message]);
  rows.push([]);
  rows.push(['Audit trail']);
  rows.push(['Line', 'Formula', 'Current area', 'Target area', 'Working (current)', 'Working (target)']);
  for (const l of result.audit) {
    rows.push([l.label, l.formula, l.current, l.target, l.currentWorking, l.targetWorking]);
  }
  rows.push([]);
  rows.push(['Sensitivity by docks per operator (current area)']);
  rows.push(['Docks per operator', 'Docks', 'Operators', 'Autonomous cost', 'Cost ratio']);
  for (const s of result.sensitivity) {
    rows.push([s.ratio, s.docks, s.operators, s.autoCost, s.costRatio]);
  }
  return toCsv(rows);
}

/** CSV of the whole portfolio: one row per site, incomplete rows genuinely blank. */
export function portfolioCsv(scored: ScoredSite[]): string {
  const passthroughKeys = [...new Set(scored.flatMap((s) => Object.keys(s.passthrough)))];

  const header = [
    'Customer',
    'Site',
    'Industry',
    ...passthroughKeys,
    'Manual Cost',
    'Autonomous Cost',
    'Annual Saving',
    'Cost Ratio (current area)',
    'Cost Ratio (target area)',
    'Return %',
    'Payback Months',
    'Hours Multiple',
    'Docks Required',
    'Operators Required',
    'Status',
    'Recommendation',
  ];

  const rows: unknown[][] = [header];

  for (const s of scored) {
    const base = [s.customer, s.site, s.industry, ...passthroughKeys.map((k) => s.passthrough[k] ?? '')];

    if (s.result.status !== 'ok') {
      // Every calculated column genuinely blank. Not zero, not "N/A".
      rows.push([...base, '', '', '', '', '', '', '', '', '', '', 'model incomplete', '']);
      continue;
    }

    const c = s.result.current;
    const status = s.result.tierImprovesAtTarget
      ? 'tier improves at target'
      : s.result.tierWeakensAtTarget
        ? 'tier weakens at target'
        : 'calculated';

    rows.push([
      ...base,
      c.manualCost,
      c.autoCost,
      c.saving,
      c.costRatio,
      s.result.target.costRatio,
      c.returnPct ?? '',
      c.paybackMonths ?? '',
      c.hoursMultiple,
      c.docks,
      c.operators,
      status,
      s.result.recommendation,
    ]);
  }

  return toCsv(rows);
}

/** Exceptions CSV. Invalid rows with the specific reason each. */
export function exceptionsCsv(scored: ScoredSite[]): string {
  const rows: unknown[][] = [['Customer', 'Site', 'Field', 'Reason', 'Kind']];
  for (const s of scored) {
    for (const issue of s.result.issues) {
      rows.push([s.customer, s.site, issue.field, issue.reason, 'invalid']);
    }
    for (const w of s.result.warnings) {
      rows.push([s.customer, s.site, '', w.message, 'warning']);
    }
  }
  return toCsv(rows);
}
