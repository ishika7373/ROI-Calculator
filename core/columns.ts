import type { DiscoveryInputs, Params, Raw } from './types.js';
import { coerceNumber } from './validate.js';
import { DEFAULT_PARAMS } from './defaults.js';

/**
 * Header matching and parameter resolution.
 *
 * Lives in /core because both delivery modes must resolve a row identically, * if the web app and the CLI disagreed about which column fed which field, the
 * parity test would compare two different questions.
 */

/**
 * Normalise a header: lowercase, strip everything that is not alphanumeric,
 * collapse the unit spellings that mean the same thing.
 *
 * This is what lets `Salary per Resource ($/yr)` and `Salary per Resource ($/year)`
 * resolve to the same field without an alias entry for every spelling.
 */
export function normaliseHeader(header: string): string {
  let s = header.toLowerCase();
  s = s.replace(/[$€£¥₹]/g, '');
  s = s.replace(/\bsq\.?\s*ft\b|\bsquare\s*feet\b|\bsqft\b/g, 'sqft');
  s = s.replace(/\bsq\.?\s*m\b|\bsquare\s*met(er|re)s?\b|\bsqm\b/g, 'sqm');
  s = s.replace(/\byrs?\b|\byears?\b/g, 'yr');
  s = s.replace(/[^a-z0-9]/g, '');
  return s;
}

/** Field aliases, for the cases normalisation alone cannot reach. */
const FIELD_ALIASES: Record<string, string[]> = {
  area: ['currentsurveyareasqft', 'currentsurveyarea', 'surveyarea', 'currentarea', 'area'],
  resources: ['manualresources', 'resources', 'headcount', 'manualheadcount'],
  salary: [
    'salaryperresourceyr',
    'salaryperresource',
    'salaryperresourceperyr',
    'fullyloadedcostperresourceyr',
    'fullyloadedcost',
    'salary',
  ],
  targetArea: ['targetareasqft', 'targetarea', 'futurearea', 'targetfuturearea'],
  shiftHours: ['shifthours', 'shifthoursperday'],
  workDays: ['workingdays', 'workingdaysperyr', 'workdays', 'workingdaysperyear'],
  areaUnit: ['areaunit', 'unit', 'areaunits'],
};

const PARAM_ALIASES: Record<keyof Params, string[]> = {
  dockHours: ['dockhoursperday', 'dockhours'],
  dockDays: ['operatingdaysperyr', 'operatingdays', 'dockdays'],
  subFactor: ['substitutionfactor', 'subfactor'],
  dockCost: ['costperdockperyr', 'costperdock', 'dockcost'],
  opCost: ['costperoperatorperyr', 'costperoperator', 'operatorcost'],
  ratioNow: ['docksperoperatornow', 'docksperoperator', 'rationow'],
  ratioScale: ['docksperoperatoratscale', 'ratioatscale', 'ratioscale'],
  implCost: ['implementationcost', 'onetimeimplementation', 'implcost'],
  currency: ['currency', 'currencycode'],
};

export interface HeaderMapping {
  /** field name -> the original header text that fed it */
  resolved: Record<string, string>;
  /** headers that matched nothing and are carried through untouched */
  passthrough: string[];
  /** required fields with no matching header */
  missing: string[];
  /** fields matched by more than one header, an error, never a coin flip */
  ambiguous: Record<string, string[]>;
}

const REQUIRED_FIELDS = [
  'area',
  'resources',
  'salary',
  'targetArea',
  'shiftHours',
  'workDays',
] as const;

/**
 * Map a row's headers onto model fields.
 *
 * An unresolved required column fails loudly, listing what was found against what
 * was expected. It is never a silent skip and never a zero.
 */
export function mapHeaders(headers: string[]): HeaderMapping {
  const resolved: Record<string, string> = {};
  const hits: Record<string, string[]> = {};
  const passthrough: string[] = [];

  const allAliases: Record<string, string[]> = { ...FIELD_ALIASES };
  for (const [param, aliases] of Object.entries(PARAM_ALIASES)) {
    allAliases[param] = aliases;
  }

  for (const header of headers) {
    const norm = normaliseHeader(header);
    let matched: string | null = null;
    for (const [field, aliases] of Object.entries(allAliases)) {
      if (aliases.includes(norm)) {
        matched = field;
        break;
      }
    }
    if (matched === null) {
      passthrough.push(header);
    } else {
      (hits[matched] ??= []).push(header);
    }
  }

  const ambiguous: Record<string, string[]> = {};
  for (const [field, list] of Object.entries(hits)) {
    if (list.length > 1) ambiguous[field] = list;
    else resolved[field] = list[0]!;
  }

  const missing = REQUIRED_FIELDS.filter((f) => !(f in resolved));

  return { resolved, passthrough, missing, ambiguous };
}

/** A human-readable failure for an unresolvable header set. */
export function describeMappingFailure(mapping: HeaderMapping, headers: string[]): string | null {
  const parts: string[] = [];
  if (mapping.missing.length > 0) {
    parts.push(
      `Required column(s) not found: ${mapping.missing.join(', ')}.\n` +
        `  Headers found:    ${headers.join(' | ')}\n` +
        `  Headers expected: ${mapping.missing
          .map((f) => `${f} (e.g. "${FIELD_ALIASES[f]?.[0] ?? f}")`)
          .join(', ')}`,
    );
  }
  for (const [field, list] of Object.entries(mapping.ambiguous)) {
    parts.push(`Column "${field}" matched more than one header: ${list.join(' | ')}.`);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

export type ParamSource = 'row override' | 'Parameters sheet' | 'built-in default';

export interface ResolvedParam {
  value: number | string;
  source: ParamSource;
  /** Set when a tier supplied a value that failed validation and was skipped. */
  rejected?: string;
}

export type ParamResolution = Record<keyof Params, ResolvedParam>;

/**
 * Resolve the autonomous parameters for one row.
 *
 * Order: per-row override, then a Parameters sheet, then the built-in default.
 * A tier that supplies a present-but-invalid value does not fall through
 * silently, the rejection is recorded and carried into the Audit Trail.
 */
export function resolveParams(
  row: Record<string, Raw>,
  mapping: HeaderMapping,
  sheet: Partial<Params> = {},
  defaults: Params = DEFAULT_PARAMS,
): { params: Params; resolution: ParamResolution } {
  const resolution = {} as ParamResolution;
  const params = { ...defaults };

  for (const key of Object.keys(PARAM_ALIASES) as (keyof Params)[]) {
    if (key === 'currency') {
      const header = mapping.resolved[key];
      const raw = header ? row[header] : undefined;
      const fromRow = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
      const fromSheet = typeof sheet.currency === 'string' ? sheet.currency : null;
      if (fromRow) {
        params.currency = fromRow;
        resolution[key] = { value: fromRow, source: 'row override' };
      } else if (fromSheet) {
        params.currency = fromSheet;
        resolution[key] = { value: fromSheet, source: 'Parameters sheet' };
      } else {
        resolution[key] = { value: defaults.currency, source: 'built-in default' };
      }
      continue;
    }

    let rejected: string | undefined;

    // Tier 1, per-row override.
    const header = mapping.resolved[key];
    const rawValue = header ? row[header] : undefined;
    if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      const coerced = coerceNumber(rawValue);
      if (coerced.ok && coerced.value > 0) {
        params[key] = coerced.value;
        resolution[key] = { value: coerced.value, source: 'row override' };
        continue;
      }
      rejected = `row override rejected (${
        coerced.ok ? `not positive: ${coerced.value}` : 'not a number'
      })`;
    }

    // Tier 2, Parameters sheet.
    const sheetValue = sheet[key];
    if (typeof sheetValue === 'number' && Number.isFinite(sheetValue) && sheetValue > 0) {
      params[key] = sheetValue;
      resolution[key] = { value: sheetValue, source: 'Parameters sheet', ...(rejected && { rejected }) };
      continue;
    }

    // Tier 3, built-in default.
    resolution[key] = {
      value: defaults[key],
      source: 'built-in default',
      ...(rejected && { rejected }),
    };
  }

  return { params, resolution };
}

/** Pull the six discovery inputs out of a row using a resolved header mapping. */
export function readDiscovery(
  row: Record<string, Raw>,
  mapping: HeaderMapping,
): DiscoveryInputs {
  const get = (field: string): Raw => {
    const header = mapping.resolved[field];
    return header ? row[header] : undefined;
  };
  return {
    area: get('area'),
    resources: get('resources'),
    salary: get('salary'),
    targetArea: get('targetArea'),
    shiftHours: get('shiftHours'),
    workDays: get('workDays'),
    areaUnit: get('areaUnit'),
    targetAreaUnit: get('areaUnit'),
  };
}
