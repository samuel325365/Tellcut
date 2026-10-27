import type { ThumbInfo } from '../store.ts';

/** Background tiles from the 1 fps thumbnail atlas for a clip `len` timeline seconds long. */
export function thumbTiles(o: { in: number; speed: number; len: number; pps: number; rowH: number; info: ThumbInfo }) {
  const w = (o.rowH * o.info.width) / o.info.height, total = o.len * o.pps, out: Array<{ x: number; w: number; bg: string; size: string }> = [];
  for (let x = 0; x < total; x += w) {
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
