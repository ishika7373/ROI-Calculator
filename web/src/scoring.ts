import {
  DEFAULT_PARAMS,
  mapHeaders,
  readDiscovery,
  resolveParams,
  runModel,
} from '../../core/index.js';
import type { ModelResult, Params, ParamResolution, Raw } from '../../core/index.js';
import { PARAMETERS_SHEET, PORTFOLIO } from '../../fixtures/portfolio.js';
import type { RawRow } from '../../fixtures/portfolio.js';

/**
 * Portfolio scoring.
 *
 * This is the same path the CLI takes: map headers, resolve parameters, call
 * runModel. Nothing here computes anything itself — if it did, the two modes
 * could drift and the parity test would stop meaning anything.
 */

export interface ScoredSite {
  index: number;
  customer: string;
  site: string;
  industry: string;
  /** Unrecognised columns, carried through untouched and in original order. */
  passthrough: Record<string, string>;
  raw: RawRow;
  result: ModelResult;
  resolution: ParamResolution;
  params: Params;
}

/**
 * Headers come from the rows themselves, in order of first appearance.
 *
 * Deliberately NOT seeded from the fixture's column list: doing so invented a
 * column for any input workbook that happened not to carry it, which showed up
 * as an empty "Region" column when scoring a real customer file.
 */
const headersOf = (rows: RawRow[]): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  return ordered;
};

export function scorePortfolio(rows: RawRow[] = PORTFOLIO): ScoredSite[] {
  const headers = headersOf(rows);
  const mapping = mapHeaders(headers);

  return rows.map((raw, index) => {
    const row = raw as unknown as Record<string, Raw>;
    const { params, resolution } = resolveParams(row, mapping, PARAMETERS_SHEET, DEFAULT_PARAMS);
    const result = runModel(readDiscovery(row, mapping), params);

    const passthrough: Record<string, string> = {};
    for (const header of mapping.passthrough) {
      const value = row[header];
      if (header === 'Customer' || header === 'Site' || header === 'Industry') continue;
      passthrough[header] = value === null || value === undefined ? '' : String(value);
    }

    return {
      index,
      customer: raw.Customer,
      site: raw.Site,
      industry: raw.Industry,
      passthrough,
      raw,
      result,
      resolution,
      params,
    };
  });
}

export interface PortfolioTotals {
  sites: number;
  priced: number;
  incomplete: number;
  manualCost: number;
  autoCost: number;
  saving: number;
  costRatio: number | null;
  docks: number;
  operators: number;
}

/** Aggregate only over rows that actually priced. Incomplete rows are counted, never guessed. */
export function totalsFor(scored: ScoredSite[], scenario: 'current' | 'target'): PortfolioTotals {
  let manualCost = 0;
  let autoCost = 0;
  let docks = 0;
  let operators = 0;
  let priced = 0;

  for (const s of scored) {
    if (s.result.status !== 'ok') continue;
    const m = scenario === 'current' ? s.result.current : s.result.target;
    manualCost += m.manualCost;
    autoCost += m.autoCost;
    docks += m.docks;
    operators += m.operators;
    priced++;
  }

  return {
    sites: scored.length,
    priced,
    incomplete: scored.length - priced,
    manualCost,
    autoCost,
    saving: manualCost - autoCost,
    costRatio: manualCost > 0 ? autoCost / manualCost : null,
    docks,
    operators,
  };
}
