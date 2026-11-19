// A sticker that follows a mouth or a face (toolkit phase 5): the faces of the clip's source over the sticker's time, one face
// tracked through them, mapped through the clip's crop and frame onto the film, as the sticker's transform keys.
import { coverPlacement, drawnTransition, videoState, type VideoItem, type VideoLink } from '@tellcut/engine';
import type { FaceInfo } from '@tellcut/media-node';

export type Who = 'largest' | 'left' | 'right' | 'center';
export interface FaceSample { t: number; faces: FaceInfo[] }

const centre = (f: FaceInfo): [number, number] => [f.box[0] + f.box[2] / 2, f.box[1] + f.box[3] / 2];
const gap = (a: FaceInfo, b: FaceInfo) => Math.hypot(a.mouth[0] - b.mouth[0], a.mouth[1] - b.mouth[1]);

/** The face `who` means among several. */
export function pickFace(faces: FaceInfo[], who: Who): FaceInfo {
  const by = (score: (f: FaceInfo) => number) => faces.reduce((best, f) => (score(f) < score(best) ? f : best));
  if (who === 'left') return by((f) => centre(f)[0]);
  if (who === 'right') return by((f) => -centre(f)[0]);
  if (who === 'center') return by((f) => Math.abs(centre(f)[0] - 0.5));
  return by((f) => -(f.box[2] * f.box[3]));
}

/** seconds a face must be gone before a lone face elsewhere is taken as it (a cut, the person walking across) */
const REACQUIRE = 0.4;

/**
 * One face through the samples: chosen by `who` where it first shows, then always the nearest to where it was (it never jumps to
 * someone else), except that after REACQUIRE seconds unseen a lone face is taken as it. Where it is not seen, its last place
 * holds. `lost` lists the stretches longer than a second it was not seen.
 */
export function trackFace(samples: FaceSample[], who: Who): { track: Array<{ t: number; face: FaceInfo | null }>; lost: Array<[number, number]> } {
  let prev: FaceInfo | null = null, missFrom: number | null = null;
  const lost: Array<[number, number]> = [];
  const track = samples.map((s) => {
    let f: FaceInfo | null = null;
    if (s.faces.length) {
      if (!prev) f = pickFace(s.faces, who);
      else {
        const near = s.faces.reduce((best, x) => (gap(x, prev!) < gap(best, prev!) ? x : best));
        f = gap(near, prev) < Math.max(0.12, prev.box[2]) ? near : null;   // farther than that is another person
        // ...unless the face was gone a while and comes back as the only one: the same person, somewhere else
        if (!f && missFrom !== null && s.t - missFrom >= REACQUIRE && s.faces.length === 1) f = s.faces[0];
      }
    }
    if (f) { if (missFrom !== null && s.t - missFrom > 1) lost.push([missFrom, s.t]); missFrom = null; prev = f; }
    else if (missFrom === null) missFrom = s.t;
    return { t: s.t, face: f ?? prev };
  });
  const last = samples.at(-1);
  if (missFrom !== null && last && last.t - missFrom > 1) lost.push([missFrom, last.t]);
  // before the face is first seen it sits where it is first seen
  const first = track.find((x) => x.face)?.face ?? null;
  return { track: track.map((x) => ({ t: x.t, face: x.face ?? first })), lost };
}

/** A point and a width on the film from a face: the mouth (its width) or the face's middle (the face's width). */
export interface FilmSpot { t: number; x: number; y: number; w: number }

/**
 * Where a face in the clip's source shows on the film at film time `t`: through the clip's frame and its crop at that moment
 * (Ken Burns moves included), and through what a transition does to the whole frame as the stage draws it: the offset a slide,
 * push or whip moves it by and the scale a zoom grows it by round the frame's centre. `link` is the clip's entry in the
 * project's videoLinks (the stage's own): without it a clip's own transition still counts, but not the half of the next clip's
 * that moves this one out. Fractions of the film's width / height; `w` as a fraction of the film's width.
 */
export function onFilm(face: FaceInfo, follow: 'mouth' | 'face', clip: VideoItem, clipTimes: { start: number; end: number }, t: number,
  W: number, H: number, src: { width: number; height: number }, link?: VideoLink): FilmSpot {
  return spotOnFilm({ t, ...sourceSpot(face, follow) }, clip, clipTimes, W, H, src, link);
}

/** The point a sticker follows on a face, in the source's fractions: the mouth (its width) or the face's middle (its width). */
export function sourceSpot(face: FaceInfo, follow: 'mouth' | 'face') {
  const [x, y] = follow === 'mouth' ? face.mouth : centre(face);
  return { x, y, w: follow === 'mouth' ? face.mouthW : face.box[2] };
}

/** onFilm for a point already in the source's fractions (`p.t` the film time). */
export function spotOnFilm(p: FilmSpot, clip: VideoItem, clipTimes: { start: number; end: number }, W: number, H: number,
  src: { width: number; height: number }, link?: VideoLink): FilmSpot {
  const s = videoState(clip, clipTimes.start, clipTimes.end, p.t, W, H, {}, link);
  const b = coverPlacement(src.width, src.height, s.frame.width, s.frame.height, s.crop);
  // the point in the frame's own px, then grown round the frame's centre and moved with it
  const cx = s.frame.width / 2, cy = s.frame.height / 2, fx = b.left + p.x * b.width, fy = b.top + p.y * b.height;
  return { t: p.t, x: (s.frame.left + s.offsetX + cx + (fx - cx) * s.scale) / W, y: (s.frame.top + s.offsetY + cy + (fy - cy) * s.scale) / H, w: (p.w * b.width * s.scale) / W };
}

/** the transitions that move or grow the incoming clip's whole frame, and the outgoing one's (a slide leaves A where it is; the
 *  others move neither) */
const MOVING: ReadonlySet<string> = new Set(['slide', 'push', 'whip', 'zoom']), MOVING_OUT: ReadonlySet<string> = new Set(['push', 'whip', 'zoom']);

/**
 * Film times, one a frame, in [from, to] where a transition moves or grows the clip's frame: its own (as drawn: a fallback to a
 * dissolve does not move it) and, through `link`, the next clip's that moves it out. Keys every FACE_STEP alone would cut a
 * 0.6 s push or zoom into three straight pieces and leave the sticker beside the face in between.
 */
export function movingTimes(clip: VideoItem, clipTimes: { start: number; end: number }, link: VideoLink | undefined, from: number, to: number, fps: number): number[] {
  const spans: Array<[number, number]> = [];
  const tr = clip.transitionIn, shaped = !!clip.shape && clip.shape.length >= 3;
  if (tr && tr.dur > 0 && MOVING.has(drawnTransition(tr.type, clip.frame, shaped, link?.from))) spans.push([clipTimes.start, clipTimes.start + tr.dur]);
  const o = link?.out;
  if (o && o.dur > 0 && MOVING_OUT.has(drawnTransition(o.type, o.frame, o.shaped, clip.frame))) spans.push([clipTimes.start + o.at, clipTimes.start + o.at + o.dur]);
  const out: number[] = [];
  for (const [a, b] of spans) for (let k = Math.ceil(Math.max(a, from) * fps - 1e-6); k / fps <= Math.min(b, to) + 1e-9; k++) out.push(Math.round((k / fps) * 1e6) / 1e6);
  return out;
}

/** The spot at film time t between samples (sorted by t): straight between the two either side, held past either end. */
export function spotAt(spots: FilmSpot[], t: number): FilmSpot {
  const i = spots.findIndex((p) => p.t >= t);
  if (i === 0) return { ...spots[0], t };
  if (i < 0) return { ...spots[spots.length - 1], t };
  const a = spots[i - 1], b = spots[i], k = (t - a.t) / (b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k };
}

/** A centred moving average over three samples: a sticker that follows a face should not shiver with the detector. */
export function smooth(spots: FilmSpot[]): FilmSpot[] {
  return spots.map((p, i) => {
    const near = spots.slice(Math.max(0, i - 1), i + 2), n = near.length;
    return { t: p.t, x: near.reduce((a, q) => a + q.x, 0) / n, y: near.reduce((a, q) => a + q.y, 0) / n, w: near.reduce((a, q) => a + q.w, 0) / n };
  });
}

/**
 * How big a sticker is on what it follows, as times the spot's width: a mouth's sticker 2.4 mouths wide, a face's 1.1 faces. A face
 * cover (common.emoji mode cover) must hide the whole face, but the detector's box runs from the chin only to the brow: 1.9 faces
 * wide and raised by a tenth of its own width, it reaches from under the chin to the hairline.
 */
export const FOLLOW_SIZE = { mouth: 2.4, face: 1.1, cover: 1.9 } as const;
export const COVER_LIFT = 0.1;

/**
 * The sticker's transform keys (item-local times) for film spots: its own anchor (where the block draws it, as fractions) is moved
 * onto each spot, and it is scaled so its width is `cover` times the spot's width; `lift` raises it by that share of its width
 * (`aspect` the film's width over its height, to turn that width into a share of the height).
 */
export function stickerKeys(spots: FilmSpot[], itemStart: number, anchor: { x: number; y: number; width: number }, cover: number, lift = 0, aspect = 1) {
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  // a move is at most a frame either way (the schema's range): a face a push or zoom has taken farther off the film leaves the
  // sticker off it too, a frame from its anchor
  const move = (v: number) => r4(Math.min(1, Math.max(-1, v)));
  return spots.map((p) => ({ t: r4(p.t - itemStart), x: move(p.x - anchor.x), y: move(p.y - lift * cover * p.w * aspect - anchor.y), scale: r4(Math.min(10, Math.max(0.05, (cover * p.w) / anchor.width))) }));
}
