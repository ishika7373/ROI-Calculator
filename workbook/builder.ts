/**
 * Workbook primitives, isomorphic between Node and the browser.
 *
 * Charts are native `c:chart` parts bound to cell ranges, written by
 * @office-kit/xlsx in the same pass as the cells. There is no post-hoc injection
 * step and nothing re-opens the file afterwards, so there is no ordering hazard
 * of the kind that strips chart parts on a read-modify-write.
 *
 * Series ranges are computed from the actual row count at build time, never
 * hardcoded, so an eleventh site cannot silently fall out of every chart.
 *
 * This module reads no inputs and computes no model values. Every number it
 * writes was produced by /core and handed to it.
 */
import { addWorksheet } from '@office-kit/xlsx/workbook';
import {
  setCell,
  setFreezePanes,
  setColumnWidths,
  addConditionalFormatting,
  makeCfRule,
  makeConditionalFormatting,
} from '@office-kit/xlsx/worksheet';
import { setRangeNumberFormat, setRangeFont, setRangeBackgroundColor } from '@office-kit/xlsx/styles';
import { makeBarChart, makeBarSeries, makeChartSpace, makeLineChart } from '@office-kit/xlsx/chart';
import { addChartAt } from '@office-kit/xlsx/drawing';

type Workbook = ReturnType<typeof import('@office-kit/xlsx/workbook').createWorkbook>;
type Worksheet = ReturnType<typeof addWorksheet>;

export type CellValue = string | number | null;

/** Column letter for a 1-based index. */
export function colLetter(index: number): string {
  let n = index;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** A worksheet-qualified absolute range. */
export function rangeRef(sheet: string, col: number, firstRow: number, lastRow: number): string {
  const c = colLetter(col);
  return `${quoteSheet(sheet)}!$${c}$${firstRow}:$${c}$${lastRow}`;
}

export function cellRef(sheet: string, col: number, row: number): string {
  return `${quoteSheet(sheet)}!$${colLetter(col)}$${row}`;
}

export interface SheetOptions {
  name: string;
  rows: CellValue[][];
  freezeHeader?: boolean;
  widths?: number[];
}

/** Restrained header band — the only fill beyond the conditional scales. */
const HEADER_FILL = 'FFE4EDEF';

export function writeSheet(wb: Workbook, opts: SheetOptions): Worksheet {
  const ws = addWorksheet(wb, opts.name);

  opts.rows.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value === null || value === undefined || value === '') return;
      setCell(ws, r + 1, c + 1, value);
    });
  });

  const maxCols = Math.max(1, ...opts.rows.map((r) => r.length));

  if (opts.freezeHeader && opts.rows.length > 0) {
    setFreezePanes(ws, 'A2');
    const headerRange = `A1:${colLetter(maxCols)}1`;
    setRangeBackgroundColor(wb, ws, headerRange, HEADER_FILL);
    setRangeFont(wb, ws, headerRange, { bold: true });
  }

  if (opts.widths) {
    setColumnWidths(ws, opts.widths);
  } else {
    // Width from the widest cell in each column, bounded so a long note does not
    // push the sheet off-screen.
    const widths: number[] = [];
    for (let c = 0; c < maxCols; c++) {
      let w = 10;
      for (const row of opts.rows) {
        const v = row[c];
        if (v === null || v === undefined) continue;
        w = Math.max(w, Math.min(52, String(v).length + 2));
      }
      widths.push(w);
    }
    setColumnWidths(ws, widths);
  }

  return ws;
}

export function formatRange(
  wb: Workbook,
  ws: Worksheet,
  range: string,
  formatCode: string,
): void {
  setRangeNumberFormat(wb, ws, range, formatCode);
}

/** Number formats used across the workbook. One vocabulary, applied consistently. */
export const FORMATS = {
  currency0: '#,##0;[Red]-#,##0',
  currency2: '#,##0.00;[Red]-#,##0.00',
  percent1: '0.0%',
  percent0: '0%',
  number0: '#,##0',
  number2: '#,##0.00',
  months: '0.0',
  multiple: '0.0"x"',
} as const;

export interface ChartSpec {
  title: string;
  /** Sheet the data lives on. */
  dataSheet: string;
  /** 1-based column holding the category labels. */
  catCol: number;
  /** 1-based columns holding each series. */
  series: { col: number; label: string }[];
  /** Header row holding the series names. */
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  anchor: string;
  kind?: 'bar' | 'line';
  numberFormat?: string;
  /**
   * Stable index for this chart within the workbook. Axis ids derive from it so
   * that two builds of the same data are byte-identical — module-level counters
   * would drift between calls in the same process.
   */
  chartIndex: number;
}

/**
 * One native chart, every series bound to a live cell range.
 *
 * No cached literal values are written, so editing a figure in the workbook
 * moves the bar. That binding is what the integrity test asserts.
 */
export function addBoundChart(ws: Worksheet, spec: ChartSpec): void {
  const { dataSheet, catCol, headerRow, firstDataRow, lastDataRow } = spec;
  const numberFormat = spec.numberFormat ?? FORMATS.number0;

  const cat = {
    ref: rangeRef(dataSheet, catCol, firstDataRow, lastDataRow),
    cacheKind: 'str' as const,
  };

  const series = spec.series.map((s, i) =>
    makeBarSeries({
      idx: i,
      order: i,
      tx: { kind: 'ref' as const, ref: cellRef(dataSheet, s.col, headerRow) },
      val: { ref: rangeRef(dataSheet, s.col, firstDataRow, lastDataRow) },
      cat,
    }),
  );

  const axA = 1000 + spec.chartIndex * 2;
  const axB = axA + 1;

  const chart =
    spec.kind === 'line'
      ? makeLineChart({ grouping: 'standard', series: series as never, axIds: [axA, axB] })
      : makeBarChart({
          barDir: 'col',
          grouping: 'clustered',
          series,
          axIds: [axA, axB],
          gapWidth: 60,
        });

  const space = makeChartSpace({
    plotArea: {
      chart,
      catAx: { axId: axA, crossAx: axB, position: 'b' },
      valAx: {
        axId: axB,
        crossAx: axA,
        position: 'l',
        numFmt: { formatCode: numberFormat, sourceLinked: false },
      },
    },
    title: spec.title,
    legend: { position: 'b' },
    plotVisOnly: true,
  });

  addChartAt(ws, spec.anchor, { space }, { widthPx: 660, heightPx: 380 });
}

/**
 * Conditional formatting. Applied to Cost Ratio and Payback Months only, as a
 * restrained two-point scale — moss where the figure is favourable, amber tint
 * where it is not.
 */
export function addRatioScale(ws: Worksheet, sqref: string, priority: number): void {
  // The library models colour scales as verbatim child markup rather than a typed
  // structure, so the two-point scale is written as the OOXML it round-trips.
  const innerXml =
    '<colorScale>' +
    '<cfvo type="min"/><cfvo type="max"/>' +
    '<color rgb="FFE4EFE8"/><color rgb="FFFBEEDF"/>' +
    '</colorScale>';
  addConditionalFormatting(
    ws,
    makeConditionalFormatting({
      sqref,
      rules: [makeCfRule({ type: 'colorScale', priority, formulas: [], innerXml })],
    }),
  );
}
