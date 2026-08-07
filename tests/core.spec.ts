import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVERY,
  DEFAULT_PARAMS,
  ceilCount,
  computeScenario,
  coerceNumber,
  formatMonths,
  formatMultiple,
  formatPercent,
  formatReturn,
  roundHalfUp,
  runModel,
  sensitivity,
  tierFor,
  normaliseUnit,
} from '../core/index.js';
import type { DiscoveryInputs, ModelOk, Params } from '../core/types.js';

/** Narrow to the ok branch, failing loudly if the row did not calculate. */
function ok(result: ReturnType<typeof runModel>): ModelOk {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got model incomplete: ${JSON.stringify(result.issues)}`);
  }
  return result;
}

const defaults = () => runModel({ ...DEFAULT_DISCOVERY });

// ---------------------------------------------------------------------------
// 1. Acceptance: defaults, current area
// ---------------------------------------------------------------------------

describe('acceptance, defaults, current area', () => {
  const r = () => ok(defaults()).current;

  it('manualHours = 240,000', () => expect(r().manualHours).toBe(240_000));
  it('manualCost = $8,000,000', () => expect(r().manualCost).toBe(8_000_000));
  it('hoursPerDock = 8,760', () => expect(r().hoursPerDock).toBe(8_760));
  it('docks = 28', () => expect(r().docks).toBe(28));
  it('operators = 7', () => expect(r().operators).toBe(7));
  it('autoCost = $1,820,000', () => expect(r().autoCost).toBe(1_820_000));
  it('saving = $6,180,000', () => expect(r().saving).toBe(6_180_000));

  it('costRatio raw = 0.2275, rendered 22.8%', () => {
    expect(r().costRatio).toBeCloseTo(0.2275, 10);
    expect(formatPercent(r().costRatio)).toBe('22.8%');
  });

  // Two layers, so a formatting change and a model error do not produce the same
  // red test. The raw value sits 0.018% from the 339/340 display boundary.
  it('returnPct raw = 3.3956 to four places', () => {
    expect(r().returnPct).not.toBeNull();
    expect(roundHalfUp(r().returnPct!, 4)).toBe(3.3956);
  });
  it('returnPct rendered = 340%', () => expect(formatReturn(r().returnPct)).toBe('340%'));

  it('hoursMultiple raw = 3.65, rendered 3.7x', () => {
    expect(r().hoursMultiple).toBeCloseTo(3.65, 10);
    expect(formatMultiple(r().hoursMultiple)).toBe('3.7x');
  });

  it('paybackMonths raw = 0.4854, rendered 0.5', () => {
    expect(roundHalfUp(r().paybackMonths!, 4)).toBe(0.4854);
    expect(formatMonths(r().paybackMonths)).toBe('0.5');
  });

  it('hourlyRate = 33.33 (asserted directly, it appears in no acceptance figure)', () => {
    expect(r().hourlyRate).toBeCloseTo(80_000 / 2_400, 10);
    expect(roundHalfUp(r().hourlyRate, 2)).toBe(33.33);
  });
});

// ---------------------------------------------------------------------------
// 2. Acceptance: defaults, target area
// ---------------------------------------------------------------------------

describe('acceptance, defaults, target area', () => {
  const r = () => ok(defaults()).target;

  it('manualCost = $16,000,000', () => expect(r().manualCost).toBe(16_000_000));
  it('docks = 55', () => expect(r().docks).toBe(55));
  it('operators = 10', () => expect(r().operators).toBe(10));
  it('autoCost = $3,275,000', () => expect(r().autoCost).toBe(3_275_000));
  it('costRatio rendered = 20.5%', () => expect(formatPercent(r().costRatio)).toBe('20.5%'));
  it('manualHours = 480,000', () => expect(r().manualHours).toBe(480_000));
  it('scaleFactor = 2', () => expect(r().scaleFactor).toBe(2));
});

// ---------------------------------------------------------------------------
// 3. Acceptance: sensitivity
// ---------------------------------------------------------------------------

describe('acceptance, sensitivity at current area', () => {
  const rows = () => ok(defaults()).sensitivity;

  it('6:1 gives autoCost $1,660,000', () => {
    const row = rows().find((s) => s.ratio === 6)!;
    expect(row.operators).toBe(5);
    expect(row.autoCost).toBe(1_660_000);
  });

  it('2:1, 4:1 and 8:1 computed independently', () => {
    const byRatio = Object.fromEntries(rows().map((s) => [s.ratio, s]));
    expect(byRatio[2]!.operators).toBe(14);
    expect(byRatio[2]!.autoCost).toBe(28 * 45_000 + 14 * 80_000);
    expect(byRatio[4]!.operators).toBe(7);
    expect(byRatio[8]!.operators).toBe(4); // 28/8 = 3.5, rounds up
    expect(byRatio[8]!.autoCost).toBe(28 * 45_000 + 4 * 80_000);
  });

  it('the 4:1 row reconciles with the headline autoCost', () => {
    const row = rows().find((s) => s.ratio === 4)!;
    expect(row.autoCost).toBe(ok(defaults()).current.autoCost);
  });
});

// ---------------------------------------------------------------------------
// 4. Named rule tests, a failure names the rule that broke
// ---------------------------------------------------------------------------

describe('RULE: ceiling is non-commutative with linear scaling', () => {
  // Scaling resources then ceiling gives 55 docks. Ceiling then scaling gives 56.
  // This is the test that catches scaling the wrong quantity.
  it('target docks are 55, not 2 x 28 = 56', () => {
    const t = ok(defaults()).target;
    expect(t.docks).toBe(55);
    expect(t.docks).not.toBe(56);
    expect(t.docksExact).toBeCloseTo(480_000 / 8_760, 10);
  });
});

describe('RULE: the target scenario substitutes ratioScale for ratioNow', () => {
  it('target operators are 10 (55/6), not 14 (55/4)', () => {
    const r = ok(defaults());
    expect(r.target.ratioUsed).toBe(DEFAULT_PARAMS.ratioScale);
    expect(r.target.operators).toBe(10);
    expect(r.target.operators).not.toBe(14);
  });

  it('the current scenario still uses ratioNow, no cross-contamination', () => {
    const r = ok(defaults());
    expect(r.current.ratioUsed).toBe(DEFAULT_PARAMS.ratioNow);
    expect(r.current.operators).toBe(7);
  });
});

describe('RULE: anything we buy or hire rounds up; extrapolations stay continuous', () => {
  it('docks and operators each round up independently', () => {
    // 90 resources scaled to 150000/80000 = 1.875 -> 168.75 resources
    const r = ok(
      runModel({
        area: 80_000,
        resources: 90,
        salary: 82_000,
        targetArea: 150_000,
        shiftHours: 8,
        workDays: 310,
      }),
    );
    expect(r.target.resources).toBeCloseTo(168.75, 10);
    expect(Number.isInteger(r.target.docks)).toBe(true);
    expect(Number.isInteger(r.target.operators)).toBe(true);
    expect(r.target.docks).toBe(Math.ceil(r.target.docksExact));
    expect(r.target.operators).toBe(Math.ceil(r.target.docks / DEFAULT_PARAMS.ratioScale));
  });

  it('scaled resources are never rounded, 168.75 stays 168.75', () => {
    const r = ok(
      runModel({
        area: 80_000,
        resources: 90,
        salary: 82_000,
        targetArea: 150_000,
        shiftHours: 8,
        workDays: 310,
      }),
    );
    expect(r.target.resources).not.toBe(169);
    expect(r.target.manualHours).toBeCloseTo(168.75 * 8 * 310, 8);
    expect(r.target.manualCost).toBeCloseTo(168.75 * 82_000, 8);
    // Docks derive from the fractional hours, then round up.
    expect(r.target.docksExact).toBeCloseTo(
      (168.75 * 8 * 310) / (8_760 * 1.0),
      10,
    );
  });
});

describe('RULE: the operator ratio is applied to whole docks', () => {
  // For integer ratios this is provably inert: ceil(ceil(x)/r) === ceil(x/r) always.
  // It only has teeth at fractional ratios, which are now permitted.
  it('is inert for integer ratios (proof by exhaustion)', () => {
    let disagreements = 0;
    for (let hours = 1; hours <= 200_000; hours += 137) {
      for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12]) {
        const x = hours / 8_760;
        if (Math.ceil(Math.ceil(x) / r) !== Math.ceil(x / r)) disagreements++;
      }
    }
    expect(disagreements).toBe(0);
  });

  it('bites at fractional ratios, 5.5 docks per operator', () => {
    const params: Params = { ...DEFAULT_PARAMS, ratioNow: 5.5 };
    const r = ok(runModel({ ...DEFAULT_DISCOVERY }, params));
    // 28 whole docks / 5.5 = 5.09 -> 6 operators.
    expect(r.current.operators).toBe(6);
    // The fractional-dock path would give ceil(27.397/5.5) = ceil(4.98) = 5.
    expect(Math.ceil(r.current.docksExact / 5.5)).toBe(5);
    expect(r.current.operators).not.toBe(5);
  });

  it('accepts a fractional ratio as a real staffing plan', () => {
    const params: Params = { ...DEFAULT_PARAMS, ratioNow: 2.5 };
    const r = ok(runModel({ ...DEFAULT_DISCOVERY }, params));
    expect(r.current.operatorsExact).toBeCloseTo(28 / 2.5, 10);
    expect(r.current.operators).toBe(12); // 11.2 -> 12
  });
});

describe('RULE: substitution factor moves docks in the stated direction', () => {
  const docksAt = (subFactor: number) =>
    ok(runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, subFactor })).current.docks;

  it('a higher substitution factor reduces docks', () => {
    expect(docksAt(0.5)).toBe(55);
    expect(docksAt(0.8)).toBe(35);
    expect(docksAt(1.0)).toBe(28);
    expect(docksAt(1.5)).toBe(19);
    expect(docksAt(2.0)).toBe(14);
  });

  it('is strictly monotonic across the plausible range', () => {
    const series = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(docksAt);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!).toBeLessThan(series[i - 1]!);
    }
  });

  it('is not ignored, 1.0 is the only value where it is invisible', () => {
    expect(docksAt(1.0)).not.toBe(docksAt(1.5));
  });
});

describe('RULE: operator cost is distinct from resource salary', () => {
  it('changing opCost alone moves autoCost', () => {
    const base = ok(defaults()).current.autoCost;
    const bumped = ok(
      runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, opCost: 90_000 }),
    ).current.autoCost;
    expect(bumped - base).toBe(7 * 10_000);
  });

  it('changing salary alone does not move autoCost', () => {
    const base = ok(defaults()).current.autoCost;
    const other = ok(runModel({ ...DEFAULT_DISCOVERY, salary: 95_000 })).current.autoCost;
    expect(other).toBe(base);
  });
});

// ---------------------------------------------------------------------------
// 5. Rounding
// ---------------------------------------------------------------------------

describe('rounding', () => {
  it('half-up survives the binary representation of 3.65', () => {
    const hm = 8_760 / 2_400;
    expect(hm.toFixed(1)).toBe('3.6'); // the naive path, documented as wrong here
    expect(roundHalfUp(hm, 1)).toBe(3.7);
  });

  it('half-up handles 22.75 and 20.46875', () => {
    expect(roundHalfUp(22.75, 1)).toBe(22.8);
    expect(roundHalfUp(20.46875, 1)).toBe(20.5);
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(-2.5, 0)).toBe(-3);
    expect(roundHalfUp(-3.65, 1)).toBe(-3.7);
  });

  it('does not round up a value genuinely below the boundary', () => {
    expect(roundHalfUp(3.6499, 1)).toBe(3.6);
    expect(roundHalfUp(0.4499, 1)).toBe(0.4);
  });

  it('ceilCount does not over-count an exact quotient', () => {
    // 26,280 hours is exactly 3 dock-years. Float division must not buy a fourth.
    expect(ceilCount(26_280 / 8_760)).toBe(3);
    for (let k = 1; k <= 500; k++) {
      expect(ceilCount((k * 8_760) / 8_760)).toBe(k);
    }
  });

  it('ceilCount rounds any fraction up', () => {
    expect(ceilCount(27.397)).toBe(28);
    expect(ceilCount(0.0001)).toBe(1);
    expect(ceilCount(3.5)).toBe(4);
  });

  it('ceilCount returns 0 for non-positive input rather than a negative count', () => {
    expect(ceilCount(0)).toBe(0);
    expect(ceilCount(-5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases, none may yield NaN, Infinity, a crash or a silent zero
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  const cases: Array<[string, DiscoveryInputs, string]> = [
    ['zero resources', { ...DEFAULT_DISCOVERY, resources: 0 }, 'resources'],
    ['zero area', { ...DEFAULT_DISCOVERY, area: 0 }, 'area'],
    ['zero target area', { ...DEFAULT_DISCOVERY, targetArea: 0 }, 'targetArea'],
    ['zero salary', { ...DEFAULT_DISCOVERY, salary: 0 }, 'salary'],
    ['zero shift hours', { ...DEFAULT_DISCOVERY, shiftHours: 0 }, 'shiftHours'],
    ['zero working days', { ...DEFAULT_DISCOVERY, workDays: 0 }, 'workDays'],
    ['negative resources', { ...DEFAULT_DISCOVERY, resources: -10 }, 'resources'],
    ['negative salary', { ...DEFAULT_DISCOVERY, salary: -80_000 }, 'salary'],
    ['empty string', { ...DEFAULT_DISCOVERY, area: '' }, 'area'],
    ['whitespace only', { ...DEFAULT_DISCOVERY, workDays: '   ' }, 'workDays'],
    ['null', { ...DEFAULT_DISCOVERY, salary: null }, 'salary'],
    ['undefined', { ...DEFAULT_DISCOVERY, shiftHours: undefined }, 'shiftHours'],
    ['non-numeric string', { ...DEFAULT_DISCOVERY, shiftHours: 'eight' }, 'shiftHours'],
    ['almost-numeric string', { ...DEFAULT_DISCOVERY, area: '60k' }, 'area'],
    ['NaN', { ...DEFAULT_DISCOVERY, resources: Number.NaN }, 'resources'],
    ['Infinity', { ...DEFAULT_DISCOVERY, resources: Number.POSITIVE_INFINITY }, 'resources'],
  ];

  for (const [name, input, field] of cases) {
    it(`${name} -> model incomplete, naming ${field}`, () => {
      const r = runModel(input);
      expect(r.status).toBe('model incomplete');
      expect(r.current).toBeNull();
      expect(r.target).toBeNull();
      expect(r.recommendation).toBeNull();
      expect(r.issues.some((i) => i.field === field)).toBe(true);
    });
  }

  it('subFactor 0 -> model incomplete, not Infinity docks', () => {
    const r = runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, subFactor: 0 });
    expect(r.status).toBe('model incomplete');
    expect(r.issues.some((i) => i.field === 'subFactor')).toBe(true);
  });

  it('negative subFactor and zero ratios -> model incomplete', () => {
    expect(runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, subFactor: -1 }).status).toBe(
      'model incomplete',
    );
    expect(runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, ratioNow: 0 }).status).toBe(
      'model incomplete',
    );
    expect(runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, ratioScale: 0 }).status).toBe(
      'model incomplete',
    );
  });

  it('collects every issue rather than short-circuiting on the first', () => {
    const r = runModel({
      area: 0,
      resources: -1,
      salary: 'abc',
      targetArea: null,
      shiftHours: 8,
      workDays: 300,
    });
    expect(r.status).toBe('model incomplete');
    expect(r.issues.length).toBe(4);
  });

  it('an incomplete row carries no tier and no recommendation text', () => {
    const r = runModel({ ...DEFAULT_DISCOVERY, resources: 0 });
    expect(r.recommendation).toBeNull();
    expect(r.tierCurrent).toBeNull();
    expect(r.tierTarget).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Exhaustive non-finite sweep
// ---------------------------------------------------------------------------

describe('no input combination yields NaN or Infinity in any output field', () => {
  it('sweeps a wide grid of valid inputs', () => {
    const areas = [1, 1_000, 60_000, 5_000_000];
    const resourcesList = [1, 3, 100, 5_000];
    const salaries = [1, 65_000, 250_000];
    const shifts = [1, 8, 24];
    const days = [1, 300, 365];
    const subs = [0.1, 1, 2.5];
    const ratios = [0.5, 4, 5.5, 20];

    let checked = 0;
    for (const area of areas)
      for (const resources of resourcesList)
        for (const salary of salaries)
          for (const shiftHours of shifts)
            for (const workDays of days)
              for (const subFactor of subs)
                for (const ratioNow of ratios) {
                  const r = runModel(
                    { area, resources, salary, targetArea: area * 2, shiftHours, workDays },
                    { ...DEFAULT_PARAMS, subFactor, ratioNow, ratioScale: ratioNow },
                  );
                  checked++;
                  if (r.status !== 'ok') continue;
                  for (const m of [r.current, r.target]) {
                    for (const [key, value] of Object.entries(m)) {
                      if (typeof value !== 'number') continue;
                      expect(
                        Number.isFinite(value),
                        `${key} = ${value} for area=${area} res=${resources} sub=${subFactor}`,
                      ).toBe(true);
                    }
                  }
                  for (const s of r.sensitivity) {
                    expect(Number.isFinite(s.autoCost)).toBe(true);
                    expect(Number.isFinite(s.costRatio)).toBe(true);
                  }
                }
    expect(checked).toBeGreaterThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// 8. Negative saving
// ---------------------------------------------------------------------------

describe('negative saving is a real answer, not a failure', () => {
  // Two resources cannot cover the dock cost, autonomous costs more than manual.
  const negative = () =>
    ok(
      runModel({
        area: 10_000,
        resources: 2,
        salary: 40_000,
        targetArea: 20_000,
        shiftHours: 8,
        workDays: 300,
      }),
    );

  it('still reports cost ratio, docks and operators', () => {
    const c = negative().current;
    expect(c.saving).toBeLessThan(0);
    expect(c.costRatio).toBeGreaterThan(1);
    expect(c.docks).toBeGreaterThan(0);
    expect(c.operators).toBeGreaterThan(0);
  });

  it('returnPct is negative and displayed, not suppressed', () => {
    const c = negative().current;
    expect(c.returnPct).not.toBeNull();
    expect(c.returnPct!).toBeLessThan(0);
    expect(formatReturn(c.returnPct)).toMatch(/^-\d+%$/);
  });

  it('paybackMonths is null and renders as prose, not Infinity', () => {
    const c = negative().current;
    expect(c.paybackMonths).toBeNull();
    expect(formatMonths(c.paybackMonths)).toBe('no payback at these inputs');
  });

  it('falls into the no-standalone tier', () => {
    expect(negative().tierCurrent).toBe('no-standalone');
    expect(negative().recommendation).toBe('Labour case does not stand alone at these inputs');
  });

  it('returnPct is null only when there is no autonomous spend', () => {
    const r = ok(
      runModel({ ...DEFAULT_DISCOVERY }, { ...DEFAULT_PARAMS, dockCost: 0, opCost: 0 }),
    );
    expect(r.current.autoCost).toBe(0);
    expect(r.current.returnPct).toBeNull();
    expect(r.current.costRatio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Recommendation tiers
// ---------------------------------------------------------------------------

describe('recommendation tiers', () => {
  it('defaults land in the strong tier', () => {
    expect(ok(defaults()).tierCurrent).toBe('strong');
    expect(ok(defaults()).recommendation).toBe('Strong case, proceed to scoped study');
  });

  it('requires BOTH conditions in tier 1, not either', () => {
    // Cost ratio qualifies, payback does not. OR would wrongly give 'strong'.
    expect(tierFor(0.3, 18)).toBe('viable');
    // Payback qualifies, cost ratio does not.
    expect(tierFor(0.5, 6)).toBe('viable');
  });

  it('requires BOTH conditions in tier 2', () => {
    expect(tierFor(0.5, 30)).toBe('marginal');
    expect(tierFor(0.8, 20)).toBe('marginal');
  });

  it('is inclusive exactly at the boundaries', () => {
    expect(tierFor(0.35, 12)).toBe('strong');
    expect(tierFor(0.3500001, 12)).toBe('viable');
    expect(tierFor(0.35, 12.0000001)).toBe('viable');
    expect(tierFor(0.6, 24)).toBe('viable');
    expect(tierFor(0.6000001, 24)).toBe('marginal');
  });

  it('places no-standalone ahead of marginal', () => {
    expect(tierFor(1.0, null)).toBe('no-standalone');
    expect(tierFor(1.4, null)).toBe('no-standalone');
    expect(tierFor(0.99, null)).toBe('marginal');
  });

  it('a null payback cannot qualify for tier 1 or 2 on cost ratio alone', () => {
    expect(tierFor(0.2, null)).toBe('marginal');
  });

  it('flags a tier change between current and target rather than picking one', () => {
    const r = ok(defaults());
    expect(typeof r.tierImprovesAtTarget).toBe('boolean');
    expect(r.tierImprovesAtTarget && r.tierWeakensAtTarget).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Area units and scale factor
// ---------------------------------------------------------------------------

describe('area units', () => {
  it('assumes a shared unit when neither is given', () => {
    expect(runModel({ ...DEFAULT_DISCOVERY }).status).toBe('ok');
  });

  it('accepts matching units in different spellings', () => {
    const r = runModel({ ...DEFAULT_DISCOVERY, areaUnit: 'sq ft', targetAreaUnit: 'SQFT' });
    expect(r.status).toBe('ok');
    expect(normaliseUnit('square feet')).toBe(normaliseUnit('sq ft'));
    expect(normaliseUnit('m2')).toBe(normaliseUnit('sq m'));
  });

  it('rejects a genuine unit mismatch rather than scaling across it', () => {
    const r = runModel({
      ...DEFAULT_DISCOVERY,
      areaUnit: 'sq ft',
      targetAreaUnit: 'acres',
    });
    expect(r.status).toBe('model incomplete');
    expect(r.issues.some((i) => i.field === 'areaUnit')).toBe(true);
  });

  it('assumes a shared unit when only one is given', () => {
    expect(runModel({ ...DEFAULT_DISCOVERY, areaUnit: 'sq m' }).status).toBe('ok');
  });

  it('warns on an implausible scale factor but still prices the row', () => {
    // 60,000 sq ft against 120,000 acres, a factor near 2 in numbers but the
    // units differ by 43,560, which shows up as an absurd scale factor.
    const r = runModel({ ...DEFAULT_DISCOVERY, targetArea: 60_000 * 43_560 });
    expect(r.status).toBe('ok');
    expect(r.warnings.some((w) => w.code === 'scale-factor-implausible')).toBe(true);
  });

  it('does not warn on a legitimate tenfold expansion', () => {
    const r = runModel({ ...DEFAULT_DISCOVERY, targetArea: 600_000 });
    expect(r.status).toBe('ok');
    expect(r.warnings.length).toBe(0);
  });

  it('warns on a large contraction too', () => {
    const r = runModel({ ...DEFAULT_DISCOVERY, targetArea: 100 });
    expect(r.warnings.some((w) => w.code === 'scale-factor-implausible')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Coercion
// ---------------------------------------------------------------------------

describe('coercion', () => {
  it('accepts thousands separators, whitespace and a currency symbol', () => {
    expect(coerceNumber('60,000')).toEqual({ ok: true, value: 60_000 });
    expect(coerceNumber('  60000  ')).toEqual({ ok: true, value: 60_000 });
    expect(coerceNumber('$80,000')).toEqual({ ok: true, value: 80_000 });
    expect(coerceNumber('0.5')).toEqual({ ok: true, value: 0.5 });
    expect(coerceNumber('.5')).toEqual({ ok: true, value: 0.5 });
  });

  it('rejects anything it would have to guess at', () => {
    for (const bad of ['60k', 'n/a', 'eight', '1e5', '12abc', '--3', true]) {
      expect(coerceNumber(bad as never).ok).toBe(false);
    }
  });

  it('distinguishes missing from non-numeric', () => {
    expect(coerceNumber(null)).toMatchObject({ ok: false, reason: 'missing' });
    expect(coerceNumber('')).toMatchObject({ ok: false, reason: 'missing' });
    expect(coerceNumber('abc')).toMatchObject({ ok: false, reason: 'non-numeric' });
  });
});

// ---------------------------------------------------------------------------
// 12. Audit trail
// ---------------------------------------------------------------------------

describe('audit trail', () => {
  it('carries a scale factor line so the customer sees what their area became', () => {
    const line = ok(defaults()).audit.find((l) => l.key === 'scaleFactor')!;
    expect(line.current).toBe(1);
    expect(line.target).toBe(2);
    expect(line.targetWorking).toContain('120,000 ÷ 60,000');
  });

  it('shows the ceiling as its own step for docks and operators', () => {
    const audit = ok(defaults()).audit;
    expect(audit.find((l) => l.key === 'docksExact')!.current).toBeCloseTo(27.3972, 3);
    expect(audit.find((l) => l.key === 'docks')!.current).toBe(28);
    expect(audit.find((l) => l.key === 'operatorsExact')!.current).toBe(7);
    expect(audit.find((l) => l.key === 'operators')!.current).toBe(7);
  });

  it('reconciles: every line recomputes from the lines above it', () => {
    const a = Object.fromEntries(ok(defaults()).audit.map((l) => [l.key, l.current!]));
    expect(a.manualHours).toBe(a.resources! * 8 * 300);
    expect(a.hoursPerDock).toBe(24 * 365);
    expect(a.hourlyRate).toBeCloseTo(80_000 / (8 * 300), 10);
    expect(a.hoursMultiple).toBeCloseTo(a.hoursPerDock! / (8 * 300), 10);
    expect(a.manualCost).toBe(a.resources! * 80_000);
    expect(a.operatorsExact).toBeCloseTo(a.docks! / 4, 10);
    expect(a.operators).toBe(Math.ceil(a.operatorsExact!));
    expect(a.docksExact).toBeCloseTo(a.manualHours! / (a.hoursPerDock! * 1.0), 10);
    expect(a.docks).toBe(Math.ceil(a.docksExact!));
    expect(a.autoCost).toBe(a.docks! * 45_000 + a.operators! * 80_000);
    expect(a.saving).toBe(a.manualCost! - a.autoCost!);
    expect(a.costRatio).toBeCloseTo(a.autoCost! / a.manualCost!, 12);
  });

  it('carries the cost-per-area display lines', () => {
    const a = ok(defaults()).audit;
    expect(a.find((l) => l.key === 'manualCostPerArea')!.current).toBeCloseTo(8_000_000 / 60_000, 8);
    expect(a.find((l) => l.key === 'autoCostPerArea')!.target).toBeCloseTo(3_275_000 / 120_000, 8);
  });

  it('states the fractional treatment rather than hiding it', () => {
    const r = ok(
      runModel({
        area: 80_000,
        resources: 90,
        salary: 82_000,
        targetArea: 150_000,
        shiftHours: 8,
        workDays: 310,
      }),
    );
    const line = r.audit.find((l) => l.key === 'resources')!;
    expect(line.target).toBeCloseTo(168.75, 10);
    expect(line.targetWorking).toContain('168.75');
    expect(line.targetWorking).toContain('fractional');
  });
});

// ---------------------------------------------------------------------------
// 13. Purity
// ---------------------------------------------------------------------------

describe('purity', () => {
  it('is deterministic, the same input gives an identical result', () => {
    const a = JSON.stringify(runModel({ ...DEFAULT_DISCOVERY }));
    const b = JSON.stringify(runModel({ ...DEFAULT_DISCOVERY }));
    expect(a).toBe(b);
  });

  it('does not mutate its inputs', () => {
    const input = { ...DEFAULT_DISCOVERY };
    const params = { ...DEFAULT_PARAMS };
    const snapshotIn = JSON.stringify(input);
    const snapshotParams = JSON.stringify(params);
    runModel(input, params);
    expect(JSON.stringify(input)).toBe(snapshotIn);
    expect(JSON.stringify(params)).toBe(snapshotParams);
  });

  it('computeScenario is callable standalone and agrees with runModel', () => {
    const direct = computeScenario({
      scenario: 'current',
      resources: 100,
      salary: 80_000,
      shiftHours: 8,
      workDays: 300,
      areaUsed: 60_000,
      scaleFactor: 1,
      ratio: 4,
      params: DEFAULT_PARAMS,
    });
    expect(direct).toEqual(ok(defaults()).current);
  });

  it('sensitivity is callable standalone and agrees with runModel', () => {
    const r = ok(defaults());
    expect(sensitivity(r.current, DEFAULT_PARAMS)).toEqual(r.sensitivity);
  });
});
