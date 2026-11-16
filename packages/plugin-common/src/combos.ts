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
  // the picture turns to comic-book halftone dots and the focus lines close in from the edges over a quarter second, both at once on
  // the boing. (The backdrop's halftone pattern is a background, under the clip where a full-frame clip hides it: the film's print
  // look puts the dots on the picture itself instead, under the lines so they stay solid ink)
  { id: 'punchline', label: '笑點', doc: '笑點落下、吐槽、傻眼的一瞬間：畫面變成漫畫的印刷網點，粗黑的集中線從四邊往中間收，配一聲彈簧「啵嚶～」，畫面輕輕一晃', parts: [
    { name: 'dots', kind: 'effect', type: 'common.film', template: 'print-zine', at: 0, len: 0.9 },
    { name: 'lines', kind: 'effect', type: 'common.speedlines', template: 'manga-focus', at: 0, len: 0.9 },
    { name: 'boing', kind: 'sfx', type: 'common.boing', at: 0, len: 0.62, gain: -8 },
    { name: 'shake', kind: 'shake', at: 0, len: 0.25, px: 12 },
  ] },
  // the tape look holds while its tracking band slides down the frame from 0.2 s to 0.8 s; the seed puts the tears' flickers in pairs
  // at about 0.1, 0.45 and 0.85 s (a tear step is two frames, glitch.ts); the rewind sound swells to its loudest in the middle
  { id: 'rewind', label: '倒帶', doc: '倒回去重看、回到剛才、再來一次：畫面變成錄影帶，一條追蹤雜訊帶往下滑過，幾條反相細帶閃過，配錄影帶倒帶的「嘰嚕嚕」', parts: [
    { name: 'tape', kind: 'effect', type: 'common.film', template: 'vhs-tape', params: { tracking: '0.2:0.6:0.9' }, at: 0, len: 1.1 },
    { name: 'tear', kind: 'effect', type: 'common.glitch', template: 'soft-tear', params: { seed: 6 }, at: 0, len: 1.1 },
    { name: 'spool', kind: 'sfx', type: 'common.rewind', params: { dur: 1 }, at: 0, len: 1, gain: -8 },
  ] },
];
