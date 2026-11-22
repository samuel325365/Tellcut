// common.progress segments (spec 2026-11-22, progress characters): a phone app's stories bar — `dots` thin rounded segments with
// gaps between them, where bar would be (its height and place, so it fits above a header too): those done full of `color`, the
// current one filling left to right, the rest `track`. The segments' starts are pencil's `at` (pencilState's parsing, the extra
// time ending the last) when `step` is −1; otherwise `step` is this item's segment and `at` is not read.
import { clamp, cssCamel, h } from '@tellcut/engine';
import { band, pencilState, tail, type Draw } from './shared.ts';

/** each segment's fill 0…1: step −1 → by `at` (pencilState's parsing) or evenly over [0, dur − tail]; step ≥ 0 → segments before
 *  `step` full, `step` filling over [0, dur − tail], `at` ignored */
export function segmentFills(n: number, step: number, at: string, local: number, dur: number): number[] {
  const m = Math.max(1, Math.round(n)), span = Math.max(0, Math.max(0, dur) - tail(dur));
  const over = (from: number, to: number) => (to > from ? clamp((local - from) / (to - from)) : local >= from ? 1 : 0);
  if (step >= 0) {
    const s = Math.min(m - 1, Math.floor(step));
    return Array.from({ length: m }, (_, i) => (i < s ? 1 : i > s ? 0 : over(0, span)));
  }
  // with no `at`, pencilState shares the span it is given evenly: the same even split as the other character modes
  const { starts, doneAt } = pencilState(at, m, local, span), end = Number.isFinite(doneAt) ? doneAt : span;
  return Array.from({ length: m }, (_, i) => (i < starts.length ? over(starts[i], i + 1 < starts.length ? starts[i + 1] : end) : 0));
}

export const drawSegments: Draw = (ctx, p, m) => {
  const { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, th = Math.max(1, p.thickness * k), n = Math.max(1, Math.round(p.dots));
  if (!m.list.length) for (let i = 0; i < n; i++) {
    const seg = h('div', null, null, m.root), fill = h('div', null, null, seg);
    cssCamel(seg, { position: 'absolute', overflow: 'hidden' });
    cssCamel(fill, { position: 'absolute', left: '0', top: '0', height: '100%' });
    m.list.push(seg);
  }
  const { x, w, top } = band(ctx, p, th), gap = th * 0.6, sw = Math.max(0, (w - gap * (n - 1)) / n);
  const fills = segmentFills(n, p.step, p.at, local, dur);
  m.list.forEach((seg, i) => {
    cssCamel(seg, { left: `${x + i * (sw + gap)}px`, top: `${top}px`, width: `${sw}px`, height: `${th}px`, borderRadius: `${th / 2}px`, background: p.track });
    cssCamel(seg.firstElementChild as HTMLElement, { width: `${+(fills[i] * 100).toFixed(3)}%`, background: p.color });
  });
};
