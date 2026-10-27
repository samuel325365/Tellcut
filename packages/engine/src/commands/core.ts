// Shared helpers for edit commands. A command is a recipe that mutates a draft Project in place:
// the editor wraps it with immer to record undo patches; tests run it on a structuredClone.
import type { AnyItem, AudioItem, Project, Track, VideoItem } from '../schema.ts';

/** A refused edit. message: English (agents read it through propose); code + params: the editor's translated notice (err.cmd.<code>). */
export class CommandError extends Error {
  constructor(message: string, readonly code?: string, readonly params?: Record<string, string | number>) { super(message); }
}
export interface Found { track: Track; ti: number; item: AnyItem; ii: number }

/** Rounds to a microsecond so repeated edits keep project.json tidy. */
export const r6 = (t: number) => Math.round(t * 1e6) / 1e6;
export const minLen = (p: Project) => 1 / p.meta.fps;
const items = (t: Track) => t.items as AnyItem[];

export function findItem(p: Project, id: string): Found {
  for (let ti = 0; ti < p.tracks.length; ti++) {
    const ii = items(p.tracks[ti]).findIndex((x) => x.id === id);
    if (ii >= 0) return { track: p.tracks[ti], ti, item: items(p.tracks[ti])[ii], ii };
  }
  throw new CommandError(`No item "${id}"`);
}

/** base if no item or track uses it, otherwise base-2, base-3, … */
export function uniqueId(p: Project, base: string): string {
  const used = new Set(p.tracks.flatMap((t) => [t.id, ...items(t).map((i) => i.id)]));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Keeps fade-in plus fade-out inside a music/audio clip whose length changed (both shrink in proportion). */
export function fitFades(track: Track, it: any) {
  if (track.kind !== 'music' && track.kind !== 'audio') return;
  const len = it.end - it.start, sum = it.fadeIn + it.fadeOut;
  if (!(sum > len)) return;
  const k = len / sum, down = (v: number) => Math.floor(v * k * 1e6) / 1e6;
  it.fadeIn = down(it.fadeIn); it.fadeOut = down(it.fadeOut);
}

export const childrenOf = (p: Project, id: string) => p.tracks.flatMap((t) => items(t).filter((i) => i.parent === id));

/** The ids without those whose ancestor is also listed (moving a parent already carries its children). */
export function topLevel(p: Project, ids: string[]): string[] {
  const listed = new Set(ids);
  const byId = new Map(p.tracks.flatMap((t) => items(t).map((i) => [i.id, i] as const)));
  const listedAncestor = (id: string) => {
    const seen = new Set<string>();
    for (let par = byId.get(id)?.parent; par !== undefined && !seen.has(par); par = byId.get(par)?.parent) {
      if (listed.has(par)) return true;
      seen.add(par);
    }
    return false;
  };
  return [...listed].filter((id) => !listedAncestor(id));
}

/** Media seconds per timeline second, or null for items without media time (scenes, overlays, sfx). */
export function mediaRate(track: Track, item: AnyItem): number | null {
  if (track.kind === 'video') return (item as VideoItem).speed;
  if (track.kind === 'audio') return (item as AudioItem).rate;
  if (track.kind === 'music') return 1;
  return null;
}

/** Length of the item's source in seconds (music files carry no declared length: Infinity). */
export function sourceLength(p: Project, track: Track, item: AnyItem): number {
  if (track.kind === 'video' || track.kind === 'audio') return p.sources[(item as VideoItem | AudioItem).source].duration;
  return Infinity;
}

/** Shifts the item-relative fields (envelope points, freezeAt, defocus, keys) by d seconds; envelope points before 0 are dropped. */
export function shiftRelative(track: Track, it: any, d: number) {
  if (it.envelope) it.envelope = it.envelope.map(([t, db]: [number, number]) => [r6(t + d), db]).filter(([t]: [number, number]) => t >= 0);
  // a moving layer's path (toolkit phase 5) stays on the same moments; keys before 0 stay, like crop keys
  if (it.transform?.keys) it.transform = { ...it.transform, keys: it.transform.keys.map((k: any) => ({ ...k, t: r6(k.t + d) })) };
  if (track.kind === 'video') {
    if (it.freezeAt != null) it.freezeAt = Math.max(0, r6(it.freezeAt + d));
    if (it.defocus) it.defocus = { ...it.defocus, from: Math.max(0, r6(it.defocus.from + d)), to: Math.max(0, r6(it.defocus.to + d)) };
    // keys and shakes moved before 0 stay in the data, inactive (trimming the head back brings them back)
    if (it.crop?.keys) it.crop = { ...it.crop, keys: it.crop.keys.map((k: any) => ({ ...k, t: r6(k.t + d) })) };
    if (it.shake) it.shake = it.shake.map((s: any) => ({ ...s, at: r6(s.at + d) }));
  }
}

/** The in-point after the head moves by dt: past freezeAt the clip holds the same frame, so in stops at it (like split). */
export function headIn(track: Track, it: any, dt: number, rate: number): number {
  return r6(it.in + (track.kind === 'video' && it.freezeAt != null && dt > it.freezeAt ? it.freezeAt : dt) * rate);
}

/** Scales the item-relative fields by k (a speed change keeps them on the same content). */
export function scaleRelative(track: Track, it: any, k: number) {
  if (it.envelope) it.envelope = it.envelope.map(([t, db]: [number, number]) => [r6(t * k), db]);
  if (it.transform?.keys) it.transform = { ...it.transform, keys: it.transform.keys.map((q: any) => ({ ...q, t: r6(q.t * k) })) };
  if (track.kind === 'video') {
    if (it.freezeAt != null) it.freezeAt = r6(it.freezeAt * k);
    if (it.defocus) it.defocus = { ...it.defocus, from: r6(it.defocus.from * k), to: r6(it.defocus.to * k) };
    if (it.crop?.keys) it.crop = { ...it.crop, keys: it.crop.keys.map((c: any) => ({ ...c, t: r6(c.t * k) })) };
    if (it.shake) it.shake = it.shake.map((s: any) => ({ ...s, at: r6(s.at * k), dur: r6(s.dur * k) }));
  }
}

/** Source seconds a media clip plays from its in-point: past freezeAt a video holds one frame. */
export function sourceNeed(kind: Track['kind'], it: any): number {
  const len = it.end - it.start;
  if (kind === 'video') return Math.min(len, it.freezeAt ?? len) * it.speed;
  return kind === 'audio' ? len * it.rate : len;
}

const LINK_EPS = 1e-3;
/** A clip's own sounds (the first cut's 原音): its audio children of the same source spanning the whole clip, `len` seconds long
 *  (default: the clip's length now). An unknown id has none. */
export function ownSounds(p: Project, id: string, len?: number): AudioItem[] {
  const par = p.tracks.flatMap(items).find((x) => x.id === id) as any;
  if (!par) return [];
  const L = len ?? par.end - par.start;
  return p.tracks.flatMap((t) => (t.kind !== 'audio' ? [] : (items(t) as AudioItem[]).filter((c) =>
    c.parent === id && c.source === par.source && Math.abs(c.start) <= LINK_EPS && Math.abs(c.end - L) <= LINK_EPS)));
}

/** After a media clip was trimmed (spec 2026-10-15-proposals-magnetic §4.3): its own sound is trimmed the same way, the other
 *  children stay on the same picture. head: seconds cut from (> 0) or added to (< 0) the head; oldLen: the length before. */
export function followTrim(p: Project, id: string, oldLen: number, newLen: number, head: number) {
  const own = new Set<AnyItem>(ownSounds(p, id, oldLen));
  for (const t of p.tracks) for (const c of items(t) as any[]) {
    if (c.parent !== id) continue;
    if (own.has(c)) { c.end = r6(newLen); c.in = r6(c.in + head * c.rate); fitFades(t, c); continue; }
    if (head) { c.start = r6(c.start - head); c.end = r6(c.end - head); }
  }
}

/** When an item's length changes, its children keep their proportional place (spec §3.1), and what moves inside a child (its
 *  keys, envelope) stretches with it. Sound effects keep their length. */
export function scaleChildren(p: Project, id: string, oldLen: number, newLen: number) {
  if (!(oldLen > 0) || oldLen === newLen) return;
  const k = newLen / oldLen;
  for (const t of p.tracks) for (const c of items(t)) {
    if (c.parent !== id) continue;
    const before = c.end - c.start;
    c.start = r6(c.start * k);
    c.end = t.kind === 'sfx' ? r6(c.start + before) : r6(c.end * k);
    if (t.kind !== 'sfx' && before > 0) scaleRelative(t, c, (c.end - c.start) / before);
    scaleChildren(p, c.id, before, c.end - c.start);
  }
}
