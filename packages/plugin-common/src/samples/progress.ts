// common.progress's character modes' golden samples (spec 2026-11-22, progress characters): runner, stretch, paws, segments, fuse
// and battery, each 9:16 like the block's first sample (progress-bar in basics.ts) plus a 16:9 `wide-` one. Kept apart from the
// block's older samples so those, and the gallery thumbnail (the first sample), stay as they are.
import type { Sample } from './fixtures.ts';

export const PROGRESS_SAMPLES: Sample[] = [
  // runner: on its way (mid-hop) and just arrived (the flag at the top of its bounce)
  { name: 'progress-runner', type: 'common.progress', params: { mode: 'runner', position: 'bottom' }, len: 4, at: [1.4, 3.2] },
  { name: 'wide-progress-runner', type: 'common.progress', params: { mode: 'runner', position: 'bottom' }, len: 4, at: [1.4, 3.2], wide: true },
  { name: 'progress-runner-car', type: 'common.progress', params: { mode: 'runner', position: 'bottom', runner: '🚗', goal: '🏠' }, len: 4, at: [1.8, 3.2] },
];
