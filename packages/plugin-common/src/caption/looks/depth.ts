// Depth: extrude (letters with a solid 3D side).
import type { CaptionLook } from '../types.ts';

/** letters in the highlight colour with a thin dark edge and a solid side stepping down and right in the second colour, darker
 *  as it goes back, and a shadow under it all; the word being said turns white */
export const extrude: CaptionLook = {
  id: 'extrude',
  color: (e) => e.p.hl,
  stroke: (e) => 0.03 * e.fs,
  strokeColor: (e) => `color-mix(in srgb, ${e.p.accent || '#e8742c'} 40%, #000)`,
  box: (e) => {
    const side = e.p.accent || '#e8742c', steps = 6, layers: string[] = [];
    for (let i = 1; i <= steps; i++) layers.push(`${(0.02 * i * e.fs).toFixed(1)}px ${(0.025 * i * e.fs).toFixed(1)}px 0 color-mix(in srgb, ${side} ${100 - i * 8}%, #000)`);
    layers.push(`${(0.2 * e.fs).toFixed(1)}px ${(0.26 * e.fs).toFixed(1)}px ${(0.22 * e.fs).toFixed(1)}px rgba(0,0,0,0.55)`);
    // the side reaches into the space after a word: wider spaces keep the words apart
    return { textShadow: layers.join(', '), wordSpacing: '0.18em' };
  },
  word: (e) => ({ hot: { color: '#ffffff' }, onbox: { color: e.p.hl }, box: '#2b1a5c' }),
};

/** a long shadow: the letters cast a solid shadow far down and right, in the second colour (dark by default), fading out */
export const longshadow: CaptionLook = {
  id: 'longshadow', weight: '900',
  box: (e) => {
    const c = e.p.accent || '#1a1a2e', steps = 14, layers: string[] = [];
    for (let i = 1; i <= steps; i++) layers.push(`${(0.018 * i * e.fs).toFixed(1)}px ${(0.018 * i * e.fs).toFixed(1)}px 0 color-mix(in srgb, ${c} ${100 - i * 5}%, transparent)`);
    return { textShadow: layers.join(', '), wordSpacing: '0.2em' };
  },
};

/** pressed into a plate: a mid-grey box, the letters lit from the top left and shaded at the bottom right */
export const emboss: CaptionLook = {
  id: 'emboss', weight: '900',
  color: () => '#c9ccd2',
  hl: (e) => e.p.hl,
  room: (e, width) => width - 1.2 * e.px,
  box: (e) => ({ background: 'linear-gradient(180deg, #b4b8c0, #9aa0aa)', padding: '0.14em 0.6em', borderRadius: `${(0.12 * e.fs).toFixed(1)}px`,
    textShadow: `${(-0.025 * e.fs).toFixed(1)}px ${(-0.025 * e.fs).toFixed(1)}px 0 rgba(255,255,255,0.85), ${(0.03 * e.fs).toFixed(1)}px ${(0.03 * e.fs).toFixed(1)}px 0 rgba(0,0,0,0.45)`,
    boxShadow: `0 ${(0.06 * e.fs).toFixed(1)}px ${(0.2 * e.fs).toFixed(1)}px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5)` }),
};

/** chunky toy blocks: white letters with a thick ink outline and a deep solid side straight down */
export const block: CaptionLook = {
  id: 'block',
  stroke: (e) => 0.12 * e.fs,
  box: (e) => {
    const side = e.p.accent || e.theme.palette.accent, layers: string[] = [];
    for (let i = 1; i <= 5; i++) layers.push(`0 ${(0.035 * i * e.fs).toFixed(1)}px 0 ${i === 5 ? e.p.outline : side}`);
    return { textShadow: layers.join(', ') };
  },
  hl: (e) => e.p.hl,
};

/** puffy: rounded letters blown up like a balloon: a soft rounded face, a thick white rim and a soft shadow */
export const puffy: CaptionLook = {
  id: 'puffy', weight: '400', font: 'Huninn',
  color: (e) => e.p.hl,
  stroke: (e) => 0.22 * e.fs,
  strokeColor: () => '#ffffff',
  hl: (e) => e.p.accent || e.theme.palette.accent,
  box: (e) => ({ filter: `drop-shadow(0 ${(0.08 * e.fs).toFixed(1)}px ${(0.1 * e.fs).toFixed(1)}px rgba(0,0,0,0.35))`, textShadow: `0 ${(-0.05 * e.fs).toFixed(1)}px 0 rgba(255,255,255,0.55)` }),
};
