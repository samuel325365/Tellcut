// The things on the desk (spec 2026-11-07-desk3d): their parameters (one object from the simple fields, or a JSON list of them),
// their sizes and where the picture sits on each, the curled-paper sheet they are built from, and how far the handwriting has got.
// Desk units: the table is the plane y = 0 of the 3D scene; an object's x runs right, its y runs up the picture (away from the
// camera, world z = −y), rot turns it on the table. Everything here is a pure function.
import type * as T from 'three';
import { numOr, type Project } from '@tellcut/engine';
import { parseCellShots, type CellShot } from '../cells.ts';
import { parseSentences, sentenceCps, type Sentence } from '../handwrite.ts';
import type { Side, Warmth } from './light.ts';
import type { Surface } from './surface.ts';

export type Kind = 'postcard' | 'polaroid' | 'photo' | 'tv' | 'card';
export type Enter = 'drop' | 'left' | 'right' | 'bottom' | 'none';
export const KINDS: Kind[] = ['postcard', 'polaroid', 'photo', 'tv', 'card'];
export const ENTERS: Enter[] = ['drop', 'left', 'right', 'bottom', 'none'];

export interface Mark { top: string; bottom: string; date: string; at: number }
export interface Obj {
  kind: Kind; shot: CellShot | null; x: number; y: number; rot: number; portrait: boolean;
  enter: Enter; at: number; dur: number; exit: Enter | null; exitAt: number; flipAt: number | null; flipDur: number;
  place: string; year: string; caption: string; back: Sentence[]; stamp: CellShot | null; mark: Mark | null;
  /** the object's own seed (its paper fibres) */
  seed: number;
  /** how high it lies at rest: set by the list (`stack`), else a sheet's thickness above the one before */
  rest?: number;
}

/** the block's parameters: the simple fields make one object; `objects` (a JSON list) replaces them with any number */
export interface FlatlayParams {
  kind: Kind; shot: string; place: string; year: string; caption: string; back: string; enter: Enter; at: number; flipAt: number;
  mark: string; markAt: number;
  /** JSON text, or the list itself */
  objects: string | unknown[];
  surface: Surface; side: Side; warmth: Warmth; camera: 'push' | 'still' | 'top'; topAt: number;
  /** a json parameter: the object itself, or its JSON text */
  fly: string | Record<string, unknown> | null; dof: number; seed: number;
}

/** sizes in desk units; pic is where the picture sits on the object, as fractions of its width and height (x, y from the top left) */
export interface Size { w: number; h: number; pic: [number, number, number, number]; depth: number; curl: number }
export const KIND_SIZE: Record<Kind, Size> = {
  // the spike's postcard: a 0.04 margin, a strip under the photo for the place name
  postcard: { w: 1.5, h: 1.0, pic: [0.04 / 1.5, 0.04, 1.42 / 1.5, 0.84], depth: 0, curl: 0.018 },
  polaroid: { w: 0.88, h: 1.06, pic: [0.06 / 0.88, 0.06 / 1.06, 0.76 / 0.88, 0.76 / 1.06], depth: 0, curl: 0.012 },
  // a wooden moulding 0.08 wide and a white mat 0.144 wide round a 5:7 picture
  photo: { w: 1.2, h: 1.5, pic: [0.224 / 1.2, 0.224 / 1.5, 0.752 / 1.2, 1.052 / 1.5], depth: 0.06, curl: 0 },
  // a 4:3 screen on the left of the set, the knobs to its right, the brand under it
  tv: { w: 1.5, h: 1.2, pic: [0.1 / 1.5, 0.15 / 1.2, 1.0 / 1.5, 0.75 / 1.2], depth: 0.45, curl: 0 },
  card: { w: 1.0, h: 1.4, pic: [0.07, 0.06, 0.86, 0.6], depth: 0, curl: 0.01 },
};
const PORTRAIT_POSTCARD: Size = { w: 1.0, h: 1.5, pic: [0.04, 0.04 / 1.5, 0.92, 1.26 / 1.5], depth: 0, curl: 0.018 };

/** the object's size, a portrait postcard standing up */
export const sizeOf = (o: Pick<Obj, 'kind' | 'portrait'>): Size => (o.kind === 'postcard' && o.portrait ? PORTRAIT_POSTCARD : KIND_SIZE[o.kind]);
/** the picture's width over its height */
export function picAspect(o: Pick<Obj, 'kind' | 'portrait'>): number {
  const s = sizeOf(o);
  return (s.pic[2] * s.w) / (s.pic[3] * s.h);
}

/** where the objects lie when the JSON does not say: [x, y, rot] by order, a column down a tall frame, a row across a wide one */
const TALL: Array<[number, number, number]> = [[-0.1, 0.72, 0.09], [0.28, -0.5, -0.12], [-0.3, -0.05, 0.05], [0.25, 0.85, -0.06], [0.02, 0.2, 0.03], [-0.25, -0.85, 0.07]];
const WIDE: Array<[number, number, number]> = [[-0.95, 0.1, 0.07], [0.8, -0.05, -0.1], [0, 0.22, -0.04], [-0.3, -0.28, 0.06], [0.45, 0.32, 0.04], [1.4, 0.2, -0.05]];
export function slot(i: number, W: number, H: number): [number, number, number] {
  const list = W > H ? WIDE : TALL;
  return list[i % list.length];
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v === undefined || v === null ? d : String(v));
const shotOf = (v: unknown): CellShot | null => (typeof v === 'string' && v.trim() ? parseCellShots(v)[0] ?? null : null);
function markOf(v: unknown, at: number): Mark | null {
  const s = str(v).trim();
  if (!s) return null;
  const [top = '', bottom = '', date = ''] = s.split('|').map((x) => x.trim());
  return { top, bottom, date, at };
}

/** how long an exit takes */
export const EXIT_DUR = 0.8;

function objFrom(e: Record<string, unknown>, i: number, W: number, H: number, simple: boolean, len: number): Obj {
  const kind = KINDS.includes(e.kind as Kind) ? (e.kind as Kind) : 'postcard';
  const enter = ENTERS.includes(e.enter as Enter) ? (e.enter as Enter) : 'drop';
  const [sx, sy, sr] = slot(i, W, H);
  const shot = shotOf(e.shot);
  const flipAt = numOr(e.flipAt, -1);
  const exit = ENTERS.includes(e.exit as Enter) && e.exit !== 'none' ? (e.exit as Enter) : null;
  const at = numOr(e.at, simple ? 0.2 : 0), dur = numOr(e.dur, enter === 'drop' ? 0.9 : 0.8);
  return {
    kind, shot, x: numOr(e.x, sx), y: numOr(e.y, sy), rot: numOr(e.rot, sr), portrait: e.portrait === true, enter, at, dur,
    // an exit with no time leaves just as the item ends (not before it has come in)
    exit, exitAt: numOr(e.exitAt, Math.max(at + dur, len - EXIT_DUR)), flipAt: flipAt >= 0 ? flipAt : null, flipDur: numOr(e.flipDur, 0.9),
    place: str(e.place), year: str(e.year), caption: str(e.caption), back: parseSentences(str(e.back)),
    // a postcard's stamp is that stop's own picture unless it says otherwise
    stamp: shotOf(e.stamp) ?? (kind === 'postcard' ? shot : null), mark: markOf(e.mark, numOr(e.markAt, 1)), seed: i + 1,
  };
}

/** the objects on the desk: the JSON list when there is one, else the one object of the simple fields (an empty list too); a broken
 *  list falls back to the simple object and says why. `len` is the item's length (an exit with no exitAt ends with it; left out,
 *  such an exit never comes) */
export function parseObjects(p: Partial<FlatlayParams>, W: number, H: number, len = Infinity): { objs: Obj[]; error: string | null } {
  const simple = () => [objFrom(p as Record<string, unknown>, 0, W, H, true, len)];
  // a list as it is (cut.ts may hand one over), else JSON text
  const raw: unknown = p.objects, text = Array.isArray(raw) ? null : str(raw).trim();
  if (text === '' || (Array.isArray(raw) && !raw.length)) return { objs: simple(), error: null };
  try {
    const list = text === null ? raw : JSON.parse(text);
    if (!Array.isArray(list)) throw new Error('not a list');
    if (!list.length) return { objs: simple(), error: null };
    return { objs: stack(list.map((e, i) => objFrom(e && typeof e === 'object' ? e : {}, i, W, H, false, len))), error: null };
  } catch (e) {
    return { objs: simple(), error: `objects JSON：${(e as Error).message}` };
  }
}

/** what the picture face shows: the clip, a held frame, or the stand-in (no shot, or a source the project does not have) */
export function faceSource(o: Pick<Obj, 'shot'>, project: Pick<Project, 'sources'> | undefined): 'video' | 'still' | 'placeholder' {
  if (!o.shot || !(project?.sources as Record<string, unknown> | undefined)?.[o.shot.source]) return 'placeholder';
  return o.shot.still ? 'still' : 'video';
}

/** how far above the one before each later object lies */
export const REST_Z = 0.004;

/** where each object rests: a sheet's thickness above the one before, and above the curled corners and the thickness of every
 *  earlier object it may overlap (bounding circles), so nothing shows through it; a box (the tv) is not climbed, a sheet tucks
 *  under its edge */
export function stack(objs: Obj[]): Obj[] {
  const half = (o: Obj) => { const s = sizeOf(o); return Math.hypot(s.w, s.h) / 2; };
  objs.forEach((o, i) => {
    let rest = REST_Z * (i + 1);
    for (let j = 0; j < i; j++) {
      const u = objs[j], s = sizeOf(u);
      if (u.kind === 'tv' || Math.hypot(o.x - u.x, o.y - u.y) >= half(o) + half(u)) continue;
      rest = Math.max(rest, (u.rest ?? REST_Z * (j + 1)) + s.depth + s.curl + REST_Z);
    }
    o.rest = rest;
  });
  return objs;
}

/** a sheet curling up at its corners: flat in the middle, `curl` high at each corner (x, y from the sheet's centre) */
export const sheetZ = (x: number, y: number, w: number, h: number, curl: number) => curl * (((2 * x) / w) ** 2 * 0.6 + ((2 * y) / h) ** 2 * 0.4) ** 1.6;

/** a w×h sheet (or the part `rect` of it, in fractions from the top left, lifted `lift` above it: the photo on the same curl) bent
 *  by sheetZ, facing +z */
export function sheetGeometry(THREE: typeof import('three'), w: number, h: number, curl: number, o: { rect?: [number, number, number, number]; lift?: number; seg?: number } = {}): T.BufferGeometry {
  const [rx, ry, rw, rh] = o.rect ?? [0, 0, 1, 1], seg = o.seg ?? 24;
  const sw = rw * w, sh = rh * h, geo = new THREE.PlaneGeometry(sw, sh, seg, seg), p = geo.attributes.position;
  const cx = rx * w + sw / 2 - w / 2, cy = h / 2 - (ry * h + sh / 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, y = p.getY(i) + cy;
    p.setXYZ(i, x, y, sheetZ(x, y, w, h, curl) + (o.lift ?? 0));
  }
  geo.computeVertexNormals();
  return geo;
}

/** how many characters of each line the pen has written by `local` (a character counts once its stroke has begun) */
export function writtenChars(lines: Sentence[], local: number, cps = 12): number[] {
  return lines.map((s) => {
    const n = [...s.text].length, speed = sentenceCps(s, cps);
    return local <= s.start ? 0 : Math.min(n, Math.ceil((local - s.start) * speed));
  });
}
