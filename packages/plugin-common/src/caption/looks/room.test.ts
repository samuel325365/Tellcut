// Every look's room is no wider than what its box and lines leave the words: the padding and borders each side, and letter
// spacing (which the line breaking does not count). A look that gave its words more room than that let a full line run past
// the safe area (ribbon, news, chalk, crayon, label and lyric did).
import { resolveTheme } from '@tellcut/engine';
import { caption } from '../index.ts';
import { LOOKS } from './index.ts';

const DEFAULTS = Object.fromEntries(caption.params.map((d) => [d.key, d.default])) as any;
const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
const PX = 100, WIDTH = 1000;

/** a length in em (px are taken at the font size; % and the rest are not padding the words pay for) */
const em = (v: string | undefined) => { const m = /^(-?\d*\.?\d+)(em|px)?$/.exec(String(v ?? '').trim()); return !m ? 0 : m[2] === 'px' ? Number(m[1]) / PX : Number(m[1]); };
/** the left and right padding, border and border-left of some CSS, in em */
function sides(css: Record<string, string>): number {
  const pad = String(css.padding ?? '').trim().split(/\s+/).filter(Boolean);
  const [r, l] = pad.length === 1 ? [pad[0], pad[0]] : pad.length === 2 || pad.length === 3 ? [pad[1], pad[1]] : pad.length === 4 ? [pad[1], pad[3]] : ['0', '0'];
  const border = (s?: string) => em(String(s ?? '').trim().split(/\s+/)[0]);
  return em(r) + em(l) + em(css.paddingLeft) + em(css.paddingRight) + 2 * border(css.border) + border(css.borderLeft) + border(css.borderRight);
}

test('a look\'s room leaves its padding, borders and letter spacing out', () => {
  const over: string[] = [];
  for (const look of LOOKS) {
    const e: any = { p: { ...DEFAULTS, text: '今天帶你去吃台南最強的牛肉湯', style: look.id }, theme, W: 1080, H: 1920, k: 1, px: PX, fs: PX, local: 1.5, who: '#ffffff', ink: '#ffffff', left: false, opacity: 1 };
    const box = look.box?.(e) ?? {};
    const line: any = { style: {}, querySelectorAll: () => [] };
    look.lines?.([line], e);
    const lineCss = line.style as Record<string, string>;
    const pad = sides(box) + sides(lineCss), spacing = em(box.letterSpacing) + em(lineCss.letterSpacing);
    const room = look.room ? look.room(e, WIDTH) : WIDTH;
    // a full line of Chinese: room / px characters, each (1 + spacing) em, plus the padding; 2 % of slack for the looks whose
    // spacing is a hair (heavy's 0.02 em)
    const width = room * (1 + Math.max(0, spacing)) + pad * PX;
    if (width > WIDTH * 1.02 + 1e-6) over.push(`${look.id}: ${width.toFixed(1)}`);
  }
  expect(over).toEqual([]);
});
