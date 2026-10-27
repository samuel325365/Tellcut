import { readFileSync } from 'node:fs';
import { Cut } from './cut.ts';
import { CUT_API, formatCutApi } from './api-doc.ts';

test('the cheat sheet names every public method of Cut, and nothing that is gone', () => {
  // `private` exists only in the TypeScript source (the running code has lost it): read the source to tell
  const src = readFileSync(new URL('./cut.ts', import.meta.url), 'utf8');
  const isPrivate = (k: string) => new RegExp(`\\n  private (async |get )?${k}\\b`).test(src);
  const own = Object.getOwnPropertyNames(Cut.prototype).filter((k) => k !== 'constructor' && !isPrivate(k));
  const statics = Object.getOwnPropertyNames(Cut).filter((k) => typeof (Cut as any)[k] === 'function');
  expect(new Set(CUT_API.map(([n]) => n))).toEqual(new Set([...own, ...statics]));
  // two lines a method: raised with each batch of methods (lines, filmTime, audio, beats: 2026-10-26), kept a glance
  expect(formatCutApi().split('\n').length).toBeLessThan(95);
});
