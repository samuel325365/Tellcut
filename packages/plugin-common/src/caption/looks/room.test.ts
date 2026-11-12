// Every look's room is no wider than what its box and lines leave the words: the padding and borders each side, and letter
// spacing (which the line breaking does not count). A look that gave its words more room than that let a full line run past
// the safe area (ribbon, news, chalk, crayon, label and lyric did; ransom's per-letter scraps too).
import { resolveTheme, textEm } from '@tellcut/engine';
import { caption } from '../index.ts';
import { LOOKS } from './index.ts';

const DEFAULTS = Object.fromEntries(caption.params.map((d) => [d.key, d.default])) as any;
const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
const PX = 100, WIDTH = 1000;

/** a length in em (px are taken at the font size; % and the rest are not padding the words pay for) */
const em = (v: string | undefined) => { const m = /^(-?\d*\.?\d+)(em|px)?$/.exec(String(v ?? '').trim()); return !m ? 0 : m[2] === 'px' ? Number(m[1]) / PX : Number(m[1]); };
/** the left and right lengths of a CSS shorthand (padding, margin), in em */
function across(v: string | undefined): number {
  const pad = String(v ?? '').trim().split(/\s+/).filter(Boolean);
  const [r, l] = pad.length === 1 ? [pad[0], pad[0]] : pad.length === 2 || pad.length === 3 ? [pad[1], pad[1]] : pad.length === 4 ? [pad[1], pad[3]] : ['0', '0'];
  return em(r) + em(l);
}
/** the left and right padding, border and border-left of some CSS, in em */
function sides(css: Record<string, string>): number {
  const border = (s?: string) => em(String(s ?? '').trim().split(/\s+/)[0]);
  return across(css.padding) + em(css.paddingLeft) + em(css.paddingRight) + 2 * border(css.border) + border(css.borderLeft) + border(css.borderRight);
}

/** a look drawn at PX with `text`: its box's and a line's CSS, what each letter adds (letter spacing, a letter's own padding and
 *  margin: ransom's scraps), and its room in a line WIDTH wide */
function measure(look: (typeof LOOKS)[number], text: string) {
  const e: any = { p: { ...DEFAULTS, text, style: look.id }, theme, W: 1080, H: 1920, k: 1, px: PX, fs: PX, local: 1.5, who: '#ffffff', ink: '#ffffff', left: false, opacity: 1 };
  const box = look.box?.(e) ?? {};
  const line: any = { style: {}, querySelectorAll: () => [] };
  look.lines?.([line], e);
  const lineCss = line.style as Record<string, string>, char = look.word?.(e).char?.(0, '字') ?? {};
  const pad = sides(box) + sides(lineCss), spacing = em(box.letterSpacing) + em(lineCss.letterSpacing) + sides(char) + across(char.margin);
  const caps = [box.textTransform, lineCss.textTransform].includes('uppercase');
  return { e, box, pad, spacing, caps, room: look.room ? look.room(e, WIDTH) : WIDTH };
}

test('a look\'s room leaves its padding, borders and letter spacing out', () => {
  const over: string[] = [];
  for (const look of LOOKS) {
    const { pad, spacing, room } = measure(look, '今天帶你去吃台南最強的牛肉湯');
    // a full line of Chinese: room / px characters, each (1 + spacing) em, plus the padding; 2 % of slack for the looks whose
    // spacing is a hair (heavy's 0.02 em)
    const width = room * (1 + Math.max(0, spacing)) + pad * PX;
    if (width > WIDTH * 1.02 + 1e-6) over.push(`${look.id}: ${width.toFixed(1)}`);
  }
  expect(over).toEqual([]);
});

// captions only: a title look (heading) fits a few big words its own way (spaced's capitals are left to it)
test('a caption look in capitals counts its Latin letters 0.6 em wide (vhs ran 12–41 px past the safe side in English)', () => {
  const text = 'We walked all the way to the Colosseum today', over: string[] = [];
  for (const look of LOOKS) {
    const { pad, spacing, caps, room } = measure(look, text);
    if (!caps || look.only === 'title') continue;
    // the line breaking counts each letter 0.55 em; in capitals they are at least 0.6 em, plus the spacing
    const n = [...text].length, width = (room / PX / textEm(text)) * (n * 0.6 + n * Math.max(0, spacing)) * PX + pad * PX;
    if (width > WIDTH * 1.02 + 1e-6) over.push(`${look.id}: ${width.toFixed(1)}`);
  }
  expect(over).toEqual([]);
});

test('a look\'s minimum width is never wider than the 9:16 safe width (desk\'s 78 % of the frame was 842 px on 821)', () => {
  const safe = 1080 * (1 - 2 * theme.safe.side), over: string[] = [];
  for (const look of LOOKS) {
    const { e, box } = measure(look, '今天');
    const mw = String(box.minWidth ?? ''), m = /^(\d*\.?\d+)(%|px)$/.exec(mw);
    if (!mw) continue;
    const px = !m ? Infinity : m[2] === '%' ? (Number(m[1]) / 100) * e.W : Number(m[1]);
    if (px > safe + 0.5) over.push(`${look.id}: ${mw}`);
  }
  expect(over).toEqual([]);
});
