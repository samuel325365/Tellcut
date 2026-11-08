// The Cut API's framing helpers: where a picture sits (a frame, a shape) and the main-track clip under a common.flatlay desk.
import { addItem, allItems, r6, resolveTimes, type Project, type VideoItem } from '@tellcut/engine';
import { flatlayClip } from '@tellcut/plugin-common';

export type Frame = [number, number, number, number];
/** a polygon the picture is cut to, corners in fractions of its frame (common.comic's comicShape(n, params)) */
export type Shape = Array<[number, number]>;
export function checkShape(shape: Shape, what: string) {
  if (!Array.isArray(shape) || shape.length < 3 || !shape.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)))
    throw new Error(`${what}：要給至少三個角 [[x, y], …]（frame 裡的比例）`);
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

/** the item's frame (its own, else the panel's with its rounded corners, else the whole screen) and its shape: a shape is in
 *  fractions of whichever frame that is, so it is kept in all three (the player cuts a full-screen item to it as well) */
export function frameFields(layout: { frame: Frame; radius: number } | null, frame?: Frame, shape?: Shape) {
  if (shape !== undefined) checkShape(shape, 'shape');
  const cut = shape ? { shape } : {};
  return frame ? { frame, ...cut } : layout ? { frame: layout.frame, radius: layout.radius, ...cut } : cut;
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
