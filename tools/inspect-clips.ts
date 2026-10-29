// inspect's map from the timeline back to the footage: which source each clip on the timeline plays, and from where in it.
// The overview pages, the source lines and this list all name a source by its id, so a clip can be found in all three.
import { resolveTimes, type Project } from '@tellcut/engine';
import { timecode1 } from '@tellcut/media-node';

export interface TimelineClip {
  /** the track's name (or id) */ track: string; start: number; end: number; source: string;
  /** where in the source it plays (seconds; none for a photo) */ in?: number; out?: number;
  /** speed (video) or rate (audio) when not 1 */ speed?: number; label?: string;
}

const r2 = (t: number) => Math.round(t * 100) / 100;

/** every clip that plays a source (video and audio tracks), in timeline order, at film times (a linked item's are relative to
 *  its parent); a clip's own sound (an audio item whose parent is a video clip of the same source) is left out: it says nothing new */
export function timelineClips(p: Pick<Project, 'tracks' | 'sources'>): TimelineClip[] {
  const out: TimelineClip[] = [], times = resolveTimes(p);
  const video = new Map(p.tracks.flatMap((t) => (t.kind === 'video' ? t.items.map((it) => [it.id, it.source] as const) : [])));
  for (const t of p.tracks) {
    if (t.kind !== 'video' && t.kind !== 'audio') continue;
    for (const it of t.items) {
      if (t.kind === 'audio' && it.parent !== undefined && video.get(it.parent) === it.source) continue;
      const { start, end } = times.get(it.id)!;
      const speed = 'speed' in it ? it.speed : it.rate, photo = p.sources[it.source]?.kind === 'image';
      out.push({ track: t.name ?? t.id, start: r2(start), end: r2(end), source: it.source,
        ...(photo ? {} : { in: r2(it.in), out: r2(it.in + (it.end - it.start) * speed) }), ...(speed !== 1 ? { speed } : {}), ...(it.label ? { label: it.label } : {}) });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.track.localeCompare(b.track));
}

/** One line per clip, `時間軸 ← 素材 入–出`, and the sources no clip uses; nothing when the timeline has no clips. */
export function formatClips(p: Pick<Project, 'tracks' | 'sources'>): string[] {
  const clips = timelineClips(p);
  if (!clips.length) return [];
  const tracks = new Set(clips.map((c) => c.track)).size > 1;   // the track only when there is more than one to tell apart
  const L = ['時間軸上的片段（時間軸 ← 素材 素材裡的入點–出點）：'];
  for (const c of clips) {
    const from = c.in === undefined ? '（照片）' : ` ${timecode1(c.in)}–${timecode1(c.out!)}`;
    L.push(`  ${tracks ? `${c.track} ` : ''}${timecode1(c.start)}–${timecode1(c.end)} ← ${c.source}${from}${c.speed ? ` ×${c.speed}` : ''}${c.label ? `「${c.label}」` : ''}`);
  }
  const used = new Set(clips.map((c) => c.source)), unused = Object.keys(p.sources).filter((s) => !used.has(s));
  if (unused.length) L.push(`  沒用到：${unused.join('、')}`);
  return L;
}
