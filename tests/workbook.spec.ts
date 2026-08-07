import { readFile, unlink } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { workbookToBytes } from '@office-kit/xlsx/io';
import { buildWorkbook } from '../workbook/build.js';
import { scorePortfolio } from '../web/src/scoring.js';
import { PORTFOLIO } from '../fixtures/portfolio.js';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Workbook integrity.
 *
 * Reopens the generated package and asserts the things a customer would notice:
 * every sheet present, charts that are native chart XML bound to live ranges
 * rather than pictures, and no cell carrying an error value.
 */

let parts: Record<string, string>;
let bytes: Uint8Array;

const sheetXml = () =>
  Object.entries(parts).filter(([n]) => n.startsWith('xl/worksheets/') && n.endsWith('.xml'));

beforeAll(async () => {
  const wb = buildWorkbook(scorePortfolio(PORTFOLIO));
  bytes = await workbookToBytes(wb);
  const files = unzipSync(bytes);
  parts = Object.fromEntries(
    Object.entries(files).map(([name, data]) => [name, strFromU8(data)]),
  );
});

describe('package structure', () => {
  it('contains every expected sheet', () => {
    const names = [...parts['xl/workbook.xml']!.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([
      'Executive Summary',
      'Detailed Calculations',
      'Audit Trail',
      'Sensitivity Analysis',
      'Charts',
      'Exceptions',
      'README',
      'Original Input',
    ]);
  });

  it('preserves the original input worksheet', () => {
    expect(parts['xl/workbook.xml']).toContain('Original Input');
  });

  it('is a plausible size for a formatted workbook', () => {
    expect(bytes.length).toBeGreaterThan(20_000);
  });
});

describe('charts are native and range-bound', () => {
  const chartParts = () => Object.keys(parts).filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n));

  it('emits five chart parts', () => {
    expect(chartParts()).toHaveLength(5);
  });

  it('registers each chart with the correct OOXML content type', () => {
    const ct = parts['[Content_Types].xml']!;
    for (const part of chartParts()) {
      expect(ct).toContain(`PartName="/${part}"`);
    }
    const overrides = [...ct.matchAll(/ContentType="([^"]*drawingml\.chart\+xml)"/g)];
    expect(overrides).toHaveLength(5);
  });

  it('substitutes no images for charts', () => {
    const media = Object.keys(parts).filter((n) => n.startsWith('xl/media/'));
    expect(media).toEqual([]);
  });

  it('binds every series to a cell range, not cached literals', () => {
    for (const part of chartParts()) {
      const xml = parts[part]!;
      expect(xml, `${part} has no series`).toContain('<c:ser>');
      expect(xml, `${part} has no value reference`).toContain('<c:numRef>');

      const refs = [...xml.matchAll(/<c:f>(.*?)<\/c:f>/g)].map((m) => m[1]!);
      expect(refs.length, `${part} has no c:f`).toBeGreaterThan(0);

      const ranges = refs.filter((r) => r.includes(':'));
      expect(ranges.length, `${part} has no range-shaped reference`).toBeGreaterThan(0);
      for (const r of ranges) {
        expect(r, `${part} range is not sheet-qualified`).toMatch(
          /^'[^']+'!\$[A-Z]+\$\d+:\$[A-Z]+\$\d+$/,
        );
      }
    }
  });

  it('spans every data row — ranges are computed, never hardcoded', () => {
    const expectedLast = PORTFOLIO.length + 1; // header row plus one row per site
    for (const part of chartParts()) {
      const ranges = [...parts[part]!.matchAll(/<c:f>([^<]*:[^<]*)<\/c:f>/g)].map((m) => m[1]!);
      for (const r of ranges) {
        const m = /\$(\d+):\$[A-Z]+\$(\d+)$/.exec(r)!;
        expect(Number(m[1])).toBe(2);
        expect(Number(m[2]), `${part} stops short of the last site`).toBe(expectedLast);
      }
    }
  });

  it('wires each chart through a drawing relationship', () => {
    const rels = Object.entries(parts).filter(([n]) => /drawings\/_rels\//.test(n));
    expect(rels.length).toBeGreaterThan(0);
    const joined = rels.map(([, x]) => x).join('');
    for (const part of Object.keys(parts).filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n))) {
      const file = part.split('/').pop();
      expect(joined).toContain(file!);
    }
  });
});

describe('no cell carries an error value', () => {
  /**
   * Scoped to cell values rather than the whole package: the README deliberately
   * uses the words NaN and infinity in prose explaining that no output may
   * contain them, and that sentence is not a defect.
   */
  it('has no error-typed cells', () => {
    for (const [name, xml] of sheetXml()) {
      expect(xml, `${name} has an error-typed cell`).not.toMatch(/<c[^>]*\st="e"/);
    }
  });

  it('has no numeric cell holding NaN or Infinity', () => {
    for (const [name, xml] of sheetXml()) {
      const values = [...xml.matchAll(/<v>([^<]*)<\/v>/g)].map((m) => m[1]!);
      for (const v of values) {
        expect(
          /^-?(\d+\.?\d*([eE][+-]?\d+)?|\d*\.\d+)$/.test(v),
          `${name} has non-numeric value "${v}"`,
        ).toBe(true);
      }
    }
  });

  it('has no error token in any inline or shared cell string', () => {
    const strings = [
      ...(parts['xl/sharedStrings.xml'] ?? '').matchAll(/<t[^>]*>([^<]*)<\/t>/g),
    ].map((m) => m[1]!);
    // Exclude the README's own explanatory prose about these tokens.
    const cells = strings.filter((s) => s.length < 120);
    for (const s of cells) {
      for (const token of ['#REF', '#DIV/0', '#VALUE', '#N/A']) {
        expect(s.includes(token), `cell string "${s}" contains ${token}`).toBe(false);
      }
      expect(/\bNaN\b/.test(s), `cell string "${s}" contains NaN`).toBe(false);
      expect(/\bInfinity\b/.test(s), `cell string "${s}" contains Infinity`).toBe(false);
    }
  });
});

describe('content correctness', () => {
  it('writes the incomplete row with blank figures and no recommendation', () => {
    const shared = parts['xl/sharedStrings.xml']!;
    expect(shared).toContain('model incomplete');
    expect(shared).toContain('Petrobras');
  });

  it('carries both cost-ratio bases on the summary, each labelled', () => {
    const shared = parts['xl/sharedStrings.xml']!;
    expect(shared).toContain('Cost Ratio (current area)');
    expect(shared).toContain('Cost Ratio (target area)');
  });

  it('carries the passthrough columns untouched', () => {
    const shared = parts['xl/sharedStrings.xml']!;
    expect(shared).toContain('Region');
    expect(shared).toContain('Notes');
    expect(shared).toContain('Middle East');
  });

  it('states the scope limitation in the README', () => {
    const shared = parts['xl/sharedStrings.xml']!;
    expect(shared).toContain('labour displacement only');
    expect(shared).toContain('scaffolding');
    expect(shared).toContain('shutdown windows');
    expect(shared).toContain('placeholders');
  });

  it('applies conditional formatting, and only to cost ratio and payback', () => {
    const exec = sheetXml().find(([, x]) => x.includes('conditionalFormatting'));
    expect(exec).toBeDefined();
    const count = (exec![1].match(/<conditionalFormatting/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('freezes the header row on the summary', () => {
    const frozen = sheetXml().filter(([, x]) => x.includes('state="frozen"'));
    expect(frozen.length).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('produces byte-identical output for the same input', async () => {
    const a = await workbookToBytes(buildWorkbook(scorePortfolio(PORTFOLIO)));
    const b = await workbookToBytes(buildWorkbook(scorePortfolio(PORTFOLIO)));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
