// The cells of the cell frames (common.grid, common.slant, common.postage): each cell plays its own shot, the way common.popcard
// does — the block asks for the pieces it needs in media() and puts the video (or a still) in the cell's own element, so the picture
// moves with the cell as it slides or grows and goes on playing all the while. The cells' videos are silent (like popcard's).
// A shot is one line "source|source seconds|x,y,zoom|still": the cell's video starts at `source seconds` when the cell comes in;
// x,y,zoom is the crop; `still` holds that frame. A missing line, "-" or a line without a source leaves the cell to the stand-in.
// Everything here is a pure function of time.
import { clamp, cssCamel, eIO3, eOut3, type ItemCtx, type MediaRef, type Project, type StillRef } from '@tellcut/engine';
import { windowEl, type Win } from './window.ts';

export type Rect = [number, number, number, number];
export type CellDir = 'left' | 'right' | 'top' | 'bottom';
export interface CellShot { source: string; from: number; crop: { x: number; y: number; zoom: number }; still: boolean }

/** a crop as written, each part kept when it is a number (x, y) or above 0 (zoom), the rest the middle and 1: "0.5,0.3" keeps its
 *  x and y, { zoom: 1.5 } its zoom */
export function cropOf(v: unknown): { x: number; y: number; zoom: number } {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, n = (x: unknown) => (x === undefined || x === null || x === '' ? NaN : Number(x));
  const x = n(r.x), y = n(r.y), zoom = n(r.zoom);
  return { x: Number.isFinite(x) ? x : 0.5, y: Number.isFinite(y) ? y : 0.5, zoom: zoom > 0 && Number.isFinite(zoom) ? zoom : 1 };
}

/** one shot a line, in cell order; a blank line, "-" or a line with no source is null (the cell keeps its place) */
export function parseCellShots(text: string): Array<CellShot | null> {
  const lines = String(text ?? '').split('\n').map((l) => l.trim());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.map((l) => {
    const [source = '', from, crop, still] = l.split('|').map((x) => x.trim());
    if (!source || source === '-') return null;
    const [x, y, zoom] = String(crop || '').split(',').map((v) => v.trim());
    return { source, from: Number(from) || 0, crop: cropOf({ x, y, zoom }), still: still === 'still' };
  });
}

/** when each cell comes in: a comma list (an empty or bad field, and any cell past the list, gets i × step, in place) */
export function revealTimes(times: string, count: number, step: number): number[] {
  const fields = String(times ?? '').split(/[,，]/).map((f) => f.trim());
  return Array.from({ length: count }, (_, i) => {
    const v = fields[i] !== undefined && fields[i] !== '' ? Number(fields[i]) : NaN;
    return Number.isFinite(v) ? v : Math.round(i * step * 1e6) / 1e6;
  });
}

const DIRS: CellDir[] = ['left', 'right', 'top', 'bottom'];
/** where each cell comes from: one value for all, else a comma list; missing or unknown ones left and right in turn */
export function cellDirs(from: string, count: number): CellDir[] {
  const fields = String(from ?? '').split(/[,，]/).map((f) => f.trim()).filter((f, i, a) => a.length > 1 || f);
  return Array.from({ length: count }, (_, i) => {
    const d = (fields.length === 1 ? fields[0] : fields[i]) as CellDir;
    return DIRS.includes(d) ? d : i % 2 ? 'right' : 'left';
  });
}

/** how far a cell is in, 0…1: in over `dur` from `at`; past `exitAt` (≥ 0) back out over `dur` from wherever it had got to (a cell
 *  still coming in stops there and turns back, instead of going on in while the way out starts slowly) */
export function cellProgress(local: number, at: number, dur: number, exitAt: number): number {
  const d = Math.max(0.01, dur), inAt = (t: number) => (t <= at ? 0 : eOut3(clamp((t - at) / d)));
  if (exitAt < 0 || local <= exitAt) return inAt(local);
  return inAt(exitAt) * (1 - eIO3(clamp((local - exitAt) / d)));
}

/** the move that puts `box` (px) just out of the W×H frame on the `dir` side */
export function offscreen(dir: CellDir, box: Rect, W: number, H: number): [number, number] {
  const [x, y, w, h] = box;
  if (dir === 'left') return [-(x + w), 0];
  if (dir === 'right') return [W - x, 0];
  if (dir === 'top') return [0, -(y + h)];
  return [0, H - y];
}

/** a cell's video: from its source seconds, for as long as the cell is on (from `at` to the item's end) */
export const cellRef = (s: CellShot, len: number): MediaRef => ({ source: s.source, in: s.from, out: s.from + len, speed: 1, interp: 'none' });

/** whether a cell due at `at` comes in at all in an item `dur` s long: one that would be on screen only in the last 0.05 s does
 *  not (media() declares no clip for it and draw keeps it hidden, so the two never disagree on the last frames) */
export const cellLive = (at: number, dur: number): boolean => dur - at > 0.05;

/** start loading a still shot's picture before its cell shows (build draws at 0, when no cell is in yet), so ready() can wait for it */
export function preloadCell(ctx: ItemCtx, win: Win, shot: CellShot | null) {
  const s = known(ctx, shot);
  if (!s?.still) return;
  const url = ctx.media.stillUrl({ source: s.source, t: s.from, w: 1080 });
  if (win.src !== url) { win.src = url; win.img.src = url; }
}

/** the pieces the cells need: a video per playing cell that ever shows, a still per held one */
export function cellMedia(shots: Array<CellShot | null>, ats: number[], dur: number): { videos: MediaRef[]; stills: StillRef[] } {
  const videos: MediaRef[] = [], stills: StillRef[] = [];
  shots.forEach((s, i) => {
    const at = ats[i] ?? 0, len = dur - at;
    if (!s || !cellLive(at, dur)) return;
    if (s.still) stills.push({ source: s.source, t: s.from, w: 1080 });
    else videos.push(cellRef(s, len));
  });
  return { videos, stills };
}

/** the shot when the project has its source, else null: a mistyped source id shows the stand-in (media() still names it, so the
 *  project's checks report it) */
function known(ctx: ItemCtx, shot: CellShot | null): CellShot | null {
  return shot && (ctx.project as Project).sources?.[shot.source] ? shot : null;
}

/** a cell's element: a clipping box with a still's <img> and the painted stand-in (window.ts) */
export const cellEl = (parent: HTMLElement): Win => windowEl(parent);

/** fill a cell w × h px: its shot `local` s after the cell came in (`len` s on screen in all), or the stand-in */
export function showCell(ctx: ItemCtx, win: Win, written: CellShot | null, local: number, len: number, w: number, h: number) {
  const shot = known(ctx, written);
  cssCamel(win.box, { width: `${w}px`, height: `${h}px` });
  cssCamel(win.ph, { display: shot ? 'none' : 'block' });
  if (!shot) { cssCamel(win.img, { display: 'none' }); return; }
  const src = (ctx.project as Project).sources?.[shot.source] as { width?: number; height?: number } | undefined;
  if (shot.still) {
    preloadCell(ctx, win, shot);
    cssCamel(win.img, { display: 'block' });
    ctx.media.place(win.img as unknown as HTMLVideoElement, w, h, shot.crop, src?.width, src?.height);
    return;
  }
  // a cell that held a still before (an edit switched it to a video) must not keep showing that still under the video
  cssCamel(win.img, { display: 'none' });
  const v = ctx.media.video(cellRef(shot, Math.max(0.05, len)), win.box, clamp(local, 0, Math.max(0, len - 0.04)), false);
  ctx.media.place(v, w, h, shot.crop, src?.width, src?.height);
}
