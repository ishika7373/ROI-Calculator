import type { Params } from '../core/types.js';

/**
 * The mock portfolio.
 *
 * Ten sites carried over from the supplied input workbook, plus two constructed
 * to exercise behaviour twenty happy rows cannot reach. Every column name here is
 * spelled the way a real workbook spells it — including the `$/yr` abbreviation,
 * which differs from the brief's `$/year` and is what forces the header matcher
 * to be alias-tolerant rather than merely case-tolerant.
 *
 * `Notes` and `Region` are unrecognised passthrough columns. Two of them, because
 * one column never catches a column-ordering bug.
 */

export interface RawRow {
  Customer: string;
  Site: string;
  Industry: string;
  'Current Survey Area (sq ft)': number | string | null;
  'Manual Resources': number | string | null;
  'Salary per Resource ($/yr)': number | string | null;
  'Target Area (sq ft)': number | string | null;
  'Shift Hours': number | string | null;
  'Working Days': number | string | null;
  Region: string;
  Notes: string;
  'Substitution Factor'?: number;
  'Docks per Operator Now'?: number;
  'Area Unit'?: string;
}

export const PORTFOLIO: RawRow[] = [
  {
    Customer: 'Shell',
    Site: 'Refinery A',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 60_000,
    'Manual Resources': 100,
    'Salary per Resource ($/yr)': 80_000,
    'Target Area (sq ft)': 120_000,
    'Shift Hours': 8,
    'Working Days': 300,
    Region: 'Europe',
    Notes: 'Baseline — matches the published acceptance figures',
  },
  {
    Customer: 'BP',
    Site: 'Refinery B',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 90_000,
    'Manual Resources': 140,
    'Salary per Resource ($/yr)': 85_000,
    'Target Area (sq ft)': 180_000,
    'Shift Hours': 8,
    'Working Days': 300,
    Region: 'Europe',
    Notes: 'Expansion planned',
  },
  {
    Customer: 'Chevron',
    Site: 'Pipeline North',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 125_000,
    'Manual Resources': 180,
    'Salary per Resource ($/yr)': 90_000,
    'Target Area (sq ft)': 250_000,
    'Shift Hours': 10,
    'Working Days': 320,
    Region: 'North America',
    Notes: 'High utilization',
  },
  {
    Customer: 'TotalEnergies',
    Site: 'Terminal C',
    Industry: 'Energy',
    'Current Survey Area (sq ft)': 45_000,
    'Manual Resources': 60,
    'Salary per Resource ($/yr)': 70_000,
    'Target Area (sq ft)': 90_000,
    'Shift Hours': 8,
    'Working Days': 300,
    Region: 'Europe',
    Notes: 'Small deployment',
  },
  {
    Customer: 'Aramco',
    Site: 'Processing Unit',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 220_000,
    'Manual Resources': 320,
    'Salary per Resource ($/yr)': 95_000,
    'Target Area (sq ft)': 450_000,
    'Shift Hours': 12,
    'Working Days': 330,
    Region: 'Middle East',
    Notes: 'Mega facility',
  },
  {
    // Scales to 168.75 resources — the fractional-extrapolation case.
    Customer: 'Siemens Energy',
    Site: 'Wind Farm',
    Industry: 'Energy',
    'Current Survey Area (sq ft)': 80_000,
    'Manual Resources': 90,
    'Salary per Resource ($/yr)': 82_000,
    'Target Area (sq ft)': 150_000,
    'Shift Hours': 8,
    'Working Days': 310,
    Region: 'Europe',
    Notes: 'Renewable assets — target scaling is fractional (168.75)',
  },
  {
    Customer: 'Tata Steel',
    Site: 'Plant 4',
    Industry: 'Manufacturing',
    'Current Survey Area (sq ft)': 70_000,
    'Manual Resources': 85,
    'Salary per Resource ($/yr)': 65_000,
    'Target Area (sq ft)': 140_000,
    'Shift Hours': 8,
    'Working Days': 300,
    Region: 'India',
    Notes: 'Steel inspection',
  },
  {
    Customer: 'Reliance',
    Site: 'Jamnagar',
    Industry: 'Refinery',
    'Current Survey Area (sq ft)': 180_000,
    'Manual Resources': 260,
    'Salary per Resource ($/yr)': 90_000,
    'Target Area (sq ft)': 350_000,
    'Shift Hours': 12,
    'Working Days': 330,
    Region: 'India',
    Notes: 'Largest refinery',
  },
  {
    // Carries per-row overrides, to exercise the resolution order.
    Customer: 'Adani Power',
    Site: 'Thermal Plant',
    Industry: 'Power',
    'Current Survey Area (sq ft)': 95_000,
    'Manual Resources': 130,
    'Salary per Resource ($/yr)': 76_000,
    'Target Area (sq ft)': 180_000,
    'Shift Hours': 8,
    'Working Days': 300,
    Region: 'India',
    Notes: 'Row overrides substitution factor and operator ratio',
    'Substitution Factor': 1.3,
    'Docks per Operator Now': 5.5,
  },
  {
    Customer: 'NTPC',
    Site: 'Super Thermal',
    Industry: 'Power',
    'Current Survey Area (sq ft)': 150_000,
    'Manual Resources': 220,
    'Salary per Resource ($/yr)': 78_000,
    'Target Area (sq ft)': 300_000,
    'Shift Hours': 10,
    'Working Days': 320,
    Region: 'India',
    Notes: 'Long-term planning',
  },
  {
    // Autonomous costs more than manual: one dock and one operator cannot be
    // undercut by two people. Tier moves from no-standalone to marginal at target.
    Customer: 'Ørsted',
    Site: 'Met Mast Alpha',
    Industry: 'Energy',
    'Current Survey Area (sq ft)': 4_000,
    'Manual Resources': 2,
    'Salary per Resource ($/yr)': 45_000,
    'Target Area (sq ft)': 6_000,
    'Shift Hours': 8,
    'Working Days': 260,
    Region: 'Europe',
    Notes: 'Negative saving at current area — labour case does not stand alone',
  },
  {
    // Missing a required field. Must reach Exceptions and the summary, never a guess.
    Customer: 'Petrobras',
    Site: 'Terminal D',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 55_000,
    'Manual Resources': 70,
    'Salary per Resource ($/yr)': null,
    'Target Area (sq ft)': 110_000,
    'Shift Hours': 8,
    'Working Days': 300,
    Region: 'South America',
    Notes: 'Salary not supplied during discovery',
  },
];

/** Column order as it appears in the source workbook, preserved on output. */
export const INPUT_COLUMNS = [
  'Customer',
  'Site',
  'Industry',
  'Current Survey Area (sq ft)',
  'Manual Resources',
  'Salary per Resource ($/yr)',
  'Target Area (sq ft)',
  'Shift Hours',
  'Working Days',
  'Region',
  'Notes',
] as const;

/** Optional per-row override columns present in this fixture. */
export const OVERRIDE_COLUMNS = [
  'Substitution Factor',
  'Docks per Operator Now',
  'Area Unit',
] as const;

/**
 * A Parameters sheet, exercising the middle tier of resolution: it beats the
 * built-in defaults but loses to a per-row override.
 */
export const PARAMETERS_SHEET: Partial<Params> = {
  dockCost: 45_000,
  opCost: 80_000,
  implCost: 250_000,
};
