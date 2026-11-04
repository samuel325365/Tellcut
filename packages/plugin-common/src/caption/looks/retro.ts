// Digital and retro looks: rgb (a red and a cyan copy pulled apart), pixel (8-bit letters), vhs (a camcorder's on-screen text),
// terminal (green text on a console), segment (a liquid-crystal display) and scanline (letters striped by scan lines).
import type { CaptionLook } from '../types.ts';
import { padded } from './basic.ts';

/** white words with a red copy pulled left and a cyan copy pulled right, as if the colours slipped */
export const rgb: CaptionLook = {
  id: 'rgb', weight: '900',
  box: (e) => ({ textShadow: `${(-0.05 * e.fs).toFixed(1)}px 0 0 rgba(255,0,80,0.9), ${(0.05 * e.fs).toFixed(1)}px 0 0 rgba(0,229,255,0.9), 0 ${(0.04 * e.fs).toFixed(1)}px ${(0.12 * e.fs).toFixed(1)}px rgba(0,0,0,0.5)` }),
};

/** 8-bit game letters: a blocky face, a hard one-step shadow; Chinese keeps a bold sans */
export const pixel: CaptionLook = {
  id: 'pixel', weight: '400', font: 'Press Start 2P',
  sizeScale: 0.9,
  box: (e) => ({ textShadow: `${(0.08 * e.fs).toFixed(1)}px ${(0.08 * e.fs).toFixed(1)}px 0 ${e.p.outline}`, lineHeight: '1.6', letterSpacing: '0.04em' }),
};

/** a camcorder's on-screen text: white monospaced capitals with a slight colour fringe and glow, as on tape */
export const vhs: CaptionLook = {
  // a thin dark edge and a dark halo under the colour fringe: on a white wall it was unreadable; normal size, as capitals in this
  // face run wide and a spoken sentence took five lines at 1.2× (acceptance film cap-acc-vlog)
  id: 'vhs', weight: '400', font: 'VT323',
  stroke: (e) => 0.05 * e.fs,
  box: (e) => ({ textShadow: `${(0.03 * e.fs).toFixed(1)}px 0 0 rgba(255,60,60,0.75), ${(-0.03 * e.fs).toFixed(1)}px 0 0 rgba(60,160,255,0.75), 0 0 ${(0.25 * e.fs).toFixed(1)}px rgba(0,0,0,0.7)`, textTransform: 'uppercase', letterSpacing: '0.04em' }),
};

/** green monospaced text on a dark console box, glowing faintly */
export const terminal: CaptionLook = {
  id: 'terminal', weight: '400', font: 'JetBrains Mono', room: padded, left: true,
  color: () => '#4dff88',
  hl: () => '#e8fff0',
  box: (e) => ({ background: 'rgba(4,14,8,0.82)', padding: '0.25em 0.6em', borderRadius: `${(0.08 * e.fs).toFixed(1)}px`, textShadow: `0 0 ${(0.12 * e.fs).toFixed(1)}px rgba(77,255,136,0.6)`,
    boxShadow: 'inset 0 0 0 1px rgba(77,255,136,0.35)' }),
};

/** a liquid-crystal display: dark segments on a grey-green panel, the unlit segments a faint ghost behind them */
export const segment: CaptionLook = {
  id: 'segment', weight: '700', font: 'JetBrains Mono', room: padded,
  color: () => '#1d2418',
  hl: () => '#000000',
  box: (e) => ({ background: 'linear-gradient(180deg, #a9b59a, #8f9c80)', padding: '0.18em 0.6em', borderRadius: `${(0.1 * e.fs).toFixed(1)}px`, fontStyle: 'italic', letterSpacing: '0.05em',
    textShadow: `${(0.05 * e.fs).toFixed(1)}px ${(0.05 * e.fs).toFixed(1)}px 0 rgba(29,36,24,0.18)`, boxShadow: `inset 0 ${(0.05 * e.fs).toFixed(1)}px ${(0.12 * e.fs).toFixed(1)}px rgba(0,0,0,0.35), 0 0 0 ${(0.06 * e.fs).toFixed(1)}px #2a2f33` }),
};

/** letters striped by fine scan lines, in the highlight colour fading to white, as on an old screen */
export const scanline: CaptionLook = {
  id: 'scanline', weight: '900',
  word: (e) => {
    const lines = (c: string) => ({ backgroundImage: `repeating-linear-gradient(180deg, ${c} 0 0.06em, transparent 0.06em 0.1em), linear-gradient(180deg, #ffffff, ${c})`, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      filter: `drop-shadow(0 0 ${(0.08 * e.fs).toFixed(1)}px ${c})` });
    return { base: lines(e.p.hl), hot: lines(e.p.accent || '#ffffff') };
  },
};
