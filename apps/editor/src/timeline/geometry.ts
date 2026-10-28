import { resolveTimes, type AnyItem, type Project, type Times, type Track, type TrackKind } from '@tellcut/engine';

/** m:ss.cc (with frames) or m:ss. */
export function formatTime(t: number, precise = false): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return precise ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

export const HEADER_W = 176, RULER_H = 24, ROW_GAP = 2;
export const ROW_H: Record<TrackKind, number> = { video: 56, scene: 36, overlay: 28, music: 44, audio: 44, sfx: 24 };
/** Compact rows (the default): Wedding's 13 overlay tracks shrink from 364 px to 260 px. */
export const ROW_H_COMPACT: Record<TrackKind, number> = { video: 44, scene: 28, overlay: 20, music: 36, audio: 36, sfx: 20 };
export interface View { pps: number; scroll: number }
export interface Row { track: Track; y: number; h: number; laneH: number; lanes: Map<string, number> }

const VISUAL = new Set<TrackKind>(['scene', 'video', 'overlay']);

/** Overlapping items of one track go to separate lanes (start order, first free lane), so none hides another. */
export function assignLanes(items: AnyItem[], times: Times): Map<string, number> {
  const order = [...items].sort((a, b) => times.get(a.id)!.start - times.get(b.id)!.start);
  const ends: number[] = [], lanes = new Map<string, number>();
  for (const it of order) {
    const tm = times.get(it.id)!;
    let i = ends.findIndex((e) => e <= tm.start + 1e-6);
    if (i < 0) { i = ends.length; ends.push(0); }
    ends[i] = tm.end;
    lanes.set(it.id, i);
  }
  return lanes;
}

/** A collapsed track: one thin row, its items all in it. */
export const COLLAPSED_H = 12;
export function layoutRows(p: Project, times: Times = resolveTimes(p), heights: Record<TrackKind, number> = ROW_H, collapsed: ReadonlySet<string> = new Set()): Row[] {
  const order = [...p.tracks.filter((t) => VISUAL.has(t.kind)).reverse(), ...p.tracks.filter((t) => !VISUAL.has(t.kind))];
  let y = 0;
  return order.map((track) => {
    let r: Row;
    if (collapsed.has(track.id)) r = { track, y, h: COLLAPSED_H, laneH: COLLAPSED_H, lanes: new Map((track.items as AnyItem[]).map((i) => [i.id, 0])) };
    else {
      const lanes = assignLanes(track.items as AnyItem[], times), laneH = heights[track.kind];
      const n = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
      r = { track, y, h: laneH * n, laneH, lanes };
    }
    y += r.h + ROW_GAP;
    return r;
  });
}
/** The tallest a lane of each kind grows to when rows fill the timeline (about twice the standard height). */
export const ROW_H_MAX: Record<TrackKind, number> = { video: 96, scene: 72, overlay: 56, music: 88, audio: 88, sfx: 48 };
/** Lane heights that fill `avail` px (spec 2026-10-28-timeline-refresh A1): every kind grows by one factor from `base`, a kind
 *  stops at ROW_H_MAX and the others share what is left; collapsed rows keep COLLAPSED_H. No room to spare: `base` as is. */
export function fitHeights(p: Project, times: Times, base: Record<TrackKind, number>, collapsed: ReadonlySet<string>, avail: number): Record<TrackKind, number> {
  const rows = layoutRows(p, times, base, collapsed), units: Partial<Record<TrackKind, number>> = {};
  let fixed = Math.max(0, rows.length - 1) * ROW_GAP;
  for (const r of rows) {
    if (collapsed.has(r.track.id)) { fixed += COLLAPSED_H; continue; }
    units[r.track.kind] = (units[r.track.kind] ?? 0) + r.h / r.laneH;
  }
  const kinds = Object.keys(units) as TrackKind[];
  const natural = fixed + kinds.reduce((a, k) => a + base[k] * units[k]!, 0);
  if (!kinds.length || avail <= natural) return base;
  // grow everything by k; a kind that would pass its cap is pinned there and k is worked out again for the rest
  const capped = new Set<TrackKind>();
  let k = 1;
  for (;;) {
    const free = avail - fixed - kinds.filter((x) => capped.has(x)).reduce((a, x) => a + ROW_H_MAX[x] * units[x]!, 0);
    const grow = kinds.filter((x) => !capped.has(x)).reduce((a, x) => a + base[x] * units[x]!, 0);
    k = grow > 0 ? free / grow : Infinity;
    const over = kinds.filter((x) => !capped.has(x) && base[x] * k >= ROW_H_MAX[x]);
    if (!over.length) break;
    over.forEach((x) => capped.add(x));
  }
  const out = { ...base };
  for (const x of Object.keys(base) as TrackKind[]) out[x] = Math.max(base[x], Math.min(ROW_H_MAX[x], Math.floor(base[x] * k + 1e-6)));
  return out;
}
export const rowAt = (rows: Row[], y: number) => rows.find((r) => y >= r.y && y < r.y + r.h) ?? null;

export const timeToX = (t: number, v: View) => (t - v.scroll) * v.pps;
export const xToTime = (x: number, v: View) => v.scroll + x / v.pps;

export function zoomAround(v: View, factor: number, anchorX: number): View {
  const pps = Math.max(5, Math.min(400, v.pps * factor));
  const t = xToTime(anchorX, v);
  return { pps, scroll: Math.max(0, t - anchorX / pps) };
}

const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
export function rulerTicks(v: View, width: number): Array<{ t: number; major: boolean }> {
  const step = STEPS.find((s) => s * v.pps >= 60) ?? 60, minor = step / 5;
  const out: Array<{ t: number; major: boolean }> = [];
  const t0 = Math.floor(v.scroll / minor) * minor, t1 = xToTime(width, v);
  for (let k = 0, t = t0; t <= t1 + 1e-9; k++, t = t0 + k * minor) {
    const r = Math.round(t * 1000) / 1000;
    out.push({ t: r, major: Math.abs(r / step - Math.round(r / step)) < 1e-6 });
  }
  return out;
}

/** Zoom range (px per second) and the empty second shown after the end. */
export const MIN_PPS = 5, MAX_PPS = 400, FIT_MIN_PPS = 20, AIR = 1;
/** Furthest scroll: the end of the project (plus AIR) at the right edge of the lane. */
export const maxScroll = (duration: number, laneW: number, pps: number) => Math.max(0, duration + AIR - laneW / pps);
/** Horizontal scrollbar thumb (px within a track of `trackW`) for the visible part of the project. */
export function scrollThumb(v: View, duration: number, trackW: number): { left: number; width: number } {
  const span = duration + AIR, visible = trackW / v.pps;
  if (visible >= span) return { left: 0, width: trackW };
  const width = Math.max(16, Math.round((trackW * visible) / span));
  return { left: Math.max(0, Math.min(trackW - width, Math.round((trackW * v.scroll) / span))), width };
}
/** The zoom slider (0–100) is logarithmic: every step zooms by the same factor. */
export const ppsFromZoom = (z: number) => MIN_PPS * (MAX_PPS / MIN_PPS) ** (z / 100);
export const zoomFromPps = (pps: number) => (100 * Math.log(pps / MIN_PPS)) / Math.log(MAX_PPS / MIN_PPS);
