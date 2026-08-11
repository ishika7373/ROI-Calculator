import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * House style, enforced rather than remembered.
 *
 * Em dashes have been removed by hand twice and returned twice, so the rule
 * lives here now. `samples/` is excluded: it holds built output, which is
 * regenerated from source rather than edited.
 */

const tracked = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx|css|md|json|html)$/.test(f))
  .filter((f) => !f.startsWith('samples/'));

describe('house style', () => {
  it('tracks a meaningful number of files', () => {
    expect(tracked.length).toBeGreaterThan(15);
  });

  it('contains no em dashes', () => {
    const offenders: string[] = [];
    for (const file of tracked) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (line.includes('—')) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 70)}`);
      });
    }
    expect(offenders, `em dashes found:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps the light theme out of the components', () => {
    // The chart carried the old palette as literal hex, which no class rename
    // could reach, and it stayed light on a dark ground until someone looked.
    const offenders: string[] = [];
    for (const file of tracked.filter((f) => f.startsWith('web/src/') && f.endsWith('.tsx'))) {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(/(?:fill|stroke)[=:]\s*['"]#[0-9a-fA-F]{6}['"]/g);
      if (matches) offenders.push(`${file}: ${matches.join(', ')}`);
    }
    expect(offenders, `hardcoded colours:\n${offenders.join('\n')}`).toEqual([]);
  });
});
