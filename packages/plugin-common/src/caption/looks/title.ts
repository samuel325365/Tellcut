// A title's own looks (common.heading, spec 2026-11-05-title-templates): made for a few big words, never offered as a caption
// style (`only: 'title'`). serif (a documentary's serif name), spaced (wide-tracked capitals), stack (a big first line, the
// rest small), sign (a neon sign on a dark board), vintage (cream letterpress), seal (a double-ruled stamp), split (two colours,
// top and bottom), giant (a third bigger, heavy, a deep shadow), script (handwriting underlined), ribbon (each line on a notched ribbon).
import { cssCamel } from '@tellcut/engine';
import type { CaptionLook } from '../types.ts';
import { padded, faceRoom } from './basic.ts';

const shade = (fs: number, a = 0.55) => `0 ${(0.03 * fs).toFixed(1)}px ${(0.08 * fs).toFixed(1)}px rgba(0,0,0,${a}), 0 ${(0.08 * fs).toFixed(1)}px ${(0.4 * fs).toFixed(1)}px rgba(0,0,0,0.35)`;

/** the room a line has when its letters are spaced `em` apart: the caption fits words without their spacing */
const spacedRoom = (em: number, pad = 0) => faceRoom(0.55, em, (e, width) => width - pad * e.px);

/** a documentary's name: a classical serif, a little spaced, a soft shadow */
export const serif: CaptionLook = {
  id: 'serif', only: 'title', weight: '600', font: 'Noto Serif TC', room: spacedRoom(0.08),
  box: (e) => ({ textShadow: shade(e.fs), letterSpacing: '0.08em' }),
};

/** wide-tracked capitals in a light weight: a film's name */
export const spaced: CaptionLook = {
  id: 'spaced', only: 'title', weight: '400', room: spacedRoom(0.32),
  box: (e) => ({ textShadow: shade(e.fs, 0.7), letterSpacing: '0.32em', textTransform: 'uppercase' }),
  // the line under it keeps a modest spacing, not the title's
  gloss: () => ({ letterSpacing: '0.12em' }),
};

/** a magazine stack: the first line big, the lines after it half the size, spaced, in the highlight colour */
export const stack: CaptionLook = {
  id: 'stack', only: 'title',
  box: (e) => ({ textShadow: shade(e.fs) }),
  lines: (lines, e) => lines.forEach((l, i) => { if (i) cssCamel(l, { fontSize: '0.5em', letterSpacing: '0.12em', color: e.p.hl, marginTop: '0.2em' }); }),
};

/** a neon sign: glowing tubes on a dark board with a lit rim */
export const sign: CaptionLook = {
  id: 'sign', only: 'title', weight: '400', font: 'Huninn', room: padded,
  color: () => '#fff6fb',
  box: (e) => {
    const c = e.p.accent || e.p.hl, g = (k: number) => `${(k * e.fs).toFixed(1)}px`;
    return { background: 'rgba(14,10,22,0.86)', padding: '0.25em 0.6em 0.3em', borderRadius: '0.28em', border: `${g(0.05)} solid ${c}`,
      boxShadow: `0 0 ${g(0.25)} ${c}, inset 0 0 ${g(0.25)} color-mix(in srgb, ${c} 60%, transparent)`,
      textShadow: `0 0 ${g(0.04)} #ffffff, 0 0 ${g(0.12)} ${c}, 0 0 ${g(0.3)} ${c}` };
  },
};

/** cream letterpress: warm off-white serif type pressed in, a thin dark edge */
export const vintage: CaptionLook = {
  id: 'vintage', only: 'title', weight: '700', font: 'Cactus Classical Serif',
  color: () => '#f3e6c8',
  box: (e) => ({ textShadow: `0 ${(0.02 * e.fs).toFixed(1)}px 0 rgba(60,40,20,0.9), 0 ${(0.05 * e.fs).toFixed(1)}px ${(0.12 * e.fs).toFixed(1)}px rgba(0,0,0,0.5)`, letterSpacing: '0.04em' }),
};

/** a double-ruled stamp, slightly turned, in the accent colour */
export const seal: CaptionLook = {
  id: 'seal', only: 'title', weight: '900', room: spacedRoom(0.1, 1.2),
  color: (e) => e.p.accent || e.theme.palette.accent,
  box: (e) => ({ border: `${(0.1 * e.fs).toFixed(1)}px double ${e.p.accent || e.theme.palette.accent}`, padding: '0.12em 0.45em 0.18em', borderRadius: '0.12em',
    background: 'rgba(255,250,240,0.9)', letterSpacing: '0.1em' }),
  pin: () => ' rotate(-3deg)',
  // the line under it is not spaced by the big words' 0.1 em (in their pixels it ran wider than the stamp and broke)
  gloss: () => ({ letterSpacing: '0.02em' }),
};

/** two colours, the text colour on top and the highlight colour under it, split across the middle of the line */
export const split: CaptionLook = {
  id: 'split', only: 'title',
  word: (e) => {
    const fill = (a: string, b: string) => ({ backgroundImage: `linear-gradient(180deg, ${a} 0 50%, ${b} 50% 100%)`, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' });
    return { base: { ...fill(e.p.color, e.p.hl), filter: `drop-shadow(0 ${(0.05 * e.fs).toFixed(1)}px 0 rgba(0,0,0,0.55))` }, hot: fill(e.p.hl, e.p.color), dim: { opacity: '0.4' } };
  },
};

/** a third bigger, the heaviest weight set tight, a deep soft shadow: one giant word over the picture (an outline only would show
 *  the Chinese fonts' overlapping strokes) */
export const giant: CaptionLook = {
  id: 'giant', only: 'title', sizeScale: 1.35,
  box: (e) => ({ letterSpacing: '-0.02em', textShadow: `0 ${(0.04 * e.fs).toFixed(1)}px 0 rgba(0,0,0,0.35), 0 ${(0.12 * e.fs).toFixed(1)}px ${(0.5 * e.fs).toFixed(1)}px rgba(0,0,0,0.55)` }),
};

/** handwriting with a stroke of the highlight colour under each line */
export const script: CaptionLook = {
  id: 'script', only: 'title', weight: '400', font: 'Iansui',
  box: (e) => ({ textShadow: shade(e.fs) }),
  lines: (lines, e) => lines.forEach((l) => cssCamel(l, { display: 'table', margin: `0 ${e.left ? '0' : 'auto'}`, padding: '0 0.1em 0.12em',
    backgroundImage: `linear-gradient(${e.p.hl}, ${e.p.hl})`, backgroundSize: '100% 0.09em', backgroundPosition: '0 96%', backgroundRepeat: 'no-repeat' })),
};

/** each line on a ribbon in the accent colour with notched ends */
export const ribbon: CaptionLook = {
  id: 'ribbon', only: 'title', weight: '900', room: padded,
  color: () => '#ffffff',
  lines: (lines, e) => lines.forEach((l, i) => cssCamel(l, { display: 'table', margin: `${i ? '0.15em' : '0'} ${e.left ? '0' : 'auto'} 0`, padding: '0.08em 0.9em 0.12em',
    background: e.p.accent || e.theme.palette.accent, clipPath: 'polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%)' })),
};

/** a scrapbook's title card (the Collage pilot film's fx.scraplabel, 2026-11-05): heavy Playfair in the accent colour on a cream card
 *  with double rules above and below, a block of the highlight colour peeking out at its top left like a scrap pasted under it */
export const scrapbook: CaptionLook = {
  id: 'scrapbook', only: 'title', weight: '900', font: 'Playfair Display', room: padded,
  color: (e) => e.p.accent || e.theme.palette.accent,
  box: (e) => {
    const f = (k: number) => `${(k * e.fs).toFixed(1)}px`, rule = `${f(0.06)} double #5a4a3a`;
    return { background: '#f6efe0', padding: '0.12em 0.5em 0.2em', borderTop: rule, borderBottom: rule,
      boxShadow: `-${f(0.18)} -${f(0.16)} 0 ${e.p.hl}, 0 ${f(0.06)} ${f(0.18)} rgba(40,25,10,0.35)` };
  },
  pin: () => ' rotate(-1.5deg)',
  gloss: () => ({ color: '#4a3c30', letterSpacing: '0.12em' }),
};

/** wide geometric capitals stacked, one line solid and the others outlined, the solid one stepping down a line every 0.45 s (the Mono Frame
 *  pilot film's fx.monotitle, 2026-11-05). Light words get a soft shade to stay readable on bright footage: a text shadow on the solid
 *  line, a drop shadow on the outlined ones (a text shadow would show through their empty fill as a grey blur); dark words, none */
export const CYCLE_STEP = 0.45;
const light = (c: string) => { const m = /^#?([0-9a-f]{6})/i.exec(String(c ?? '')); if (!m) return true; const n = parseInt(m[1], 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 128; };
export const cycle: CaptionLook = {
  id: 'cycle', only: 'title', weight: '700', font: 'Space Grotesk', room: padded,
  box: () => ({ letterSpacing: '0.01em' }),
  lines: (lines, e) => {
    const hot = Math.floor(Math.max(0, e.local) / CYCLE_STEP) % Math.max(1, lines.length), w = Math.max(1.5, 0.028 * e.px), shade = light(e.p.color), b = (0.1 * e.px).toFixed(1);
    lines.forEach((l, i) => cssCamel(l, i === hot
      ? { color: '', webkitTextStroke: '0', textShadow: shade ? `0 0 ${b}px rgba(0,0,0,0.4)` : 'none', filter: 'none' }
      : { color: 'transparent', webkitTextStroke: `${w.toFixed(1)}px ${e.p.color}`, textShadow: 'none', filter: shade ? `drop-shadow(0 0 ${(0.05 * e.px).toFixed(1)}px rgba(0,0,0,0.55))` : 'none' }));
  },
};

export const TITLE_LOOKS: CaptionLook[] = [serif, spaced, stack, sign, vintage, seal, split, giant, script, ribbon, scrapbook, cycle];
