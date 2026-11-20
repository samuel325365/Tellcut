// The face side of Cut.save() (toolkit phase 5): clips without a crop of their own focus on the faces in them, clips avoidBurned
// cropped keep the faces in them in frame, and stickers asked to follow a mouth or a face get their transform keys.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRegistry, isNamedShape, r6, resolveTimes, shapeHolds, shapeSafe, type NamedShape, videoLinks, visibleRegion, type Crop, type Project, type SceneItem, type VideoItem } from '@tellcut/engine';
import { FACE_STEP, faceKey, facesAt, type FaceInfo, type FacesProvider } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { COVER_LIFT, FOLLOW_SIZE, movingTimes, pickFace, smooth, sourceSpot, spotAt, spotOnFilm, stickerKeys, trackFace, type Who } from './follow.ts';
import { avoidBurnedMove, spreadMove } from './avoid.ts';
import { viewCrop, type Rect } from './view.ts';
import { pictureLen, pictureTimeAt } from './frames.ts';

/** what the face passes work on: the project, its folder, the detector (undefined: tellcut/providers.json's) and Cut's notes */
export interface FaceCtx { p: Project; dir: string; provider?: FacesProvider; notes: string[] }
/** a sticker asked to follow a mouth or a face (Cut.effect({ follow })) */
export interface FollowReq { id: string; follow: 'mouth' | 'face'; who: Who; clip?: string }

/** a clip avoidBurned cropped (Cut.clip): its pieces (tighten's), the stretch of the source, the crop asked for, the geometry;
 *  `cropOnly`: avoidBurned: 'crop', our captions stay where they are when the crop has to give up */
export interface BurnedAsk { ids: string[]; source: string; from: number; to: number; want: { from: Crop; to: Crop }; geo: Parameters<typeof avoidBurnedMove>[0]; cropOnly?: boolean }

/** Faces at source times; a detector that fails is a note, not a failed cut. */
async function faces(x: FaceCtx, path: string, times: number[], what: string) {
  try { return await facesAt(x.dir, path, times, { provider: x.provider }); }
  catch (e) { x.notes.push(`${what}：人臉偵測失敗（${(e as Error).message.split('\n')[0].slice(0, 120)}），沒有用到它`); return null; }
}
/** the source file of a clip's source, and its size */
function sourceOf(x: FaceCtx, id: string) { const s = x.p.sources[id]; return { path: resolve(x.dir, s.path), width: s.width, height: s.height, image: s.kind === 'image' }; }

/** how far the face focus of a shaped window zooms in at most to bring the faces into the part the shape shows: further, the
 *  picture goes soft (a 720p source in a 1080p film is already 1.5×) */
export const SHAPE_FOCUS_ZOOM = 2;
/** the face box is padded by this share of its size on each side: a detector's box is tight round the features, and hair or a
 *  chin cut by the shape's edge reads as a face cut too */
const FACE_PAD = 0.12;
/** ...but by at most this share of the picture's short side: a close-up (a face over a sixth of the short side) cut at the hair by
 *  the shape is how a portrait in a round frame looks anyway, and the safe box is already the shape's inscribed rectangle, so a
 *  pad growing with the face reported faces that showed whole as not fitting */
const FACE_PAD_MOST = 0.02;
/** a face shorter than this share of the picture's short side is not framed into a shape: the detector's floor is about 0.1 (it
 *  misses smaller faces, faces.py), so this band is people some way off, passers-by behind the subject; chasing one zoomed in
 *  and pushed the view to the picture's edge. A travel subject talking to the camera or in a medium shot is 0.15–0.5. */
const SHAPE_FACE_MIN = 0.12;
/** a sample's face shorter than this share of the largest face in the clip is someone further back, not the subject (the subject
 *  walking closer through a clip stays within it): framing both would spread the faces over the picture */
const SHAPE_FACE_SHARE = 0.5;

/**
 * The faces a shaped window frames, from the faces found at each sample (the clip's quarter, half and three quarters), as
 * [left, top, right, bottom] in fractions of the source: each sample's largest face of at least SHAPE_FACE_MIN, and of those the
 * ones at least SHAPE_FACE_SHARE as tall as the largest, so the main subject wins over passers-by. null: only small faces.
 */
export function shapedSubject(samples: FaceInfo[][], srcW: number, srcH: number): Rect | null {
  const short = Math.min(srcW, srcH), tall = (f: FaceInfo) => (f.box[3] * srcH) / short;
  const picks = samples.map((fs) => fs.filter((f) => tall(f) >= SHAPE_FACE_MIN)).filter((fs) => fs.length).map((fs) => pickFace(fs, 'largest'));
  if (!picks.length) return null;
  const most = Math.max(...picks.map(tall)), boxes = picks.filter((f) => tall(f) >= SHAPE_FACE_SHARE * most).map((f) => f.box);
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[0] + b[2])), Math.max(...boxes.map((b) => b[1] + b[3]))];
}

/** a face of which at least this share shows in its shape counts as framed, though its box is not inside the safe rectangle (a
 *  close-up in a circle: the box's corners poke out of the inscribed square while the face, round, is in the circle) */
export const FACE_SHOWN = 0.97;

/** How much of the faces `subject` (a box in fractions of the source) the shape shows with `crop`: the oval in the box, measured
 *  against the shape itself (engine shapeHolds); 1 for the text shape (it gets no focus). */
export function faceShown(shape: NamedShape, aspect: number, srcW: number, srcH: number, frameW: number, frameH: number, crop: Crop, subject: Rect): number {
  const v = visibleRegion(srcW, srcH, frameW, frameH, crop);
  const l = (subject[0] - v.x0) / v.w, t = (subject[1] - v.y0) / v.h, r = (subject[2] - v.x0) / v.w, b = (subject[3] - v.y0) / v.h;
  return shapeHolds(shape, aspect, [(l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2]) ?? 1;
}

/**
 * The crop that puts `subject` (the faces, [left, top, right, bottom] in fractions of the source) inside `safe`, the part of the
 * frame a shape certainly shows ([x, y, w, h] in fractions of the frame, shapes.ts shapeSafe), at the least zoom that does it:
 * the view of a cover crop can move only as far as the picture reaches, so a face near the source's edge or a safe box off the
 * frame's middle may need a closer view, while a closer view makes the face bigger, so it may then no longer fit. When both cannot
 * hold (or it would zoom past SHAPE_FOCUS_ZOOM) the faces are made to fit as far as they can and centred in the safe box as far
 * as the picture allows, and `inside` is false.
 */
export function shapedFocus(srcW: number, srcH: number, frameW: number, frameH: number, safe: [number, number, number, number], subject: Rect): { crop: Crop; inside: boolean } {
  const one = visibleRegion(srcW, srcH, frameW, frameH, { x: 0.5, y: 0.5, zoom: 1 });
  const short = Math.min(srcW, srcH);
  const pw = Math.min((subject[2] - subject[0]) * FACE_PAD, (FACE_PAD_MOST * short) / srcW), ph = Math.min((subject[3] - subject[1]) * FACE_PAD, (FACE_PAD_MOST * short) / srcH);
  const face = [Math.max(0, subject[0] - pw), Math.max(0, subject[1] - ph), Math.min(1, subject[2] + pw), Math.min(1, subject[3] + ph)];
  // per axis: the view (in fractions of the source; one.w / zoom across) must be at most `most` for the faces to be placed inside
  // the safe box without the view leaving the picture, and at least `least` for them to fit in it
  const axes = ([0, 1] as const).map((k) => {
    const a = face[k], b = face[k + 2], s0 = safe[k], s1 = safe[k] + safe[k + 2], v1 = k ? one.h : one.w;
    const most = Math.min(v1, s0 > 1e-6 ? a / s0 : Infinity, s1 < 1 - 1e-6 ? (1 - b) / (1 - s1) : Infinity), least = (b - a) / (s1 - s0);
    return { a, b, s0, s1, v1, zNeed: v1 / Math.max(most, 1e-6), zFit: v1 / Math.max(least, 1e-6) };
  });
  const need = Math.max(1, ...axes.map((x) => x.zNeed)), fit = Math.min(SHAPE_FOCUS_ZOOM, ...axes.map((x) => x.zFit));
  const inside = need <= fit + 1e-9, zoom = inside ? need : Math.max(1, Math.min(need, fit));
  const centre = axes.map(({ a, b, s0, s1, v1 }) => {
    const v = v1 / zoom, lo = Math.max(0, b - s1 * v), hi = Math.min(1 - v, a - s0 * v);
    // the view's start: the middle of the starts that keep the faces inside the safe box, else the one that centres them in it
    const start = lo <= hi ? (lo + hi) / 2 : Math.min(1 - v, Math.max(0, (a + b) / 2 - ((s0 + s1) / 2) * v));
    return start + v / 2;
  });
  const z = Math.round(zoom * 1000) / 1000, crop = viewCrop(srcW, srcH, frameW, frameH, centre[0], centre[1], z), whole = visibleRegion(srcW, srcH, frameW, frameH, { x: 0.5, y: 0.5, zoom: z });
  // an axis the view spans whole cannot move: any focus there is the same picture, and 0.5 says so (the bisection ends at 0)
  const at = (v: number, span: number) => (span >= 1 - 1e-6 ? 0.5 : Math.round(v * 1000) / 1000);
  return { crop: { x: at(crop.x, whole.w), y: at(crop.y, whole.h), zoom: crop.zoom }, inside };
}

/**
 * Clips without a crop whose picture is another shape than their frame: the crop's focus goes to the middle of the faces in it
 * (the largest face at a quarter, half and three quarters of the clip), not the centre. A picture wider than its frame (a landscape
 * shot in a portrait film) is cropped at the sides, so the focus moves sideways; a taller one (portrait in landscape) moves up or down.
 * Each group is one clip (or the pieces tighten made of it), focused alike. A clip cut to a named shape shows less than its frame
 * (a circle in a wide frame, only its middle): the faces go into the part the shape certainly shows (shapedFocus), even when the
 * picture fits the frame (only the main subject's face, shapedSubject: passers-by are left alone); a text shape gets no focus at
 * all (letters show no whole face, on purpose).
 */
export async function resolveAutoFocus(x: FaceCtx, groups: string[][]) {
  const W = x.p.meta.width, H = x.p.meta.height;
  for (const group of groups) {
    const all = group.map((id) => x.p.tracks.find((t) => t.id === 'v1')?.items.find((i) => i.id === id) as VideoItem | undefined).filter((c): c is VideoItem => !!c);
    if (!all.length) continue;   // removed again
    const it = all[0], id = group.join('、');
    const src = sourceOf(x, it.source), [, , fw, fh] = it.frame;
    const frameAr = (fw * W) / (fh * H), fits = Math.abs(src.width / src.height - frameAr) / frameAr < 0.1;
    const axis = src.width / src.height > frameAr ? 'x' : 'y';
    const shape = isNamedShape(it.shape) ? it.shape : null;
    if (shape?.type === 'text' || src.image) continue;
    const safe = shape && shapeSafe(shape, frameAr);
    if (safe) {
      // a crop moved since (avoidBurned's) is left as it is
      if (all.some((c) => JSON.stringify(c.crop.from) !== JSON.stringify(c.crop.to) || c.crop.from.x !== 0.5 || c.crop.from.y !== 0.5 || c.crop.from.zoom !== 1)) continue;
    } else if (fits || all.some((c) => c.crop.from[axis] !== 0.5 || c.crop.to[axis] !== 0.5)) continue;
    if (!existsSync(src.path)) continue;   // footage not on this PC
    // a quarter, half and three quarters into the clip (into all its pieces, laid end to end)
    const lens = all.map(pictureLen), whole = lens.reduce((a, b) => a + b, 0);
    const times = [0.25, 0.5, 0.75].map((f) => { let t = f * whole; for (const [i, c] of all.entries()) { if (t <= lens[i] || i === all.length - 1) return c.in + Math.min(t, lens[i]); t -= lens[i]; } return it.in; });
    const found = await faces(x, src.path, times, id);
    if (!found) continue;
    if (shape && safe) {
      const samples = [...found.values()];
      if (!samples.some((fs) => fs.length)) continue;
      const subject = shapedSubject(samples, src.width, src.height);
      if (!subject) { x.notes.push(`${it.source}（${id}）找到的臉都太小（遠處的路人），不對焦，留在 ${shape.type} 形狀的中間`); continue; }
      const r = shapedFocus(src.width, src.height, fw * W, fh * H, safe, subject);
      // the safe rectangle is strict: a face whose box pokes out of it at the corners may still show whole in the shape
      if (!r.inside && faceShown(shape, frameAr, src.width, src.height, fw * W, fh * H, r.crop, subject) >= FACE_SHOWN) r.inside = true;
      for (const c of all) c.crop = { ...c.crop, from: { ...r.crop }, to: { ...r.crop } };
      x.notes.push(r.inside ? `${it.source}（${id}）自動對焦到人臉，放進 ${shape.type} 形狀一定看得到的範圍（x=${r.crop.x}、y=${r.crop.y}、放大 ${r.crop.zoom} 倍）`
        : `${it.source}（${id}）的人臉放不進 ${shape.type} 形狀一定看得到的範圍（臉太大或太靠邊，放大最多 ${SHAPE_FOCUS_ZOOM} 倍），盡量放進去了（x=${r.crop.x}、y=${r.crop.y}、放大 ${r.crop.zoom} 倍）；考慮放大 frame、換形狀，或自己給 crop`);
      continue;
    }
    const k = axis === 'x' ? 0 : 1;
    const vs = [...found.values()].filter((fs) => fs.length).map((fs) => { const f = pickFace(fs, 'largest'); return f.box[k] + f.box[k + 2] / 2; }).sort((a, b) => a - b);
    if (!vs.length) continue;
    const v = Math.round(vs[Math.floor(vs.length / 2)] * 1000) / 1000;
    for (const c of all) c.crop = { ...c.crop, from: { ...c.crop.from, [axis]: v }, to: { ...c.crop.to, [axis]: v } };
    x.notes.push(`${it.source}（${id}）自動對焦到人臉（${axis}=${v}）`);
  }
}

/**
 * Clips avoidBurned cropped, worked out again around the faces in them (the largest at a quarter, half and three quarters of the
 * stretch): the crop that clears the caption must go on showing whatever of them the asked-for crop showed, the focus moving
 * sideways onto them if need be. A clip waiting for the face focus (no crop of its own, another shape than its frame) is looked at
 * where the faces are first, as that focus would, and leaves the focus pass. When the caption cannot be cleared without cutting
 * a face, the clip keeps the crop asked for and is returned: Cut.save() moves our captions over it to the top and says so once per
 * source, together with the clips avoidBurned gave up on for the zoom. No faces: the crop stays.
 */
export async function resolveBurnedFaces(x: FaceCtx, asks: BurnedAsk[], autoFocus: string[][]): Promise<BurnedAsk[]> {
  const gaveUp: BurnedAsk[] = [];
  const v1 = (x.p.tracks.find((t) => t.id === 'v1')?.items ?? []) as VideoItem[];
  for (const a of asks) {
    const all = a.ids.map((id) => v1.find((i) => i.id === id)).filter((c): c is VideoItem => !!c);
    if (!all.length) continue;   // removed again
    const src = sourceOf(x, a.source), id = a.ids.join('、');
    if (!existsSync(src.path)) continue;   // footage not on this PC
    const found = await faces(x, src.path, [0.25, 0.5, 0.75].map((f) => a.from + f * (a.to - a.from)), id);
    const boxes = [...(found?.values() ?? [])].filter((fs) => fs.length).map((fs) => pickFace(fs, 'largest').box);
    if (!boxes.length) continue;
    const subject: Rect = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[0] + b[2])), Math.max(...boxes.map((b) => b[1] + b[3]))];
    let want = a.want;
    const g = a.geo, frameAr = g.frameW / g.frameH, fi = autoFocus.findIndex((ids) => ids.includes(a.ids[0]));
    if (fi >= 0 && Math.abs(g.srcW / g.srcH - frameAr) / frameAr >= 0.1) {
      const axis = g.srcW / g.srcH > frameAr ? 'x' : 'y', k = axis === 'x' ? 0 : 1, v = Math.round(((subject[k] + subject[k + 2]) / 2) * 1000) / 1000;
      if (want.from[axis] === 0.5 && want.to[axis] === 0.5) want = { from: { ...want.from, [axis]: v }, to: { ...want.to, [axis]: v } };
      autoFocus.splice(fi, 1);
    }
    const r = avoidBurnedMove(g, want, subject), move = r.why ? want : { from: r.from, to: r.to };
    const crops = all.length > 1 ? spreadMove(move, all.map((c) => c.end - c.start)) : [move];
    const before = JSON.stringify(all.map((c) => [c.crop.from, c.crop.to]));
    all.forEach((c, i) => { c.crop = { ...c.crop, ...crops[i] }; });
    if (r.why) gaveUp.push(a);
    else if (JSON.stringify(all.map((c) => [c.crop.from, c.crop.to])) !== before)
      x.notes.push(`avoidBurned：${a.source}（${id}）裁掉燒進去的字幕時保住人臉（x=${r6(move.from.x)}、y=${r6(move.from.y)}、放大 ${r6(move.from.zoom)} 倍）`);
  }
  return gaveUp;
}

/** Stickers asked to follow a mouth or a face: their transform keys, from the faces of the clip under them. A face cover
 *  (common.emoji mode cover) on a face is made big enough to hide it all (FOLLOW_SIZE.cover, COVER_LIFT). */
export async function resolveFollows(x: FaceCtx, follows: FollowReq[]) {
  if (!follows.length) return;
  const W = x.p.meta.width, H = x.p.meta.height, registry = createRegistry(plugins);
  for (const req of follows) {
    const times = resolveTimes(x.p), found = x.p.tracks.flatMap((t) => t.items as SceneItem[]).find((i) => i.id === req.id);
    const at = times.get(req.id);
    if (!found || !at) continue;
    const clips = (x.p.tracks.find((t) => t.id === 'v1')?.items ?? []) as VideoItem[];
    const clip = req.clip ? clips.find((c) => c.id === req.clip) : clips.find((c) => { const ct = times.get(c.id)!; return ct.start <= at.start + 1e-6 && ct.end > at.start; });
    if (!clip) { x.notes.push(`${req.id}：下面沒有影片片段，沒辦法跟著臉`); continue; }
    const ct = times.get(clip.id)!, src = sourceOf(x, clip.source);
    if (at.end > ct.end + 0.05) x.notes.push(`${req.id}：比片段 ${clip.id} 長，${r6(ct.end)} 秒之後停在最後的位置（要跟下一段的臉，拆成兩張貼圖）`);
    // film times every 0.2 s over the sticker (the clip's part of it), and the source times they show
    const film: number[] = [];
    for (let t = Math.max(at.start, ct.start); t <= Math.min(at.end, ct.end) + 1e-6; t += FACE_STEP) film.push(r6(t));
    const srcTime = (t: number) => (src.image ? 0 : pictureTimeAt(clip, t - ct.start));   // past freezeAt the held frame
    if (!existsSync(src.path)) { x.notes.push(`${req.id}：${clip.source} 不在這台電腦上，貼圖留在原本的位置`); continue; }
    const fs = await faces(x, src.path, film.map(srcTime), req.id);
    if (!fs) continue;   // the detector failed: faces() said so
    const { track, lost } = trackFace(film.map((t) => ({ t, faces: fs.get(faceKey(srcTime(t))) ?? [] })), req.who);
    if (!track.some((s) => s.face)) { x.notes.push(`${req.id}：${clip.source} 這段找不到臉，貼圖留在原本的位置`); continue; }
    // smoothed where the detector found it (in the source's fractions, so a transition's move is not averaged away), then put on
    // the film as the stage draws the clip, a key a frame where a transition moves or grows it
    const seen = smooth(track.map((s) => ({ t: s.t, ...sourceSpot(s.face!, req.follow) }))), link = videoLinks(x.p, times).get(clip.id);
    const when = [...new Set([...film, ...movingTimes(clip, ct, link, film[0], film[film.length - 1], x.p.meta.fps)])].sort((a, b) => a - b);
    const spots = when.map((t) => spotOnFilm(spotAt(seen, t), clip, ct, W, H, src, link));
    // the block's own anchor (where it draws the sticker) and width, from its params and their defaults
    const defs = registry.item(found.type)?.params ?? [], param = (k: string, d: number) => Number(found.params[k] ?? defs.find((p) => p.key === k)?.default ?? d);
    // a sticker's size is a share of the film's short side; the keys want it as a share of the width
    const anchor = { x: param('x', 0.5), y: param('y', 0.5), width: (param('size', 20) / 100) * (Math.min(W, H) / W) };
    const cover = req.follow === 'face' && found.type === 'common.emoji' && (found.params.mode ?? defs.find((p) => p.key === 'mode')?.default) === 'cover';
    const keys = stickerKeys(spots, at.start, anchor, cover ? FOLLOW_SIZE.cover : FOLLOW_SIZE[req.follow], cover ? COVER_LIFT : 0, W / H);
    found.transform = { x: keys[0].x, y: keys[0].y, scale: keys[0].scale, ox: anchor.x, oy: anchor.y, keys };
    x.notes.push(`${req.id} 跟著 ${clip.source} 的${req.follow === 'mouth' ? '嘴' : '臉'}移動（${keys.length} 個關鍵格）${lost.length ? `；${lost.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} 秒`).join('、')} 看不到臉，停在最後的位置` : ''}`);
  }
}
