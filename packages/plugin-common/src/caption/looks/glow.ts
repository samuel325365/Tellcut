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

/** a gradient filling the words (word spans: background-clip text), with a dark edge under them */
const filled = (gradient: string, edge: string, fs: number, extra = {}) => ({ backgroundImage: gradient, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  filter: `drop-shadow(0 ${(0.04 * fs).toFixed(1)}px 0 ${edge}) drop-shadow(0 ${(0.08 * fs).toFixed(1)}px ${(0.14 * fs).toFixed(1)}px rgba(0,0,0,0.5))`, ...extra });

/** polished gold: a warm gradient with a bright band across the middle, a brown edge */
export const gold: CaptionLook = {
  id: 'gold',
  word: (e) => ({ base: filled('linear-gradient(180deg, #fff6c8 0%, #f6d36b 32%, #b8862b 52%, #f2c94c 70%, #8a5a12 100%)', '#4a2c06', e.fs), hot: filled('linear-gradient(180deg, #ffffff 0%, #fff1b8 40%, #ffd23f 100%)', '#4a2c06', e.fs), box: '#2a1a04' }),
};

/** chrome: a cold silver gradient with a hard horizon in the middle, a dark edge */
export const chrome: CaptionLook = {
  id: 'chrome',
  word: (e) => ({ base: filled('linear-gradient(180deg, #ffffff 0%, #dfe6ee 45%, #6f7a86 50%, #c9d2dc 72%, #ffffff 100%)', '#1c2128', e.fs), hot: filled(`linear-gradient(180deg, #ffffff 0%, ${e.p.hl} 48%, #6f7a86 52%, ${e.p.hl} 100%)`, '#1c2128', e.fs), box: '#1c2128' }),
};

/** a gradient of the highlight and second colours that keeps flowing through the words */
export const flow: CaptionLook = {
  id: 'flow',
  word: (e) => {
    const a = e.p.hl, b = e.p.accent || '#ff5fa2', at = `${((e.local * 60) % 200).toFixed(1)}% 50%`;
    return { base: filled(`linear-gradient(100deg, ${a}, ${b}, #ffffff, ${a}, ${b})`, 'rgba(0,0,0,0.6)', e.fs, { backgroundSize: '200% 100%', backgroundPosition: at }), box: 'rgba(255,255,255,0.18)' };
  },
};

/** white words in a wide soft glow of the highlight colour */
export const halo: CaptionLook = {
  id: 'halo', weight: '700',
  box: (e) => ({ textShadow: `0 0 ${(0.1 * e.fs).toFixed(1)}px ${e.p.hl}, 0 0 ${(0.35 * e.fs).toFixed(1)}px ${e.p.hl}, 0 ${(0.03 * e.fs).toFixed(1)}px ${(0.06 * e.fs).toFixed(1)}px rgba(0,0,0,0.5)` }),
  hl: () => '#ffffff',
  word: (e) => ({ hot: { textShadow: `0 0 ${(0.12 * e.fs).toFixed(1)}px #ffffff, 0 0 ${(0.45 * e.fs).toFixed(1)}px ${e.p.accent || e.p.hl}` } }),
};

/** words split in two colours across the middle: the highlight colour above, the second colour below */
export const duotone: CaptionLook = {
  id: 'duotone',
  word: (e) => ({ base: filled(`linear-gradient(180deg, ${e.p.hl} 0 54%, ${e.p.accent || '#ff5fa2'} 54% 100%)`, 'rgba(0,0,0,0.55)', e.fs), hot: filled(`linear-gradient(180deg, #ffffff 0 54%, ${e.p.hl} 54% 100%)`, 'rgba(0,0,0,0.55)', e.fs) }),
};
