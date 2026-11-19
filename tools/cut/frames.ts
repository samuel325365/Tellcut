// The Cut API's framing helpers: where a picture sits (a frame, a shape) and the main-track clip under a common.flatlay desk.
import { addItem, allItems, cropAt, isNamedShape, NamedShapeZ, r6, resolveTimes, SHAPE_PARAMS, SHAPE_TYPES, type Crop, type NamedShape, type Project, type ShapeType, type VideoItem } from '@tellcut/engine';
import { secs, type SrcTime } from '@tellcut/plugin-common/speech';
import { flatlayClip } from '@tellcut/plugin-common';
import { viewCrop, viewHits, viewRect, type Rect } from './view.ts';

/** The source second a video clip's picture shows `local` seconds into it: past freezeAt it holds the frame there (engine
 *  videoState's mediaLocal); its sound goes on. Burned captions, leaks, black bars and faces read the picture, so they use this. */
export const pictureTimeAt = (clip: { in: number; speed: number; freezeAt?: number | null }, local: number) =>
  clip.in + (clip.freezeAt != null ? Math.min(local, clip.freezeAt) : local) * clip.speed;
/** How many seconds of its source a video clip's picture runs through (a frozen one stops at its freeze point). */
export const pictureLen = (clip: { start: number; end: number; speed: number; freezeAt?: number | null }) =>
  (clip.freezeAt != null ? Math.min(clip.end - clip.start, clip.freezeAt) : clip.end - clip.start) * clip.speed;

export type Frame = [number, number, number, number];
/** a polygon the picture is cut to, corners in fractions of its frame (common.comic's comicShape(n, params)) */
export type Polygon = Array<[number, number]>;
/** what c.clip / c.photo / c.beside take as a shape: a polygon, a named shape's type ('circle'), or the named shape itself
 *  ({ type: 'star', points: 6 }); written to project.json as a polygon or a named shape object */
export type Shape = Polygon | ShapeType | NamedShape;
/** the line round a window: true for the engine's default (8 px at a 1080 short side, white), false none */
export type OutlineIn = boolean | { width?: number; color?: string };
/** the soft shadow under a window: true for the engine's default, false none */
export type ShadowIn = boolean | { blur?: number; y?: number; opacity?: number };

const listOf = (xs: readonly string[]) => xs.join('、');
/**
 * A shape given to the Cut API, checked and as project.json keeps it. As strict as transitions: an unknown type, a key the type
 * does not have, a value out of its range or of the wrong kind is said at once, by name, rather than failing at save() with zod's
 * words or quietly doing something else. The parameters come from the engine's SHAPE_PARAMS, so a new one needs no change here.
 */
export function checkShape(shape: unknown, what: string): Polygon | NamedShape {
  if (Array.isArray(shape)) {
    if (shape.length < 3 || !shape.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)))
      throw new Error(`${what}：要給至少三個角 [[x, y], …]（frame 裡的比例）`);
    return shape as Polygon;
  }
  const o: Record<string, unknown> | null = typeof shape === 'string' ? { type: shape } : shape && typeof shape === 'object' ? shape as Record<string, unknown> : null;
  if (!o) throw new Error(`${what} 要是形狀名稱（例如 'circle'）、{ type: …, 參數 } 或至少三個角 [[x, y], …]，現在是 ${JSON.stringify(shape)}`);
  const type = o.type;
  if (typeof type !== 'string' || !(SHAPE_TYPES as readonly string[]).includes(type))
    throw new Error(`${what}：沒有 ${JSON.stringify(type)} 這種形狀（只有 ${listOf(SHAPE_TYPES)}）`);
  const params = SHAPE_PARAMS[type as ShapeType], keys = params.map((p) => p.key);
  for (const k of Object.keys(o)) if (k !== 'type' && !keys.includes(k))
    throw new Error(`${what}：${type} 沒有「${k}」${keys.length ? `（只有 ${listOf(keys)}）` : '（這個形狀沒有參數）'}`);
  for (const p of params) {
    const v = o[p.key], at = `${what} 的 ${type}.${p.key}`;
    if (v === undefined) {
      if (p.required) throw new Error(typeof shape === 'string' ? `${what}：${type} 形狀要給字，寫成 { type: '${type}', ${p.key}: 'ROMA' }` : `${at} 一定要給`);
      continue;
    }
    if (p.kind === 'int' || p.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || (p.kind === 'int' && !Number.isInteger(v)) || v < p.min! || v > p.max!)
        throw new Error(`${at} 要是 ${p.min}–${p.max} 的${p.kind === 'int' ? '整數' : '數字'}，現在是 ${JSON.stringify(v)}`);
    } else if (p.kind === 'enum') {
      if (typeof v !== 'string' || !p.options!.includes(v)) throw new Error(`${at} 只能是 ${listOf(p.options!)}，現在是 ${JSON.stringify(v)}`);
    } else if (p.kind === 'sides') {
      if (typeof v !== 'string' || !/^(?!.*(.).*\1)[tblr]{1,4}$/.test(v)) throw new Error(`${at} 是 t（上）、b（下）、l（左）、r（右）的組合，每個字母最多一次，例如 'tb'，現在是 ${JSON.stringify(v)}`);
    } else if (typeof v !== 'string' || !v.trim()) throw new Error(`${at} 要是字，現在是 ${JSON.stringify(v)}`);
    else if (v.split('\n').length > 2 || v.split('\n').some((l) => !l.trim())) throw new Error(`${at} 最多兩行（用一個 \\n 分行，不能有空行），現在是 ${JSON.stringify(v)}`);
    else if (v.length > 60) throw new Error(`${at} 最多 60 個字元，現在 ${v.length} 個；字少才看得到畫面`);
  }
  // the engine's own schema has the last word (what the editor and the player read)
  return NamedShapeZ.parse(o);
}

/** an outline given to the Cut API, as project.json keeps it ({} draws the engine's default) */
export function checkOutline(o: unknown, what: string): { width?: number; color?: string } | undefined {
  if (o === undefined || o === false) return undefined;
  if (o === true) return {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what} 的 outline 要是 true 或 { width?, color? }，現在是 ${JSON.stringify(o)}`);
  const r = o as Record<string, unknown>;
  for (const k of Object.keys(r)) if (k !== 'width' && k !== 'color') throw new Error(`${what} 的 outline 沒有「${k}」（只有 width、color）`);
  if (r.width !== undefined && (typeof r.width !== 'number' || !Number.isFinite(r.width) || r.width <= 0 || r.width > 100))
    throw new Error(`${what} 的 outline.width 是線寬（1080 短邊的 px），要大於 0、最多 100，現在是 ${JSON.stringify(r.width)}`);
  if (r.color !== undefined && (typeof r.color !== 'string' || !r.color.trim())) throw new Error(`${what} 的 outline.color 要是顏色字串（例如 '#ffffff'），現在是 ${JSON.stringify(r.color)}`);
  return { ...(r.width !== undefined ? { width: r.width as number } : {}), ...(r.color !== undefined ? { color: r.color as string } : {}) };
}

/** a shadow given to the Cut API, as project.json keeps it */
export function checkShadow(o: unknown, what: string): true | { blur?: number; y?: number; opacity?: number } | undefined {
  if (o === undefined || o === false) return undefined;
  if (o === true) return true;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what} 的 shadow 要是 true 或 { blur?, y?, opacity? }，現在是 ${JSON.stringify(o)}`);
  const r = o as Record<string, unknown>, range = { blur: [0, 300], y: [-300, 300], opacity: [0, 1] } as const;
  for (const k of Object.keys(r)) if (!(k in range)) throw new Error(`${what} 的 shadow 沒有「${k}」（只有 blur、y、opacity）`);
  for (const [k, [lo, hi]] of Object.entries(range)) {
    const v = r[k];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)) throw new Error(`${what} 的 shadow.${k} 要在 ${lo}–${hi} 之間，現在是 ${JSON.stringify(v)}`);
  }
  return Object.keys(r).length ? r as { blur?: number; y?: number; opacity?: number } : true;
}

/** the window's dressing fields of a clip (shape, outline, shadow), checked */
export interface Dress { shape?: Shape; outline?: OutlineIn; shadow?: ShadowIn }
export function dressFields(o: Dress, what: string) {
  const shape = o.shape === undefined ? undefined : checkShape(o.shape, `${what} 的 shape`);
  const outline = checkOutline(o.outline, what), shadow = checkShadow(o.shadow, what);
  return { ...(shape ? { shape } : {}), ...(outline ? { outline } : {}), ...(shadow ? { shadow } : {}) };
}
/** A frame is fractions of the screen: pixels (a 1080 × 1920 rectangle) pushed the whole picture off screen with no error,
 *  and the r3b-baking chat spent several turns finding it from the contact sheet. Some bleed past the edges is allowed. */
export function checkFrame(f: Frame | undefined, what: string): void {
  if (!f) return;
  const [x, y, w, h] = f;
  if (f.length !== 4 || f.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw new Error(`${what} 的 frame 要是 [x, y, 寬, 高] 四個數字`);
  if (f.some((n) => Math.abs(n) > 1.5)) throw new Error(`${what} 的 frame [${f.join(', ')}] 看起來是像素：frame 是畫面的比例（0–1），例如 [0.08, 0.2, 0.84, 0.47]`);
  if (w <= 0 || h <= 0) throw new Error(`${what} 的 frame 寬、高要大於 0`);
  if (x >= 1 || y >= 1 || x + w <= 0 || y + h <= 0) throw new Error(`${what} 的 frame [${f.join(', ')}] 整個在畫面外`);
}

/** the item's frame (its own, else the panel's with its rounded corners, else the whole screen) and its dressing: a shape is in
 *  fractions of whichever frame that is, so it is kept in all three (the player cuts a full-screen item to it as well). A named
 *  shape in the panel's frame does not take the panel's radius: the engine ignores it there, and a radius left in project.json
 *  would come back as soon as the shape is taken off in the editor, a rounded corner nobody asked for. */
export function frameFields(layout: { frame: Frame; radius: number } | null, frame: Frame | undefined, dress: Dress, what: string) {
  const d = dressFields(dress, what);
  return frame ? { frame, ...d } : layout ? { frame: layout.frame, ...(isNamedShape(d.shape) ? {} : { radius: layout.radius }), ...d } : d;
}

/** Cut.flatlayClip's work (see there): the clip and its sound added to `p`; returns its id and where it ends on the film */
export function addFlatlayClip(p: Project, src: (id: string) => Project['sources'][string], itemId: string, index: number, o: { gain?: number }): { id: string; end: number } {
  const it = allItems(p).find((x) => (x.item as { id: string }).id === itemId)?.item as { type?: string; params?: Record<string, unknown> } | undefined;
  if (!it || it.type !== 'common.flatlay') throw new Error(`flatlayClip：${itemId} 不是 common.flatlay 項目`);
  const t = resolveTimes(p).get(itemId)!, dur = r6(t.end - t.start), params = it.params ?? {};
  // the source's size for the crop: the object's shot names it
  const probe = flatlayClip(params, index, 1920, 1080, p.meta.width, p.meta.height, dur);
  if (!probe) throw new Error(`flatlayClip：${itemId} 沒有第 ${index} 樣東西，或它沒有鏡頭、是定格（index 從 0 數）`);
  const s = src(probe.source);
  const c = flatlayClip(params, index, s.width, s.height, p.meta.width, p.meta.height, dur)!;
  const start = r6(t.start + c.at), len = r6(Math.min(c.len, s.duration - c.from));
  if (!(len > 0)) throw new Error(`flatlayClip：第 ${index} 樣東西在項目裡沒有時間（at ${c.at} 秒、項目長 ${dur} 秒）`);
  const times = resolveTimes(p);
  const block = (p.tracks.find((x) => x.id === 'v1')!.items as VideoItem[]).find((v) => { const vt = times.get(v.id)!; return vt.start < start + len - 1e-6 && vt.end > start + 1e-6; });
  if (block) { const bt = times.get(block.id)!; throw new Error(`flatlayClip：主軌 ${start}–${r6(start + len)} 秒被 ${block.id}（${bt.start}–${bt.end} 秒）擋住`); }
  const id = addItem(p, { track: 'v1', item: { source: c.source, in: c.from, speed: 1, start, end: r6(start + len), crop: { from: c.crop, to: c.crop } } });
  if (s.audio !== false) {
    const edge = r6(Math.min(0.1, len / 4));
    addItem(p, { track: 'orig', item: { source: c.source, in: c.from, rate: 1, start: 0, end: len, gain: o.gain ?? 0, fadeIn: edge, fadeOut: edge, parent: id } });
  }
  return { id, end: start + len };
}

/** the whole picture, still */
export const STILL: Crop = { x: 0.5, y: 0.5, zoom: 1 };
/** a clip's crop: the full move, or the short form — where it starts (x, y, zoom; default the centre at 1) and what changes by the
 *  end (`to`: any of x, y, zoom; `push`: the zoom times this) — that every cut.ts used to write its own helper for */
export type CropIn = { from: Crop; to: Crop } | { x?: number; y?: number; zoom?: number; to?: Partial<Crop>; push?: number };
export function cropOf(c: CropIn | undefined, what: string): { from: Crop; to: Crop } | undefined {
  if (!c) return undefined;
  if ('from' in c) return c;
  const from: Crop = { x: c.x ?? 0.5, y: c.y ?? 0.5, zoom: c.zoom ?? 1 };
  const to: Crop = { x: c.to?.x ?? from.x, y: c.to?.y ?? from.y, zoom: c.to?.zoom ?? r6(from.zoom * (c.push ?? 1)) };
  for (const [k, v] of Object.entries({ x: from.x, y: from.y, zoom: from.zoom, 'to.x': to.x, 'to.y': to.y, 'to.zoom': to.zoom }))
    if (typeof v !== 'number' || !Number.isFinite(v) || (k.endsWith('zoom') && v <= 0)) throw new Error(`${what} 的 crop.${k} 要是數字${k.endsWith('zoom') ? '（大於 0）' : ''}，現在是 ${v}`);
  return { from, to };
}

/** a track `id` made at `index` when the project has none yet (sound tracks start at 0 dB) */
export function addTrack(p: Project, id: string, kind: string, name: string, index: number) {
  if (!p.tracks.some((t) => t.id === id)) p.tracks.splice(index, 0, (kind === 'sfx' || kind === 'music' ? { id, kind, name, gain: 0, items: [] } : { id, kind, name, items: [] }) as Project['tracks'][number]);
}

type Source = Project['sources'][string];
export type ViewOpts = { at: [number, number]; zoom?: number; frame?: Frame; keepOut?: Rect[]; burned?: boolean; what?: string };
/** Cut.view's work (see there): `size` is the frame's width and height in pixels, `cap` the burned-in caption row the inventory
 *  found in the source (none: nothing to keep out but `keepOut`) */
export function viewOf(s: Source, size: [number, number], source: string, o: ViewOpts, cap: { rect: number[] } | null | undefined): Crop {
  const [W, H] = size, crop = viewCrop(s.width, s.height, W, H, o.at[0], o.at[1], o.zoom ?? 1), view = viewRect(s.width, s.height, W, H, crop);
  const keep: Array<[Rect, string]> = [...(o.keepOut ?? []).map((r) => [r, '禁區'] as [Rect, string]),
    ...(cap ? [[[cap.rect[0], cap.rect[1] - 0.012, cap.rect[0] + cap.rect[2], cap.rect[1] + cap.rect[3]], '原片燒進去的字幕'] as [Rect, string]] : [])];
  const f = (r: Rect) => r.map((x) => x.toFixed(3)).join(', ');
  for (const [r, name] of keep) if (viewHits(view, [r]).length)
    throw new Error(`view(${source}${o.what ? `，${o.what}` : ''})：畫面會露出${name}（看到的範圍 ${f(view)}，${name} ${f(r)}）；把 at 移開或放大 zoom`);
  return crop;
}

export type BandsOpts = { len: number; from?: SrcTime[]; crops?: Array<{ from: Crop; to: Crop }>; count?: number; every?: number; ratio?: number; gap?: number };
/** Cut.bands' work (see there): `first` puts band 0 on the main track at `t0` (the cursor) and says its id and where it ends */
export function addBands(p: Project, s: Source, source: string, o: BandsOpts, t0: number, first: (from: number, frame: Frame) => { id: string; end: number }): string[] {
  const n = Math.max(1, Math.round(o.count ?? o.from?.length ?? o.crops?.length ?? 3)), { width: W, height: H } = p.meta;
  const gap = o.gap ?? 20 / 1920, bh = Math.min((1 - (n - 1) * gap) / n, W / (o.ratio ?? 2.7) / H), top = (1 - n * bh - (n - 1) * gap) / 2;
  const frame = (i: number): Frame => [0, r6(top + i * (bh + gap)), 1, r6(bh)], every = o.every ?? o.len / (n + 1);
  const at = (i: number) => secs(o.from?.[i] ?? 0, `c.bands('${source}') 的 from[${i}]`);
  const one = first(at(0), frame(0)), ids = [one.id], end = one.end, v1 = p.tracks.findIndex((t) => t.id === 'v1');
  for (let i = 1; i < n; i++) {
    const track = `v${i + 1}`, start = r6(Math.min(end - 1 / p.meta.fps, t0 + i * every));
    addTrack(p, track, 'video', `Layer ${i + 1}`, v1 + i);
    const from = Math.max(0, Math.min(at(i), s.duration - (end - start)));
    ids.push(addItem(p, { track, item: { source, in: r6(from), speed: 1, start, end, crop: o.crops?.[i] ?? { from: STILL, to: STILL }, frame: frame(i) } }));
  }
  return ids;
}

export type BesideOpts = { frame: Frame; crop?: CropIn; source?: string; offset?: number; track?: string } & Dress;
/** Cut.beside's work (see there): `src` finds a source or throws */
export function addBeside(p: Project, src: (id: string) => Source, clipIds: string | string[], o: BesideOpts): string[] {
  const ids = Array.isArray(clipIds) ? clipIds : [clipIds], what = `c.beside(${JSON.stringify(clipIds)})`;
  if (!o?.frame) throw new Error(`${what}：要給 frame（這段第二個畫面放的框，例如 duoWindow('b', 參數)）`);
  checkFrame(o.frame, what);
  const dress = dressFields(o, what);
  const track = o.track ?? 'v2', offset = o.offset ?? 0;
  if (track === 'v1') throw new Error(`${what}：track 不能是主軌 v1（第二個畫面在自己的影片軌上，預設 v2）`);
  const have = p.tracks.find((t) => t.id === track);
  if (have && have.kind !== 'video') throw new Error(`${what}：${track} 是 ${have.kind} 軌，不是影片軌`);
  if (o.source !== undefined) src(o.source);
  const v1 = p.tracks.find((t) => t.id === 'v1')!.items as VideoItem[], times = resolveTimes(p);
  const clips = ids.map((id) => { const c = v1.find((i) => i.id === id); if (!c) throw new Error(`${what}：主軌上沒有「${id}」`); return c; })
    .sort((a, b) => times.get(a.id)!.start - times.get(b.id)!.start);
  const move = cropOf(o.crop, what) ?? { from: STILL, to: STILL };
  const total = clips.reduce((n, c) => n + (c.end - c.start), 0);
  addTrack(p, track, 'video', 'Beside', p.tracks.findIndex((t) => t.id === 'v1') + 1);
  let acc = 0;
  return clips.map((c) => {
    const source = o.source ?? c.source, s = src(source), { start, end } = times.get(c.id)!, len = end - start;
    const from = s.kind === 'image' ? 0 : r6(c.in + offset);
    if (s.kind !== 'image' && (from < 0 || from + len * c.speed > s.duration + 1e-6))
      throw new Error(`${what}：${source} 沒有 ${from.toFixed(2)}–${(from + len * c.speed).toFixed(2)} 秒（素材長 ${s.duration} 秒）；改 offset`);
    const crop = clips.length > 1 && total > 0 && !(move as { keys?: unknown[] }).keys?.length ? { from: cropAt(move, acc / total, 1), to: cropAt(move, (acc + len) / total, 1) } : move;
    acc += len;
    return addItem(p, { track, item: { source, in: from, speed: c.speed, start: r6(start), end: r6(end), crop, frame: o.frame, ...dress, ...(c.transitionIn ? { transitionIn: c.transitionIn } : {}) } });
  });
}
