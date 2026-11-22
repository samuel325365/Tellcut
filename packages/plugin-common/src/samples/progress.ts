// common.progress's character modes' golden samples (spec 2026-11-22, progress characters): runner, stretch, paws, segments, fuse
// and battery, each 9:16 like the block's first sample (progress-bar in basics.ts) plus a 16:9 `wide-` one. Kept apart from the
// block's older samples so those, and the gallery thumbnail (the first sample), stay as they are.
import type { Sample } from './fixtures.ts';

export const PROGRESS_SAMPLES: Sample[] = [
  // runner: on its way (mid-hop) and just arrived (the flag at the top of its bounce)
  { name: 'progress-runner', type: 'common.progress', params: { mode: 'runner', position: 'bottom' }, len: 4, at: [1.4, 3.2] },
  { name: 'wide-progress-runner', type: 'common.progress', params: { mode: 'runner', position: 'bottom' }, len: 4, at: [1.4, 3.2], wide: true },
  { name: 'progress-runner-car', type: 'common.progress', params: { mode: 'runner', position: 'bottom', runner: '🚗', goal: '🏠' }, len: 4, at: [1.8, 3.2] },
  // stretch: the animal half grown (mid-step) and arrived (the dog's tongue out, the cat's tail up, the caterpillar's antennae
  // quivering); warm natural colours, so the pictures read as animals
  { name: 'progress-stretch', type: 'common.progress', params: { mode: 'stretch', position: 'bottom', thickness: 16, color: '#c98a4b' }, len: 4, at: [1.5, 3.3] },
  { name: 'progress-stretch-cat', type: 'common.progress', params: { mode: 'stretch', position: 'bottom', thickness: 16, look: 'cat', color: '#8d8f98' }, len: 4, at: [1.5, 3.5] },
  { name: 'progress-stretch-worm', type: 'common.progress', params: { mode: 'stretch', position: 'bottom', thickness: 16, look: 'worm', color: '#8bc34a' }, len: 4, at: [1.5, 3.15] },
  { name: 'wide-progress-stretch', type: 'common.progress', params: { mode: 'stretch', position: 'bottom', thickness: 16, color: '#c98a4b' }, len: 4, at: [1.5, 3.3], wide: true },
  // paws: a trail of twelve prints half way (the newest still landing) and all down; a star stamp instead of the drawn print
  { name: 'progress-paws', type: 'common.progress', params: { mode: 'paws', dots: 12 }, len: 4, at: [1.55, 3.3] },
  { name: 'progress-paws-star', type: 'common.progress', params: { mode: 'paws', dots: 12, runner: '⭐' }, len: 4, at: [1.55] },
  { name: 'wide-progress-paws', type: 'common.progress', params: { mode: 'paws', dots: 12 }, len: 4, at: [1.55, 3.3], wide: true },
  // segments: a stories bar at the top, the third of five filling, and all full
  { name: 'progress-segments', type: 'common.progress', params: { mode: 'segments', position: 'top', dots: 5 }, len: 4, at: [1.5, 3.3] },
  { name: 'wide-progress-segments', type: 'common.progress', params: { mode: 'segments', position: 'top', dots: 5 }, len: 4, at: [1.5, 3.3], wide: true },
  // fuse: the spark half way along a rope to the bomb, and the bomb at the top of its pop just after the spark got there
  { name: 'progress-fuse', type: 'common.progress', params: { mode: 'fuse', position: 'bottom', color: '#ffb300', track: '#d9b382' }, len: 4, at: [1.5, 3.15] },
  { name: 'wide-progress-fuse', type: 'common.progress', params: { mode: 'fuse', position: 'bottom', color: '#ffb300', track: '#d9b382' }, len: 4, at: [1.5, 3.15], wide: true },
  // battery: half charged (the third cell breathing), then full in the done colour; low (the first chapter of five, red)
  { name: 'progress-battery', type: 'common.progress', params: { mode: 'battery', position: 'bottom', size: 3, color: '#34c759' }, len: 4, at: [1.5, 3.1] },
  { name: 'progress-battery-low', type: 'common.progress', params: { mode: 'battery', position: 'bottom', size: 3, color: '#34c759', step: 0 }, len: 4, at: [1.1] },
  { name: 'wide-progress-battery', type: 'common.progress', params: { mode: 'battery', position: 'bottom', size: 3, color: '#34c759' }, len: 4, at: [1.5, 3.1], wide: true },
  // rocket (spec 2026-11-22, progress more modes): climbing the right side, flame lit, and the fireworks round the moon at their fullest
  { name: 'progress-rocket', type: 'common.progress', params: { mode: 'rocket' }, len: 4, at: [1.6, 3.25] },
  { name: 'wide-progress-rocket', type: 'common.progress', params: { mode: 'rocket' }, len: 4, at: [1.6, 3.25], wide: true },
  { name: 'progress-rocket-balloon', type: 'common.progress', params: { mode: 'rocket', runner: '🎈', goal: '☁️', align: 'left' }, len: 4, at: [1.8, 3.25] },
  // ring: two thirds round in the top right corner, and just full (the done colour at the top of its pop, the ripple out round it);
  // the second chapter of four with a pizza in the middle instead of the percentage, bottom left
  { name: 'progress-ring', type: 'common.progress', params: { mode: 'ring' }, len: 4, at: [2, 3.2] },
  { name: 'wide-progress-ring', type: 'common.progress', params: { mode: 'ring' }, len: 4, at: [2, 3.2], wide: true },
  { name: 'progress-ring-step', type: 'common.progress', params: { mode: 'ring', dots: 4, step: 1, runner: '🍕', align: 'left', position: 'bottom' }, len: 4, at: [1.5] },
];
