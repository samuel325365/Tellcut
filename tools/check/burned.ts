// Text burned into the footage against the text we put on top (toolkit phase 2d): where the footage's own caption lands on the
// finished picture, and whether our words sit on it or a word we bleep is written out in it.
import { cropAt, coverPlacement, resolveTheme, resolveTimes, type Project, type VideoItem } from '@tellcut/engine';
import type { Burned } from '@tellcut/media-node';
import { timecode1 } from '@tellcut/media-node';
import type { Finding } from './rules.ts';
import type { TextBox } from './visual.ts';
import { pictureTimeAt } from '../cut/frames.ts';

interface Rect { x: number; y: number; w: number; h: number }
const area = (r: Rect) => Math.max(0, r.w) * Math.max(0, r.h);
const inter = (a: Rect, b: Rect): Rect => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y }; };

/** Where a source's caption row lands on the finished picture at film time `t`, in project pixels (null: the clip shows no caption then). */
export function burnedRectAt(p: Project, item: VideoItem, start: number, end: number, burned: Burned | null | undefined, t: number): Rect | null {
  const c = burned?.caption;
  if (!c) return null;
  const src = p.sources[item.source], local = t - start, srcT = pictureTimeAt(item, local);   // a frozen clip holds its freeze frame
  if (!src || !c.spans.some(([a, b]) => srcT >= a && srcT < b)) return null;
  const { width: W, height: H } = p.meta, [fx, fy, fw, fh] = item.frame, frame: Rect = { x: fx * W, y: fy * H, w: fw * W, h: fh * H };
  const box = coverPlacement(src.width, src.height, frame.w, frame.h, cropAt(item.crop, local, end - start));
  const [rx, ry, rw, rh] = c.rect;
  const r: Rect = { x: frame.x + box.left + rx * box.width, y: frame.y + box.top + ry * box.height, w: rw * box.width, h: rh * box.height };
  const seen = inter(r, frame);                                   // the part the frame does not cut off
  return area(seen) > 0 ? seen : null;
}

const OVERLAP = 0.25;

/** A progress bar on the bottom safe margin (common.progress at position bottom, y left at -1), in project pixels: the band its
 *  thickness takes, or the progress lane (3.5 % of the height) when that is more (dots, paws, a runner or a vine stand taller than
 *  the line). Not text, so the page's boxes never show it; avoidBurned moves our captions off the footage's row and leaves it there. */
export function bottomBarRect(p: Project, params: Record<string, unknown> | undefined): Rect | null {
  const q = params ?? {}, y = typeof q.y === 'number' ? q.y : -1;
  if (q.position !== 'bottom' || y >= 0 || q.mode === 'rocket' || q.mode === 'ring' || q.mode === 'stamps' || q.mode === 'battery') return null;
  const { width: W, height: H } = p.meta, safe = resolveTheme(p.meta.theme, p.meta).safe, th = (typeof q.thickness === 'number' ? q.thickness : 12) * Math.min(W, H) / 1080;
  const h = Math.max(th, 0.035 * H), bottom = (1 - safe.bottom) * H;
  return { x: safe.side * W, y: bottom - h, w: W * (1 - 2 * safe.side), h };
}
/** The checks, from the text boxes the page measured at sample times. */
export function burnedChecks(p: Project, burned: Record<string, Burned | null>, samples: Array<{ t: number; boxes: TextBox[] }>): Finding[] {
  if (!Object.values(burned).some((b) => b?.caption)) return [];
  const times = resolveTimes(p);
  const videos = p.tracks.filter((t) => t.kind === 'video' && !t.muted).flatMap((t) => t.items as VideoItem[]);   // a hidden track shows no caption
  const textOf = new Map<string, string>();
  for (const t of p.tracks) if (t.kind === 'overlay' || t.kind === 'scene') for (const it of t.items as Array<{ id: string; params?: { text?: unknown } }>) if (typeof it.params?.text === 'string') textOf.set(it.id, it.params.text);
  const over = new Map<string, number[]>(), leak = new Map<string, number[]>(), bars = new Map<string, number[]>(), shown: number[] = [];
  const barItems = p.tracks.filter((t) => t.kind === 'overlay' && !t.muted).flatMap((t) => t.items as Array<{ id: string; type: string; params?: Record<string, unknown> }>)
    .filter((it) => it.type === 'common.progress').map((it) => ({ id: it.id, rect: bottomBarRect(p, it.params), tm: times.get(it.id) })).filter((b) => b.rect && b.tm);
  for (const s of samples) {
    const live = videos.map((v) => ({ v, tm: times.get(v.id)! })).filter(({ v, tm }) => tm && s.t >= tm.start && s.t < tm.end && burned[v.source]?.caption);
    const zones = live.map(({ v, tm }) => burnedRectAt(p, v, tm.start, tm.end, burned[v.source], s.t)).filter((r): r is Rect => !!r);
    if (!zones.length) continue;
    shown.push(s.t);
    // a bar on the bottom margin over the row: most of its height inside it
    for (const b of barItems) if (s.t >= b.tm!.start && s.t < b.tm!.end && zones.some((z) => { const i = inter(b.rect!, z); return i.w > 0 && i.h >= b.rect!.h * 0.5; })) { if (!bars.has(b.id)) bars.set(b.id, []); bars.get(b.id)!.push(s.t); }
    for (const b of s.boxes) {
      if (videos.some((v) => v.id === b.id)) continue;
      const hit = b.rects.some((r) => zones.some((z) => area(inter(r, z)) / Math.max(1, area(r)) >= OVERLAP));
      if (hit) { if (!over.has(b.id)) over.set(b.id, []); over.get(b.id)!.push(s.t); }
      if (/\{[^}]+\}/.test(textOf.get(b.id) ?? '')) { if (!leak.has(b.id)) leak.set(b.id, []); leak.get(b.id)!.push(s.t); }
    }
  }
  const span = (ts: number[]): [number, number] => [Math.min(...ts), Math.max(...ts)];
  const out: Finding[] = [];
  for (const [id, ts] of over) out.push({ level: 'warn', t: span(ts), ids: [id], msg: `我們的字疊在原片自己燒進畫面的字幕上（${id}，約 ${timecode1(span(ts)[0])} 起）；放大裁掉下緣、字幕改放上方，或換鏡頭` });
  for (const [id, ts] of bars) out.push({ level: 'warn', t: span(ts), ids: [id], msg: `進度條壓在原片自己燒進畫面的字幕上（${id}，約 ${timecode1(span(ts)[0])} 起）；字幕移到上方時它不會跟著移，改成 position: 'top'，或放大裁掉原片的字幕列` });
  for (const [id, ts] of leak) out.push({ level: 'warn', t: span(ts), ids: [id], msg: `要打碼的字，原片同時段的字幕可能直接寫出來了（${id}，約 ${timecode1(span(ts)[0])} 起）；消音可能洩底，先看縮圖確認或換鏡頭` });
  if (shown.length) out.push({ level: 'note', t: span(shown), msg: `原片自己的字幕在成品裡看得到（取樣的 ${shown.length} 個時間點，約 ${timecode1(span(shown)[0])}–${timecode1(span(shown)[1])}）；再加我們的字幕會變兩層。要乾淨：c.clip 加 avoidBurned: true，或換鏡頭` });
  return out;
}
