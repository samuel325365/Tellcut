import type { Crop, TransitionType, VideoItem } from './schema.ts';
import { clamp, eIO3, eOut3, lerp, prog } from './util.ts';

export interface Box { left: number; top: number; width: number; height: number }

/**
 * Cover-fit the source into the frame, put source point (x,y) at the frame centre (clamped so the
 * frame stays covered), then zoom around where that point landed. Matches both original projects:
 * Wedding scaled around transform-origin (fx,fy); Kyoto centred fx and zoomed around it.
 */
export function coverPlacement(srcW: number, srcH: number, frameW: number, frameH: number, crop: Crop): Box {
  const base = Math.max(frameW / srcW, frameH / srcH);
  const bw = srcW * base, bh = srcH * base;
  const bl = clamp(frameW / 2 - crop.x * bw, frameW - bw, 0);
  const bt = clamp(frameH / 2 - crop.y * bh, frameH - bh, 0);
  const ax = bl + crop.x * bw, ay = bt + crop.y * bh;           // focus point on the frame
  const width = bw * crop.zoom, height = bh * crop.zoom;
  return { left: ax - crop.x * width, top: ay - crop.y * height, width, height };
}

export const lerpCrop = (a: Crop, b: Crop, p: number): Crop => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), zoom: lerp(a.zoom, b.zoom, p) });

export const EASE_FNS = { linear: (p: number) => p, in: (p: number) => p * p * p, out: eOut3, inOut: eIO3 } as const;

/** The crop at clip-local time `local` of a clip `len` long: from (0) → keys inside (0, len) → to (len), each segment eased.
 *  Keys a trim left outside the clip do nothing but stay in the data (lengthening the clip brings them back). */
export function cropAt(c: VideoItem['crop'], local: number, len: number): Crop {
  const keys = (c.keys ?? []).filter((k) => k.t > 0 && k.t < len).sort((a, b) => a.t - b.t);
  const pts = [{ t: 0, ...c.from }, ...keys, { t: len, ...c.to }];
  let i = 0;
  while (i < pts.length - 2 && local >= pts[i + 1].t) i++;
  const a = pts[i], b = pts[i + 1];
  const p = b.t > a.t ? EASE_FNS[c.ease ?? 'linear'](clamp((local - a.t) / (b.t - a.t))) : 1;
  return lerpCrop(a, b, p);
}

/** Smooth value noise in [-1, 1] on two channels; the same key and phase always give the same pair. */
const fnv1a = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rnd = (seed: number, i: number) => {
  let x = Math.imul(seed ^ Math.imul(i, 0x9e3779b1), 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
};
export function shakeNoise(key: string, u: number): [number, number] {
  const s = fnv1a(key), i = Math.floor(u), f = u - i, w = f * f * (3 - 2 * f);
  const ch = (c: number) => rnd(s + c, i) * (1 - w) + rnd(s + c, i + 1) * w;
  return [ch(0), ch(7919)];
}

/** The Ken Burns zoom around the focus (ax, ay), then the shake: grown by k around the frame centre (cx, cy) and moved
 *  by (sx, sy). A picture point p lands at m·p + (tx, ty). Growing around the centre (not the focus) is what keeps
 *  every edge covered: each side gains (k − 1)·half the frame ≥ the shake amplitude. */
export function kbMatrix(ax: number, ay: number, zoom: number, cx: number, cy: number, k: number, sx: number, sy: number) {
  return { m: k * zoom, tx: k * ax * (1 - zoom) + cx * (1 - k) + sx, ty: k * ay * (1 - zoom) + cy * (1 - k) + sy };
}

/** offsetX/Y move the whole frame (a slide or push); shakeX/Y move the picture inside the frame (shakeScale grows it so no edge
 *  shows); radius rounds the frame's corners; clipPath is the CSS clip-path of the item's shape, or of a wipe while one runs
 *  (never both: a shaped clip's wipe is drawn as a dissolve), '' for the whole frame. */
export interface VideoState { frame: Box; offsetX: number; offsetY: number; opacity: number; filter: string; crop: Crop; mediaLocal: number; held: boolean; shakeX: number; shakeY: number; shakeScale: number; radius: number; clipPath: string }

/** a shape (corners in frame fractions) as a CSS clip-path */
export function shapeClipPath(shape: ReadonlyArray<readonly [number, number]> | undefined): string {
  if (!shape || shape.length < 3) return '';
  const pc = (v: number) => `${Math.round(v * 1e5) / 1e3}%`;
  return `polygon(${shape.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(', ')})`;
}

type Rect = readonly [number, number, number, number];
type Dir = 'l' | 'r' | 'u' | 'd';
/** The incoming clip B's linked transition as the outgoing clip A sees it: B's type and options, `at` the A-local second it starts
 *  (B's start − A's start), `dur` its length (equal to the overlap: only a linked transition moves A), B's frame and whether B is
 *  cut to a shape (both decide whether B's transition is drawn as itself, see drawnTransition). */
export interface OutTransition { type: TransitionType; dir?: Dir; x?: number; y?: number; at: number; dur: number; frame: Rect; shaped: boolean }
/** videoState's optional last argument, made by the stage from the overlaps (pairs.ts videoLinks): `from` on B, the frame of the
 *  clip A its transition is linked to; `out` on A, B's transition. Without it a clip draws as if in no linked pair. */
export interface VideoLink { from?: Rect; out?: OutTransition }

const isFull = (f: Rect) => Math.abs(f[0]) < 1e-6 && Math.abs(f[1]) < 1e-6 && Math.abs(f[2] - 1) < 1e-6 && Math.abs(f[3] - 1) < 1e-6;
/** The transitions drawn so far. THE one fallback place: any other type is drawn as a dissolve until it is added here. */
const DRAWN: ReadonlySet<TransitionType> = new Set<TransitionType>(['cut', 'dissolve', 'slide', 'wipe', 'push']);

/** The transition actually drawn for an incoming clip of frame `frame` (cut to a shape: `shaped`) coming from a clip of frame
 *  `from` (absent: not linked): a type not drawn yet is a dissolve; so is a wipe on a shaped clip (both are the frame's
 *  clip-path) and a push unless both frames are the whole picture (a push is two pictures moving edge to edge). */
export function drawnTransition(type: TransitionType, frame: Rect, shaped: boolean, from?: Rect): TransitionType {
  if (!DRAWN.has(type)) return 'dissolve';
  if (type === 'wipe' && shaped) return 'dissolve';
  if (type === 'push' && (!isFull(frame) || (from && !isFull(from)))) return 'dissolve';
  return type;
}

// Directions keep slide's meaning: `dir` is the side the incoming picture comes from. 'l': B enters from the left, a wipe's
// edge moving left to right, a push moving both pictures rightwards; 'r' the mirror; 'u' from the top, moving down; 'd' from
// the bottom, moving up.

/** A wipe's clip-path on B at eased progress e: the part of B on its `dir` side, (e × 100)% of it ('' once whole). */
export function wipeClip(dir: Dir, e: number): string {
  if (e >= 1) return '';
  const r = `${+((1 - e) * 100).toFixed(3)}%`;   // inset(top right bottom left)
  return dir === 'r' ? `inset(0 0 0 ${r})` : dir === 'u' ? `inset(0 0 ${r} 0)` : dir === 'd' ? `inset(${r} 0 0 0)` : `inset(0 ${r} 0 0)`;
}

/** A push's offsets at eased progress e in a w × h picture: B's, and A's exactly one picture further on, in whole pixels so the
 *  two edges meet on a pixel boundary (no seam of background between them, no overlap). */
export function pushOffsets(dir: Dir, e: number, w: number, h: number): { b: [number, number]; a: [number, number] } {
  const x = Math.round((1 - e) * w), y = Math.round((1 - e) * h);
  // + 0: no -0 (a 'none' transform either way, but tests compare with Object.is)
  if (dir === 'r') return { b: [x, 0], a: [x - w + 0, 0] };
  if (dir === 'u') return { b: [0, -y + 0], a: [0, h - y] };
  if (dir === 'd') return { b: [0, y], a: [0, y - h + 0] };
  return { b: [-x + 0, 0], a: [w - x, 0] };
}

export function videoState(item: VideoItem, start: number, end: number, t: number, W: number, H: number, grades: Record<string, string>, link?: VideoLink): VideoState {
  const local = t - start;
  const [fx, fy, fw, fh] = item.frame;
  const frame: Box = { left: fx * W, top: fy * H, width: fw * W, height: fh * H };
  let opacity = item.opacity ?? 1, offsetX = 0, offsetY = 0, wipe: string | null = null;
  const tr = item.transitionIn;
  if (tr && tr.type !== 'cut' && tr.dur > 0) {
    const kind = drawnTransition(tr.type, item.frame, !!item.shape && item.shape.length >= 3, link?.from), p = prog(local, 0, tr.dur);
    const d = tr.dir ?? 'l';
    if (kind === 'dissolve') opacity *= eIO3(p);
    else if (kind === 'slide') {
      const a = eOut3(p);
      if (d === 'l') offsetX = -(1 - a) * frame.width;
      if (d === 'r') offsetX = (1 - a) * frame.width;
      if (d === 'u') offsetY = -(1 - a) * frame.height;
      if (d === 'd') offsetY = (1 - a) * frame.height;
      opacity *= a;
    } else if (kind === 'wipe') wipe = wipeClip(d, eIO3(p));
    else if (kind === 'push') [offsetX, offsetY] = pushOffsets(d, eIO3(p), frame.width, frame.height).b;
  }
  // the outgoing side: only while the next clip's linked transition runs, and only for the types that move A
  const o = link?.out;
  if (o && o.dur > 0 && local >= o.at && local < o.at + o.dur && drawnTransition(o.type, o.frame, o.shaped, item.frame) === 'push') {
    const [ax, ay] = pushOffsets(o.dir ?? 'l', eIO3(prog(local, o.at, o.at + o.dur)), frame.width, frame.height).a;
    offsetX += ax; offsetY += ay;
  }
  let filter = item.grade ? grades[item.grade] ?? 'none' : 'none';
  if (item.defocus && local >= item.defocus.from) {
    const d = item.defocus, p0 = d.px0 ?? 0;
    const b = p0 + (d.px - p0) * eIO3(prog(local, d.from, d.to));
    if (b > 0) filter = `${filter === 'none' ? '' : `${filter} `}blur(${b.toFixed(2)}px)`;
  }
  let shakeX = 0, shakeY = 0, amp = 0;
  (item.shake ?? []).forEach((s, k) => {
    if (local < s.at || local >= s.at + s.dur) return;
    const a = s.px * (1 - (local - s.at) / s.dur) ** 2;
    const [nx, ny] = shakeNoise(`${item.id}#${k}`, (local - s.at) * (s.hz ?? 18));
    shakeX += a * nx; shakeY += a * ny; amp += a;
  });
  // the picture grows just enough that a shaken edge never shows the frame background
  const shakeScale = amp > 0 ? 1 + (2 * amp) / Math.min(frame.width, frame.height) : 1;
  const crop = cropAt(item.crop, local, end - start);
  const mediaLocal = item.freezeAt != null ? Math.min(local, item.freezeAt) : local;
  const held = item.freezeAt != null && local >= item.freezeAt;
  return { frame, offsetX, offsetY, opacity, filter, crop, mediaLocal, held, shakeX, shakeY, shakeScale, radius: item.radius ?? 0, clipPath: wipe ?? shapeClipPath(item.shape) };
}

/** The part of the source a frame shows, in 0..1 source coordinates (the inverse view of coverPlacement). */
export function visibleRegion(srcW: number, srcH: number, frameW: number, frameH: number, crop: Crop) {
  const b = coverPlacement(srcW, srcH, frameW, frameH, crop);
  return { x0: -b.left / b.width, y0: -b.top / b.height, w: frameW / b.width, h: frameH / b.height };
}

/** The crop whose view is the source pixel window [x, y, w, h] (same aspect as the frame): the zoom from the width,
 *  then each focus axis bisected through visibleRegion, which grows monotonically with it (clamping included). */
export function cropForWindow(srcW: number, srcH: number, frameW: number, frameH: number, win: [number, number, number, number]): Crop {
  const z1 = visibleRegion(srcW, srcH, frameW, frameH, { x: 0.5, y: 0.5, zoom: 1 });
  const zoom = clamp((z1.w * srcW) / win[2], 1, 8);
  const solve = (axis: 'x' | 'y', target: number) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2, r = visibleRegion(srcW, srcH, frameW, frameH, { x: axis === 'x' ? m : 0.5, y: axis === 'y' ? m : 0.5, zoom });
      if ((axis === 'x' ? r.x0 : r.y0) < target) lo = m; else hi = m;
    }
    return Math.round(hi * 1e6) / 1e6;
  };
  return { x: solve('x', win[0] / srcW), y: solve('y', win[1] / srcH), zoom: Math.round(zoom * 1e6) / 1e6 };
}

/** The crop whose visible region is the current one moved by (dx, dy) source fractions (the viewfinder follows the
 *  cursor), stopping at the source edge. The region start grows monotonically with the focus, so each axis is bisected. */
export function moveViewfinder(srcW: number, srcH: number, frameW: number, frameH: number, c: Crop, dx: number, dy: number): Crop {
  const r = visibleRegion(srcW, srcH, frameW, frameH, c);
  const solve = (axis: 'x' | 'y', target: number) => {
    const at = (v: number) => { const q = visibleRegion(srcW, srcH, frameW, frameH, { ...c, [axis]: v }); return axis === 'x' ? q.x0 : q.y0; };
    const want = clamp(target, at(0), at(1));
    if (Math.abs(at(c[axis]) - want) < 1e-9) return c[axis];   // nothing to move (e.g. zoom 1 on a same-aspect source)
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (at(m) < want) lo = m; else hi = m; }
    return Math.round(hi * 1e6) / 1e6;
  };
  return { x: solve('x', r.x0 + dx), y: solve('y', r.y0 + dy), zoom: c.zoom };
}
