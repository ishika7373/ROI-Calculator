import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guarantees about /core.
 *
 * These are the properties that make the parity test meaningful: if /core stayed
 * pure by convention alone, a stray import would quietly let the two delivery
 * modes diverge. Asserted here rather than trusted.
 */

const CORE = new URL('../core/', import.meta.url).pathname;
const files = readdirSync(CORE).filter((f) => f.endsWith('.ts'));

const importsOf = (src: string): string[] =>
  [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);

describe('/core is pure', () => {
  it('has files to check', () => expect(files.length).toBeGreaterThan(5));

  for (const file of files) {
    const src = readFileSync(join(CORE, file), 'utf8');

    it(`${file} imports nothing outside /core`, () => {
      for (const spec of importsOf(src)) {
        expect(spec.startsWith('./'), `${file} imports "${spec}"`).toBe(true);
      }
    });

    it(`${file} touches no DOM, file IO or framework`, () => {
      // Strip comments first, the rules are described in prose in several files.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const banned of [
        'document',
        'window',
        'localStorage',
        'node:fs',
        'node:path',
        'require(',
        'process.',
        'react',
      ]) {
        expect(code.includes(banned), `${file} references "${banned}"`).toBe(false);
      }
    });
  }

  it('calc.ts imports only types and the ceiling helper', () => {
    const src = readFileSync(join(CORE, 'calc.ts'), 'utf8');
    expect(importsOf(src).sort()).toEqual(['./round.js', './types.js']);
  });

  it('calc.ts uses ceilCount and never Math.ceil or Math.round directly', () => {
    const code = readFileSync(join(CORE, 'calc.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code.includes('ceilCount')).toBe(true);
    expect(code.includes('Math.ceil')).toBe(false);
    expect(code.includes('Math.round')).toBe(false);
    expect(code.includes('toFixed')).toBe(false);
  });

  it('round.ts is the only file containing Math.ceil', () => {
    const owners = files.filter((f) => {
      const code = readFileSync(join(CORE, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return code.includes('Math.ceil');
    });
    expect(owners).toEqual(['round.ts']);
  });
});
