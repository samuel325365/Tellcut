// The face side of Cut.save() (toolkit phase 5): clips without a crop of their own focus on the faces in them, clips avoidBurned
// cropped keep the faces in them in frame, and stickers asked to follow a mouth or a face get their transform keys.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRegistry, r6, resolveTimes, type Crop, type Project, type SceneItem, type VideoItem } from '@tellcut/engine';
import { FACE_STEP, faceKey, facesAt, type FacesProvider } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { COVER_LIFT, FOLLOW_SIZE, onFilm, pickFace, smooth, stickerKeys, trackFace, type Who } from './follow.ts';
import { avoidBurnedMove, spreadMove } from './avoid.ts';
import type { Rect } from './view.ts';

/** what the face passes work on: the project, its folder, the detector (undefined: tellcut/providers.json's) and Cut's notes */
export interface FaceCtx { p: Project; dir: string; provider?: FacesProvider; notes: string[] }
/** a sticker asked to follow a mouth or a face (Cut.effect({ follow })) */
export interface FollowReq { id: string; follow: 'mouth' | 'face'; who: Who; clip?: string }

/** a clip avoidBurned cropped (Cut.clip): its pieces (tighten's), the stretch of the source, the crop asked for, the geometry */
export interface BurnedAsk { ids: string[]; source: string; from: number; to: number; want: { from: Crop; to: Crop }; geo: Parameters<typeof avoidBurnedMove>[0] }

/** Faces at source times; a detector that fails is a note, not a failed cut. */
async function faces(x: FaceCtx, path: string, times: number[], what: string) {
  try { return await facesAt(x.dir, path, times, { provider: x.provider }); }
  catch (e) { x.notes.push(`${what}：人臉偵測失敗（${(e as Error).message.split('\n')[0].slice(0, 120)}），沒有用到它`); return null; }
}
/** the source file of a clip's source, and its size */
function sourceOf(x: FaceCtx, id: string) { const s = x.p.sources[id]; return { path: resolve(x.dir, s.path), width: s.width, height: s.height, image: s.kind === 'image' }; }

/**
 * Clips without a crop whose picture is another shape than their frame: the crop's focus goes to the middle of the faces in it
 * (the largest face at a quarter, half and three quarters of the clip), not the centre. A picture wider than its frame (a landscape
 * shot in a portrait film) is cropped at the sides, so the focus moves sideways; a taller one (portrait in landscape) moves up or down.
 * Each group is one clip (or the pieces tighten made of it), focused alike.
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
    if (fits || src.image || all.some((c) => c.crop.from[axis] !== 0.5 || c.crop.to[axis] !== 0.5)) continue;
    if (!existsSync(src.path)) continue;   // footage not on this PC
    // a quarter, half and three quarters into the clip (into all its pieces, laid end to end)
    const lens = all.map((c) => (c.end - c.start) * c.speed), whole = lens.reduce((a, b) => a + b, 0);
    const times = [0.25, 0.5, 0.75].map((f) => { let t = f * whole; for (const [i, c] of all.entries()) { if (t <= lens[i] || i === all.length - 1) return c.in + Math.min(t, lens[i]); t -= lens[i]; } return it.in; });
    const found = await faces(x, src.path, times, id);
    if (!found) continue;
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
 * a face, the clip keeps the crop asked for and a note says so (check then reports the caption). No faces: the crop stays.
 */
export async function resolveBurnedFaces(x: FaceCtx, asks: BurnedAsk[], autoFocus: string[][]) {
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
    if (r.why) x.notes.push(`avoidBurned：${a.source}（${id}）裁掉燒進去的字幕會切到畫面裡的人臉，照原本的裁切；字幕改放畫面上方或換鏡頭`);
    else if (JSON.stringify(all.map((c) => [c.crop.from, c.crop.to])) !== before)
      x.notes.push(`avoidBurned：${a.source}（${id}）裁掉燒進去的字幕時保住人臉（x=${r6(move.from.x)}、y=${r6(move.from.y)}、放大 ${r6(move.from.zoom)} 倍）`);
  }
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
    const srcTime = (t: number) => (src.image ? 0 : clip.in + (t - ct.start) * clip.speed);
    if (!existsSync(src.path)) { x.notes.push(`${req.id}：${clip.source} 不在這台電腦上，貼圖留在原本的位置`); continue; }
    const fs = await faces(x, src.path, film.map(srcTime), req.id);
    if (!fs) continue;   // the detector failed: faces() said so
    const { track, lost } = trackFace(film.map((t) => ({ t, faces: fs.get(faceKey(srcTime(t))) ?? [] })), req.who);
    if (!track.some((s) => s.face)) { x.notes.push(`${req.id}：${clip.source} 這段找不到臉，貼圖留在原本的位置`); continue; }
    const spots = smooth(track.map((s) => onFilm(s.face!, req.follow, clip, ct, s.t, W, H, src)));
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
