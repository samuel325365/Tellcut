// avoidBurned's fallback (Cut.save()): when a clip could not be cropped clear of the footage's own caption row (the zoom it needs is
// past the footage's resolution, or clearing it would cut a face), our captions sitting on that row over the clip move to the top
// of the frame instead of being drawn on top of it. Only what really sits on it moves: a caption the author placed never does, nor
// one whose top place is taken (a title, the hook's tags, a header) or would land on the row as well (a clip in a window up there).
// Pure: Cut.save() hands the items in and applies what comes back.
import { coverPlacement, type Crop } from '@tellcut/engine';
import { isCaption, placedByAuthor, type CaptionItem } from './under-panel.ts';

/** [from, to] as fractions of the frame's width or height */
export type Span = [number, number];
/** where a source's caption row lands on the film over one clip */
export interface BurnedZone { x: Span; y: Span }

const crosses = (a: Span, b: Span) => a[0] < b[1] - 1e-6 && b[0] < a[1] - 1e-6;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Where the caption row `rect` ([x, y, w, h] of the source) lands on the film over a clip in `frame` ([x, y, w, h] of the film), the
 * rows every crop of its move shows taken together (its start, keys and end: the move runs through them); null when the frame never
 * shows it. Like check's burnedRectAt, but over the whole clip.
 */
export function burnedZone(o: { srcW: number; srcH: number; W: number; H: number; frame: [number, number, number, number]; crops: Crop[]; rect: [number, number, number, number] }): BurnedZone | null {
  const [fx, fy, fw, fh] = o.frame, [rx, ry, rw, rh] = o.rect;
  let zone: BurnedZone | null = null;
  for (const c of o.crops) {
    const b = coverPlacement(o.srcW, o.srcH, fw * o.W, fh * o.H, c);
    // the row in film fractions, cut to the frame
    const x: Span = [Math.max(fx, fx + (b.left + rx * b.width) / o.W), Math.min(fx + fw, fx + (b.left + (rx + rw) * b.width) / o.W)];
    const y: Span = [Math.max(fy, fy + (b.top + ry * b.height) / o.H), Math.min(fy + fh, fy + (b.top + (ry + rh) * b.height) / o.H)];
    if (x[1] - x[0] <= 1e-6 || y[1] - y[0] <= 1e-6) continue;
    zone = zone ? { x: [Math.min(zone.x[0], x[0]), Math.max(zone.x[1], x[1])], y: [Math.min(zone.y[0], y[0]), Math.max(zone.y[1], y[1])] } : { x, y };
  }
  return zone;
}

/** a block parameter as the top check reads it: its key, label and default */
export interface ParamInfo { key: string; label?: string; default?: unknown }

/**
 * Whether an overlay item sits in the top band of the frame (down to `bandBottom`), from its params with the defaults (and a caption
 * or title template) filled in: a heading laid out at the top or in a corner, a `y` / `top` above `bandBottom` (whatever edge or
 * centre the block means by it), `position: 'top'`, a corner at the top, or a `y` / `top` left at -1 where the block's own label
 * says -1 is the top safe margin (badge, header, scoreboard…). Not a layout solver: a transform is not looked at.
 */
export function sitsAtTop(p: Record<string, unknown>, defs: ParamInfo[], bandBottom: number): boolean {
  if (p.layout === 'top' || p.layout === 'corner') return true;   // common.heading
  if (p.position === 'top' || p.corner === 'tl' || p.corner === 'tr') return true;
  for (const k of ['y', 'top']) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v >= 0 && v < bandBottom) return true;
    // -1 = "the block's own place": the top when its label says so and no `position` picks it instead (common.progress)
    const label = defs.find((d) => d.key === k)?.label ?? '';
    if (v < 0 && !defs.some((d) => d.key === 'position') && /-1＝[^；）]*(安全區上緣|上方安全區)/.test(label)) return true;
  }
  return false;
}

/** a clip avoidBurned left as asked: its film time, where the row lands, and whether its captions may move (`avoidBurned: 'crop'`: no) */
export interface GaveUpClip { id: string; start: number; end: number; zone: BurnedZone; move: boolean }
/** a caption on the timeline, its film times and its params as drawn (defaults and template filled in) */
export interface TimedCaption extends CaptionItem { start: number; end: number; eff: Record<string, unknown> }
/** another overlay item over the same time: whether it sits at the top is asked with sitsAtTop */
export interface TimedItem { id: string; start: number; end: number; eff: Record<string, unknown>; defs: ParamInfo[] }
/** where a caption moves (for the clip whose row it sat on): params merged into its own (common.caption) or a transform (core.caption, moved from the bottom margin) */
export type TopMove = { id: string; clip: string } & ({ params: Record<string, unknown> } | { transform: { x: number; y: number; scale: number } });
/** why a caption over the row stayed: the author placed it, the top is taken (or is on the row too), the clip said `avoidBurned: 'crop'` */
export type Stay = 'placed' | 'taken' | 'crop';

/**
 * The captions over clips avoidBurned gave up on that sit on the caption row (their two-line height at the place they are drawn
 * crossing the row), and where each goes: to the top of the frame (inside `safe.top`), or nowhere and why. `heightOf`: a caption's
 * height with two lines (captionHeight); `hung`: captions the panel layout hung under the panel (off the picture: left alone).
 * Each caption answers to the first clip (in film order) whose row it sits on.
 */
export function planCaptionsTop(caps: TimedCaption[], o: { clips: GaveUpClip[]; others: TimedItem[]; safe: { top: number; bottom: number; side: number }; heightOf: (it: TimedCaption) => number; hung: Set<string> }) {
  const moves: TopMove[] = [], stays: Array<{ id: string; why: Stay; clip: string }> = [];
  const over: Array<{ it: TimedCaption; clip: GaveUpClip; h: number; hits: GaveUpClip[] }> = [];
  const clips = [...o.clips].sort((a, b) => a.start - b.start), across: Span = [o.safe.side, 1 - o.safe.side];
  for (const it of caps) {
    if (!isCaption(it.type) || o.hung.has(it.id)) continue;
    const during = clips.filter((c) => crosses([it.start, it.end], [c.start, c.end]));
    if (!during.length) continue;
    const h = o.heightOf(it), e = it.eff, bottom = 1 - o.safe.bottom;
    // where it is drawn now: its own lower edge, else its position (core.caption: the bottom margin, moved by its transform)
    const shift = it.type === 'core.caption' && typeof (it.transform as { y?: unknown } | undefined)?.y === 'number' ? (it.transform as { y: number }).y : 0;
    const y = typeof e.y === 'number' && e.y >= 0 ? e.y : null;
    const now: Span = y !== null ? [y - h, y] : e.position === 'top' ? [o.safe.top, o.safe.top + h] : e.position === 'center' ? [0.5 - h / 2, 0.5 + h / 2] : [bottom - h + shift, bottom + shift];
    const hits = during.filter((c) => crosses(now, c.zone.y) && crosses(across, c.zone.x));
    if (!hits.length) continue;   // not on the row: nothing to fix
    if (placedByAuthor(it)) { stays.push({ id: it.id, why: 'placed', clip: hits[0].id }); continue; }
    // a template's own place (centre, top, a lower edge) is not the bottom margin: moving it up is not ours to do
    if (y !== null || (it.type === 'common.caption' && e.position !== 'bottom')) continue;
    over.push({ it, clip: hits[0], h, hits: during });
  }
  const moving = new Set(over.map((x) => x.it.id));
  for (const { it, clip, h, hits } of over) {
    if (!clip.move) { stays.push({ id: it.id, why: 'crop', clip: clip.id }); continue; }
    const top: Span = [o.safe.top, o.safe.top + h];
    // the top band is taken by something else up there over the same time, or a clip shows its row up there as well
    const taken = hits.some((c) => crosses(top, c.zone.y) && crosses(across, c.zone.x))
      || o.others.some((x) => !moving.has(x.id) && crosses([it.start, it.end], [x.start, x.end]) && sitsAtTop(x.eff, x.defs, top[1]));
    if (taken) { stays.push({ id: it.id, why: 'taken', clip: clip.id }); continue; }
    if (it.type === 'core.caption') moves.push({ id: it.id, clip: clip.id, transform: { x: 0, y: r4(top[1] - (1 - o.safe.bottom)), scale: 1 } });
    else {
      // position 'top' puts the box's top edge on the margin; a name or tag chip drawn above the box would then stick out above it,
      // so a caption with one gets its lower edge at the margin plus its whole height instead
      const chips = (!!it.eff.name && it.eff.style !== 'qa' && (!it.eff.point || it.eff.point === 'none')) || !!it.eff.tag;
      moves.push({ id: it.id, clip: clip.id, params: chips ? { y: r4(top[1]) } : { position: 'top' } });
    }
  }
  return { moves, stays };
}
