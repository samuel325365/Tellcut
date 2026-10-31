// Magnetic main track (spec 2026-10-15-proposals-magnetic §4): after every command the magnetic video track is packed from 0
// with no gaps, items placed over its clips hang on them, music marked toEnd ends with the film, and the duration follows.
import type { AnyItem, Project, Track } from '../schema.ts';
import { resolveTimes, TIME_EPS } from '../time.ts';
import { CommandError, findItem, fitFades, minLen, r6 } from './core.ts';
import { overlapPairs, relink } from './overlap.ts';

const EPS = TIME_EPS;
const items = (t: Track) => t.items as AnyItem[];
export const magneticTrack = (p: Pick<Project, 'tracks'>): Track | undefined => p.tracks.find((t: any) => t.kind === 'video' && t.magnetic);

/** Everything a command needs afterwards: the magnetic rules, then linked transitions following their overlaps. */
export function settle(before: Project, after: Project) { settleMagnetic(before, after); relink(before, after); }

/** What can hang on a magnetic clip: anything off the magnetic track except the music that ends with the film (a voice
 *  line on a music track hangs like a caption), at top level or already on a magnetic clip. */
const isBed = (t: Track, it: AnyItem) => t.kind === 'music' && !!(it as any).toEnd;
const eligible = (p: Project, mag: Track, t: Track, it: AnyItem) =>
  t !== mag && !isBed(t, it) && (it.parent === undefined || items(mag).some((c) => c.id === it.parent));
const magEnd = (mag: Track) => Math.max(0, ...items(mag).map((c) => c.end));
const findIn = (p: Project, id: string): AnyItem | undefined => { for (const t of p.tracks) { const i = items(t).find((x) => x.id === id); if (i) return i; } return undefined; };

function touchedIds(before: Project, after: Project, mag: Track): Set<string> {
  const old = new Map(before.tracks.flatMap((t) => items(t).map((i) => [i.id, { t: t.id, i }] as const)));
  const out = new Set<string>(), tb = resolveTimes(before), ta = resolveTimes(after);
  for (const t of after.tracks) for (const it of items(t)) {
    const o = old.get(it.id);
    if (!o || o.t !== t.id) { out.add(it.id); continue; }
    // only a change of place in time counts: attach/detach keep the place, so a hand-made (un)hanging stays
    const a = ta.get(it.id)!, b = tb.get(it.id)!;
    if (Math.abs(a.start - b.start) <= EPS && Math.abs(a.end - b.end) <= EPS) continue;
    // off the magnetic track a trim or a stretch (one edge where it was) is not a move: the item stays on its clip, or on none.
    // A grade over the whole film trimmed to a shorter film was hung on the first clip, so a later trim of that clip would have
    // dragged it off the others. Both edges moved is a move, with a new length or not. (A clip of the magnetic track itself
    // still counts: pack places it by its start.)
    if (t !== mag && (Math.abs(a.start - b.start) <= EPS || Math.abs(a.end - b.end) <= EPS)) continue;
    if (it.parent === undefined) { out.add(it.id); continue; }
    const par = old.get(it.parent)?.i, now = items(mag).find((c) => c.id === it.parent);
    // a child moved by its own drag (its parent unchanged), not by the parent's trim
    if (par && now && JSON.stringify(par) === JSON.stringify(now)) out.add(it.id);
  }
  return out;
}

/** Hangs `it` on the magnetic clip under its start (or on nothing), keeping its place in time. */
function hang(p: Project, mag: Track, it: AnyItem) {
  const times = resolveTimes(p), a = times.get(it.id)!, len = a.end - a.start;
  const home = items(mag).filter((c) => { const t = times.get(c.id)!; return a.start >= t.start - EPS && a.start < t.end - EPS; }).pop();
  if (home?.id === it.parent) return;
  if (home) { it.parent = home.id; it.start = r6(a.start - times.get(home.id)!.start); }
  else { delete it.parent; it.start = r6(a.start); }
  it.end = r6(it.start + len);
}

/** Packs the magnetic track from 0. A clip this command placed (moved, added) goes where its start falls among the middles
 *  of the others — dropped before a clip's middle it lands before that clip, so a drag to 0 makes it the first and a new
 *  clip goes to the nearest cut. A dissolve keeps its overlap, also into a new neighbour (deleting the clip between two
 *  dissolves must not leave a dip to black). */
function pack(before: Project, mag: Track, placed: Set<string>) {
  const linked = new Map<string, { a: string; ov: number }>();
  for (const w of overlapPairs(before).values()) if (w.track === mag.id && w.linked) linked.set(w.b, { a: w.a, ov: w.ov });
  const key = (it: AnyItem) => placed.has(it.id) ? it.start : (it.start + it.end) / 2;
  const order = items(mag).map((it, i) => ({ it, i, k: key(it) })).sort((x, y) => x.k - y.k || (placed.has(y.it.id) ? 1 : 0) - (placed.has(x.it.id) ? 1 : 0) || x.i - y.i).map((x) => x.it);
  let end = 0, prev: AnyItem | null = null;
  for (const it of order) {
    const l = linked.get(it.id), len = it.end - it.start;
    const ov = !prev || !l ? 0 : l.a === prev.id ? l.ov : Math.min(l.ov, prev.end - prev.start, len);
    it.start = r6(Math.max(0, end - ov)); it.end = r6(it.start + len); end = it.end; prev = it;
  }
  mag.items.splice(0, mag.items.length, ...(order as any[]));
}

export function settleMagnetic(before: Project, after: Project) {
  const mag = magneticTrack(after);
  if (!mag) return;
  // a clip on the magnetic track hangs on nothing (one moved there from another track keeps its place in time)
  const abs = resolveTimes(after);
  for (const c of items(mag)) if (c.parent !== undefined) { const r = abs.get(c.id)!; delete c.parent; c.start = r6(r.start); c.end = r6(r.end); }
  const touched = touchedIds(before, after, mag);
  for (const t of after.tracks) for (const it of items(t)) if (touched.has(it.id) && eligible(after, mag, t, it)) hang(after, mag, it);
  // what sits after the last clip (an end card over black) follows the end of the film
  const was = magneticTrack(before), oldEnd = was && was.id === mag.id && items(was).length ? magEnd(was) : null;
  const tail = oldEnd === null ? [] : after.tracks.flatMap((t) => t === mag ? [] : items(t).filter((it) => {
    const b = findIn(before, it.id);
    return b && it.parent === undefined && !isBed(t, it) && !touched.has(it.id) && b.start >= oldEnd - EPS;
  }));
  pack(before, mag, new Set(items(mag).filter((c) => touched.has(c.id)).map((c) => c.id)));
  if (!items(mag).length) return;
  const shift = oldEnd === null ? 0 : magEnd(mag) - oldEnd;
  if (Math.abs(shift) > EPS) for (const it of tail) { it.start = r6(it.start + shift); it.end = r6(it.end + shift); }
  // the film lasts until the last clip or whatever comes after it (not counting the music that follows the film)
  const times = resolveTimes(after);
  let dur = magEnd(mag);
  for (const t of after.tracks) for (const it of items(t)) if (!isBed(t, it)) dur = Math.max(dur, times.get(it.id)!.end);
  dur = r6(dur);
  after.meta.duration = dur;
  for (const t of after.tracks) if (t.kind === 'music') for (const m of items(t) as any[]) {
    if (!m.toEnd) continue;
    const file = after.media[m.media]?.duration, cap = file === undefined ? Infinity : m.start + (file - m.in);
    m.end = r6(Math.max(m.start + minLen(after), Math.min(dur, cap)));
    fitFades(t, m);
  }
}

export function magneticGaps(p: Project, id: string): { count: number; shift: number } {
  const t = p.tracks.find((x) => x.id === id);
  if (!t) throw new CommandError(`No track "${id}"`, 'cmd.noTrack', { id });
  const times = resolveTimes(p), spans = items(t).map((c) => times.get(c.id)!).sort((a, b) => a.start - b.start);
  let end = 0, count = 0, shift = 0;
  for (const s of spans) { if (s.start > end + EPS) { count++; shift += s.start - end; } end = Math.max(end, s.end); }
  return { count, shift: r6(shift) };
}

export function setMagnetic(p: Project, a: { id: string; on: boolean }) {
  const t: any = p.tracks.find((x) => x.id === a.id);
  if (!t || t.kind !== 'video') throw new CommandError(`"${a.id}" is not a video track`, 'cmd.notVideoTrack', { id: a.id });
  if (!a.on) { delete t.magnetic; return; }
  for (const x of p.tracks as any[]) if (x !== t) delete x.magnetic;
  t.magnetic = true;
  const times = resolveTimes(p);
  for (const c of items(t)) if (c.parent !== undefined) { const r = times.get(c.id)!; delete c.parent; c.start = r6(r.start); c.end = r6(r.end); }
  for (const x of p.tracks) for (const it of items(x)) if (eligible(p, t, x, it)) hang(p, t, it);
  pack(p, t, new Set());
}

export function attach(p: Project, a: { id: string; to: string }) {
  const f = findItem(p, a.id), to = findItem(p, a.to);
  if (to.item.id === f.item.id) throw new CommandError('An item cannot be attached to itself', 'cmd.attachSelf');
  for (let x: AnyItem | undefined = to.item; x?.parent !== undefined; x = findItem(p, x.parent).item)
    if (x.parent === f.item.id) throw new CommandError('Cannot attach to an item that is attached to it', 'cmd.attachLoop');
  if ((f.track as any).magnetic) throw new CommandError('Clips on the magnetic track cannot be attached to other items', 'cmd.attachMagnetic');
  const times = resolveTimes(p), r = times.get(a.id)!, base = times.get(a.to)!.start;
  f.item.parent = a.to; f.item.start = r6(r.start - base); f.item.end = r6(r.end - base);
}

export function detach(p: Project, a: { id: string }) {
  const f = findItem(p, a.id), r = resolveTimes(p).get(a.id)!;
  delete f.item.parent; f.item.start = r6(r.start); f.item.end = r6(r.end);
}

/** Items hanging on a magnetic clip that start outside it (left there by a trim): [item id, clip id]. */
export function overruns(p: Project): Array<[string, string]> {
  const mag = magneticTrack(p);
  if (!mag) return [];
  const out: Array<[string, string]> = [];
  for (const c of items(mag)) for (const t of p.tracks) for (const it of items(t)) {
    if (it.parent === c.id && (it.start < -EPS || it.start >= c.end - c.start - EPS)) out.push([it.id, c.id]);
  }
  return out;
}

export function magneticWarnings(p: Project): string[] {
  if (!magneticTrack(p)) return [];
  const out = overruns(p).map(([id, c]) => `「${id}」超出它所屬的片段「${c}」`);
  for (const t of p.tracks) if (t.kind === 'music') for (const m of items(t) as any[]) {
    if (m.toEnd && m.end < p.meta.duration - EPS) out.push(`音樂「${m.id}」的檔案不夠長，停在 ${m.end.toFixed(2)} 秒（片長 ${p.meta.duration.toFixed(2)} 秒）`);
  }
  return out;
}
