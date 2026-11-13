// spaced (wide-tracked capitals): the room it gives the line breaking matches the capitals' real widths, measured in Chrome in
// Noto Sans TC at weight 400 (canvas measureText, 2026-11-13). Counted at the line breaking's 0.55 em, MOROCCO ran 58 px past the
// safe side in 9:16; counted at one wider number, ISTANBUL (narrow with its I) broke in two.
import { resolveTheme, textEm } from '@tellcut/engine';
import { caption } from '../index.ts';
import { capEm, spaced } from './title.ts';

const DEFAULTS = Object.fromEntries(caption.params.map((d) => [d.key, d.default])) as any;
const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
const PX = 100, WIDTH = 1000, SPACING = 0.32;
/** the titles' widths in em as Chrome drew them (no letter spacing) */
const MEASURED: Record<string, number> = { MARRAKESH: 5.85, SEATTLE: 4.06, BAGEL: 3.072, CREDITS: 3.99, ISTANBUL: 4.712, ABCDEFGHIJKLMNOPQRSTUVWXYZ: 16.432 };

/** how wide `word` really is, in px, when the line breaking fills spaced's room with it (it counts textEm per em of room) */
function drawn(word: string) {
  const e: any = { p: { ...DEFAULTS, text: word, style: 'spaced' }, theme, W: 1080, H: 1920, k: 1, px: PX, local: 1.5, who: '#fff', ink: '#fff', left: false, opacity: 1 };
  const room = spaced.room!(e, WIDTH), px = room / textEm(word);   // the font size at which the word fills the room as counted
  return px * (MEASURED[word] + [...word].length * SPACING);
}

test('a spaced title filling its room is as wide as the safe width in its real capitals: never past it, and not more than 6 % short', () => {
  for (const word of Object.keys(MEASURED)) {
    expect(drawn(word), word).toBeLessThanOrEqual(WIDTH * 1.01);
    expect(drawn(word), word).toBeGreaterThan(WIDTH * 0.94);
  }
});

test('the capitals table is the measured widths: I narrow, W wide, other characters the line breaking\'s 0.55', () => {
  expect(capEm('i')).toBe(capEm('I'));
  expect(capEm('I')).toBeLessThan(0.3);
  expect(capEm('W')).toBeGreaterThan(0.85);
  expect(capEm('7')).toBe(0.55);
  expect(capEm('字')).toBe(0.55);
});
