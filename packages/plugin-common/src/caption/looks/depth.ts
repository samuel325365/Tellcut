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
