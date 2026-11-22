// common.progress's character modes (spec 2026-11-22, progress characters): runner, stretch, paws, segments, fuse and battery share
// one way of going along — `travel` reaches the end `tail` seconds before the item ends, leaving that time for the "arrived"
// reaction, then the last 0.3 s fade — and one box inside the safe area (`band`). Each mode is a file of its own beside this one,
// dispatched by more.ts; progress.ts only hands over to drawMore for these modes.
import { clamp, prog, type ItemCtx, type Theme } from '@tellcut/engine';

export const MORE_MODES = ['runner', 'stretch', 'paws', 'segments', 'fuse', 'battery'] as const;
export type MoreMode = (typeof MORE_MODES)[number];
export const isMoreMode = (m: string): m is MoreMode => (MORE_MODES as readonly string[]).includes(m);

/** the seconds kept at the end of an item for the arrival (a quarter of it, at most one) */
export const tail = (dur: number): number => Math.min(1, Math.max(0, dur) * 0.25);

/** the chapter `step` stands for in a run of `dots`, or −1 for the whole run */
const chapter = (step: number, dots: number) => {
  const n = Math.max(1, Math.round(Number.isFinite(dots) ? dots : 1));
  return { n, i: step >= 0 ? Math.min(n - 1, Math.floor(step)) : -1 };
};

/** 0…1; step −1: 0→1 over [0, dur − tail]; step ≥ 0: step/dots → (step+1)/dots over the same span; clamped */
export function travel(step: number, dots: number, local: number, dur: number): number {
  const span = Math.max(0, dur) - tail(dur), u = span > 0 ? clamp(local / span) : 1, { n, i } = chapter(step, dots);
  return clamp(i < 0 ? u : (i + u) / n);
}

/** seconds since travel reached 1, or −1 when it has not (or never will in this item) */
export function arrived(step: number, dots: number, local: number, dur: number): number {
  const { n, i } = chapter(step, dots);
  if (i >= 0 && i < n - 1) return -1;
  const end = Math.max(0, Math.max(0, dur) - tail(dur));
  return local >= end ? local - end : -1;
}

/** 1 → 0 over the last 0.3 s */
export const fadeOut = (local: number, dur: number): number => 1 - prog(local, dur - 0.3, dur);

/** what the new modes read of common.progress's params */
export interface MoreParams { mode: string; position: 'top' | 'bottom'; y: number; color: string; track: string; thickness: number; dots: number; step: number;
  iconSize: number; size: number; align: string; done: string; ink: string; paper: string; at: string; runner: string; goal: string; look: 'dog' | 'cat' | 'worm'; flip: boolean }

/** the box a mode `height` px tall takes: left edge and width inside the side safe margins, and its top (y ≥ 0: centred there; else
 *  against the top or bottom safe edge) */
export function band(ctx: { W: number; H: number; theme: Theme }, p: MoreParams, height: number): { x: number; w: number; top: number } {
  const { W, H, theme } = ctx, x = theme.safe.side * W, w = Math.max(0, W - 2 * x), hh = Math.max(0, height);
  const top = p.y >= 0 ? p.y * H - hh / 2 : p.position === 'bottom' ? H * (1 - theme.safe.bottom) - hh : theme.safe.top * H;
  return { x, w, top };
}

/** one mode's DOM, rebuilt when `key` changes: `root` (made by drawMore, empty at first) holds whatever the mode builds into it the
 *  first time it draws — named elements in `el`, a row of like ones in `list` */
export interface More { key: string; root: HTMLElement; el: Record<string, HTMLElement>; list: HTMLElement[] }
/** draws one mode at ctx.local. The root already fades over the last 0.3 s; `cv` starts each frame hidden: a mode that paints on it
 *  shows it with cssCamel (display block, its own fadeOut opacity; cssCamel, not el.style, or drawMore's hiding of it next frame is
 *  skipped as already done) and sizes and clears it with canvasAt, and leaves globalAlpha at 1 */
export type Draw = (ctx: ItemCtx<MoreParams>, p: MoreParams, m: More, cv: HTMLCanvasElement) => void;
