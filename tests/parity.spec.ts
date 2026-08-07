import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  mapHeaders,
  readDiscovery,
  resolveParams,
  runModel,
  toCents,
} from '../core/index.js';
import type { ModelResult, Raw } from '../core/index.js';
import { scorePortfolio } from '../web/src/scoring.js';
import { PARAMETERS_SHEET, PORTFOLIO, INPUT_COLUMNS } from '../fixtures/portfolio.js';
import type { RawRow } from '../fixtures/portfolio.js';

/**
 * Parity.
 *
 * The web path and the CLI path are run over the same fixture rows and asserted
 * to agree exactly, to the cent and to the whole dock. This is the guarantee
 * that the two delivery modes cannot drift.
 *
 * The web path here is the one the app actually uses (scorePortfolio). The CLI
 * path is reconstructed independently below, going through the header matcher
 * and parameter resolver by hand, so that the two are not the same code merely
 * called twice.
 */

/** Twenty fixture rows: the twelve-site portfolio plus eight constructed cases. */
const EXTRA: RawRow[] = [
  {
    Customer: 'Fixture', Site: 'Fractional ratio', Industry: 'Test',
    'Current Survey Area (sq ft)': 30_000, 'Manual Resources': 47,
    'Salary per Resource ($/yr)': 61_500, 'Target Area (sq ft)': 71_000,
    'Shift Hours': 9, 'Working Days': 287, Region: 'Test', Notes: 'fractional operator ratio',
    'Docks per Operator Now': 5.5,
  },
  {
    Customer: 'Fixture', Site: 'High substitution', Industry: 'Test',
    'Current Survey Area (sq ft)': 12_345, 'Manual Resources': 23,
    'Salary per Resource ($/yr)': 71_250, 'Target Area (sq ft)': 40_000,
    'Shift Hours': 11, 'Working Days': 341, Region: 'Test', Notes: '',
    'Substitution Factor': 1.7,
  },
  {
    Customer: 'Fixture', Site: 'Exact dock division', Industry: 'Test',
    'Current Survey Area (sq ft)': 8_760, 'Manual Resources': 3,
    'Salary per Resource ($/yr)': 90_000, 'Target Area (sq ft)': 17_520,
    'Shift Hours': 8, 'Working Days': 365, Region: 'Test', Notes: 'exact quotient',
  },
  {
    Customer: 'Fixture', Site: 'Single resource', Industry: 'Test',
    'Current Survey Area (sq ft)': 500, 'Manual Resources': 1,
    'Salary per Resource ($/yr)': 250_000, 'Target Area (sq ft)': 900,
    'Shift Hours': 24, 'Working Days': 365, Region: 'Test', Notes: '',
  },
  {
    Customer: 'Fixture', Site: 'Thousands separators', Industry: 'Test',
    'Current Survey Area (sq ft)': '75,000', 'Manual Resources': '110',
    'Salary per Resource ($/yr)': '$88,500', 'Target Area (sq ft)': '150,000',
    'Shift Hours': '8', 'Working Days': '295', Region: 'Test', Notes: 'string inputs',
  },
  {
    Customer: 'Fixture', Site: 'Non-numeric', Industry: 'Test',
    'Current Survey Area (sq ft)': 40_000, 'Manual Resources': 'sixty',
    'Salary per Resource ($/yr)': 70_000, 'Target Area (sq ft)': 80_000,
    'Shift Hours': 8, 'Working Days': 300, Region: 'Test', Notes: 'invalid row',
  },
  {
    Customer: 'Fixture', Site: 'Unit mismatch', Industry: 'Test',
    'Current Survey Area (sq ft)': 60_000, 'Manual Resources': 100,
    'Salary per Resource ($/yr)': 80_000, 'Target Area (sq ft)': 3,
    'Shift Hours': 8, 'Working Days': 300, Region: 'Test', Notes: 'implausible scale factor',
  },
  {
    Customer: 'Fixture', Site: 'Contraction', Industry: 'Test',
    'Current Survey Area (sq ft)': 200_000, 'Manual Resources': 300,
    'Salary per Resource ($/yr)': 93_000, 'Target Area (sq ft)': 140_000,
    'Shift Hours': 10, 'Working Days': 310, Region: 'Test', Notes: 'target smaller than current',
  },
];

const FIXTURES: RawRow[] = [...PORTFOLIO, ...EXTRA];

/** The CLI path, reconstructed from the primitives rather than reusing the web helper. */
function cliPath(rows: RawRow[]): ModelResult[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const col of INPUT_COLUMNS) {
    seen.add(col);
    headers.push(col);
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }

  const mapping = mapHeaders(headers);
  return rows.map((raw) => {
    const row = raw as unknown as Record<string, Raw>;
    const { params } = resolveParams(row, mapping, PARAMETERS_SHEET, DEFAULT_PARAMS);
    return runModel(readDiscovery(row, mapping), params);
  });
}

/** Every numeric field of a result, flattened for exact comparison. */
function flatten(r: ModelResult): Record<string, unknown> {
  const out: Record<string, unknown> = { status: r.status };
  if (r.status !== 'ok') {
    out.issues = r.issues.map((i) => `${i.field}:${i.reason}`).join('|');
    return out;
  }
  for (const scenario of ['current', 'target'] as const) {
    const m = r[scenario];
    for (const [k, v] of Object.entries(m)) {
      out[`${scenario}.${k}`] = v;
    }
  }
  out.recommendation = r.recommendation;
  out.tierCurrent = r.tierCurrent;
  out.tierTarget = r.tierTarget;
  out.sensitivity = r.sensitivity.map((s) => `${s.ratio}/${s.docks}/${s.operators}/${s.autoCost}`).join('|');
  return out;
}

describe('parity between the web path and the CLI path', () => {
  const web = scorePortfolio(FIXTURES).map((s) => s.result);
  const cli = cliPath(FIXTURES);

  it('runs twenty fixture rows through both paths', () => {
    expect(FIXTURES.length).toBe(20);
    expect(web).toHaveLength(20);
    expect(cli).toHaveLength(20);
  });

  it('covers the cases that matter, not twenty happy rows', () => {
    const statuses = web.map((r) => r.status);
    expect(statuses.filter((s) => s === 'model incomplete').length).toBeGreaterThanOrEqual(2);
    const okRows = web.filter((r) => r.status === 'ok') as Extract<ModelResult, { status: 'ok' }>[];
    expect(okRows.some((r) => r.current.saving < 0), 'a negative-saving row').toBe(true);
    expect(okRows.some((r) => !Number.isInteger(r.target.resources)), 'a fractional-scaling row').toBe(true);
    expect(okRows.some((r) => r.current.paybackMonths === null), 'a no-payback row').toBe(true);
    expect(web.some((r) => r.warnings.length > 0), 'a warned row').toBe(true);
    expect(okRows.some((r) => !Number.isInteger(r.current.ratioUsed)), 'a fractional ratio').toBe(true);
  });

  for (let i = 0; i < FIXTURES.length; i++) {
    const label = `${FIXTURES[i]!.Customer}, ${FIXTURES[i]!.Site}`;

    it(`row ${i + 1}: ${label} matches exactly`, () => {
      expect(flatten(web[i]!)).toEqual(flatten(cli[i]!));
    });
  }

  it('matches to the cent on every monetary field', () => {
    for (let i = 0; i < FIXTURES.length; i++) {
      const a = web[i]!;
      const b = cli[i]!;
      if (a.status !== 'ok' || b.status !== 'ok') {
        expect(a.status).toBe(b.status);
        continue;
      }
      for (const scenario of ['current', 'target'] as const) {
        for (const field of ['manualCost', 'autoCost', 'saving', 'hourlyRate'] as const) {
          expect(toCents(a[scenario][field]), `${scenario}.${field} on row ${i + 1}`).toBe(
            toCents(b[scenario][field]),
          );
        }
      }
    }
  });

  it('matches to the whole dock and the whole operator', () => {
    for (let i = 0; i < FIXTURES.length; i++) {
      const a = web[i]!;
      const b = cli[i]!;
      if (a.status !== 'ok' || b.status !== 'ok') continue;
      for (const scenario of ['current', 'target'] as const) {
        expect(a[scenario].docks, `docks on row ${i + 1}`).toBe(b[scenario].docks);
        expect(a[scenario].operators, `operators on row ${i + 1}`).toBe(b[scenario].operators);
        expect(Number.isInteger(a[scenario].docks)).toBe(true);
        expect(Number.isInteger(a[scenario].operators)).toBe(true);
      }
    }
  });

  it('agrees on every recommendation, including its absence', () => {
    for (let i = 0; i < FIXTURES.length; i++) {
      expect(web[i]!.recommendation, `recommendation on row ${i + 1}`).toBe(cli[i]!.recommendation);
    }
  });

  it('serialises identically end to end', () => {
    expect(JSON.stringify(web.map(flatten))).toBe(JSON.stringify(cli.map(flatten)));
  });
});
