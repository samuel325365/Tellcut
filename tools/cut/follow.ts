// A sticker that follows a mouth or a face (toolkit phase 5): the faces of the clip's source over the sticker's time, one face
// tracked through them, mapped through the clip's crop and frame onto the film, as the sticker's transform keys.
import { coverPlacement, videoState, type VideoItem } from '@tellcut/engine';
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
 * (Ken Burns moves included). Fractions of the film's width / height; `w` as a fraction of the film's width.
 */
export function onFilm(face: FaceInfo, follow: 'mouth' | 'face', clip: VideoItem, clipTimes: { start: number; end: number }, t: number,
  W: number, H: number, src: { width: number; height: number }): FilmSpot {
  const s = videoState(clip, clipTimes.start, clipTimes.end, t, W, H, {});
  const b = coverPlacement(src.width, src.height, s.frame.width, s.frame.height, s.crop);
  const [sx, sy] = follow === 'mouth' ? face.mouth : centre(face), sw = follow === 'mouth' ? face.mouthW : face.box[2];
  return { t, x: (s.frame.left + b.left + sx * b.width) / W, y: (s.frame.top + b.top + sy * b.height) / H, w: (sw * b.width) / W };
}

/** A centred moving average over three samples: a sticker that follows a face should not shiver with the detector. */
export function smooth(spots: FilmSpot[]): FilmSpot[] {
  return spots.map((p, i) => {
    const near = spots.slice(Math.max(0, i - 1), i + 2), n = near.length;
    return { t: p.t, x: near.reduce((a, q) => a + q.x, 0) / n, y: near.reduce((a, q) => a + q.y, 0) / n, w: near.reduce((a, q) => a + q.w, 0) / n };
  });
}

/**
 * The sticker's transform keys (item-local times) for film spots: its own anchor (where the block draws it, as fractions) is moved
 * onto each spot, and it is scaled so its width is `cover` times the spot's width.
 */
export function stickerKeys(spots: FilmSpot[], itemStart: number, anchor: { x: number; y: number; width: number }, cover: number) {
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return spots.map((p) => ({ t: r4(p.t - itemStart), x: r4(p.x - anchor.x), y: r4(p.y - anchor.y), scale: r4(Math.min(10, Math.max(0.05, (cover * p.w) / anchor.width))) }));
}
