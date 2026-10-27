// Giving out handles (spec 2026-10-22-block-handles): npm run promote and promote-style add the next handle of a prefix to the
// registry (packages/protocol/src/handles.ts) and warn when a new block's name is too close to an old one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { distance } from './catalog.ts';

export const HANDLES_FILE = join(TELLCUT_ROOT, 'packages/protocol/src/handles.ts');

/** the next handle of `prefix` (MRK, SFX-HIT, MUS) in the registry's text: one past the highest given out, retired ones included */
export function nextHandle(text: string, prefix: string): string {
  let max = 0;
  for (const m of text.matchAll(new RegExp(`'${prefix}-(\\d+)'`, 'g'))) max = Math.max(max, Number(m[1]));
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

/** the registry's text with a line for `handle` → `id` after the last handle of its prefix in HANDLES (or at its end) */
export function withHandle(text: string, handle: string, id: string): string {
  if (text.includes(`'${handle}'`)) throw new Error(`代號 ${handle} 已經給出去了（或作廢了），不能再用`);
  const start = text.indexOf('export const HANDLES'), end = start < 0 ? -1 : text.indexOf('\n};', start) + 1;
  if (start < 0 || end <= 0) throw new Error('代號登記表裡找不到 HANDLES');
  const prefix = handle.replace(/-\d+$/, '');
  let at = end;
  for (const m of text.slice(start, end).matchAll(new RegExp(`^  '${prefix}-\\d+': [^\\n]*\\n`, 'gm'))) at = start + m.index! + m[0].length;
  return `${text.slice(0, at)}  '${handle}': '${id}',\n${text.slice(at)}`;
}

export const readHandles = (file = HANDLES_FILE) => readFileSync(file, 'utf8');

/** existing short names (no common.) a new `name` is easy to mistake for: one letter off for six letters or fewer, two for
 *  longer ones; and the ones that contain it or that it contains (often a deliberate family: tag / hangtag) */
export function similarNames(name: string, names: string[]): { close: string[]; within: string[] } {
  const others = [...new Set(names)].filter((n) => n !== name), limit = name.length <= 6 ? 1 : 2;
  const close = others.filter((n) => distance(name, n) <= limit);
  return { close, within: others.filter((n) => !close.includes(n) && (n.includes(name) || name.includes(n))) };
}
