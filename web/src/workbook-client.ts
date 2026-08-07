import { workbookToBytes } from '@office-kit/xlsx/io';
import { loadWorkbook, fromArrayBuffer } from '@office-kit/xlsx/io';
import { iterWorksheets } from '@office-kit/xlsx/workbook';
import { getRangeValues, getDataExtent } from '@office-kit/xlsx/worksheet';
import { buildWorkbook } from '../../workbook/build.js';
import type { ScoredSite } from './scoring.js';

/**
 * The browser path to the workbook.
 *
 * It calls the same builder the CLI calls, so the two cannot produce different
 * files. Charts included — this is deliberately not a lesser file.
 */
export async function buildWorkbookBytes(scored: ScoredSite[]): Promise<Uint8Array> {
  const wb = buildWorkbook(scored);
  return await workbookToBytes(wb);
}

/** Read an uploaded workbook and report how many data rows it carries. */
export async function readWorkbookRows(buffer: ArrayBuffer): Promise<number> {
  const wb = await loadWorkbook(fromArrayBuffer(buffer));
  let rows = 0;
  for (const ws of iterWorksheets(wb)) {
    const extent = getDataExtent(ws);
    if (!extent) continue;
    const values = getRangeValues(ws, `A1:A${extent.maxRow}`);
    rows += Math.max(0, values.length - 1);
    break;
  }
  return rows;
}
