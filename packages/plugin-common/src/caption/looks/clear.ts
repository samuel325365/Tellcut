// Clear looks, more of them: punch (a heavy outline and a shadow, the short-video caption), double (two outlines), soft (a soft
// shadow only), frost (a frosted-glass box) and cinema (a film subtitle).
import type { CaptionLook } from '../types.ts';
import { padded } from './basic.ts';

/** white words, a heavy ink outline and a soft shadow under it: the caption short videos use, best with a word effect */
export const punch: CaptionLook = {
  id: 'punch',
  stroke: (e) => 0.16 * e.fs,
  box: (e) => ({ textShadow: `0 ${(0.06 * e.fs).toFixed(1)}px ${(0.2 * e.fs).toFixed(1)}px rgba(0,0,0,0.45)` }),
};

/** white words with an ink outline and a second, outer outline in the accent colour */
export const double: CaptionLook = {
  id: 'double',
  stroke: (e) => 0.12 * e.fs,
  box: (e) => {
    const ring = e.p.accent || e.theme.palette.accent, r = 0.09 * e.fs, d = r * 0.7;
    const at = [[r, 0], [-r, 0], [0, r], [0, -r], [d, d], [-d, d], [d, -d], [-d, -d]];
    return { textShadow: at.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${ring}`).join(', ') };
  },
};

/** white words with only a soft shadow: quiet, for a calm picture */
export const soft: CaptionLook = {
  id: 'soft', weight: '700',
  box: (e) => ({ textShadow: `0 ${(0.04 * e.fs).toFixed(1)}px ${(0.08 * e.fs).toFixed(1)}px rgba(0,0,0,0.55), 0 ${(0.1 * e.fs).toFixed(1)}px ${(0.5 * e.fs).toFixed(1)}px rgba(0,0,0,0.45)` }),
};

/** white words on a box of frosted glass: the picture behind it blurred and a little brighter */
export const frost: CaptionLook = {
  id: 'frost', weight: '700', room: padded,
  box: (e) => ({ background: 'rgba(18,20,26,0.36)', backdropFilter: `blur(${(18 * e.k).toFixed(1)}px) saturate(1.3)`, padding: '0.12em 0.5em 0.16em', borderRadius: '0.38em',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)' }),
};

/** a film's subtitle: medium weight, slightly spaced, a tight dark shadow in a soft dark halo, nothing else */
export const cinema: CaptionLook = {
  id: 'cinema', weight: '500',
  // a soft dark halo under the tight shadow: white on a bright sky stays readable (acceptance film cap-acc-trip)
  box: (e) => ({ textShadow: `0 ${(0.04 * e.fs).toFixed(1)}px ${(0.1 * e.fs).toFixed(1)}px rgba(0,0,0,0.9), 0 0 ${(0.3 * e.fs).toFixed(1)}px rgba(0,0,0,0.6), 0 0 ${(0.12 * e.fs).toFixed(1)}px rgba(0,0,0,0.5)`, letterSpacing: '0.04em' }),
};
