import type { ThumbInfo } from '../store.ts';

/** Background tiles from the 1 fps thumbnail atlas for a clip `len` timeline seconds long; `span` (px from the clip's left edge,
 *  geometry.ts drawnSpan): only the tiles that reach into it, at the places they have in the whole row. */
export function thumbTiles(o: { in: number; speed: number; len: number; pps: number; rowH: number; info: ThumbInfo; span?: [number, number] }) {
  const w = (o.rowH * o.info.width) / o.info.height, total = o.len * o.pps, out: Array<{ x: number; w: number; bg: string; size: string }> = [];
  const [a, b] = o.span ?? [0, total], end = Math.min(total, b);
  for (let k = Math.max(0, Math.floor(a / w)), x = k * w; x < end; k++, x = k * w) {
    const t = o.in + (x / o.pps) * o.speed;
    const idx = Math.max(0, Math.min(o.info.count - 1, Math.floor(t / o.info.interval)));
    const col = idx % o.info.cols, row = Math.floor(idx / o.info.cols);
    out.push({ x, w, bg: `-${col * w}px -${row * o.rowH}px`, size: `${o.info.cols * w}px auto` });
  }
  return out;
}
/** One tile of the atlas: the frame shown at source time t, h px tall. */
export function thumbAt(info: ThumbInfo, t: number, h: number) {
  const w = (h * info.width) / info.height, idx = Math.max(0, Math.min(info.count - 1, Math.floor(t / info.interval)));
  return { w, bg: `-${(idx % info.cols) * w}px -${Math.floor(idx / info.cols) * h}px`, size: `${info.cols * w}px auto` };
}
/** One frame of the atlas for a box of any size with the frame's own aspect (the library's cards): the frame shown at source
 *  time t, placed by percentages, so the box can be as wide as its grid column makes it. */
export function thumbPct(info: ThumbInfo, t: number) {
  const idx = Math.max(0, Math.min(info.count - 1, Math.floor(t / info.interval))), rows = Math.ceil(info.count / info.cols);
  const col = idx % info.cols, row = Math.floor(idx / info.cols), pct = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);
  return { bg: `${pct(col, info.cols)}% ${pct(row, rows)}%`, size: `${info.cols * 100}% auto`, aspect: info.width / info.height };
}
