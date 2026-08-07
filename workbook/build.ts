import { createWorkbook } from '@office-kit/xlsx/workbook';
import { TIER_TEXT } from '../core/index.js';
import type { ScoredSite } from '../web/src/scoring.js';
import {
  FORMATS,
  addBoundChart,
  addRatioScale,
  colLetter,
  formatRange,
  writeSheet,
  type CellValue,
} from './builder.js';

/**
 * Drone_ROI_Output.xlsx.
 *
 * Every number here came from /core. This file arranges and formats; it does not
 * calculate. Both the CLI and the browser call this same function, so the two
 * cannot produce different workbooks.
 */

const EXEC_SHEET = 'Executive Summary';

export function buildWorkbook(scored: ScoredSite[]) {
  const wb = createWorkbook();

  const passthroughKeys = [...new Set(scored.flatMap((s) => Object.keys(s.passthrough)))];

  /* ---------------------------------------------- Sheet 1: Executive Summary */

  const currency = scored[0]?.params.currency ?? 'USD';

  const execHeader = [
    'Customer',
    'Site',
    'Industry',
    ...passthroughKeys,
    `Manual Cost (${currency})`,
    `Autonomous Cost (${currency})`,
    `Annual Saving (${currency})`,
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

  const execRows: CellValue[][] = [execHeader];

  for (const s of scored) {
    const base: CellValue[] = [
      s.customer,
      s.site,
      s.industry,
      ...passthroughKeys.map((k) => s.passthrough[k] ?? ''),
    ];

    if (s.result.status !== 'ok') {
      // Calculated fields genuinely blank. No zero, no "N/A", no recommendation.
      execRows.push([...base, null, null, null, null, null, null, null, null, null, null, 'model incomplete', null]);
      continue;
    }

    const c = s.result.current;
    const status = s.result.tierImprovesAtTarget
      ? 'tier improves at target'
      : s.result.tierWeakensAtTarget
        ? 'tier weakens at target'
        : 'calculated';

    execRows.push([
      ...base,
      c.manualCost,
      c.autoCost,
      c.saving,
      c.costRatio,
      s.result.target.costRatio,
      c.returnPct,
      c.paybackMonths,
      c.hoursMultiple,
      c.docks,
      c.operators,
      status,
      s.result.recommendation,
    ]);
  }

  const execWs = writeSheet(wb, { name: EXEC_SHEET, rows: execRows, freezeHeader: true });

  const firstData = 2;
  const lastData = execRows.length;
  const base = 3 + passthroughKeys.length;
  const col = {
    customer: 1,
    manualCost: base + 1,
    autoCost: base + 2,
    saving: base + 3,
    ratioCurrent: base + 4,
    ratioTarget: base + 5,
    returnPct: base + 6,
    payback: base + 7,
    hoursMultiple: base + 8,
    docks: base + 9,
    operators: base + 10,
  };

  const R = (c: number) => `${colLetter(c)}${firstData}:${colLetter(c)}${lastData}`;

  formatRange(wb, execWs, R(col.manualCost), FORMATS.currency0);
  formatRange(wb, execWs, R(col.autoCost), FORMATS.currency0);
  formatRange(wb, execWs, R(col.saving), FORMATS.currency0);
  formatRange(wb, execWs, R(col.ratioCurrent), FORMATS.percent1);
  formatRange(wb, execWs, R(col.ratioTarget), FORMATS.percent1);
  formatRange(wb, execWs, R(col.returnPct), FORMATS.percent0);
  formatRange(wb, execWs, R(col.payback), FORMATS.months);
  formatRange(wb, execWs, R(col.hoursMultiple), FORMATS.multiple);
  formatRange(wb, execWs, R(col.docks), FORMATS.number0);
  formatRange(wb, execWs, R(col.operators), FORMATS.number0);

  // Conditional formatting on Cost Ratio and Payback Months only.
  addRatioScale(execWs, R(col.ratioCurrent), 1);
  addRatioScale(execWs, R(col.payback), 2);

  /* ------------------------------------------- Sheet 2: Detailed Calculations */

  const detailHeader = [
    'Customer',
    'Site',
    'Scenario',
    'Area priced',
    'Scale factor',
    'Docks per operator used',
    'Manual resources',
    'Manual hours',
    'Manual cost',
    'Hourly rate',
    'Hours per dock',
    'Docks before rounding',
    'Docks',
    'Operators before rounding',
    'Operators',
    'Autonomous cost',
    'Annual saving',
    'Cost ratio',
    'Return %',
    'Payback months',
    'Hours multiple',
  ];

  const detailRows: CellValue[][] = [detailHeader];

  const pushScenario = (s: ScoredSite, which: 'current' | 'target') => {
    if (s.result.status !== 'ok') {
      detailRows.push([s.customer, s.site, which, ...Array(18).fill(null)]);
      return;
    }
    const m = which === 'current' ? s.result.current : s.result.target;
    detailRows.push([
      s.customer,
      s.site,
      which === 'current' ? 'Current area' : 'Target area',
      m.areaUsed,
      m.scaleFactor,
      m.ratioUsed,
      m.resources,
      m.manualHours,
      m.manualCost,
      m.hourlyRate,
      m.hoursPerDock,
      m.docksExact,
      m.docks,
      m.operatorsExact,
      m.operators,
      m.autoCost,
      m.saving,
      m.costRatio,
      m.returnPct,
      m.paybackMonths,
      m.hoursMultiple,
    ]);
  };

  for (const s of scored) pushScenario(s, 'current');

  // Header band separating the target-area block.
  const bandRow = detailRows.length + 1;
  detailRows.push(['TARGET AREA, resources scaled linearly, operator ratio switched to at-scale']);
  for (const s of scored) pushScenario(s, 'target');

  const detailWs = writeSheet(wb, {
    name: 'Detailed Calculations',
    rows: detailRows,
    freezeHeader: true,
  });

  const dLast = detailRows.length;
  formatRange(wb, detailWs, `D2:D${dLast}`, FORMATS.number0);
  formatRange(wb, detailWs, `E2:E${dLast}`, FORMATS.number2);
  formatRange(wb, detailWs, `G2:H${dLast}`, FORMATS.number2);
  formatRange(wb, detailWs, `I2:I${dLast}`, FORMATS.currency0);
  formatRange(wb, detailWs, `J2:J${dLast}`, FORMATS.currency2);
  formatRange(wb, detailWs, `K2:K${dLast}`, FORMATS.number0);
  formatRange(wb, detailWs, `L2:O${dLast}`, FORMATS.number2);
  formatRange(wb, detailWs, `P2:Q${dLast}`, FORMATS.currency0);
  formatRange(wb, detailWs, `R2:S${dLast}`, FORMATS.percent1);
  formatRange(wb, detailWs, `T2:T${dLast}`, FORMATS.months);
  formatRange(wb, detailWs, `U2:U${dLast}`, FORMATS.multiple);

  /* -------------------------------------------------- Sheet 3: Audit Trail */

  const auditRows: CellValue[][] = [
    ['Customer', 'Site', 'Line', 'Formula in plain English', 'Working (current area)', 'Current', 'Working (target area)', 'Target'],
  ];

  for (const s of scored) {
    if (s.result.status !== 'ok') {
      auditRows.push([s.customer, s.site, 'model incomplete', s.result.issues.map((i) => i.reason).join('; '), null, null, null, null]);
      auditRows.push([]);
      continue;
    }
    for (const l of s.result.audit) {
      auditRows.push([s.customer, s.site, l.label, l.formula, l.currentWorking, l.current, l.targetWorking, l.target]);
    }
    // Parameter provenance, per site. Never a silent fallback.
    auditRows.push([s.customer, s.site, ', parameter sources, ', '', '', null, '', null]);
    for (const [key, r] of Object.entries(s.resolution)) {
      auditRows.push([
        s.customer,
        s.site,
        key,
        `resolved from: ${r.source}${r.rejected ? ` (${r.rejected})` : ''}`,
        String(r.value),
        typeof r.value === 'number' ? r.value : null,
        '',
        null,
      ]);
    }
    auditRows.push([]);
  }

  writeSheet(wb, { name: 'Audit Trail', rows: auditRows, freezeHeader: true });

  /* ------------------------------------------ Sheet 4: Sensitivity Analysis */

  const sensRows: CellValue[][] = [
    ['Customer', 'Site', 'Docks per operator', 'Docks', 'Operators', 'Autonomous cost', 'Cost ratio'],
  ];
  for (const s of scored) {
    if (s.result.status !== 'ok') {
      sensRows.push([s.customer, s.site, null, null, null, null, null]);
      continue;
    }
    for (const row of s.result.sensitivity) {
      sensRows.push([s.customer, s.site, row.ratio, row.docks, row.operators, row.autoCost, row.costRatio]);
    }
  }
  const sensWs = writeSheet(wb, { name: 'Sensitivity Analysis', rows: sensRows, freezeHeader: true });
  formatRange(wb, sensWs, `F2:F${sensRows.length}`, FORMATS.currency0);
  formatRange(wb, sensWs, `G2:G${sensRows.length}`, FORMATS.percent1);

  /* ------------------------------------------------------ Sheet 5: Charts */

  const chartsWs = writeSheet(wb, {
    name: 'Charts',
    rows: [
      ['Charts'],
      ['Every series below is bound to a cell range on the Executive Summary sheet.'],
      ['Edit a figure there and these charts move with it, they are not pictures.'],
    ],
    widths: [110],
  });

  const chartBase = {
    dataSheet: EXEC_SHEET,
    catCol: col.customer,
    headerRow: 1,
    firstDataRow: firstData,
    lastDataRow: lastData,
  };

  addBoundChart(chartsWs, {
    ...chartBase,
    title: 'Manual vs Autonomous Cost',
    series: [
      { col: col.manualCost, label: 'Manual Cost' },
      { col: col.autoCost, label: 'Autonomous Cost' },
    ],
    chartIndex: 0,
    anchor: 'A5',
    numberFormat: FORMATS.number0,
  });

  addBoundChart(chartsWs, {
    ...chartBase,
    title: 'Annual Savings',
    series: [{ col: col.saving, label: 'Annual Saving' }],
    chartIndex: 1,
    anchor: 'A26',
    numberFormat: FORMATS.number0,
  });

  addBoundChart(chartsWs, {
    ...chartBase,
    title: 'Cost Ratio',
    series: [
      { col: col.ratioCurrent, label: 'Cost Ratio (current area)' },
      { col: col.ratioTarget, label: 'Cost Ratio (target area)' },
    ],
    chartIndex: 2,
    anchor: 'A47',
    numberFormat: FORMATS.percent1,
  });

  addBoundChart(chartsWs, {
    ...chartBase,
    title: 'Return %',
    series: [{ col: col.returnPct, label: 'Return %' }],
    chartIndex: 3,
    anchor: 'A68',
    numberFormat: FORMATS.percent0,
  });

  addBoundChart(chartsWs, {
    ...chartBase,
    title: 'Payback Months',
    series: [{ col: col.payback, label: 'Payback Months' }],
    chartIndex: 4,
    anchor: 'A89',
    numberFormat: FORMATS.months,
  });

  /* -------------------------------------------------- Sheet 6: Exceptions */

  const exceptionRows: CellValue[][] = [['Customer', 'Site', 'Kind', 'Field', 'Reason']];
  for (const s of scored) {
    for (const issue of s.result.issues) {
      exceptionRows.push([s.customer, s.site, 'invalid', issue.field, issue.reason]);
    }
    for (const w of s.result.warnings) {
      exceptionRows.push([s.customer, s.site, 'warning', '', w.message]);
    }
  }
  // Omitted entirely when empty.
  if (exceptionRows.length > 1) {
    writeSheet(wb, { name: 'Exceptions', rows: exceptionRows, freezeHeader: true });
  }

  /* ------------------------------------------------------ Sheet 7: README */

  writeSheet(wb, { name: 'README', rows: readmeRows(scored), widths: [104] });

  /* ------------------------------- The original input worksheet, unmodified */

  // Echo the headers the input actually carried, in their original order.
  const inputHeader: string[] = [];
  const seenHeader = new Set<string>();
  for (const s of scored) {
    for (const key of Object.keys(s.raw as unknown as Record<string, unknown>)) {
      if (!seenHeader.has(key)) {
        seenHeader.add(key);
        inputHeader.push(key);
      }
    }
  }
  const inputRows: CellValue[][] = [inputHeader as unknown as CellValue[]];
  for (const s of scored) {
    inputRows.push(
      inputHeader.map((h) => {
        const v = (s.raw as unknown as Record<string, unknown>)[h];
        return v === null || v === undefined ? null : (v as CellValue);
      }),
    );
  }
  writeSheet(wb, { name: 'Original Input', rows: inputRows, freezeHeader: true });

  return wb;
}

function readmeRows(scored: ScoredSite[]): CellValue[][] {
  const p = scored[0]?.params;
  const rows: CellValue[][] = [];
  const line = (s: CellValue = '') => rows.push([s]);
  const head = (s: string) => {
    line();
    line(s.toUpperCase());
  };

  line('AUTONOMOUS INSPECTION ROI, MODEL OUTPUT');
  line('Generated by the Drone ROI engine. Every figure derives from the model below.');

  head('What each sheet contains');
  line('Executive Summary, one row per site. Original input columns first, in their original order, then the calculated columns. Rows that could not be priced show blank figures and a status of "model incomplete".');
  line('Detailed Calculations, every intermediate value, for the current area and again for the target area. The target block is separated by a header band.');
  line('Audit Trail, each formula in plain English with its inputs and computed value, per site, plus the resolved source of every autonomous parameter.');
  line('Sensitivity Analysis, autonomous cost and cost ratio at docks-per-operator of 2, 4, 6 and 8, per site, at the current area.');
  line('Charts, native Excel charts bound to cell ranges on the Executive Summary. Editing a figure there moves the chart. These are not images.');
  line('Exceptions, invalid or skipped rows with a specific reason each. Omitted when empty.');
  line('Original Input, the source worksheet, unmodified.');

  head('The model');
  line('manualHours   = resources x shiftHours x workDays');
  line('manualCost    = resources x salary');
  line('hourlyRate    = salary / (shiftHours x workDays)');
  line('hoursPerDock  = dockHours x dockDays');
  line('docks         = roundUp( manualHours / (hoursPerDock x subFactor) )');
  line('operators     = roundUp( docks / docksPerOperator )');
  line('autoCost      = docks x dockCost + operators x opCost');
  line('saving        = manualCost - autoCost');
  line('costRatio     = autoCost / manualCost');
  line('returnPct     = saving / autoCost');
  line('paybackMonths = implCost / (saving / 12)');
  line('hoursMultiple = hoursPerDock / (shiftHours x workDays)');

  head('Rounding, and why it differs by quantity');
  line('Docks and operators each round up, independently. A dock is a purchase and an operator is a hire: you cannot buy four tenths of a dock or hire a fifth of a person. The operator ratio is applied to the whole dock count, never to a fractional one.');
  line('Manual resources at the target area are NOT rounded. They are a linear extrapolation of the customer\'s own staffing that nobody has committed to, not something we procure, a different epistemic status, so a different rule. Rounding 168.75 up to 169 would also inflate manual cost, which flatters the seller, and would turn manual cost into a step function that obscures the linear-versus-sub-linear contrast the target scenario exists to show. Target-area resources are therefore shown to two decimal places.');

  head('The target-area scenario');
  line('Resources are scaled by targetArea / area and every line is recomputed, substituting the at-scale docks-per-operator ratio. Nothing is averaged, smoothed or interpolated between the two scenarios.');

  head('Area, and what it does');
  line('Area enters the model only as the ratio targetArea / area, and as the denominator of the cost-per-unit-area display lines. The model does not price per square foot. If a customer engineer asks where the square footage went, that is the honest answer.');
  line('An optional Area Unit column is read if present. If the current and target areas carry different units, the row is not priced and appears in Exceptions. If no unit is given, both areas are assumed to share whatever unit the customer used, safe exactly as long as they match. A scale factor outside roughly 0.1x to 50x raises a warning, because that band catches a square-feet-against-acres mix-up without refusing a genuine tenfold expansion.');

  head('Row validation');
  line('A row is not priced if any required field is missing, non-numeric, negative or zero. Required fields: current area, manual resources, salary, target area, shift hours, working days.');
  line('Salary and target area are included in the zero check even though the brief names only four fields, because a zero in either produces a division by zero: zero salary makes manual cost zero and the cost ratio infinite, and zero target area collapses the target scenario. No output may contain NaN or infinity, and that requirement wins.');
  line('Invalid rows are never guessed at. They appear in Exceptions with a specific reason, and in the Executive Summary with blank figures and no recommendation text.');

  head('The recommendation rule');
  line('Evaluated in this order, on the CURRENT-AREA figures:');
  line(`1. costRatio <= 0.35 AND paybackMonths <= 12  ->  "${TIER_TEXT.strong}"`);
  line(`2. costRatio <= 0.60 AND paybackMonths <= 24  ->  "${TIER_TEXT.viable}"`);
  line(`3. costRatio >= 1.00                          ->  "${TIER_TEXT['no-standalone']}"`);
  line(`4. otherwise                                  ->  "${TIER_TEXT.marginal}"`);
  line('Both conditions are required in tiers 1 and 2, not either. Invalid rows receive no recommendation at all.');
  line('Where the current and target areas fall into different tiers, the Status column says so ("tier improves at target" or "tier weakens at target"). That is a signal, not a conflict, and neither figure is silently preferred.');
  line('These are rule-derived assessments of what the model shows at the inputs given. They are not guarantees, forecasts or predictions of outcome.');

  head('Parameter resolution');
  line('Each autonomous parameter is resolved in this order: a per-row override column, then a Parameters sheet in the input workbook, then the built-in default. The source is recorded for every parameter of every site in the Audit Trail. A tier that supplies a present-but-invalid value does not fall through silently, the rejection is recorded.');

  head('Source of every default');
  line('All autonomous-side defaults are placeholders. None is derived from commercial data and none is an industry benchmark. They exist so the model runs before real figures are available, and they must be replaced before this workbook is shown to a customer.');
  if (p) {
    line(`dockHours = ${p.dockHours}   dockDays = ${p.dockDays}   subFactor = ${p.subFactor}`);
    line(`dockCost = ${p.dockCost}   opCost = ${p.opCost}`);
    line(`docksPerOperator now = ${p.ratioNow}   at scale = ${p.ratioScale}`);
    line(`implementation = ${p.implCost}   currency = ${p.currency}`);
  }

  head('The substitution factor is the key uncertainty');
  line('It expresses drone hours against labour hours. The default of 1.0 is deliberately conservative: a docked drone does not spend time mobilising to the asset, so the true figure is likely higher than 1.0. It should be raised only against evidence from the site in question, and it moves the dock count more than any other parameter.');

  head('Scope limitation');
  line('This model prices labour displacement only.');
  line('It explicitly excludes avoided scaffolding and rope access, avoided shutdown windows, compliance penalty exposure, and unplanned downtime. At industrial scale each of these is typically larger than the labour line. A business case built on this workbook alone understates the value, and should be read as a floor rather than an estimate.');
  line('No industry benchmark figure appears anywhere in this workbook. Every number is either derived from the model or was supplied by the user.');

  return rows;
}
