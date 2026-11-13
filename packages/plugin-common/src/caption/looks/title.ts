// A title's own looks (common.heading, spec 2026-11-05-title-templates): made for a few big words, never offered as a caption
// style (`only: 'title'`). serif (a documentary's serif name), spaced (wide-tracked capitals), stack (a big first line, the
// rest small), sign (a neon sign on a dark board), vintage (cream letterpress), seal (a double-ruled stamp), split (two colours,
// top and bottom), giant (a third bigger, heavy, a deep shadow), script (handwriting underlined), ribbon (each line on a notched ribbon).
import { cssCamel } from '@tellcut/engine';
import type { CaptionLook } from '../types.ts';
import { padded, faceRoom } from './basic.ts';

const shade = (fs: number, a = 0.55) => `0 ${(0.03 * fs).toFixed(1)}px ${(0.08 * fs).toFixed(1)}px rgba(0,0,0,${a}), 0 ${(0.08 * fs).toFixed(1)}px ${(0.4 * fs).toFixed(1)}px rgba(0,0,0,0.35)`;

/** the room a line has when its letters are spaced `em` apart: the caption fits words without their spacing; `latin`: how wide its
 *  Latin letters really are (0.55 em, what the line breaking counts, unless the look sets them in capitals) */
const spacedRoom = (em: number, pad = 0, latin: number | ((c: string) => number) = 0.55) => faceRoom(latin, em, (e, width) => width - pad * e.px);
/** Noto Sans TC's capitals at weight 400 (the default font), measured in Chrome: I is 0.29 em and W 0.88, most 0.55–0.75. Counted at
 *  the line breaking's 0.55, MOROCCO at the default size ran 58 px past the safe side in 9:16; counted at one wider number (0.65)
 *  ISTANBUL, narrow with its I, no longer shrank onto one line and broke in two. Other characters keep 0.55 */
const CAPS: Record<string, number> = { A: 0.61, B: 0.66, C: 0.64, D: 0.69, E: 0.59, F: 0.55, G: 0.69, H: 0.73, I: 0.29, J: 0.54, K: 0.65, L: 0.54, M: 0.81,
  N: 0.72, O: 0.74, P: 0.63, Q: 0.74, R: 0.64, S: 0.6, T: 0.6, U: 0.72, V: 0.58, W: 0.88, X: 0.57, Y: 0.53, Z: 0.6 };
export const capEm = (c: string) => CAPS[c.toUpperCase()] ?? 0.55;

/** a documentary's name: a classical serif, a little spaced, a soft shadow */
export const serif: CaptionLook = {
  id: 'serif', only: 'title', weight: '600', font: 'Noto Serif TC', room: spacedRoom(0.08),
  box: (e) => ({ textShadow: shade(e.fs), letterSpacing: '0.08em' }),
};

/** wide-tracked capitals in a light weight: a film's name */
export const spaced: CaptionLook = {
  id: 'spaced', only: 'title', weight: '400', room: spacedRoom(0.32, 0, capEm),
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
  // 0.6 em of padding and a 0.05 em tube a side
  id: 'sign', only: 'title', weight: '400', font: 'Huninn', room: (e, width) => width - 1.3 * e.px,
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
  id: 'vintage', only: 'title', weight: '700', font: 'Cactus Classical Serif', room: spacedRoom(0.04),
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
  // each line's ribbon has 0.8 em of padding a side (0.9 left five characters of a 9:16 title at the default size a hair over the safe
  // width even shrunk to 0.7, so the line broke in three); more than padded's 0.6, which ran a full line's ribbon past the safe area
  id: 'ribbon', only: 'title', weight: '900', room: (e, width) => width - 1.6 * e.px,
  color: () => '#ffffff',
  lines: (lines, e) => lines.forEach((l, i) => cssCamel(l, { display: 'table', margin: `${i ? '0.15em' : '0'} ${e.left ? '0' : 'auto'} 0`, padding: '0.08em 0.8em 0.12em',
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

/** a fashion magazine's giant headline (the Fashion pilot film's fx.bighead, 2026-11-06): heavy high-contrast Playfair, tight; with
 *  more than one line the first is a small kicker-sized word (THE) over the big one (NEEDLE) */
export const didone: CaptionLook = {
  id: 'didone', only: 'title', weight: '900', font: 'Playfair Display', room: padded,
  box: () => ({ letterSpacing: '-0.01em', lineHeight: '0.95' }),
  lines: (lines) => { if (lines.length > 1) cssCamel(lines[0], { fontSize: '0.45em', textAlign: 'left' }); },
};

/** a storybook title (the Wes Anderson pilot film's fx.storytitle, 2026-11-06): heavy Playfair with a hard shadow in the outline colour;
 *  a line with no capital, digit or CJK letter (a day, in, and finally,) is set half size in italic over it, and when every line is like
 *  that (fin.) they keep their size; the line under it is italic too */
export const storybook: CaptionLook = {
  id: 'storybook', only: 'title', weight: '900', font: 'Playfair Display', room: padded,
  box: (e) => ({ textShadow: `${(0.035 * e.fs).toFixed(1)}px ${(0.035 * e.fs).toFixed(1)}px 0 ${e.p.outline}`, lineHeight: '1' }),
  lines: (lines) => {
    const soft = lines.map((l) => isSoftLine(l.textContent ?? '')), all = soft.every(Boolean);
    lines.forEach((l, i) => {
      if (soft[i]) cssCamel(l, { fontStyle: 'italic', fontWeight: '400', fontSize: all ? '' : '0.5em', textShadow: '0 0.02em 0.08em rgba(0,0,0,0.5)' });
    });
  },
  gloss: () => ({ fontStyle: 'italic', fontWeight: '400', fontFamily: "'Playfair Display', 'Noto Serif TC', serif" }),
};
/** dopamine colour blocks (the Dopamine Colors pilot film's fx.poptitle, 2026-11-06): each line a flat block, set side by side and
 *  tipped a little; the last block the accent colour with the words' colour, those before it the outline colour (ink) with the
 *  highlight's; a line with no CJK letter in heavy italic Playfair (No.1); the kicker a small block of the outline colour */
export const pop: CaptionLook = {
  id: 'pop', only: 'title', weight: '900', font: 'Noto Serif TC', room: padded, row: true,
  lines: (lines, e) => {
    const n = lines.length, accent = e.p.accent || e.theme.palette.accent;
    lines.forEach((l, i) => {
      const last = i === n - 1, latin = !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(l.textContent ?? '');
      cssCamel(l, { display: 'inline-block', verticalAlign: 'bottom', margin: `0 0 0 ${i ? '0.1em' : '0'}`, padding: '0.04em 0.2em 0.07em', lineHeight: '1.12',
        background: last ? accent : e.p.outline, color: last ? e.p.color : e.p.hl,
        ...(latin ? { fontFamily: "'Playfair Display', 'Noto Serif TC', serif", fontStyle: 'italic' } : {}) });
    });
  },
  pin: () => ' rotate(-2deg)',
  kicker: (p, kfs) => ({ background: p.outline, color: p.kickerColor || '#ffffff', letterSpacing: '0.04em', textShadow: 'none', fontWeight: '900', fontFamily: "'Noto Serif TC', serif",
    padding: `${(0.12 * kfs).toFixed(2)}px ${(0.4 * kfs).toFixed(2)}px` }),
};

/** storybook's small italic lines: no capital (any script's: \u00c9, \u00ce), digit or CJK letter in them */
export const isSoftLine = (text: string) => !!text.trim() && !/[\p{Lu}\p{Lt}\p{Nd}\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}]/u.test(text);

export const TITLE_LOOKS: CaptionLook[] = [serif, spaced, stack, sign, vintage, seal, split, giant, script, ribbon, scrapbook, cycle, didone, storybook, pop];
