import type { DiscoveryInputs, Issue, Params, Raw, Warning } from './types.js';
import { DEFAULT_AREA_UNIT, SCALE_FACTOR_MAX, SCALE_FACTOR_MIN } from './defaults.js';

/** Human-facing labels, so an issue names the field the way the customer saw it. */
const LABELS: Record<string, string> = {
  area: 'Current Survey Area',
  resources: 'Manual Resources',
  salary: 'Salary per Resource',
  targetArea: 'Target Area',
  shiftHours: 'Shift Hours',
  workDays: 'Working Days',
  dockHours: 'Dock Hours per Day',
  dockDays: 'Operating Days per Year',
  subFactor: 'Substitution Factor',
  dockCost: 'Cost per Dock per Year',
  opCost: 'Cost per Operator per Year',
  ratioNow: 'Docks per Operator Now',
  ratioScale: 'Docks per Operator at Scale',
  implCost: 'Implementation Cost',
};

export function labelFor(field: string): string {
  return LABELS[field] ?? field;
}

export type Coerced =
  | { ok: true; value: number }
  | { ok: false; reason: 'missing' | 'non-numeric'; detail?: string };

/**
 * Strict coercion.
 *
 * Accepts thousands separators, surrounding whitespace and a leading currency
 * symbol, because spreadsheets and CSV exports routinely produce them. Rejects
 * everything else, "60k" and "n/a" are not numbers, and guessing what they meant
 * is exactly what this engine must never do.
 */
export function coerceNumber(raw: Raw): Coerced {
  if (raw === null || raw === undefined) return { ok: false, reason: 'missing' };

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { ok: false, reason: 'non-numeric', detail: String(raw) };
    }
    return { ok: true, value: raw };
  }

  if (typeof raw !== 'string') {
    return { ok: false, reason: 'non-numeric', detail: typeof raw };
  }

  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'missing' };

  const cleaned = trimmed.replace(/^[$€£¥₹]\s?/, '').replace(/,/g, '');
  // Reject anything that is not a plain decimal number after cleaning.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    return { ok: false, reason: 'non-numeric', detail: trimmed };
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'non-numeric', detail: trimmed };
  }
  return { ok: true, value };
}

/** Normalise a unit label for comparison. Deliberately vocabulary-free. */
export function normaliseUnit(raw: Raw): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return null;
  const stripped = s.replace(/[^a-z0-9]/g, '');
  if (stripped === '') return null;
  // Collapse the handful of spellings that mean the same thing, so "sq ft",
  // "sqft" and "ft2" do not read as a unit mismatch.
  const collapsed = stripped
    .replace(/^square/, 'sq')
    .replace(/^sqfeet$|^sqft$|^ft2$|^footage$/, 'sqft')
    .replace(/^sqmetres$|^sqmeters$|^sqm$|^m2$/, 'sqm')
    .replace(/^acres$/, 'acre')
    .replace(/^hectares$/, 'hectare');
  return collapsed;
}

/** Pretty-print a unit for labels, falling back to whatever the customer typed. */
export function displayUnit(raw: Raw): string {
  if (raw === null || raw === undefined) return DEFAULT_AREA_UNIT;
  const s = String(raw).trim();
  return s === '' ? DEFAULT_AREA_UNIT : s;
}

export interface ValidatedInputs {
  area: number;
  resources: number;
  salary: number;
  targetArea: number;
  shiftHours: number;
  workDays: number;
}

export interface ValidationOutcome {
  issues: Issue[];
  warnings: Warning[];
  values: ValidatedInputs | null;
  areaUnit: string;
}

/**
 * Fields that must be strictly positive.
 *
 * The brief names area, resources, shiftHours and workDays. Salary and targetArea
 * are extended to the same rule because a zero in either produces a division by
 * zero downstream, zero salary makes manualCost zero, which makes costRatio
 * infinite, and zero targetArea collapses the target scenario to 0/0. The brief's
 * stronger requirement is that no input combination may yield NaN or Infinity, so
 * that requirement wins.
 */
const POSITIVE_FIELDS = [
  'area',
  'resources',
  'salary',
  'targetArea',
  'shiftHours',
  'workDays',
] as const;

/** Validate the six discovery inputs plus the optional area units. */
export function validateDiscovery(inputs: DiscoveryInputs): ValidationOutcome {
  const issues: Issue[] = [];
  const warnings: Warning[] = [];
  const values: Partial<ValidatedInputs> = {};

  for (const field of POSITIVE_FIELDS) {
    const coerced = coerceNumber(inputs[field]);
    const label = labelFor(field);

    if (!coerced.ok) {
      issues.push({
        field,
        reason:
          coerced.reason === 'missing'
            ? `${label} is missing`
            : `${label} is not a number ("${coerced.detail}")`,
      });
      continue;
    }

    if (coerced.value < 0) {
      issues.push({ field, reason: `${label} is negative (${coerced.value})` });
      continue;
    }
    if (coerced.value === 0) {
      issues.push({ field, reason: `${label} is zero, which leaves the model undefined` });
      continue;
    }

    values[field] = coerced.value;
  }

  // Unit mismatch. Absent units are assumed to match, because the model is
  // dimensionless and that assumption is safe exactly as long as they do.
  const unitA = normaliseUnit(inputs.areaUnit);
  const unitB = normaliseUnit(inputs.targetAreaUnit);
  if (unitA !== null && unitB !== null && unitA !== unitB) {
    issues.push({
      field: 'areaUnit',
      reason:
        `Current area is in ${displayUnit(inputs.areaUnit)} but target area is in ` +
        `${displayUnit(inputs.targetAreaUnit)}. The scale factor between different ` +
        `units is meaningless, so this row is not priced.`,
    });
  }

  const areaUnit = displayUnit(inputs.areaUnit ?? inputs.targetAreaUnit);

  if (issues.length > 0) {
    return { issues, warnings, values: null, areaUnit };
  }

  const complete = values as ValidatedInputs;

  // Scale factor plausibility. A warning, never a rejection: a genuine tenfold
  // expansion is a real scenario and the validator must not refuse to price it.
  const scaleFactor = complete.targetArea / complete.area;
  if (scaleFactor < SCALE_FACTOR_MIN || scaleFactor > SCALE_FACTOR_MAX) {
    warnings.push({
      code: 'scale-factor-implausible',
      message:
        `Target area is ${formatFactor(scaleFactor)} times the current area. That is ` +
        `outside the plausible band of ${SCALE_FACTOR_MIN}x to ${SCALE_FACTOR_MAX}x and ` +
        `often indicates the two areas were entered in different units. The row is still ` +
        `priced; check the figures before using them.`,
    });
  }

  return { issues, warnings, values: complete, areaUnit };
}

function formatFactor(x: number): string {
  if (x >= 100 || x < 0.01) return x.toExponential(2);
  return String(Math.round(x * 100) / 100);
}

/** Validate the autonomous-side parameters. */
export function validateParams(params: Params): Issue[] {
  const issues: Issue[] = [];

  const mustBePositive = [
    'dockHours',
    'dockDays',
    'subFactor',
    'ratioNow',
    'ratioScale',
  ] as const;
  const mustBeNonNegative = ['dockCost', 'opCost', 'implCost'] as const;

  for (const field of mustBePositive) {
    const v = params[field];
    const label = labelFor(field);
    if (!Number.isFinite(v)) {
      issues.push({ field, reason: `${label} is not a number` });
    } else if (v <= 0) {
      issues.push({
        field,
        reason:
          field === 'subFactor'
            ? `${label} is ${v}; it divides the dock calculation and must be greater than zero`
            : `${label} is ${v}; it must be greater than zero`,
      });
    }
  }

  for (const field of mustBeNonNegative) {
    const v = params[field];
    const label = labelFor(field);
    if (!Number.isFinite(v)) {
      issues.push({ field, reason: `${label} is not a number` });
    } else if (v < 0) {
      issues.push({ field, reason: `${label} is negative (${v})` });
    }
  }

  return issues;
}
