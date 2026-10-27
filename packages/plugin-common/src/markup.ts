// Text markup shared by the common text blocks: 【word】 is highlighted, {word} is bleeped (drawn as symbols).
// Line breaking works on the visible text; the kind of every visible character is carried over to the lines.
import { fitLines } from '@tellcut/engine';

export type Kind = 'plain' | 'hl' | 'censor';
export interface Run { t: string; kind: Kind }

const MASK = ['＊', '＃', '％', '＠', '＆'];
/** the symbol drawn in place of a bleeped character (fixed by position, so every frame agrees) */
export const mask = (i: number) => MASK[i % MASK.length];

/** Every visible character of `text` with its kind; the markers themselves are dropped. */
export function charKinds(text: string): Array<{ c: string; kind: Kind }> {
  const out: Array<{ c: string; kind: Kind }> = [];
  let kind: Kind = 'plain';
  for (const c of text) {
    if (c === '【' && kind === 'plain') { kind = 'hl'; continue; }
    if (c === '】' && kind === 'hl') { kind = 'plain'; continue; }
    if (c === '{' && kind === 'plain') { kind = 'censor'; continue; }
    if (c === '}' && kind === 'censor') { kind = 'plain'; continue; }
    out.push({ c: kind === 'censor' ? mask(out.length) : c, kind });
  }
  return out;
}

/** The text broken into lines of runs; `typed` (0–1) keeps only that share of the visible characters; `lit` [from, to) visible
 *  characters are highlighted too (the word being said: a karaoke caption), a bleep staying a bleep. */
export function layoutMarkup(text: string, boxEm: number, maxLines: number, typed = 1, lit?: [number, number] | null): { lines: Run[][]; scale: number; plain: string } {
  const chars = charKinds(text), visible = chars.map((x) => x.c).join('');
  if (lit) for (let i = Math.max(0, lit[0]); i < Math.min(chars.length, lit[1]); i++) if (chars[i].kind === 'plain') chars[i] = { ...chars[i], kind: 'hl' };
  const fit = fitLines(visible, boxEm, maxLines);
  const keep = Math.ceil(chars.length * typed);
  let pos = 0, shown = 0;
  const lines = fit.lines.map((line) => {
    const cs = [...line], runs: Run[] = [];
    while (pos < chars.length && cs.length && chars[pos].c !== cs[0]) { pos++; shown++; }   // spaces and breaks the line dropped
    for (const c of cs) {
      const k = chars[pos++] ?? { c, kind: 'plain' as Kind };
      if (shown++ >= keep) break;
      const last = runs[runs.length - 1], t = c;
      if (last && last.kind === k.kind) last.t += t; else runs.push({ t, kind: k.kind });
    }
    return runs;
  });
  return { lines, scale: fit.scale, plain: visible };
}
