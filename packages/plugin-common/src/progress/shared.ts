// common.progress's character modes (spec 2026-11-22, progress characters): runner, stretch, paws, segments, fuse and battery share
// one way of going along — `travel` reaches the end `tail` seconds before the item ends, leaving that time for the "arrived"
// reaction, then the last 0.3 s fade — and one box inside the safe area (`band`). Each mode is a file of its own beside this one,
// dispatched by more.ts; progress.ts only hands over to drawMore for these modes.
import { clamp, prog, type ItemCtx, type Theme } from '@tellcut/engine';

export const MORE_MODES = ['runner', 'stretch', 'paws', 'segments', 'fuse', 'battery', 'rocket', 'ring', 'vine', 'stamps'] as const;
export type MoreMode = (typeof MORE_MODES)[number];
export const isMoreMode = (m: string): m is MoreMode => (MORE_MODES as readonly string[]).includes(m);

/** the room a progress bar or row of dots at the top takes under the top safe margin (a share of the frame height, on portrait and
 *  square frames): a header keeps below it. paws and segments fit in it too. On a landscape frame read topLane(). */
export const TOP_LANE = 0.035;

/** pencil mode: chapter starts ("秒,秒,…"; empty = the item shared evenly) → the step that is on (−1 before the first) and whether all are done
 *  (an extra time after the last start marks "all done") */
export function pencilState(at: string, n: number, local: number, dur: number): { cur: number; starts: number[]; done: boolean; doneAt: number } {
  const given = String(at ?? '').split(/[,，]/).map((x) => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  const starts = given.length ? given.slice(0, n) : Array.from({ length: n }, (_, i) => (i * dur) / n), doneAt = given.length > n ? given[n] : Infinity;
  let cur = -1;
  for (let i = 0; i < starts.length; i++) if (local >= starts[i]) cur = i;
  return { cur, starts, done: local >= doneAt, doneAt };
}

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

/** seconds since `travel` reached `v` (0…1) at `local`: negative when it has not yet; Infinity when it was there before the item
 *  began (or the item has no time to go along in). From travel's inverse, as it is linear in local over [0, dur − tail]. */
export function sinceAt(step: number, dots: number, v: number, local: number, dur: number): number {
  const span = Math.max(0, dur) - tail(dur), a = travel(step, dots, 0, dur), b = travel(step, dots, span, dur);
  if (v <= a || !(span > 0) || !(b > a)) return Infinity;
  return local - (span * (v - a)) / (b - a);
}

/** 1 → 0 over the last 0.3 s */
export const fadeOut = (local: number, dur: number): number => 1 - prog(local, dur - 0.3, dur);

/** what the new modes read of common.progress's params */
export interface MoreParams { mode: string; position: 'top' | 'bottom'; y: number; color: string; track: string; thickness: number; dots: number; step: number;
  iconSize: number; size: number; align: string; done: string; ink: string; paper: string; at: string; runner: string; goal: string; look: 'dog' | 'cat' | 'worm'; flip: boolean }

/** A mode's own look where the item leaves a param unset: `color` defaults to the theme's accent (a red), which gave a red dog, a
 *  battery that read as always low and a red vine. For these the mode's own value wins over the project theme too (an accent is
 *  rarely a dog's coat or a leaf's green); only a value the item sets itself overrides it. vine's thickness is its template's 16:
 *  at 12 it read thin and sparse. */
export const MODE_DEFAULTS: Partial<Record<MoreMode, Partial<Pick<MoreParams, 'color' | 'done' | 'thickness'>>>> = {
  stretch: { color: '#c98a4b' },
  battery: { color: '#34c759' },
  vine: { color: '#4caf50', done: '#ff8fb1', thickness: 16 },
};

/** mode `mode`'s own defaults (MODE_DEFAULTS), a copy; {} for a mode without any. Both the drawing (withModeDefaults) and what the
 *  editor shows for an unset field (common.progress's defaultsFor) read this one table, so the two never disagree. */
export const modeDefaults = (mode: string): Partial<Pick<MoreParams, 'color' | 'done' | 'thickness'>> =>
  (Object.hasOwn(MODE_DEFAULTS, mode) ? { ...MODE_DEFAULTS[mode as MoreMode] } : {});

/** `p` with the mode's own defaults (MODE_DEFAULTS) for the params the item's own `set` (its params as written in project.json,
 *  before the theme and the block defaults fill them) leaves out; `p` itself when there is nothing to change */
export function withModeDefaults<T extends MoreParams>(p: T, set: Record<string, unknown> | undefined): T {
  const own = modeDefaults(p.mode);
  const missing = Object.entries(own).filter(([key]) => !(set && Object.hasOwn(set, key) && set[key] !== undefined));
  return missing.length ? { ...p, ...Object.fromEntries(missing) } : p;
}

/** how much larger paws, fuse, ring, stamps and battery draw on a landscape frame, so they read about as well as on 9:16: W / H there (at
 *  most 16:9's), 1 on portrait and square frames (their pictures unchanged). Ring and stamps are sized from the frame height and
 *  paws is held to the top lane, a share of it (and battery's size is one too): on 16:9 that height is the 9:16 frame's width, so they came out 1.78 times smaller
 *  than on 9:16; times this they are the size they are there. */
export const landscape = (W: number, H: number): number => (W > H && H > 0 ? Math.min(W / H, 16 / 9) : 1);

/** the top lane on a W × H frame, a share of its height: TOP_LANE times landscape(), so on 16:9 it is as many px as on 9:16 of the
 *  same short side. paws, enlarged on landscape to its 9:16 size, fits in it again, and common.header (headerTop) keeps below
 *  it: with the 9:16 share the prints ran into a header at its default place. Portrait and square frames: TOP_LANE itself. */
export const topLane = (W: number, H: number): number => TOP_LANE * landscape(W, H);

/** the box a mode `height` px tall takes: left edge and width inside the side safe margins, and its top (y ≥ 0: centred there; else
 *  against the top or bottom safe edge) */
export function band(ctx: { W: number; H: number; theme: Theme }, p: MoreParams, height: number): { x: number; w: number; top: number } {
  const { W, H, theme } = ctx, x = theme.safe.side * W, w = Math.max(0, W - 2 * x), hh = Math.max(0, height);
  const top = p.y >= 0 ? p.y * H - hh / 2 : p.position === 'bottom' ? H * (1 - theme.safe.bottom) - hh : theme.safe.top * H;
  return { x, w, top };
}

/** a box bw × bh in a corner of the safe area: against the left safe edge when p.align is 'left', else the right; vertically by
 *  band() (y ≥ 0 centred there, else the top or bottom safe edge) */
export function corner(ctx: { W: number; H: number; theme: Theme }, p: MoreParams, bw: number, bh: number): { left: number; top: number } {
  const side = ctx.theme.safe.side * ctx.W, { top } = band(ctx, p, bh);
  return { left: p.align === 'left' ? side : ctx.W - side - Math.max(0, bw), top };
}

/** one mode's DOM, rebuilt when `key` changes: `root` (made by drawMore, empty at first) holds whatever the mode builds into it the
 *  first time it draws — named elements in `el`, a row of like ones in `list` */
export interface More { key: string; root: HTMLElement; el: Record<string, HTMLElement>; list: HTMLElement[] }
/** draws one mode at ctx.local. The root already fades over the last 0.3 s; `cv` starts each frame hidden: a mode that paints on it
 *  shows it with cssCamel (display block, its own fadeOut opacity; cssCamel, not el.style, or drawMore's hiding of it next frame is
 *  skipped as already done) and sizes and clears it with canvasAt, and leaves globalAlpha at 1 */
export type Draw = (ctx: ItemCtx<MoreParams>, p: MoreParams, m: More, cv: HTMLCanvasElement) => void;
