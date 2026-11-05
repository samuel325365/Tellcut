// Looks printed on paper: ticket (receipt paper with torn edges), crayon (a scribbled band behind the words) and strip (a strip
// of paper a line).
import { clamp, cssCamel, eBack, prog } from '@tellcut/engine';
import { canvasAt } from '../../inkline.ts';
import { grainBegin, grainEnd, scribbleFill, type Pt } from '../../sketch.ts';
import type { CaptionLook, CaptionP, CaptionS, LookEnv } from '../types.ts';
import { faceRoom, padded } from './basic.ts';

/** the ticket's torn edges: 30 teeth top and bottom */
function teeth() {
  const pts: string[] = [], n = 30;
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '0px' : '0.15em'}`);
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% calc(100% - ${i % 2 ? '0px' : '0.15em'})`);
  return `polygon(${pts.join(', ')})`;
}
const TEETH = teeth();

/** the line printed on a strip of receipt paper with torn top and bottom edges, popped up from below with a slight tilt of its own */
export const ticket: CaptionLook = {
  id: 'ticket', paper: true, room: padded,
  color: (e) => e.p.outline,
  box: (e) => ({ background: e.p.bubbleBg, padding: '0.35em 0.65em 0.3em', borderRadius: '0' }),
  clip: () => TEETH,
  pin: (e) => {
    const q = eBack(prog(e.local, 0, 0.22), 1.9), tilt = (([...String(e.p.text)].reduce((a, c) => a + c.charCodeAt(0), 0) % 5) - 2) * 0.35;
    return ` translateY(${((1 - q) * 26 * e.k).toFixed(2)}px) scaleY(${(0.7 + 0.3 * Math.min(1, q)).toFixed(4)}) rotate(${tilt}deg)`;
  },
};

/** crayon's band: scribbled in the highlight colour over 0.15 s, a slightly crooked quad a little bigger than the box */
function drawBand(s: CaptionS, e: LookEnv) {
  const { p, k } = e, bw = s.box.offsetWidth, bh = s.box.offsetHeight, m = 8 * k, W = bw + 2 * m, H = bh + 2 * m;
  cssCamel(s.band, { left: `${-m}px`, top: `${-m}px`, width: `${W}px`, height: `${H}px` });
  const main = canvasAt(s.band, W, H), g = grainBegin(s.layer, W, H);
  const band: Pt[] = [[m, m + 6 * k], [m + bw, m], [m + bw - 4 * k, m + bh], [m + 4 * k, m + bh - 4 * k]];
  const seed = [...String(p.text)].reduce((a, c) => a + c.charCodeAt(0), 0) % 997;
  scribbleFill(g, band, p.hl, { u: k, w: 20, gap: 11, seed, alpha: 0.62, angle: -1.2, prog: clamp(e.local / 0.15) });
  grainEnd(s.layer, main, 0.45, k);
}

/** ink words on a band of the highlight colour scribbled in crayon behind them (picture books, handmade) */
export const crayon: CaptionLook = {
  id: 'crayon', paper: true, room: padded,
  hl: (e) => e.theme.palette.accent,
  color: (e) => e.p.outline,
  box: () => ({ padding: '0.22em 0.7em' }),
  after: (s, e) => { cssCamel(s.band, { display: 'block' }); drawBand(s, e); },
};

/** handwriting in ink with a thick white sticker edge and a drop shadow, the whole line tilted a little like a stuck-on sticker;
 *  the hot words in the accent colour */
export const sticker: CaptionLook = {
  id: 'sticker', weight: '700', font: 'LXGW WenKai TC', origin: '50% 50%',
  color: (e) => e.p.outline,
  hl: (e) => e.p.accent || e.theme.palette.accent,
  stroke: (e) => 0.3 * e.fs,
  strokeColor: (e) => e.p.bubbleBg,
  // padded below: the tilted line's low end and its thick white edge stay above the safe area's bottom line (acceptance film cap-acc-rome)
  box: (e) => ({ filter: `drop-shadow(0 ${(0.06 * e.fs).toFixed(1)}px ${(0.07 * e.fs).toFixed(1)}px rgba(0,0,0,0.4))`, letterSpacing: '0.07em', padding: '0 0.2em 0.35em' }),
  pin: () => ' rotate(-2.5deg)',
  word: (e) => ({ box: e.p.hl }),
};

export const stripTilt = (line: number) => (line % 2 ? 0.7 : -0.8);
const stripCss = (p: CaptionP, k: number) => ({ padding: '0.06em 0.42em 0.1em', background: p.bubbleBg, borderRadius: `${8 * k}px`, boxShadow: `0 ${5 * k}px ${16 * k}px rgba(20,12,6,0.3)` });

/** each line its own strip of paper (bubbleBg) with a soft shadow, tilted −0.8° and 0.7° in turn; the highlighted words (【word】
 *  and, with `words`, the one being said) on a highlighter stroke in the highlight colour, in ink like the rest */
function paperStrips(lines: HTMLElement[], p: CaptionP, left: boolean, k: number) {
  lines.forEach((line, i) => {
    cssCamel(line, { display: 'table', margin: `${i ? '0.2em' : '0'} ${left ? '0' : 'auto'} 0`, ...stripCss(p, k), transform: `rotate(${stripTilt(i)}deg)` });
    for (const sp of line.querySelectorAll<HTMLElement>('span')) if (sp.style.color) cssCamel(sp, { background: p.hl, boxShadow: `0 0 0 0.08em ${p.hl}`, borderRadius: '0.12em' });
  });
}

/** ink words printed on strips of paper, one strip a line, each tilted a little the other way; the word being said gets a
 *  highlighter stroke behind it instead of changing colour; a gloss is a strip of its own */
export const strip: CaptionLook = {
  id: 'strip', paper: true, weight: '700', room: padded,
  hl: (e) => e.p.outline,
  color: (e) => e.p.outline,
  lines: (ls, e) => paperStrips(ls, e.p, e.left, e.k),
  gloss: (s, e) => ({ display: 'table', margin: `0.3em ${e.left ? '0' : 'auto'} 0`, ...stripCss(e.p, e.k), transform: `rotate(${stripTilt(s.text.el.children.length)}deg)` }),
};

/** a strip of washi tape a line: see-through tape of the highlight colour with fine stripes and torn ends, ink words */
export const tape: CaptionLook = {
  id: 'tape', paper: true, weight: '700', room: padded,
  color: (e) => e.p.outline,
  hl: (e) => e.theme.palette.accent,
  lines: (lines, e) => lines.forEach((line, i) => cssCamel(line, { display: 'table', margin: `${i ? '0.18em' : '0'} ${e.left ? '0' : 'auto'} 0`, padding: '0.06em 0.55em 0.1em',
    background: `repeating-linear-gradient(90deg, color-mix(in srgb, ${e.p.hl} 82%, transparent) 0 0.5em, color-mix(in srgb, ${e.p.hl} 68%, transparent) 0.5em 0.6em)`,
    clipPath: 'polygon(0 6%, 2% 0, 4% 8%, 96% 2%, 98% 10%, 100% 4%, 100% 94%, 98% 100%, 96% 92%, 4% 98%, 2% 90%, 0 96%)', transform: `rotate(${i % 2 ? 1.4 : -1.2}deg)` })),
};

/** a sticky note: a square-ish yellow note slightly turned, a soft shadow, handwriting in ink */
export const postit: CaptionLook = {
  id: 'postit', paper: true, weight: '400', font: 'Iansui', room: (e, width) => width - 1.6 * e.px,
  color: (e) => e.p.outline,
  hl: (e) => e.theme.palette.accent,
  box: (e) => ({ background: `linear-gradient(175deg, ${e.p.accent || '#fff27a'} 0%, color-mix(in srgb, ${e.p.accent || '#fff27a'} 88%, #c9a200) 100%)`, padding: '0.45em 0.8em 0.55em', borderRadius: '0 0 0.15em 0.6em',
    boxShadow: `0 ${(0.1 * e.fs).toFixed(1)}px ${(0.24 * e.fs).toFixed(1)}px rgba(0,0,0,0.35)` }),
  pin: () => ' rotate(-2deg)',
};

/** a label maker's tape a line: a glossy black strip with the words embossed in white capitals, widely spaced */
export const label: CaptionLook = {
  // monospaced capitals 0.14 em apart, counted on the Latin letters only (Chinese lines kept as they were)
  id: 'label', weight: '700', font: 'JetBrains Mono', room: faceRoom(0.74, 0, padded),
  color: () => '#f4f4f4',
  lines: (lines, e) => lines.forEach((line, i) => cssCamel(line, { display: 'table', margin: `${i ? '0.16em' : '0'} ${e.left ? '0' : 'auto'} 0`, padding: '0.08em 0.5em 0.1em',
    background: `linear-gradient(180deg, #2b2b2b, #111 55%, #1c1c1c)`, borderRadius: '0.08em', textTransform: 'uppercase', letterSpacing: '0.14em',
    textShadow: '0 1px 0 rgba(0,0,0,0.9), 0 -1px 0 rgba(255,255,255,0.25)', boxShadow: `0 ${(0.05 * e.px).toFixed(1)}px ${(0.12 * e.px).toFixed(1)}px rgba(0,0,0,0.45)` })),
};

/** cut-out letters: every character on its own scrap of paper, each a different colour, font and tilt, like a ransom note */
const SCRAPS = [['#fff8ec', '#1a1a1a'], ['#1a1a1a', '#ffffff'], ['#ffe14d', '#1a1a1a'], ['#ff5c7a', '#ffffff'], ['#7fd4c8', '#1a1a1a'], ['#ffffff', '#c62828'], ['#3d7bff', '#ffffff']];
const SCRAP_FONTS = ["'Noto Serif TC'", "'Noto Sans TC'", "'Huninn'", "'LXGW WenKai TC'", "'Cactus Classical Serif'", "'Bebas Neue', 'Noto Sans TC'", "'Anton', 'Noto Sans TC'"];
export const ransom: CaptionLook = {
  id: 'ransom', weight: '700',
  word: () => ({
    char: (i: number, c: string): Record<string, string> => {
      if (!c.trim()) return { background: '', margin: '' };
      const k = (i * 7 + c.charCodeAt(0)) % SCRAPS.length, [bg, fg] = SCRAPS[k];
      return { background: bg, color: fg, fontFamily: `${SCRAP_FONTS[(i * 3 + c.charCodeAt(0)) % SCRAP_FONTS.length]}, sans-serif`, padding: '0 0.08em', margin: '0 0.03em',
        transform: `rotate(${(((i * 37 + c.charCodeAt(0)) % 13) - 6).toFixed(0)}deg)`, boxShadow: '0 0.04em 0.08em rgba(0,0,0,0.4)' };
    },
    hot: { outline: '0.08em solid #ffe14d' },
  }),
};
