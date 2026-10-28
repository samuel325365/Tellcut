// Copy and paste (spec 2026-10-28-timeline-refresh A2). A clip holds plain copies of the copied items, their children and their
// own sounds, so it still pastes after the originals are edited, deleted or undone; it is only good for the project it came
// from (the editor checks `project`), since items name that project's sources and media.
import { plainCopy } from '../util.ts';
import type { AnyItem, Project, Track, TrackKind } from '../schema.ts';
import { resolveTimes, TIME_EPS } from '../time.ts';
import { CommandError, childrenOf, fitFades, r6, topLevel, uniqueId } from './core.ts';
import { addTrack } from './edit.ts';
import { magneticTrack } from './magnetic.ts';

export interface ClipEntry { track: string; kind: TrackKind; item: AnyItem }
/** entries: the top-level items first (made absolute and parentless), then their children (times relative to the parent, as
 *  stored); anchor: the earliest top-level start */
export interface Clip { project: string; entries: ClipEntry[]; anchor: number }

const items = (t: Track) => t.items as AnyItem[];
const where = (p: Project, id: string) => { for (const t of p.tracks) { const it = items(t).find((i) => i.id === id); if (it) return { t, it }; } return null; };

export function copyItems(p: Project, ids: string[], projectId: string): Clip {
  const known = ids.filter((id) => where(p, id));
  if (!known.length) throw new CommandError('Nothing to copy');
  const times = resolveTimes(p), tops = topLevel(p, known), entries: ClipEntry[] = [];
  for (const id of tops) {
    const w = where(p, id)!, it = plainCopy(w.it), tm = times.get(id)!;
    // a copied child (a caption hung on a clip) pastes on its own: absolute, on no parent
    delete it.parent; it.start = r6(tm.start); it.end = r6(tm.end);
    entries.push({ track: w.t.id, kind: w.t.kind, item: it });
  }
  const add = (id: string) => { for (const c of childrenOf(p, id)) { const w = where(p, c.id)!; entries.push({ track: w.t.id, kind: w.t.kind, item: plainCopy(c) }); add(c.id); } };
  tops.forEach(add);
  return { project: projectId, entries, anchor: Math.min(...tops.map((id) => times.get(id)!.start)) };
}

/** Pastes at t: each item on its own track (else the first track of its kind, else a new one), new ids, children on the new
 *  ids. Clips from the magnetic track go after the magnetic clip under t (or at the end) and the rest keep their timing to
 *  them (the editor's settle packs the track and pushes the later clips). Without a magnetic track the film's length is
 *  fixed: what runs past the end is cut there, what would start at or after it is left out. skip: tracks not pasted onto
 *  (the editor's locked ones). Returns the new top-level ids. */
export function pasteItems(p: Project, a: { clip: Clip; t: number; skip?: ReadonlySet<string> }): string[] {
  const { entries } = a.clip, mag = magneticTrack(p), copied = new Set(entries.map((e) => e.item.id));
  const isTop = (e: ClipEntry) => e.item.parent === undefined || !copied.has(e.item.parent);
  const magTops = mag ? entries.filter((e) => isTop(e) && e.track === mag.id && e.kind === 'video') : [];
  let shift = a.t - a.clip.anchor;
  if (mag && magTops.length) {
    const times = resolveTimes(p), clips = items(mag).map((c) => times.get(c.id)!);
    const under = clips.find((c) => c.start <= a.t + TIME_EPS && a.t < c.end - TIME_EPS);
    shift = (under ? under.end : Math.max(0, ...clips.map((c) => c.end))) - Math.min(...magTops.map((e) => e.item.start));
  }
  const end = mag ? Infinity : p.meta.duration;
  const newId = new Map<string, string>(), absStart = new Map<string, number>(), made: Array<{ id: string; mag: boolean }> = [];
  for (const e of entries) {
    const top = isTop(e), it: any = plainCopy(e.item);
    let base = 0;
    if (top) { it.start = r6(it.start + shift); it.end = r6(it.end + shift); }
    else {
      const par = newId.get(e.item.parent!);
      if (par === undefined) continue;                 // its parent was left out
      base = absStart.get(par)!;
      it.parent = par;
    }
    if (base + it.start >= end - TIME_EPS) continue;
    if (base + it.end > end) it.end = r6(end - base);
    const open = p.tracks.filter((t) => !a.skip?.has(t.id));
    let track = open.find((t) => t.id === e.track && t.kind === e.kind) ?? open.find((t) => t.kind === e.kind);
    if (!track) { const id = addTrack(p, { kind: e.kind }); track = p.tracks.find((t) => t.id === id)!; }
    it.id = uniqueId(p, e.item.id);
    fitFades(track, it);
    items(track).push(it);
    newId.set(e.item.id, it.id); absStart.set(it.id, base + it.start);
    if (top) made.push({ id: it.id, mag: magTops.includes(e) });
  }
  if (!made.length) throw new CommandError('Nothing to paste before the end of the video');
  return [...made.filter((m) => m.mag), ...made.filter((m) => !m.mag)].map((m) => m.id);
}
