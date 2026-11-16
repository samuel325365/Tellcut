// The shared combos (engine combos.ts, spec 2026-11-16-combos): named moments built only from blocks, templates and sounds that
// already exist, timed against each other. Admission tests: combos.test.ts (well formed, picture layers of their own, a layer with a
// shape, at most MAX_COMBOS, a golden sample each) and golden/combos.test.ts (each one's peak picture apart from every other's).
// A new combo goes at the end, with its handle (CMB-nn), its texts keyed combo:<id> and its golden sample combo-<id>.
import type { Combo } from '@tellcut/engine';

export const combos: Combo[] = [
  // the lines burst out as a glow flares over the middle and shrinks back within a third of a second (low and steep: the lines read
  // through it from the first frame on footage); the hit's low thump lands with them
  { id: 'impact', label: '重擊', doc: '重擊、打臉、落地、大字砸下來：放射線從中間炸開，中間的光暈一亮再縮回去，配一記低沉的重擊，畫面跟著晃', parts: [
    { name: 'lines', kind: 'effect', type: 'common.speedlines', template: 'burst-center', at: 0, len: 0.8 },
    { name: 'flash', kind: 'effect', type: 'core.flash', template: 'bloom-pop', params: { y: 0.4, peak: 0.65, fall: 0.35, power: 3 }, at: 0, len: 0.5, layer: 'top' },
    { name: 'hit', kind: 'sfx', type: 'common.impact', at: 0, len: 1.4, gain: -6 },
    { name: 'shake', kind: 'shake', at: 0, len: 0.4, px: 28 },
  ] },
  // across a cut: the scan lines and their sideways jump start just before it, the colour split hits right after; the seeds put
  // each one's burst there (a glitch bursts on seeded frames, glitch.ts glitchBurst)
  { id: 'glitchcut', label: '故障切換', doc: '話題急轉、出事了、跳到另一個場景：剪接點前後畫面帶著掃描線往旁邊跳，接著紅藍色版分開，配刮唱片的「嘰——」', parts: [
    { name: 'scan', kind: 'effect', type: 'common.glitch', template: 'signal-loss', params: { seed: 6 }, at: -0.1, len: 0.5 },
    { name: 'split', kind: 'effect', type: 'common.glitch', template: 'rgb-hit', params: { seed: 9 }, at: 0, len: 0.4 },
    { name: 'scratch', kind: 'sfx', type: 'common.scratch', at: -0.1, len: 0.42, gain: -8 },
  ] },
];
