import type { Params } from '../core/types.js';

/**
 * The mock portfolio.
 *
 * Ten sites carried over from the supplied input workbook, plus two constructed
 * to exercise behaviour twenty happy rows cannot reach. Every column name here is
 * spelled the way a real workbook spells it, including the `$/yr` abbreviation,
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
  'Cost per Operator per Year'?: number;
  'Dock Utilisation'?: number;
  'Area Unit'?: string;
}

export const PORTFOLIO: RawRow[] = [
  {
    Customer: 'Ørsted',
    Site: 'Hornsea Substation',
    Industry: 'Offshore Wind',
    'Current Survey Area (sq ft)': 180_000,
    'Manual Resources': 5,
    'Salary per Resource ($/yr)': 380_000,
    'Target Area (sq ft)': 300_000,
    'Shift Hours': 12,
    'Working Days': 170,
    Region: 'North Sea',
    Notes: 'Offshore. A technician visit costs a vessel day and a helicopter slot, so the fully loaded rate is several times onshore.',
  },
  {
    Customer: 'Shell',
    Site: 'Pernis Refinery',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 2_400_000,
    'Manual Resources': 40,
    'Salary per Resource ($/yr)': 120_000,
    'Target Area (sq ft)': 4_800_000,
    'Shift Hours': 8,
    'Working Days': 250,
    Region: 'Europe',
    Notes: 'Baseline discovery case used in the walkthrough.',
  },
  {
    Customer: 'Aramco',
    Site: 'Ras Tanura',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 9_200_000,
    'Manual Resources': 140,
    'Salary per Resource ($/yr)': 145_000,
    'Target Area (sq ft)': 18_000_000,
    'Shift Hours': 10,
    'Working Days': 250,
    Region: 'Middle East',
    Notes: 'Largest site in the portfolio. Expatriate packages lift the fully loaded rate.',
  },
  {
    Customer: 'BP',
    Site: 'Rotterdam Refinery',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 3_100_000,
    'Manual Resources': 52,
    'Salary per Resource ($/yr)': 118_000,
    'Target Area (sq ft)': 5_400_000,
    'Shift Hours': 8,
    'Working Days': 250,
    Region: 'Europe',
    Notes: 'Expansion planned.',
  },
  {
    Customer: 'Chevron',
    Site: 'Pipeline North',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 5_800_000,
    'Manual Resources': 74,
    'Salary per Resource ($/yr)': 125_000,
    'Target Area (sq ft)': 9_500_000,
    'Shift Hours': 10,
    'Working Days': 240,
    Region: 'North America',
    Notes: 'Linear asset. Long transits between inspection points cut utilisation further.',
    'Dock Utilisation': 0.2,
  },
  {
    Customer: 'Siemens Energy',
    Site: 'Nordsee Wind Farm',
    Industry: 'Renewables',
    'Current Survey Area (sq ft)': 1_600_000,
    'Manual Resources': 22,
    'Salary per Resource ($/yr)': 115_000,
    'Target Area (sq ft)': 3_000_000,
    'Shift Hours': 8,
    'Working Days': 245,
    Region: 'Europe',
    Notes: 'Target scaling is fractional here, 22 becomes 41.25.',
  },
  {
    Customer: 'TotalEnergies',
    Site: 'Terminal C',
    Industry: 'Energy',
    'Current Survey Area (sq ft)': 950_000,
    'Manual Resources': 16,
    'Salary per Resource ($/yr)': 112_000,
    'Target Area (sq ft)': 1_700_000,
    'Shift Hours': 8,
    'Working Days': 250,
    Region: 'Europe',
    Notes: 'Small site. Programme base cost is spread across few docks, so payback lengthens.',
  },
  {
    Customer: 'Petrobras',
    Site: 'Terminal D',
    Industry: 'Oil & Gas',
    'Current Survey Area (sq ft)': 1_750_000,
    'Manual Resources': 28,
    'Salary per Resource ($/yr)': null,
    'Target Area (sq ft)': 3_400_000,
    'Shift Hours': 8,
    'Working Days': 250,
    Region: 'South America',
    Notes: 'Salary not supplied during discovery. Row is not priced.',
  },
  {
    Customer: 'Reliance',
    Site: 'Jamnagar',
    Industry: 'Refinery',
    'Current Survey Area (sq ft)': 7_400_000,
    'Manual Resources': 105,
    'Salary per Resource ($/yr)': 74_000,
    'Target Area (sq ft)': 14_000_000,
    'Shift Hours': 12,
    'Working Days': 260,
    Region: 'India',
    Notes: 'Labour cost per hour is below the autonomous cost per hour. Labour displacement alone does not carry this site.',
    'Cost per Operator per Year': 88_000,
  },
  {
    Customer: 'Tata Steel',
    Site: 'Kalinganagar',
    Industry: 'Manufacturing',
    'Current Survey Area (sq ft)': 2_050_000,
    'Manual Resources': 34,
    'Salary per Resource ($/yr)': 62_000,
    'Target Area (sq ft)': 4_100_000,
    'Shift Hours': 8,
    'Working Days': 260,
    Region: 'India',
    Notes: 'Same pattern as Jamnagar at smaller scale.',
    'Cost per Operator per Year': 74_000,
  },
  {
    Customer: 'NTPC',
    Site: 'Vindhyachal',
    Industry: 'Power',
    'Current Survey Area (sq ft)': 4_300_000,
    'Manual Resources': 68,
    'Salary per Resource ($/yr)': 61_000,
    'Target Area (sq ft)': 8_400_000,
    'Shift Hours': 10,
    'Working Days': 250,
    Region: 'India',
    Notes: 'Operator cost overridden to the local market rate, which is the correct use of a per-row override.',
    'Cost per Operator per Year': 73_000,
  },
  {
    Customer: 'Adani Power',
    Site: 'Mundra Thermal',
    Industry: 'Power',
    'Current Survey Area (sq ft)': 2_800_000,
    'Manual Resources': 46,
    'Salary per Resource ($/yr)': 58_000,
    'Target Area (sq ft)': 5_200_000,
    'Shift Hours': 8,
    'Working Days': 255,
    Region: 'India',
    Notes: 'Carries three per-row overrides, exercising the resolution order.',
    'Cost per Operator per Year': 70_000,
    'Substitution Factor': 1.2,
    'Docks per Operator Now': 6.5,
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
  'Cost per Operator per Year',
  'Dock Utilisation',
  'Area Unit',
] as const;

/**
 * A Parameters sheet, exercising the middle tier of resolution: it beats the
 * built-in defaults but loses to a per-row override.
 */
export const PARAMETERS_SHEET: Partial<Params> = {
  dockCost: 52_000,
  opCost: 100_000,
  implBase: 175_000,
  implPerDock: 75_000,
};
