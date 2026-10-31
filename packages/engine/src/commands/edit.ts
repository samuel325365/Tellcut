// Field edits from the properties panel, the library and crop mode. Every result must still validate.
import type { ZodIssue } from 'zod';
import { plainCopy as plain } from '../util.ts';
import { AudioItemZ, MusicItemZ, OverlayItemZ, SceneItemZ, SfxItemZ, VideoItemZ, type AnyItem, type Crop, type Project, type TrackKind, type Transform } from '../schema.ts';
import { CommandError, findItem, fitFades, fitOwn, followTrim, mediaRate, ownSounds, r6, scaleChildren, sourceNeed, uniqueId } from './core.ts';
import { cropAt } from '../geometry.ts';

const ITEM_Z = { video: VideoItemZ, scene: SceneItemZ, overlay: OverlayItemZ, music: MusicItemZ, audio: AudioItemZ, sfx: SfxItemZ } as const;
const BASE: Record<TrackKind, string> = { video: 'clip', music: 'music', audio: 'audio', sfx: 'sfx', scene: 'scene', overlay: 'fx' };
const AUDIO_KINDS = new Set<TrackKind>(['music', 'audio', 'sfx']);
const VISUAL_KINDS = new Set<TrackKind>(['scene', 'video', 'overlay']);

/** A field the schema refuses: the message lists every problem, the code words the first one for the panel. */
function fieldError(issues: ZodIssue[]): CommandError {
  const i = issues[0], field = i.path.join('.') || 'item', msg = issues.map((x) => `${x.path.join('.') || 'item'}: ${x.message}`).join('; ');
  if (i.code === 'too_small' && i.type === 'number') return new CommandError(msg, i.inclusive ? 'cmd.fieldMin' : 'cmd.fieldAbove', { field, min: Number(i.minimum) });
  if (i.code === 'too_big' && i.type === 'number') return new CommandError(msg, i.inclusive ? 'cmd.fieldMax' : 'cmd.fieldBelow', { field, max: Number(i.maximum) });
  return new CommandError(msg, 'cmd.fieldInvalid', { field });
}

/** Validates one item of a track kind against the schema and the project (sources, media, in-point). */
export function checkItem(p: Project, kind: TrackKind, raw: Record<string, unknown>): AnyItem {
  const r = ITEM_Z[kind].safeParse(raw);
  if (!r.success) throw fieldError(r.error.issues);
  const it = r.data as any;
  if (!(it.end > it.start)) throw new CommandError('end: end must be greater than start', 'cmd.endBeforeStart');
  if ('source' in it) {
    const s = p.sources[it.source];
    if (!s) throw new CommandError(`source: unknown source "${it.source}"`, 'cmd.noSource', { source: it.source });
    if (it.in >= s.duration) throw new CommandError(`in: ${it.in} s is past the end of source "${it.source}" (${s.duration} s)`, 'cmd.inPastEnd', { in: it.in, source: it.source, have: s.duration });
  }
  const len = it.end - it.start, n3 = (v: number) => Math.round(v * 1000) / 1000;
  if ((kind === 'music' || kind === 'audio') && it.fadeIn + it.fadeOut > len + 1e-6)
    throw new CommandError(`fadeIn: fade-in plus fade-out (${n3(it.fadeIn + it.fadeOut)} s) is longer than the clip (${n3(len)} s)`, 'cmd.fadesTooLong', { fades: n3(it.fadeIn + it.fadeOut), len: n3(len) });
  if ((kind === 'video' || kind === 'audio') && p.sources[it.source]) {
    // the source time the clip plays: after freezeAt a video holds one frame
    const used = sourceNeed(kind, it);
    const has = p.sources[it.source].duration;
    // speed/rate are rounded to 1e-6 (r6): allow that rounding over the clip length
    if (it.in + used > has + 1e-6 * (1 + len))
      throw new CommandError(`end: the clip runs past the end of source "${it.source}" (needs ${n3(it.in + used)} s, has ${n3(has)} s)`, 'cmd.clipPastEnd', { source: it.source, need: n3(it.in + used), have: n3(has) });
  }
  if ('media' in it && !(it.media in p.media)) throw new CommandError(`media: unknown media "${it.media}"`, 'cmd.noMedia', { media: it.media });
  return it;
}


/** Sets fields of one item (undefined removes a field); id cannot change; children follow a length change the way a trim moves them. */
export function updateItem(p: Project, a: { id: string; patch: Record<string, unknown> }) {
  const f = findItem(p, a.id), it = f.item as any;
  if ('id' in a.patch && a.patch.id !== a.id) throw new CommandError('id: an item id cannot be changed', 'cmd.idFixed');
  const next = { ...plain(it), ...a.patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  // a new length from the panel keeps the fades inside the clip unless the fades themselves are being set
  const fitsFades = !('fadeIn' in a.patch || 'fadeOut' in a.patch);
  if (fitsFades) fitFades(f.track, next);
  checkItem(p, f.track.kind, next);
  const oldLen = it.end - it.start, oldIn = it.in, rate = mediaRate(f.track, f.item);
  // a media clip's own sound follows a new in-point and length, and plays at a new speed too (like a rate stretch)
  const own = rate !== null ? ownSounds(p, it.id) : [];
  const k = rate !== null ? mediaRate(f.track, next as AnyItem)! / rate : 1;
  // a sound plays at most 4× and within its source: refused before anything changes, like checkItem
  const field = f.track.kind === 'video' ? 'speed' : 'rate', len = next.end - next.start, n3 = (v: number) => Math.round(v * 1000) / 1000;
  for (const c of own) {
    if (r6(c.rate * k) > 4) throw new CommandError(`${field}: the clip's own sound cannot play faster than 4× (it would need ${r6(c.rate * k)}×)`, 'cmd.ownSoundTooFast', { need: r6(c.rate * k) });
    // a frozen clip plays less of its source than its sound, which goes on past freezeAt: checkItem passed the picture, so a
    // new speed is refused when the sound would need more than the source has, as a clip without freezeAt is there. A new
    // in-point or end only moves where the sound stops (fitOwn below, like slip and trimEnd); other fields never touch it.
    if (k === 1) continue;
    const slen = (c.end - c.start) * (oldLen > 0 ? len / oldLen : 1);
    const has = p.sources[c.source]?.duration ?? Infinity, need = r6(c.in + next.in - oldIn) + slen * r6(c.rate * k);
    if (need > has + 1e-6 * (1 + slen)) throw new CommandError(`${field}: the clip's own sound runs past the end of source "${c.source}" (needs ${n3(need)} s, has ${n3(has)} s)`, 'cmd.ownSoundPastEnd', { source: c.source, need: n3(need), have: n3(has) });
  }
  for (const [key, v] of Object.entries(a.patch)) { if (v === undefined) delete it[key]; else it[key] = plain(v); }
  if (fitsFades) fitFades(f.track, it);
  for (const c of own) { c.in = r6(c.in + it.in - oldIn); c.rate = r6(c.rate * k); }
  // a block or a clip at a new speed: the children keep their proportional place; at its old speed the others stay on the same picture
  if (rate === null || k !== 1) scaleChildren(p, it.id, oldLen, it.end - it.start);
  else followTrim(p, it.id, oldLen, it.end - it.start, 0);
  fitOwn(p, own, it.end - it.start);
}

/** Appends a validated item to a track; returns its id (a free one based on the item's id or the track kind). */
export function addItem(p: Project, a: { track: string; item: Record<string, unknown> }): string {
  const t = p.tracks.find((x) => x.id === a.track);
  // the page chat once guessed a "v2" and did not know a track can be added in the same proposal
  if (!t) throw new CommandError(`No track "${a.track}" (tracks: ${p.tracks.map((x) => x.id).join(', ')}; a new one: addTrack {kind, name?, as} first, then use its "$name")`, 'cmd.noTrack', { id: a.track });
  const id = uniqueId(p, typeof a.item.id === 'string' ? a.item.id : BASE[t.kind]);
  (t.items as AnyItem[]).push(plain(checkItem(p, t.kind, { ...a.item, id })));
  return id;
}

/** Adds an empty track: visual kinds become the topmost visual layer, audio kinds go last. */
export function addTrack(p: Project, a: { kind: TrackKind; name?: string }): string {
  const id = uniqueId(p, a.kind);
  const track: any = { id, kind: a.kind, items: [], ...(a.name ? { name: a.name } : {}), ...(AUDIO_KINDS.has(a.kind) ? { gain: 0 } : {}) };
  if (VISUAL_KINDS.has(a.kind)) {
    const lastVisual = p.tracks.reduce((at, t, i) => (VISUAL_KINDS.has(t.kind) ? i : at), -1);
    p.tracks.splice(lastVisual + 1, 0, track);
  } else p.tracks.push(track);
  return id;
}

/** Footage, photos and music brought in from this PC (the media panel's Import): a file the project already has (by path,
 *  in any case) is left out; a taken id is refused. Returns the ids added. */
export function addSources(p: Project, a: { sources?: Project['sources']; media?: Project['media'] }): string[] {
  const key = (path: string) => path.replace(/\\/g, '/').toLowerCase();
  const have = new Set([...Object.values(p.sources), ...Object.values(p.media)].map((x) => key(x.path)));
  const added: string[] = [];
  for (const [map, into] of [[a.sources ?? {}, p.sources], [a.media ?? {}, p.media]] as const) {
    for (const [id, entry] of Object.entries(map)) {
      if (id in p.sources || id in p.media) throw new CommandError(`Source "${id}" already exists`, 'cmd.sourceExists', { id });
      if (have.has(key(entry.path))) continue;
      have.add(key(entry.path));
      (into as Record<string, unknown>)[id] = plain(entry);
      added.push(id);
    }
  }
  return added;
}

/** Track bus: mute on any track (visual = hidden), gain (-60..+12 dB) and solo on audio tracks. */
export function setTrack(p: Project, a: { id: string; patch: { gain?: number; muted?: boolean; solo?: boolean; name?: string } }) {
  const t = p.tracks.find((x) => x.id === a.id) as any;
  if (!t) throw new CommandError(`No track "${a.id}"`, 'cmd.noTrack', { id: a.id });
  const audio = AUDIO_KINDS.has(t.kind);
  if (!audio && (a.patch.gain !== undefined || a.patch.solo !== undefined)) throw new CommandError(`Track "${a.id}" (${t.kind}) has no bus gain or solo`, 'cmd.noBus', { id: a.id, kind: t.kind });
  if (a.patch.gain !== undefined) t.gain = Math.round(Math.min(12, Math.max(-60, a.patch.gain)) * 10) / 10;
  if (a.patch.muted !== undefined) t.muted = a.patch.muted;
  if (a.patch.solo !== undefined) t.solo = a.patch.solo;
  if (a.patch.name !== undefined) t.name = a.patch.name;
}

/** Which crop crop mode edits: the clip's first frame, its last, or a keyframe by index. */
export type CropWhich = 'from' | 'to' | number;

const clampCrop = (c: Crop) => { const k = (v: number, lo: number, hi: number) => r6(Math.min(hi, Math.max(lo, v))); return { x: k(c.x, 0, 1), y: k(c.y, 0, 1), zoom: k(c.zoom, 1, 8) }; };
const videoOf = (p: Project, id: string) => {
  const f = findItem(p, id);
  if (f.track.kind !== 'video') throw new CommandError('Only video clips have a crop', 'cmd.cropVideoOnly');
  return f.item as any;
};

export function setCrop(p: Project, a: { id: string; which: CropWhich; crop: Crop }) {
  const it = videoOf(p, a.id), c = clampCrop(a.crop);
  if (typeof a.which === 'number') {
    const k = it.crop.keys?.[a.which];
    if (!k) throw new CommandError(`No crop keyframe ${a.which}`, 'cmd.noCropKey', { index: a.which });
    Object.assign(k, c);
  } else it.crop[a.which] = c;
}

/** Inserts a crop keyframe at clip-local `t` holding the crop shown there now; returns its index. */
export function addCropKey(p: Project, a: { id: string; t: number }): number {
  const it = videoOf(p, a.id), len = it.end - it.start, t = r6(a.t);
  if (!(t > 0 && t < len)) throw new CommandError('A crop keyframe must be inside the clip (not at its start or end)', 'cmd.cropKeyInside');
  const keys: Array<{ t: number }> = (it.crop.keys ??= []);
  if (keys.some((k) => Math.abs(k.t - t) < 1e-3)) throw new CommandError('There is already a crop keyframe at this time', 'cmd.cropKeyTaken');
  keys.push({ t, ...clampCrop(cropAt(it.crop, t, len)) });
  keys.sort((x, y) => x.t - y.t);
  return keys.findIndex((k) => k.t === t);
}

export function removeCropKey(p: Project, a: { id: string; index: number }) {
  const it = videoOf(p, a.id);
  if (!it.crop.keys?.[a.index]) throw new CommandError(`No crop keyframe ${a.index}`, 'cmd.noCropKey', { index: a.index });
  it.crop.keys.splice(a.index, 1);
  if (!it.crop.keys.length) delete it.crop.keys;
}

/** Moves / scales a scene or overlay item (preview handles, properties panel); null puts it back. */
export function setTransform(p: Project, a: { id: string; transform: Transform | null }) {
  const f = findItem(p, a.id);
  if (f.track.kind !== 'scene' && f.track.kind !== 'overlay') throw new CommandError('Only scene and overlay items can be moved or scaled', 'cmd.transformSceneOnly');
  const it = f.item as any;
  if (!a.transform) { delete it.transform; return; }
  const c = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 1e4) / 1e4;
  const t = a.transform, old = it.transform as Transform | undefined;
  const next: Transform = { x: c(t.x, -1, 1), y: c(t.y, -1, 1), scale: c(t.scale, 0.05, 10), ox: c(t.ox ?? 0.5, 0, 1), oy: c(t.oy ?? 0.5, 0, 1) };
  // a moving layer (toolkit phase 5): moving or scaling it carries its whole path along; keys given anew replace it;
  // `keys: []` stops it moving
  let keys = t.keys;
  if (old?.keys?.length && (!keys || JSON.stringify(keys) === JSON.stringify(old.keys))) {
    // a new origin O' keeps the picture with T' = T + (1 − s)(O − O'): each key by its own scale; what is left is the move
    const ox0 = old.ox ?? 0.5, oy0 = old.oy ?? 0.5, ex = ox0 - next.ox!, ey = oy0 - next.oy!;
    const dx = next.x - old.x - (1 - old.scale) * ex, dy = next.y - old.y - (1 - old.scale) * ey, k = next.scale / old.scale;
    keys = old.keys.map((q) => ({ t: q.t, x: c(q.x + (1 - q.scale) * ex + dx, -1, 1), y: c(q.y + (1 - q.scale) * ey + dy, -1, 1), scale: c(q.scale * k, 0.05, 10) }));
  }
  it.transform = keys?.length ? { ...next, keys: keys.map((q) => ({ t: q.t, x: c(q.x, -1, 1), y: c(q.y, -1, 1), scale: c(q.scale, 0.05, 10) })) } : next;
}

/** Another shot for a video clip: same place and length on the timeline (its own sound swaps with it). */
export function swapSource(p: Project, a: { id: string; source: string; in: number }) {
  const f = findItem(p, a.id), it = f.item as any;
  if (f.track.kind !== 'video') throw new CommandError('Only video clips can swap footage', 'cmd.swapVideoOnly');
  const src = p.sources[a.source];
  if (!src) throw new CommandError(`No source "${a.source}"`, 'cmd.noSource', { source: a.source });
  const need = sourceNeed(f.track.kind, it), have = src.duration - a.in;
  if (a.in < 0 || have + 1e-6 < need) throw new CommandError(`"${a.source}" has only ${Math.max(0, have).toFixed(2)} s from ${a.in} s; the clip needs ${need.toFixed(2)} s`, 'cmd.sourceShort', { source: a.source, in: a.in, have: Math.max(0, have).toFixed(2), need: need.toFixed(2) });
  const own = ownSounds(p, it.id);
  for (const c of own) { c.source = a.source; c.in = r6(a.in); }
  it.source = a.source; it.in = r6(a.in);
  fitOwn(p, own, it.end - it.start);
}
