import type { Crop, TransitionType, VideoItem } from './schema.ts';
import { clamp, eIO3, eOut3, eSmooth, lerp, prog } from './util.ts';
import { isNamedShape, isShaped, shapePath, type TextShape } from './shapes.ts';

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
 *  shows); radius rounds the frame's corners (0 under a named shape); clipPath is the CSS clip-path of the item's shape (shapeClip), or of a reveal (wipe, iris, clock,
 *  bars) while one runs (never both: a shaped clip's reveal is drawn as a dissolve), '' for the whole frame. The last three are a
 *  transition's: `scale` grows the whole frame round its centre (zoom; 1 = none); `streak` blurs the frame's picture by this
 *  deviation (px) along x and along y, drawn by the stage's own SVG filter, which leaves no fringe at the frame's edges ([0, 0] =
 *  none; whip blurs along its travel only, blur and zoom evenly); `veil` covers the picture inside the frame with a colour (dip,
 *  flash; null = none). With no transition running they are 1, [0, 0] and null, and `filter` is the grade and defocus alone.
 *  The picture window's dressing: `text` the text shape the stage cuts the frame to itself (fitted inside `inset` px all round);
 *  `outline` the line round the outline, its width in stage px and the path it is stroked on ('' for the frame's own rectangle
 *  with its radius, or the text shape's letters), the clip inset by half its width so the line stays inside the frame (by all of
 *  it for the text shape, whose line is drawn outside the letters);
 *  `shadow` in stage px (null = none). */
export interface VideoState { frame: Box; offsetX: number; offsetY: number; opacity: number; filter: string; crop: Crop; mediaLocal: number; held: boolean; shakeX: number; shakeY: number; shakeScale: number; radius: number; clipPath: string;
  scale: number; streak: [number, number]; veil: Veil | null; text: TextShape | null; inset: number; outline: Outline | null; shadow: Shadow | null }
export interface Outline { width: number; color: string; path: string }
export interface Shadow { blur: number; y: number; opacity: number }
/** an outline's and a shadow's defaults, in px at a 1080 short side */
export const OUTLINE_DEFAULT = { width: 8, color: '#ffffff' }, SHADOW_DEFAULT: Shadow = { blur: 30, y: 12, opacity: 0.45 };
export interface Veil { color: string; opacity: number }

/** a polygon shape (corners in frame fractions) as a CSS clip-path */
export function shapeClipPath(shape: ReadonlyArray<readonly [number, number]> | undefined): string {
  if (!shape || !Array.isArray(shape) || shape.length < 3) return '';
  const pc = (v: number) => `${Math.round(v * 1e5) / 1e3}%`;
  return `polygon(${shape.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(', ')})`;
}

/** A clip's shape as the CSS clip-path of its w × h frame at its local second: a polygon as polygon() (as it always was), a named
 *  shape as path() in px (shapes.ts shapePath; the stage writes it only when it changes, so a still shape is set once per frame
 *  size), '' for none and for the text shape, which the stage cuts with an SVG clipPath of its own. `inset`: px kept free all round
 *  for an outline (half its width), a polygon then given as path() too. */
export function shapeClip(item: Pick<VideoItem, 'shape'>, w: number, h: number, local: number, inset = 0): string {
  const s = item.shape;
  if (!inset && !isNamedShape(s)) return shapeClipPath(s);
  return (s && shapePathOnce(s, w, h, local, inset, 'clip')) || '';
}

/** shapePath, worked out once per shape, frame size and inset (and second, for a wobbling blob) rather than every frame; as a
 *  path() clip-path when `as` is 'clip' */
function shapePathOnce(s: NonNullable<VideoItem['shape']>, w: number, h: number, local: number, inset: number, as: 'clip' | 'path'): string {
  const key = `${as}|${JSON.stringify(s)}|${w}|${h}|${inset}${isNamedShape(s) && s.type === 'blob' && s.wobble ? `|${local}` : ''}`;
  let c = CLIPS.get(key);
  if (c === undefined) {
    const d = shapePath(s, w, h, local, inset);
    c = d && as === 'clip' ? `path('${d}')` : d;
    if (CLIPS.size >= 256) CLIPS.clear();
    CLIPS.set(key, c);
  }
  return c;
}
const CLIPS = new Map<string, string>();

type Rect = readonly [number, number, number, number];
type Dir = 'l' | 'r' | 'u' | 'd';
/** The incoming clip B's linked transition as the outgoing clip A sees it: B's type and options, `at` the A-local second it starts
 *  (B's start − A's start), `dur` its length (equal to the overlap: only a linked transition moves A), B's frame and whether B is
 *  cut to a shape (both decide whether B's transition is drawn as itself, see drawnTransition). */
export interface OutTransition { type: TransitionType; dir?: Dir; x?: number; y?: number; at: number; dur: number; frame: Rect; shaped: boolean }
/** videoState's optional last argument, made by the stage from the overlaps (pairs.ts videoLinks): `from` on B, the frame of the
 *  clip A its transition is linked to; `out` on A, B's transition; `lift` on B when B is stacked under A (A later in the track's
 *  array): A's id, for the stage to draw B just above A while the transition runs (videoState does not read it). Without it a
 *  clip draws as if in no linked pair. */
export interface VideoLink { from?: Rect; out?: OutTransition; lift?: string }

const isFull = (f: Rect) => Math.abs(f[0]) < 1e-6 && Math.abs(f[1]) < 1e-6 && Math.abs(f[2] - 1) < 1e-6 && Math.abs(f[3] - 1) < 1e-6;
/** The transitions drawn. THE one fallback place: a type added to the schema is drawn as a dissolve until it is added here. */
const DRAWN: ReadonlySet<TransitionType> = new Set<TransitionType>(['cut', 'dissolve', 'slide', 'wipe', 'iris', 'clock', 'bars', 'push', 'zoom', 'whip', 'blur', 'dip', 'flash']);
/** the reveals: B uncovered through a clip-path, which a clip cut to a shape already has */
const REVEALS: ReadonlySet<TransitionType> = new Set<TransitionType>(['wipe', 'iris', 'clock', 'bars']);
/** the ones that move or grow whole pictures: both frames must be the whole picture */
const WHOLE: ReadonlySet<TransitionType> = new Set<TransitionType>(['push', 'zoom', 'whip']);

/** The transition actually drawn for an incoming clip of frame `frame` (cut to a shape: `shaped`) coming from a clip of frame
 *  `from` (absent: not linked): a type not drawn yet is a dissolve; so is a reveal on a shaped clip (both are the frame's
 *  clip-path) and a push, zoom or whip unless both frames are the whole picture (two pictures moving edge to edge, or one
 *  grown through the other). blur, dip and flash work on any frame and shape. */
export function drawnTransition(type: TransitionType, frame: Rect, shaped: boolean, from?: Rect): TransitionType {
  if (!DRAWN.has(type)) return 'dissolve';
  if (REVEALS.has(type) && shaped) return 'dissolve';
  if (WHOLE.has(type) && (!isFull(frame) || (from && !isFull(from)))) return 'dissolve';
  return type;
}

/** Why drawnTransition draws `type` as a dissolve, for the editor's note and check's: 'shape' a reveal on a clip cut to a
 *  shape, 'frame' a push, zoom or whip on a clip whose frame is not the whole picture, 'from' the same when it is the frame of
 *  the clip it comes from that is not; null when the type is drawn as itself (a dissolve or a cut always is). */
export type TransitionFallback = 'shape' | 'frame' | 'from';
export function transitionFallback(type: TransitionType, frame: Rect, shaped: boolean, from?: Rect): TransitionFallback | null {
  if (drawnTransition(type, frame, shaped, from) === type) return null;
  if (REVEALS.has(type) && shaped) return 'shape';
  if (WHOLE.has(type)) return isFull(frame) ? 'from' : 'frame';
  return 'frame';   // a type not drawn yet (none today): no better reason to give
}

// Directions keep slide's meaning: `dir` is the side the incoming picture comes from. 'l': B enters from the left, a wipe's
// edge moving left to right, a push moving both pictures rightwards; 'r' the mirror; 'u' from the top, moving down; 'd' from
// the bottom, moving up.

const n3 = (v: number) => +v.toFixed(3);
/** quintic in-out: whip's motion, slower at both ends and faster in the middle than push's cubic */
const eIO5 = (p: number) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2);
/** eIO5's speed over its top speed: 0 at both ends, 1 in the middle (whip's blur follows it) */
const speed5 = (p: number) => 16 * Math.min(p, 1 - p) ** 4;
/** 0 at both ends, 1 in the middle (zoom's blur) */
const bump = (p: number) => (4 * p * (1 - p)) ** 2;

/** A wipe's clip-path on B at eased progress e: the part of B on its `dir` side, (e × 100)% of it ('' once whole). */
export function wipeClip(dir: Dir, e: number): string {
  if (e >= 1) return '';
  const r = `${+((1 - e) * 100).toFixed(3)}%`;   // inset(top right bottom left)
  return dir === 'r' ? `inset(0 0 0 ${r})` : dir === 'u' ? `inset(0 0 ${r} 0)` : dir === 'd' ? `inset(${r} 0 0 0)` : `inset(0 ${r} 0 0)`;
}

/** An iris's clip-path on a w × h frame at eased progress e: a circle round (x, y) (frame fractions) whose radius reaches the
 *  farthest corner at e = 1 ('' then). In px: a percentage radius of circle() is of the box's diagonal over √2, not of the
 *  distance to a corner. */
export function irisClip(e: number, w: number, h: number, x = 0.5, y = 0.5): string {
  if (e >= 1) return '';
  const cx = x * w, cy = y * h, R = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
  return `circle(${n3(e * R)}px at ${n3(x * 100)}% ${n3(y * 100)}%)`;
}

/** A clock wipe's clip-path on a w × h frame at eased progress e: the sector a hand round the frame centre has swept, clockwise
 *  from 12 o'clock, e × 360° of it, as a polygon from the centre along the frame's edge (each corner passed is a point). The hand
 *  turns at an even angle on the real frame (worked out in px), not on the frame squeezed into a square. '' once whole. */
export function clockClip(e: number, w: number, h: number): string {
  if (e >= 1) return '';
  const cx = w / 2, cy = h / 2, a = 2 * Math.PI * Math.max(0, e), c = Math.atan2(cx, cy);
  const pt = (x: number, y: number) => `${n3((x / w) * 100)}% ${n3((y / h) * 100)}%`;
  // the corners clockwise from 12 o'clock, each with its angle from 12 o'clock as seen from the centre
  const corners: Array<[number, number, number]> = [[w, 0, c], [w, h, Math.PI - c], [0, h, Math.PI + c], [0, 0, 2 * Math.PI - c]];
  // where the hand meets the frame's edge
  const dx = Math.sin(a), dy = -Math.cos(a), k = Math.min(Math.abs(dx) > 1e-12 ? cx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-12 ? cy / Math.abs(dy) : Infinity);
  const pts = [pt(cx, cy), pt(cx, 0), ...corners.filter((q) => q[2] < a).map(([x, y]) => pt(x, y)), pt(cx + k * dx, cy + k * dy)];
  return `polygon(${pts.join(', ')})`;
}

/** how many strips bars cuts the frame into, and when each runs, in the transition's progress: strip i (counted from the `dir`
 *  side) from i × BAR_GAP for BAR_LEN, so four or five strips are on the move at once, each at its own height, and the last ends
 *  at 1 */
export const BARS = 6, BAR_LEN = 0.6, BAR_GAP = (1 - BAR_LEN) / (BARS - 1);

/** Bars' clip-path on a w × h frame at progress p (linear: each strip eases on its own, with a smoothstep, gentler than
 *  the cubic, so their heights spread over the whole frame): the frame in BARS equal strips across the
 *  direction of travel (dir l / r: vertical strips, the first at that side; u / d: horizontal ones), each wiping to B along its
 *  length one after another, the 1st, 3rd and 5th from the top (or the left) and the others from the bottom (or the right). One
 *  path() of separate rectangles (px; drawn the same way round and not overlapping, so the nonzero rule fills each once and no
 *  bridge between them shows); adjacent strips share their edge exactly, so no seam. '' once whole, an empty inset before any
 *  strip has begun. */
export function barsClip(dir: Dir, p: number, w: number, h: number): string {
  if (p >= 1) return '';
  const across = dir === 'l' || dir === 'r', rects: string[] = [];
  for (let k = 0; k < BARS; k++) {
    const i = dir === 'l' || dir === 'u' ? k : BARS - 1 - k, q = eSmooth((p - i * BAR_GAP) / BAR_LEN);
    if (q <= 0) continue;
    const odd = i % 2 === 1;
    // along the strip: [s0, s1] of its length L; across it: the k-th sixth of the frame's other side S
    const L = across ? h : w, S = across ? w : h, s0 = odd ? L * (1 - q) : 0, s1 = odd ? L : L * q, a0 = (k * S) / BARS, a1 = ((k + 1) * S) / BARS;
    const [x0, x1, y0, y1] = across ? [a0, a1, s0, s1] : [s0, s1, a0, a1];
    rects.push(`M${n3(x0)} ${n3(y0)}H${n3(x1)}V${n3(y1)}H${n3(x0)}Z`);
  }
  return rects.length ? `path('${rects.join('')}')` : 'inset(50%)';
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

/** zoom: A grows to 1 + ZOOM_OUT (accelerating: 1 + ZOOM_OUT × p^ZOOM_POW, about 1.6 by the middle), B settles from 1 + ZOOM_IN
 *  (decelerating: (1 − p)²) and fades in over ZOOM_FADE of the progress (eased in-out), both with an even blur of up to ZOOM_BLUR of the
 *  short side in the middle, where they move fastest */
export const ZOOM_OUT = 1.4, ZOOM_POW = 1.2, ZOOM_IN = 0.8, ZOOM_FADE: readonly [number, number] = [0.35, 0.65], ZOOM_BLUR = 0.01;
/** whip: the blur along the travel at its fastest (the middle), of the frame's length along it */
export const WHIP_BLUR = 0.06;
/** blur: the deviation at its blurriest (the middle), of the frame's short side */
export const BLUR_MAX = 0.03;
/** flash: a spike, not a plateau. Its strength s runs straight (no easing) from 0 at the start to 1 at the middle and back to 0
 *  at the end; the white veil is s^FLASH_VEIL and the picture's brightness 1 + FLASH_BRIGHT × s^FLASH_BURN, so both come on only
 *  near the middle. An eased ramp and a brightness up to 3× (its first version) burned bright footage to white for two thirds of
 *  the flash (0.4 s of a 0.6 s one); now a bright picture is white for about 3 frames of a 0.6 s flash at 30 fps, while a dark
 *  one still peaks white with a bright frame either side (transitions.test.ts measures both). */
export const FLASH_BRIGHT = 0.35, FLASH_VEIL = 4, FLASH_BURN = 8;
const VEIL = { dip: '#000', flash: '#fff' } as const;

/** What a transition does to one picture at its progress: multiplied into the opacity and scale, added to the offsets, the larger
 *  streak and the stronger veil kept, the brightness multiplied, the clip-path set (B's reveals only). */
interface Look { opacity: number; dx: number; dy: number; scale: number; streak: [number, number]; veil: Veil | null; bright: number; clip: string | null }
const none = (): Look => ({ opacity: 1, dx: 0, dy: 0, scale: 1, streak: [0, 0], veil: null, bright: 1, clip: null });
/** dip's black veil goes as its eased progress u, flash's white one as its straight strength s to the FLASH_VEIL */
const veilOf = (kind: 'dip' | 'flash', u: number): Veil | null => (u > 0 ? { color: VEIL[kind], opacity: +(kind === 'flash' ? u ** FLASH_VEIL : u).toFixed(4) } : null);
const burn = (s: number) => 1 + FLASH_BRIGHT * s ** FLASH_BURN;
const streakAlong = (d: Dir, s: number, w: number, h: number): [number, number] => (d === 'l' || d === 'r' ? [n3(s * w), 0] : [0, n3(s * h)]);

/** the incoming clip B at progress p of its own transition (drawn as `kind`) in a w × h frame; `linked`: A is under it doing its half */
function incoming(kind: TransitionType, p: number, tr: { dir?: Dir; x?: number; y?: number }, w: number, h: number, linked: boolean): Look {
  const L = none(), d = tr.dir ?? 'l', S = Math.min(w, h);
  if (kind === 'dissolve') L.opacity = eIO3(p);
  else if (kind === 'slide') {
    const a = eOut3(p);
    if (d === 'l') L.dx = -(1 - a) * w + 0;   // + 0: no -0 once in, so a finished slide equals no transition exactly
    if (d === 'r') L.dx = (1 - a) * w;
    if (d === 'u') L.dy = -(1 - a) * h + 0;
    if (d === 'd') L.dy = (1 - a) * h;
    L.opacity = a;
  } else if (kind === 'wipe') L.clip = wipeClip(d, eIO3(p));
  else if (kind === 'iris') L.clip = irisClip(eIO3(p), w, h, tr.x, tr.y);
  else if (kind === 'clock') L.clip = clockClip(eIO3(p), w, h);
  else if (kind === 'bars') L.clip = barsClip(d, p, w, h);
  else if (kind === 'push') [L.dx, L.dy] = pushOffsets(d, eIO3(p), w, h).b;
  else if (kind === 'whip') { [L.dx, L.dy] = pushOffsets(d, eIO5(p), w, h).b; L.streak = streakAlong(d, WHIP_BLUR * speed5(p), w, h); }
  else if (kind === 'zoom') {
    L.scale = 1 + ZOOM_IN * (1 - p) ** 2;
    L.opacity = eIO3(prog(p, ZOOM_FADE[0], ZOOM_FADE[1]));
    const b = n3(ZOOM_BLUR * S * bump(p)); L.streak = [b, b];
  } else if (kind === 'blur') {
    // fades in as a dissolve does, fully blurred until the middle, sharp at the end
    L.opacity = eIO3(p);
    const b = n3(BLUR_MAX * S * (1 - eIO3(clamp(2 * p - 1)))); L.streak = [b, b];
  } else if (kind === 'dip' || kind === 'flash') {
    // the first half is A's (going to black or white) and B, under a full veil, is not seen till the middle; unlinked (nothing of
    // its own under it) B itself comes in as the veil's colour over that half
    if (p < 0.5) { L.opacity = linked ? 0 : eIO3(2 * p); L.veil = veilOf(kind, 1); if (kind === 'flash') L.bright = burn(1); }
    else if (kind === 'flash') { const s = 1 - clamp(2 * p - 1); L.veil = veilOf(kind, s); L.bright = burn(s); }
    else L.veil = veilOf(kind, 1 - eIO3(2 * p - 1));
  }
  return L;
}

/** the outgoing clip A at progress p of the next clip's linked transition (drawn as `kind`); the types not named leave A still */
function outgoing(kind: TransitionType, p: number, d: Dir, w: number, h: number): Look {
  const L = none(), S = Math.min(w, h);
  if (kind === 'push') [L.dx, L.dy] = pushOffsets(d, eIO3(p), w, h).a;
  else if (kind === 'whip') { [L.dx, L.dy] = pushOffsets(d, eIO5(p), w, h).a; L.streak = streakAlong(d, WHIP_BLUR * speed5(p), w, h); }
  else if (kind === 'zoom') {
    // accelerating into the cut; it stays opaque (B comes in over it: A fading too would only let the background through)
    L.scale = 1 + ZOOM_OUT * p ** ZOOM_POW;
    const b = n3(ZOOM_BLUR * S * bump(p)); L.streak = [b, b];
  } else if (kind === 'blur') { const b = n3(BLUR_MAX * S * eIO3(clamp(2 * p))); L.streak = [b, b]; }
  else if (kind === 'flash') { const s = clamp(2 * p); L.veil = veilOf(kind, s); L.bright = burn(s); }
  else if (kind === 'dip') L.veil = veilOf(kind, eIO3(clamp(2 * p)));
  return L;
}

/** a clip that is B of one transition and A of the next while both run (a clip shorter than the two) */
const merge = (a: Look, b: Look): Look => ({
  opacity: a.opacity * b.opacity, dx: a.dx + b.dx, dy: a.dy + b.dy, scale: a.scale * b.scale,
  streak: [Math.max(a.streak[0], b.streak[0]), Math.max(a.streak[1], b.streak[1])],
  veil: !a.veil ? b.veil : !b.veil ? a.veil : a.veil.opacity >= b.veil.opacity ? a.veil : b.veil,
  bright: a.bright * b.bright, clip: a.clip ?? b.clip,
});

export function videoState(item: VideoItem, start: number, end: number, t: number, W: number, H: number, grades: Record<string, string>, link?: VideoLink): VideoState {
  const local = t - start;
  const [fx, fy, fw, fh] = item.frame;
  const frame: Box = { left: fx * W, top: fy * H, width: fw * W, height: fh * H };
  let look = none();
  const tr = item.transitionIn;
  if (tr && tr.type !== 'cut' && tr.dur > 0) {
    const kind = drawnTransition(tr.type, item.frame, isShaped(item), link?.from);
    look = incoming(kind, prog(local, 0, tr.dur), tr, frame.width, frame.height, !!link?.from);
  }
  // the outgoing side: only while the next clip's linked transition runs
  const o = link?.out;
  if (o && o.dur > 0 && local >= o.at && local < o.at + o.dur)
    look = merge(look, outgoing(drawnTransition(o.type, o.frame, o.shaped, item.frame), prog(local, o.at, o.at + o.dur), o.dir ?? 'l', frame.width, frame.height));
  let filter = item.grade ? grades[item.grade] ?? 'none' : 'none';
  const add = (f: string) => { filter = `${filter === 'none' ? '' : `${filter} `}${f}`; };
  if (item.defocus && local >= item.defocus.from) {
    const d = item.defocus, p0 = d.px0 ?? 0;
    const b = p0 + (d.px - p0) * eIO3(prog(local, d.from, d.to));
    if (b > 0) add(`blur(${b.toFixed(2)}px)`);
  }
  if (look.bright !== 1) add(`brightness(${look.bright.toFixed(3)})`);
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
  const named = isNamedShape(item.shape);
  // the dressing: sizes in px at a 1080 short side, scaled with the stage like the blocks'
  const k = Math.min(W, H) / 1080, ol = item.outline, sh = item.shadow;
  const text = isNamedShape(item.shape) && item.shape.type === 'text' ? item.shape : null;
  // a text shape's line lies wholly outside its letters (see the stage's dress), so its letters keep the whole width free
  const ow = ol ? (ol.width ?? OUTLINE_DEFAULT.width) * k : 0, inset = text ? ow : ow / 2;
  const outline: Outline | null = ol ? { width: ow, color: ol.color ?? OUTLINE_DEFAULT.color, path: item.shape && !text ? shapePathOnce(item.shape, frame.width, frame.height, local, inset, 'path') : '' } : null;
  const shadow: Shadow | null = sh ? { blur: ((sh === true ? undefined : sh.blur) ?? SHADOW_DEFAULT.blur) * k, y: ((sh === true ? undefined : sh.y) ?? SHADOW_DEFAULT.y) * k, opacity: (sh === true ? undefined : sh.opacity) ?? SHADOW_DEFAULT.opacity } : null;
  const held = item.freezeAt != null && local >= item.freezeAt;
  return { frame, offsetX: look.dx, offsetY: look.dy, opacity: (item.opacity ?? 1) * look.opacity, filter, crop, mediaLocal, held, shakeX, shakeY, shakeScale,
    radius: named ? 0 : item.radius ?? 0, clipPath: look.clip ?? shapeClip(item, frame.width, frame.height, local, inset), scale: look.scale, streak: look.streak, veil: look.veil,
    text, inset, outline, shadow };
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
