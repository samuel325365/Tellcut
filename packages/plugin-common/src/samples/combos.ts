// The combos' golden samples (combos.ts, spec 2026-11-16-combos): a combo's picture layers drawn together (its sounds and the shake are
// not pictures), at three moments: the start, the peak and the end. The admission test compares the peaks (golden/combos.test.ts).
import { corePlugin, createRegistry, expandCombo, type ItemType } from '@tellcut/engine';
import { combos } from '../combos.ts';
import { commonItems } from '../index.ts';
import { commonSfx } from '../sfx/index.ts';
import type { Sample } from './fixtures.ts';

/** light and mid stripes: the dark lines and the white glow both show on them, and their edges show what the glitches move */
const COMBO_BG = 'repeating-linear-gradient(90deg, #d8d0bc 0px, #d8d0bc 90px, #5a6676 90px, #5a6676 180px)';
const lookup = createRegistry([corePlugin as { id: string; items: ItemType[] }, { id: 'common', items: commonItems, sfx: commonSfx }]);

/** combo `id`'s sample, combo-<id>: the moment falls where its earliest picture layer starts at 0 (a layer ahead of the moment, a
 *  negative at, starts the film), the film ends with its last picture layer; `at` are film times, as in every sample */
export function comboSample(id: string, at: number[], rest: Partial<Omit<Sample, 'name' | 'type' | 'combo' | 'items' | 'at'>> = {}): Sample {
  const c = combos.find((x) => x.id === id);
  if (!c) throw new Error(`沒有組合 ${id}`);
  const layers = expandCombo(c, lookup).filter((p) => p.kind === 'effect'), lead = Math.max(0, ...layers.map((p) => -p.at));
  const items = layers.map((p) => ({ type: p.type!, params: p.params, start: +(lead + p.at).toFixed(6), end: +(lead + p.at + p.len).toFixed(6), ...(p.layer ? { layer: p.layer } : {}) }));
  return { name: `combo-${id}`, type: `combo:${id}`, combo: id, items, len: Math.max(...items.map((x) => x.end)), at, bg: COMBO_BG, ...rest };
}

export const COMBO_SAMPLES: Sample[] = [
  // the glow over the frame, the lines half out through it; the lines at full length round the glow shrinking in the middle; the
  // lines alone, fading
  comboSample('impact', [0.06, 0.15, 0.7]),
  // the moment at 0.1: the scan lines before the cut, both bursts across it, the scan lines and a faint fringe after
  comboSample('glitchcut', [0.03, 0.17, 0.4]),
  // the dots and the focus lines' tips just in from the edges; the lines closed in round the middle; the same, fading
  comboSample('punchline', [0.05, 0.3, 0.8]),
  // the tape with the first tears; the tracking band halfway down with the second; the tape alone
  comboSample('rewind', [0.1, 0.5, 1.0]),
  // the moment at 0.6: the band coming in at the left; the band across the frame and the glint at its full size; the glint dying
  comboSample('reveal', [0.15, 0.62, 1.1]),
  // the moment at 0.4: the first confetti in at the top; the glow over the frame half full of confetti; the confetti fading
  comboSample('celebrate', [0.15, 0.7, 2.2]),
  // 3 with the hand a third round; 2 halfway; 1 nearly done
  comboSample('leader', [0.3, 1.5, 2.7]),
  // the grain with the light coming in; the light at its brightest; fading again
  comboSample('memory', [0.3, 1.25, 2.3]),
  // the moment at 0.3: the light coming in at the left; the streaks over the light at its brightest; the streaks alone, fading
  comboSample('rush', [0.15, 0.45, 1.1]),
];
