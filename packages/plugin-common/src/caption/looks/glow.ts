// Light and colour: neon (glowing tubes) and gradient (words filled with a gradient).
import type { CaptionLook } from '../types.ts';

const glow = (c: string, fs: number) => `0 0 ${(0.04 * fs).toFixed(1)}px #fff, 0 0 ${(0.16 * fs).toFixed(1)}px ${c}, 0 0 ${(0.42 * fs).toFixed(1)}px ${c}, 0 0 ${(0.9 * fs).toFixed(1)}px ${c}`;

/** pale words glowing in the highlight colour like neon tubes; the word being said glows in the second colour (accent), words not
 *  said yet are unlit */
export const neon: CaptionLook = {
  id: 'neon', weight: '400', font: 'Huninn',
  color: () => '#fff4fb',
  box: (e) => ({ textShadow: glow(e.p.hl, e.fs) }),
  word: (e) => ({ hot: { color: '#effeff', textShadow: glow(e.p.accent || '#29e7ff', e.fs) }, dim: { color: '#b98aa6', textShadow: 'none' }, onbox: { color: '#ffffff' }, box: `color-mix(in srgb, ${e.p.hl} 28%, transparent)` }),
};

/** words filled with a gradient from white through the highlight colour to the second colour, a hard dark edge under them; the
 *  word being said in a cool gradient */
export const gradient: CaptionLook = {
  id: 'gradient',
  word: (e) => {
    const fill = (a: string, b: string) => ({ backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${a} 45%, ${b} 100%)`, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' });
    return {
      base: { ...fill(e.p.hl, e.p.accent || '#ff8a4c'), filter: `drop-shadow(0 ${(0.05 * e.fs).toFixed(1)}px 0 #4a1c0c) drop-shadow(0 ${(0.1 * e.fs).toFixed(1)}px ${(0.16 * e.fs).toFixed(1)}px rgba(0,0,0,0.45))` },
      hot: fill('#a8f3ff', '#3a8cff'),
      box: '#1d1140',
    };
  },
};
