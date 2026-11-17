// common.lens's golden samples: a lens over nothing shows nothing, so each is drawn over a gingham ground (its checks show every
// bend) and a big word (in no one language: the gallery's English and Japanese cards show it as it is), the lens on the top track
// at full strength. Its templates' samples (lens-tpl-<id>) are drawn over the same ground, the template's params alone on the lens.
import { applyTemplate } from '@tellcut/engine';
import { lens } from '../lens.ts';
import { templateSample, type Sample } from './fixtures.ts';

/** what the lens bends: the ground under everything, the words over it, for `len` seconds */
const under = (len: number): NonNullable<Sample['items']> => [
  { type: 'common.backdrop', params: { pattern: 'gingham', color: '#f6efe2', color2: '#2f5d8a', tint: 0.55, scale: 60 }, start: 0, end: len, layer: 'under' },
  { type: 'common.slam', params: { text: 'TELL【CUT】', size: 9, y: 0.45, tilt: 0, shake: 0 }, start: 0, end: len },
];
const lensSample = (name: string, params: Record<string, unknown>, at = [1.5], len = 3): Sample =>
  ({ name, type: 'common.lens', params, at, len, items: [...under(len), { type: 'common.lens', params, start: 0, end: len, layer: 'top' }] });
/** a template's sample: its name (templateSample) and the template's params alone on the lens */
const tpl = (id: string, at: number[], len = 3): Sample => lensSample(templateSample(lens.type, id), applyTemplate(lens, id), at, len);

export const LENS_SAMPLES: Sample[] = [
  // a round magnifier with a thin white rim over the words, at its full 1.9×
  lensSample('lens', { look: 'magnify', shape: 'circle', x: 0.5, y: 0.45, size: 46, strength: 0.6, rim: 'line' }),
  // a big round fisheye with a glass rim: the middle swollen, the rim squeezed
  lensSample('lens-fisheye', { look: 'fisheye', shape: 'circle', x: 0.5, y: 0.45, size: 70, strength: 0.8, rim: 'glass' }),
  // a square mosaic over the words, no rim (a censor box)
  lensSample('lens-mosaic', { look: 'mosaic', shape: 'box', x: 0.5, y: 0.45, size: 64, strength: 0.8, rim: 'none' }),
  // the whole frame rippling, the waves lying sideways
  lensSample('lens-ripple', { look: 'ripple', shape: 'full', strength: 0.7 }),
  // the whole frame streaked sideways
  lensSample('lens-streak', { look: 'streak', shape: 'full', strength: 0.7 }),
  // a round lens splitting red and cyan toward its rim, the middle sharp
  lensSample('lens-prism', { look: 'prism', shape: 'circle', x: 0.5, y: 0.45, size: 70, strength: 1, rim: 'none' }),
  // the templates (2026-11-17): the small magnifier settled after its pop; the sweeping one a third and two thirds of the way;
  // the censor box; the pixel cut and the whip on items as short as their docs say, at their biggest cells and fullest blur
  // (the middle of the item); the haze in its steady middle
  tpl('spot-zoom', [1.5]),
  tpl('scan-glass', [1.0, 2.0]),
  tpl('censor', [1.5]),
  tpl('pixel-cut', [0.3], 0.6),
  tpl('heat-haze', [1.5]),
  tpl('whip', [0.2], 0.4),
];
