// The shared combos (engine combos.ts, spec 2026-11-16-combos): named moments built only from blocks, templates and sounds that
// already exist, timed against each other. Admission tests: combos.test.ts (well formed, picture layers of their own, a layer with a
// shape, at most MAX_COMBOS, a golden sample each) and golden/combos.test.ts (each one's peak picture apart from every other's).
// A new combo goes at the end, with its handle (CMB-nn), its texts keyed combo:<id> and its golden sample combo-<id>.
import type { Combo } from '@tellcut/engine';

export const combos: Combo[] = [
  // the lines burst out as the glow fills the frame and shrinks back within half a second; the hit's low thump lands with them
  { id: 'impact', label: '重擊', doc: 'A punch, a slap, a landing, a big word slammed in: radiating lines and a glow from the middle, a heavy hit and the clip shaking.', parts: [
    { name: 'lines', kind: 'effect', type: 'common.speedlines', template: 'burst-center', at: 0, len: 0.8 },
    { name: 'flash', kind: 'effect', type: 'core.flash', template: 'bloom-pop', params: { y: 0.4 }, at: 0, len: 0.5, layer: 'top' },
    { name: 'hit', kind: 'sfx', type: 'common.impact', at: 0, len: 1.4, gain: -6 },
    { name: 'shake', kind: 'shake', at: 0, len: 0.4, px: 28 },
  ] },
  // across a cut: the scan lines and their sideways jump start just before it, the colour split hits right after; the seeds put
  // each one's burst there (a glitch bursts on seeded frames, glitch.ts glitchBurst)
  { id: 'glitchcut', label: '故障切換', doc: 'A sudden change of topic, something going wrong, a jump to another scene: the picture jumps on scan lines across the cut, then its colours split, with a record scratch.', parts: [
    { name: 'scan', kind: 'effect', type: 'common.glitch', template: 'signal-loss', params: { seed: 6 }, at: -0.1, len: 0.5 },
    { name: 'split', kind: 'effect', type: 'common.glitch', template: 'rgb-hit', params: { seed: 9 }, at: 0, len: 0.4 },
    { name: 'scratch', kind: 'sfx', type: 'common.scratch', at: -0.1, len: 0.42, gain: -8 },
  ] },
];
