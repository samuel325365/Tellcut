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
  // the rainbow band crosses the middle of the frame at the moment; the glint grows from 0.2 s before it to its full size just after
  // (over its first quarter second), on the shing's attack
  { id: 'reveal', label: '揭曉', doc: '揭曉答案、成品亮相、商品登場：一道彩虹光帶從左邊掃過整個畫面，正中間的時候亮點拉出一個大十字光芒，配一聲光掃過的「鏘」', parts: [
    { name: 'sweep', kind: 'effect', type: 'common.leak', template: 'prism-sweep', at: -0.6, len: 1.2 },
    { name: 'glint', kind: 'effect', type: 'common.sparkle', template: 'glint-once', params: { x: 0.66, y: 0.36 }, at: -0.2, len: 0.8 },
    { name: 'shing', kind: 'sfx', type: 'common.shing', at: 0, len: 1.2, gain: -8 },
  ] },
  // the confetti starts falling 0.4 s ahead, so the frame is filling when the golden glow pops at the moment and shrinks back over most
  // of a second; the fanfare's rising notes lead in and its chord (0.38 s into it) lands on the glow. (The backdrop's sunburst is a
  // background, under the clip where a full-frame clip hides it: the glow, low enough for the confetti to read through, stands in)
  { id: 'celebrate', label: '慶祝', doc: '達成目標、過關、得獎、生日：中間一團金色的光一亮，彩色紙片從頂端整片落下，配 8-bit 過關號角', parts: [
    { name: 'confetti', kind: 'effect', type: 'common.sparkle', template: 'confetti-rain', at: -0.4, len: 2.4 },
    { name: 'glow', kind: 'effect', type: 'core.flash', template: 'bloom-pop', params: { color: '#ffd23f', y: 0.45, peak: 0.5, fall: 0.8, power: 2 }, at: 0, len: 0.9 },
    { name: 'fanfare', kind: 'sfx', type: 'common.fanfare', at: -0.38, len: 1.3, gain: -8 },
  ] },
  // a projected home movie over the whole countdown; the leader's disc counts 3, 2, 1, a second each with its hand sweeping a full
  // turn, a tick as each count comes up and the beep as the disc fades out
  { id: 'leader', label: '片頭倒數', doc: '片頭、影片開始、懷舊的開場：放映出來的八釐米老電影，片頭的大圓盤從 3 倒數到 1、指針一秒轉一圈，每一下一聲滴答，最後嗶一聲', parts: [
    { name: 'count', kind: 'effect', type: 'common.countdown', template: 'film-leader', params: { from: 3, to: 1 }, at: 0, len: 3 },
    { name: 'film', kind: 'effect', type: 'common.film', template: 'super8-home', at: 0, len: 3 },
    { name: 'tick1', kind: 'sfx', type: 'common.tick', at: 0, len: 0.04, gain: -6 },
    { name: 'tick2', kind: 'sfx', type: 'common.tick', at: 1, len: 0.04, gain: -6 },
    { name: 'tick3', kind: 'sfx', type: 'common.tick', at: 2, len: 0.04, gain: -6 },
    { name: 'beep', kind: 'sfx', type: 'common.beep', params: { dur: 0.15 }, at: 2.85, len: 0.15, gain: -12 },
  ] },
  // the warm light rises in the corner and fades again over the 2.5 s (brighter and bigger than its template, so it still reads over
  // bright footage) while the grain holds throughout; the chime comes in, quiet, as the light warms
  { id: 'memory', label: '回憶', doc: '回憶、以前、想起那時候：左上角一團暖光慢慢亮起來又退掉，整個畫面蒙上粗粗的底片顆粒，配一串輕輕的叮鈴', parts: [
    { name: 'glow', kind: 'effect', type: 'common.leak', template: 'warm-corner', params: { peak: 1, size: 1.2 }, at: 0, len: 2.5 },
    { name: 'grain', kind: 'effect', type: 'common.film', template: 'heavy-grain', at: 0, len: 2.5 },
    { name: 'chime', kind: 'sfx', type: 'common.chime', at: 0.2, len: 1.4, gain: -16 },
  ] },
  // the small light sweeps across from 0.3 s ahead, at its brightest just after the moment; the white streaks fly from 0.1 s ahead
  // (white reads over footage); the whoosh swells with the sweep, the fast-forward climbs from the moment
  { id: 'rush', label: '趕路', doc: '加速、趕路、快轉、衝刺：整面白色速度線往右飛，一團小而亮的光從左邊一路掃過去，配一聲「咻」和快轉往上爬的聲音，畫面輕輕晃', parts: [
    { name: 'sweep', kind: 'effect', type: 'common.leak', template: 'sweep-fast', at: -0.3, len: 0.8 },
    { name: 'lines', kind: 'effect', type: 'common.speedlines', template: 'rush-right', params: { color: '#ffffff' }, at: -0.1, len: 1 },
    { name: 'whoosh', kind: 'sfx', type: 'common.whoosh', params: { dur: 0.6 }, at: -0.2, len: 0.6, gain: -8 },
    { name: 'ffwd', kind: 'sfx', type: 'common.ffwd', params: { dur: 0.9 }, at: 0, len: 0.9, gain: -12 },
    { name: 'shake', kind: 'shake', at: 0, len: 0.4, px: 10 },
  ] },
  // the door starts down at 0.2 s and lands at 1 s, where the rattle's thump (0.55 s into it) and the clunk fall and the sign pops on;
  // from 1.5 s the frame fades to black. (Black rather than the flash's white fade-in: once the door is down a white light would only
  // hide the sign, and a fade to black is what "that's all for today" ends on)
  { id: 'closing', label: '收工', doc: '收工、打烊、今天就到這裡、片尾：整個畫面的鐵捲門嘩啦啦拉下來，到底「喀」一聲貼上「今日打烊」，再慢慢暗到全黑', parts: [
    { name: 'door', kind: 'effect', type: 'common.rolldoor', template: 'shop-close', at: 0, len: 2.4 },
    { name: 'dark', kind: 'effect', type: 'core.flash', params: { fade: 'out', color: '#000000' }, at: 1.5, len: 0.9, layer: 'top' },
    { name: 'rattle', kind: 'sfx', type: 'common.rattle', at: 0.45, len: 0.65, gain: -8 },
    { name: 'clunk', kind: 'sfx', type: 'common.clunk', at: 1, len: 0.16, gain: -6 },
  ] },
  // the iris closes over 0.6 s to a point in the middle at the moment and opens again over the next 0.6 s, black as an old cartoon's;
  // the stars burst from that point at the moment, above the iris, on the xylophone
  { id: 'irisout', label: '圈出收尾', doc: '老卡通式的收場或換場：畫面縮成一個圓收到正中間一點，一把星星從那一點炸開，再從同一點打開成新畫面，配一聲木琴', parts: [
    { name: 'iris', kind: 'effect', type: 'common.wipe', template: 'iris-close', params: { color: '#141414' }, at: -0.6, len: 1.2, layer: 'top' },
    { name: 'stars', kind: 'effect', type: 'common.sparkle', template: 'star-burst', params: { y: 0.5 }, at: 0, len: 1, layer: 'top' },
    { name: 'xylo', kind: 'sfx', type: 'common.xylo', at: 0, len: 0.16, gain: -6 },
  ] },
];
