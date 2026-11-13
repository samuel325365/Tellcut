// Trimming, slipping, rolling and speed changes.
import type { Project } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { CommandError, type Found, findItem, fitOwn, followTrim, headIn, mediaRate, minLen, ownSounds, r6, scaleChildren, scaleRelative, shiftRelative, sourceLength, sourceNeed, fitFades } from './core.ts';

/** The longest a media clip may get by moving its end: as far as its source goes. A frozen clip holds one frame after freezeAt,
 *  so when freezeAt falls inside the source it may run on for ever; a freezeAt past the source's end does not lift the limit.
 *  Never less than a frame: music may start past the end of its file (its length is not checked on load). */
function longest(p: Project, f: Found, rate: number): number {
  const it = f.item as any, fits = (sourceLength(p, f.track, f.item) - it.in) / rate;
  return f.track.kind === 'video' && it.freezeAt != null && it.freezeAt <= fits + 1e-6 ? Infinity : Math.max(minLen(p), fits);
}

/** A clip of the magnetic main track: settle packs it from 0 after every command, so where its head lands on the timeline is
 *  not this command's to limit. */
const packed = (f: Found) => f.track.kind === 'video' && !!(f.track as any).magnetic;

/** How far an item's start may move back: to time 0, and not at all for one that already starts before 0 (a caption left
 *  there by a head trim of its clip): a lower bound of -start made any edit of it jump its start to 0. */
const backTo0 = (p: Project, id: string) => Math.min(0, -resolveTimes(p).get(id)!.start);

const noSfx = (kind: string) => { if (kind === 'sfx') throw new CommandError('Sound effects have a fixed length', 'cmd.sfxFixedLength'); };

/** Moves the item's start by dt; media items keep showing the same content at the same moments. */
export function trimStart(p: Project, a: { id: string; dt: number }) {
  const f = findItem(p, a.id), it = f.item as any;
  noSfx(f.track.kind);
  const rate = mediaRate(f.track, f.item), len = it.end - it.start;
  let dt = Math.min(a.dt, len - minLen(p));
  // on the magnetic track the clamp to 0 only stopped the first clip's head from being pulled back out (its source's start
  // below still limits it)
  if (!packed(f)) dt = Math.max(dt, backTo0(p, it.id));
  if (rate !== null) dt = Math.max(dt, -it.in / rate);
  it.start = r6(it.start + dt);
  if (rate !== null) it.in = headIn(f.track, it, dt, rate);
  shiftRelative(f.track, it, -dt);
  fitFades(f.track, it);
  // a media clip's children follow its picture; a block's keep their proportional place
  if (rate !== null) followTrim(p, it.id, len, it.end - it.start, dt); else scaleChildren(p, it.id, len, it.end - it.start);
}

/** Moves the item's end by dt, never past the end of its source. */
export function trimEnd(p: Project, a: { id: string; dt: number }) {
  const f = findItem(p, a.id), it = f.item as any;
  noSfx(f.track.kind);
  const rate = mediaRate(f.track, f.item), len = it.end - it.start;
  let dt = Math.max(a.dt, -(len - minLen(p)));
  if (rate !== null) dt = Math.min(dt, longest(p, f, rate) - len);
  it.end = r6(it.end + dt);
  fitFades(f.track, it);
  if (rate !== null) followTrim(p, it.id, len, it.end - it.start, 0); else scaleChildren(p, it.id, len, it.end - it.start);
}

/** Changes which part of the source is shown without moving the item (dt in source seconds). */
export function slip(p: Project, a: { id: string; dt: number }) {
  const f = findItem(p, a.id), it = f.item as any, rate = mediaRate(f.track, f.item);
  if (rate === null) throw new CommandError('Only media items can be slipped', 'cmd.slipMediaOnly');
  // a clip frozen at its first frame needs no source time, but its in-point must still be a frame of the source: one equal to
  // the source's length fails the schema (the project would no longer save)
  const len = sourceLength(p, f.track, f.item), max = Math.max(0, Math.min(len - sourceNeed(f.track.kind, it), len - minLen(p)));
  const own = ownSounds(p, it.id);
  const was = it.in;
  it.in = r6(Math.min(max, Math.max(0, it.in + a.dt)));
  // its own sound plays the same source moment as the picture, as far as the source goes (at its start too, as followTrim)
  for (const c of own) c.in = Math.max(0, r6(c.in + it.in - was));
  fitOwn(p, own, it.end - it.start);
}

/** Moves the cut between two touching items on the same track. */
export function roll(p: Project, a: { left: string; right: string; dt: number }) {
  const L = findItem(p, a.left), R = findItem(p, a.right), times = resolveTimes(p);
  if (L.track !== R.track || Math.abs(times.get(a.left)!.end - times.get(a.right)!.start) > 1e-6) throw new CommandError('Items are not adjacent', 'cmd.notAdjacent');
  const l = L.item as any, r = R.item as any, m = minLen(p);
  const rl = mediaRate(L.track, L.item), rr = mediaRate(R.track, R.item);
  const lenL = l.end - l.start, lenR = r.end - r.start;
  let dt = Math.min(Math.max(a.dt, -(lenL - m)), lenR - m);
  if (rl !== null) dt = Math.min(dt, longest(p, L, rl) - lenL);
  if (rr !== null) dt = Math.max(dt, -r.in / rr);
  l.end = r6(l.end + dt);
  r.start = r6(r.start + dt);
  if (rr !== null) r.in = headIn(R.track, r, dt, rr);
  shiftRelative(R.track, r, -dt);
  fitFades(L.track, l); fitFades(R.track, r);
  // like a trim: a media clip's children stay on the same picture, the others keep their proportional place
  if (rl !== null) followTrim(p, l.id, lenL, l.end - l.start, 0); else scaleChildren(p, l.id, lenL, l.end - l.start);
  if (rr !== null) followTrim(p, r.id, lenR, r.end - r.start, dt); else scaleChildren(p, r.id, lenR, r.end - r.start);
}

/** Changes the item's length by moving one edge while the same source range fills it (speed follows). */
export function rateStretch(p: Project, a: { id: string; edge: 'start' | 'end'; dt: number }) {
  const f = findItem(p, a.id), it = f.item as any;
  const key = f.track.kind === 'video' ? 'speed' : f.track.kind === 'audio' ? 'rate' : null;
  if (!key) throw new CommandError('Only video and audio clips can change speed', 'cmd.speedMediaOnly');
  // the clip's own sound plays at the clip's new speed (found before the length changes)
  const own = ownSounds(p, it.id);
  const oldLen = it.end - it.start, old = it[key];
  // an own sound speeds up with the clip and a sound plays at most 4×: the stretch stops when the fastest one gets there
  const maxRate = Math.min(key === 'speed' ? 16 : 4, ...own.map((c) => (old * 4) / c.rate));
  let newLen = Math.max(minLen(p), a.edge === 'end' ? oldLen + a.dt : oldLen - a.dt);
  // the start edge cannot pass time 0 (one already before 0 is not made shorter for it; the magnetic track packs from 0 anyway)
  if (a.edge === 'start' && !packed(f)) newLen = Math.min(newLen, oldLen - backTo0(p, it.id));
  let next = (old * oldLen) / newLen;
  if (next > maxRate) { next = maxRate; newLen = (old * oldLen) / maxRate; }
  it[key] = r6(next);
  if (a.edge === 'end') it.end = r6(it.start + newLen); else it.start = r6(it.end - newLen);
  scaleRelative(f.track, it, newLen / oldLen);
  fitFades(f.track, it);
  scaleChildren(p, it.id, oldLen, newLen);
  for (const c of own) c.rate = r6(c.rate * oldLen / newLen);
  fitOwn(p, own, newLen);
}
