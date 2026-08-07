#!/usr/bin/env node
/**
 * Batch CLI.
 *
 * Reads an input workbook (or the bundled fixture), scores every row through
 * /core, and writes Drone_ROI_Output.xlsx. It calls the same builder the web app
 * calls, so the two modes cannot produce different files.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { argv, exit, stdout } from 'node:process';
import { workbookToBytes, loadWorkbook, fromArrayBuffer } from '@office-kit/xlsx/io';
import { iterWorksheets, sheetNames } from '@office-kit/xlsx/workbook';
import { getDataExtent, getRangeValues } from '@office-kit/xlsx/worksheet';
import { describeMappingFailure, mapHeaders } from '../core/index.js';
import { buildWorkbook } from '../workbook/build.js';
import { scorePortfolio } from '../web/src/scoring.js';
import { PORTFOLIO } from '../fixtures/portfolio.js';
import type { RawRow } from '../fixtures/portfolio.js';

function arg(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Read the first worksheet of a workbook into header-keyed rows. */
async function readInput(path: string): Promise<RawRow[]> {
  const buf = await readFile(path);
  const wb = await loadWorkbook(fromArrayBuffer(buf));

  for (const ws of iterWorksheets(wb)) {
    const extent = getDataExtent(ws);
    if (!extent) continue;

    const lastCol = extent.maxCol;
    const lastRow = extent.maxRow;
    const colLetter = (n: number) => {
      let s = '';
      let x = n;
      while (x > 0) {
        s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
        x = Math.floor((x - 1) / 26);
      }
      return s;
    };
    const grid = getRangeValues(ws, `A1:${colLetter(lastCol)}${lastRow}`) as unknown[][];
    const headers = (grid[0] ?? []).map((h) => String(h ?? '').trim()).filter((h) => h !== '');

    const mapping = mapHeaders(headers);
    const failure = describeMappingFailure(mapping, headers);
    if (failure) {
      stdout.write(`\nCould not read ${path}:\n${failure}\n`);
      exit(2);
    }

    return grid.slice(1).map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? null;
      });
      return obj as unknown as RawRow;
    });
  }

  stdout.write(`\n${path} contains no populated worksheet.\n`);
  exit(2);
}

async function main() {
  const input = arg('--in');
  const output = arg('--out') ?? 'Drone_ROI_Output.xlsx';

  const rows = input ? await readInput(input) : PORTFOLIO;
  const source = input ?? 'bundled fixture portfolio';

  const scored = scorePortfolio(rows);
  const priced = scored.filter((s) => s.result.status === 'ok').length;
  const incomplete = scored.length - priced;
  const warnings = scored.reduce((n, s) => n + s.result.warnings.length, 0);

  const wb = buildWorkbook(scored);
  const bytes = await workbookToBytes(wb);
  await writeFile(output, bytes);

  stdout.write(`\nDrone ROI — batch\n`);
  stdout.write(`  source      ${source}\n`);
  stdout.write(`  rows        ${scored.length}\n`);
  stdout.write(`  priced      ${priced}\n`);
  stdout.write(`  incomplete  ${incomplete}\n`);
  stdout.write(`  warnings    ${warnings}\n`);
  stdout.write(`  sheets      ${sheetNames(wb).join(', ')}\n`);
  stdout.write(`  written     ${output} (${bytes.length.toLocaleString()} bytes)\n\n`);

  for (const s of scored) {
    if (s.result.status === 'ok') continue;
    stdout.write(`  ! ${s.customer} — ${s.site}: ${s.result.issues.map((i) => i.reason).join('; ')}\n`);
  }
  for (const s of scored) {
    for (const w of s.result.warnings) {
      stdout.write(`  ~ ${s.customer} — ${s.site}: ${w.message}\n`);
    }
  }
  stdout.write('\n');
}

main().catch((err) => {
  stdout.write(`\nBatch failed: ${(err as Error).stack}\n`);
  exit(1);
});
