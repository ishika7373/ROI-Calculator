import { workbookToBytes, loadWorkbook, fromArrayBuffer } from '@office-kit/xlsx/io';
import { iterWorksheets } from '@office-kit/xlsx/workbook';
import { getRangeValues, getDataExtent } from '@office-kit/xlsx/worksheet';
import { describeMappingFailure, mapHeaders } from '../../core/index.js';
import { buildWorkbook } from '../../workbook/build.js';
import type { ScoredSite } from './scoring.js';
import type { RawRow } from '../../fixtures/portfolio.js';

/**
 * The browser path to the workbook.
 *
 * It calls the same builder the CLI calls, so the two cannot produce different
 * files. Charts included: this is deliberately not a lesser file.
 */
export async function buildWorkbookBytes(scored: ScoredSite[]): Promise<Uint8Array> {
  const wb = buildWorkbook(scored);
  return await workbookToBytes(wb);
}

function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export class WorkbookReadError extends Error {}

/**
 * Read an uploaded workbook into header-keyed rows.
 *
 * Uses the same header matcher the CLI uses, and fails loudly with the headers
 * found against the headers expected rather than skipping a column silently.
 */
export async function readWorkbookRows(buffer: ArrayBuffer): Promise<RawRow[]> {
  const wb = await loadWorkbook(fromArrayBuffer(buffer));

  for (const ws of iterWorksheets(wb)) {
    const extent = getDataExtent(ws);
    if (!extent) continue;

    const grid = getRangeValues(
      ws,
      `A1:${colLetter(extent.maxCol)}${extent.maxRow}`,
    ) as unknown[][];

    const headers = (grid[0] ?? []).map((h) => String(h ?? '').trim()).filter((h) => h !== '');
    if (headers.length === 0) continue;

    const mapping = mapHeaders(headers);
    const failure = describeMappingFailure(mapping, headers);
    if (failure) throw new WorkbookReadError(failure);

    const rows = grid
      .slice(1)
      .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ''))
      .map((row) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] ?? null;
        });
        return obj as unknown as RawRow;
      });

    if (rows.length === 0) {
      throw new WorkbookReadError('That worksheet has a header row but no data rows beneath it.');
    }
    return rows;
  }

  throw new WorkbookReadError('That file contains no populated worksheet.');
}
