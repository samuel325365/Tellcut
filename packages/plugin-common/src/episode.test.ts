// The looks promoted from the amber-podcast short (group B): common.duo solo, common.progress slots with common.slip's flight into a
// slot, common.outro episode.
import { defaultSafe } from '@tellcut/engine';
import { duo, duoLayout, duoWindow, parseSegs, SOLO_SIDE, soloChip } from './duo.ts';
import { parsePulses, progress, slotFills, slotRects } from './progress.ts';
import { slip, slipFlight } from './slip.ts';
import { episodeLayout, outro, outroWindow } from './outro.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default as any;

test('duo solo: one window between the header and the band, the same for a and b; split stays the default', () => {
  expect(def(duo, 'mode')).toBe('split');
  const L = duoLayout({ mode: 'solo', top: 0.177, band: 0, foot: 0.167 });
  expect(L.a).toEqual([SOLO_SIDE, 0.177, 1 - 2 * SOLO_SIDE, 0.656]);
  expect(L.b).toEqual(L.a);
  expect(L.band).toEqual([0, 0.833, 1, 0]);
  expect(duoWindow('a', { mode: 'solo', top: 0.177, band: 0, foot: 0.167 })).toEqual(L.a);
  // the two-panel layout did not move
  expect(duoLayout().a.map((x) => Math.round(x * 1920))).toEqual([0, 200, 1920, 760]);
});

test('duo solo: each name chip shows on that person\'s first turn only, at most 2.6 s, gone before the turn ends', () => {
  const segs = parseSegs('0.5-2|b\n2-6|a\n7-9|b');
  expect(soloChip(segs, 'b', 0.4)).toBe(0);
  expect(soloChip(segs, 'b', 0.6)).toBeGreaterThan(0);
  expect(soloChip(segs, 'b', 1.2)).toBe(1);
  expect(soloChip(segs, 'b', 1.96)).toBe(0);    // the turn ends at 2: gone 0.05 s before
  expect(soloChip(segs, 'b', 7.5)).toBe(0);     // not again on a later turn
  expect(soloChip(segs, 'a', 3.5)).toBe(1);
  expect(soloChip(segs, 'a', 4.7)).toBe(0);     // 2.6 s after the start of a 4 s turn
  expect(soloChip(parseSegs('3-4|b, 1-2|ab'), 'b', 1.5)).toBe(1);   // the earliest turn counts, wherever it is written
  expect(soloChip(parseSegs('0-1|a'), 'b', 0.5)).toBe(0);
});

test('progress slots: the row spans the side safe margins, sits under the top one, the cards fill in turn', () => {
  expect(def(progress, 'mode')).toBe('bar');
  const safe = defaultSafe(1080, 1920), R = slotRects(3, 1080, 1920, safe);
  expect(R).toHaveLength(3);
  expect(R[0][0]).toBeCloseTo(safe.side * 1080, 6);
  expect(R[2][0] + R[2][2]).toBeCloseTo(1080 * (1 - safe.side), 6);
  expect(R[0][1]).toBeCloseTo(safe.top * 1920, 6);
  expect(R[1][0] - (R[0][0] + R[0][2])).toBeCloseTo(20, 6);
  // y is the row's centre; bottom sits on the bottom safe margin
  const Y = slotRects(3, 1080, 1920, safe, 0.5);
  expect(Y[0][1] + Y[0][3] / 2).toBeCloseTo(960, 6);
  const B = slotRects(2, 1080, 1920, safe, -1, 'bottom');
  expect(B[0][1] + B[0][3]).toBeCloseTo(1920 * (1 - safe.bottom), 6);
  // fill times: given (a missing one stays empty), else spread inside the item
  expect(slotFills('0.3, 1.2', 3, 3)).toEqual([0.3, 1.2, null]);
  const even = slotFills('', 3, 3) as number[];
  expect(even.every((t, i) => t > 0 && t < 3 && (i === 0 || t > even[i - 1]))).toBe(true);
  expect(parsePulses('2.2|0, 3|2\nnonsense, 4|')).toEqual([[2.2, 0], [3, 2]]);
});

test('slip slot: the stub stays put until the last 0.55 s, then lands centre on centre at the slot\'s width and fades', () => {
  expect(def(slip, 'slot')).toBe(-1);
  const card: [number, number, number, number] = [130, 1000, 820, 118], to: [number, number, number, number] = [400, 220, 270, 100];
  const a = slipFlight(2, 3, card, to);
  expect([a.k, a.alpha, Math.abs(a.dx), Math.abs(a.dy), a.scale]).toEqual([0, 1, 0, 0, 1]);
  const end = slipFlight(3, 3, card, to);
  expect(end.k).toBe(1);
  expect(end.alpha).toBe(0);
  expect(card[0] + card[2] / 2 + end.dx).toBeCloseTo(to[0] + to[2] / 2, 6);
  expect(card[1] + card[3] / 2 + end.dy).toBeCloseTo(to[1] + to[3] / 2, 6);
  expect(card[2] * end.scale).toBeCloseTo(to[2], 6);
  expect(slipFlight(2.6, 3, card, to).alpha).toBe(1);   // still solid early in the flight
});

test('outro episode: the stack fits the safe area at any shape, the window is 16:9 and the clip frame matches it', () => {
  expect(def(outro, 'look')).toBe('cta');
  const o = { lines: 2, ep: true, cta: true, credit: true, y: -1 };
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const safe = defaultSafe(W, H), L = episodeLayout(o, W, H, safe), [x, y, w, h] = L.win;
    expect(w / h).toBeCloseTo(16 / 9, 6);
    expect(x + w / 2).toBeCloseTo(W / 2, 6);
    expect(w).toBeLessThanOrEqual(0.9 * W + 1e-6);
    expect(L.top).toBeGreaterThanOrEqual(safe.top * H - 1e-6);
    expect(L.creditY + 53 * L.u).toBeLessThanOrEqual((1 - safe.bottom) * H + 1e-6);
    expect(L.ruleY).toBeLessThan(y);
    expect(L.epY).toBeGreaterThan(y + h);
    expect(L.btnY).toBeGreaterThan(L.epY);
    expect(L.creditY).toBeGreaterThan(L.btnY);
  }
  // 9:16 at full size: the 960×540 window of the original
  expect(episodeLayout(o, 1080, 1920, defaultSafe(1080, 1920)).win.slice(2)).toEqual([960, 540]);
  const win = outroWindow({ look: 'episode', lines: 'The Show\nPodcast', ep: 'Episode 12', cta: 'Watch', credit: 'CC BY' });
  const L = episodeLayout(o, 1080, 1920, defaultSafe(1080, 1920)).win;
  expect(win[0]).toBeCloseTo(L[0] / 1080, 4);
  expect(win[1]).toBeCloseTo(L[1] / 1920, 4);
  // without an episode line, a button or a credit the window moves down to stay centred
  const bare = episodeLayout({ ...o, ep: false, cta: false, credit: false }, 1080, 1920, defaultSafe(1080, 1920));
  expect(bare.win[1]).toBeGreaterThan(L[1]);
});
