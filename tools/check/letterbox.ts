// Black bars of the footage itself showing in the film (found on a hook short: a letterboxed shot zoomed into a panel
// still showed a black band on top). Each sampled frame of the source is trimmed of its black edge rows and columns; the clip's
// frame and crop at that moment give the part of the source on screen; a bar inside that part is on screen too.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { coverPlacement, videoState, type Project, type VideoItem } from '@tellcut/engine';
import { analysisFiles, ffmpeg, timecode1 } from '@tellcut/media-node';
import type { Finding } from './rules.ts';

/** the source's picture (black edges trimmed) at source time t, as fractions of the source: [x0, y0, x1, y1] */
export interface Active { t: number; box: [number, number, number, number] }

/** the size frames are looked at */
export const LB_W = 160, LB_H = 90;
/** a bar is black, not dark: at most 2 % of a row's (column's) pixels above this gray level. Deep water and night skies have
 *  grain, specks and compression noise above it; a letterbox has none. */
const BLACK = 24;
/** The picture inside the black edges of one gray w×h frame; null when the whole frame is black. */
export function edgesOf(g: ArrayLike<number>, w = LB_W, h = LB_H): Active['box'] | null {
  const rowBlack = (y: number) => { let n = 0; for (let x = 0; x < w; x++) if (g[y * w + x] > BLACK) n++; return n <= w * 0.02; };
  const colBlack = (x: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y <= y1; y++) if (g[y * w + x] > BLACK) n++; return n <= (y1 - y0 + 1) * 0.02; };
  let y0 = 0, y1 = h - 1;
  while (y0 <= y1 && rowBlack(y0)) y0++;
  if (y0 > y1) return null;
  while (rowBlack(y1)) y1--;
  let x0 = 0, x1 = w - 1;
  while (x0 < x1 && colBlack(x0, y0, y1)) x0++;
  while (x1 > x0 && colBlack(x1, y0, y1)) x1--;
  return [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h];
}

const EDGE = 0.03, SAME = 0.03;
/**
 * The samples with a bar: some edge trimmed by 3 % or more, most of the picture left (not a dark scene with one lit spot), and the
 * next or previous sample agreeing (a bar stays; a dark shot's ragged edges move).
 */
export function barred(samples: Active[]): Active[] {
  const isBar = ([x0, y0, x1, y1]: Active['box']) => (x1 - x0) * (y1 - y0) >= 0.4 && (y0 >= EDGE || 1 - y1 >= EDGE || x0 >= EDGE || 1 - x1 >= EDGE);
  const same = (a: Active, b: Active) => a.box.every((v, i) => Math.abs(v - b.box[i]) <= SAME);
  return samples.filter((s, i) => isBar(s.box) && ((i > 0 && same(s, samples[i - 1])) || (i + 1 < samples.length && same(s, samples[i + 1]))));
}

/** at least this share of the film's height (or width) of black showing counts */
const SHOWS = 0.01;

/**
 * Warnings where a clip shows its source's bars. `bars` per clip id: the barred samples (source times). The part on screen
 * comes from the clip's frame and crop at the matching film time (Ken Burns included).
 */
export function letterboxFindings(p: Project, times: Map<string, { start: number; end: number }>, bars: Record<string, Active[]>): Finding[] {
  const W = p.meta.width, H = p.meta.height, out: Finding[] = [];
  for (const t of p.tracks) if (t.kind === 'video') for (const clip of t.items as VideoItem[]) {
    const ct = times.get(clip.id), src = p.sources[clip.source], samples = bars[clip.id] ?? [];
    if (!ct || !src || !samples.length) continue;
    const hits: Array<{ ft: number; side: string; amount: number }> = [];
    for (const s of samples) {
      const ft = ct.start + (s.t - clip.in) / clip.speed;
      if (ft < ct.start - 1e-6 || ft > ct.end + 1e-6) continue;
      const v = videoState(clip, ct.start, ct.end, ft, W, H, {});
      const b = coverPlacement(src.width, src.height, v.frame.width, v.frame.height, v.crop);
      // the part of the source inside the frame, as fractions of the source
      const vx0 = Math.max(0, -b.left / b.width), vx1 = Math.min(1, (v.frame.width - b.left) / b.width);
      const vy0 = Math.max(0, -b.top / b.height), vy1 = Math.min(1, (v.frame.height - b.top) / b.height);
      const [x0, y0, x1, y1] = s.box;
      const sides: Array<[string, number]> = [['上方', ((y0 - vy0) * b.height) / H], ['下方', ((vy1 - y1) * b.height) / H],
        ['左邊', ((x0 - vx0) * b.width) / W], ['右邊', ((vx1 - x1) * b.width) / W]];
      const worst = sides.reduce((a, c) => (c[1] > a[1] ? c : a));
      if (worst[1] >= SHOWS) hits.push({ ft, side: worst[0], amount: worst[1] });
    }
    // one warning per stretch of the clip
    let run: typeof hits = [];
    const flush = () => {
      if (!run.length) return;
      const a = run[0].ft, z = run[run.length - 1].ft, most = run.reduce((m, h) => (h.amount > m.amount ? h : m));
      out.push({ level: 'warn', t: [+a.toFixed(2), +z.toFixed(2)], ids: [clip.id],
        msg: `原片自己的黑邊露出來了（${most.side}約 ${Math.round(most.amount * 100)}% 畫面高度，${timecode1(a)}–${timecode1(z)}）：放大或移動 crop 焦點把它裁掉，或換一段沒有黑邊的鏡頭` });
      run = [];
    };
    for (const h of hits) { if (run.length && h.ft - run[run.length - 1].ft > 1.1) flush(); run.push(h); }
    flush();
  }
  return out;
}

/** samples per second of each clip's source range */
const RATE = 2;
/** The barred samples of every video clip, from its source's analysis proxy (clips without one, or photos, are skipped). */
export async function clipBars(dir: string, p: Project): Promise<Record<string, Active[]>> {
  const out: Record<string, Active[]> = {}, size = LB_W * LB_H;
  for (const t of p.tracks) if (t.kind === 'video') for (const clip of t.items as VideoItem[]) {
    const src = p.sources[clip.source];
    if (!src || src.kind === 'image') continue;
    const proxy = analysisFiles(dir, resolve(dir, src.path)).proxy, len = (clip.end - clip.start) * clip.speed;
    if (!existsSync(proxy) || !(len > 0)) continue;
    const { stdout } = await ffmpeg(['-ss', clip.in.toFixed(3), '-t', len.toFixed(3), '-i', proxy, '-an', '-vf', `fps=${RATE},scale=${LB_W}:${LB_H},format=gray`, '-f', 'rawvideo', '-'], { stdout: true });
    const samples: Active[] = [];
    for (let k = 0; (k + 1) * size <= stdout.length; k++) {
      const box = edgesOf(stdout.subarray(k * size, (k + 1) * size));
      if (box) samples.push({ t: +(clip.in + k / RATE).toFixed(3), box });
    }
    const bars = barred(samples);
    if (bars.length) out[clip.id] = bars;
  }
  return out;
}
