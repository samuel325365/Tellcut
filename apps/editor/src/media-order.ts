// The Media panel's order (the UX pass of 2026-10-29): which sources and music the timeline uses, where each is first heard or seen,
// and which stretches of a source are on it, so the panel can follow the film instead of the order the files were added in.
import type { Project } from '@tellcut/engine';

export type MediaSort = 'timeline' | 'added' | 'name';
export const MEDIA_SORTS: MediaSort[] = ['timeline', 'added', 'name'];

/** a stretch of a source shorter than this on both sides of a segment's edge does not count as using that segment */
const EDGE = 0.05;

export interface MediaUse {
  /** a source or music id → the earliest timeline time it starts at */
  first: Map<string, number>;
  /** a source id → the stretches of it (source seconds) items play */
  ranges: Map<string, Array<[number, number]>>;
}

/** where the timeline uses each source (video and source-audio items) and each music file */
export function mediaUse(p: Project): MediaUse {
  const first = new Map<string, number>(), ranges = new Map<string, Array<[number, number]>>();
  const seen = (id: string, t: number) => { if (!(first.get(id)! <= t)) first.set(id, t); };
  for (const tr of p.tracks) for (const it of tr.items as any[]) {
    if (tr.kind === 'music' && typeof it.media === 'string') { seen(it.media, it.start); continue; }
    if ((tr.kind !== 'video' && tr.kind !== 'audio') || typeof it.source !== 'string') continue;
    seen(it.source, it.start);
    const rate = (tr.kind === 'video' ? it.speed : it.rate) ?? 1, from = it.in ?? 0;
    const list = ranges.get(it.source) ?? [];
    list.push([from, from + (it.end - it.start) * rate]);
    ranges.set(it.source, list);
  }
  return { first, ranges };
}

/** whether any item plays part of [a, b] of the source */
export const segmentUsed = (ranges: Array<[number, number]> | undefined, a: number, b: number) =>
  !!ranges?.some(([x, y]) => Math.min(y, b) - Math.max(x, a) > EDGE);

/** the ids in the chosen order. timeline: in the order the film first uses them, the unused ones apart (in the order they were added);
 *  added: as listed in project.json; name: by the name shown (`label`). Only timeline order sets anything apart. */
export function orderMedia(ids: string[], sort: MediaSort, first: Map<string, number>, label: (id: string) => string): { used: string[]; unused: string[] } {
  if (sort === 'added') return { used: ids, unused: [] };
  if (sort === 'name') return { used: [...ids].sort((a, b) => label(a).localeCompare(label(b), undefined, { numeric: true, sensitivity: 'base' })), unused: [] };
  const at = (id: string) => first.get(id)!;
  return { used: ids.filter((id) => first.has(id)).sort((a, b) => at(a) - at(b)), unused: ids.filter((id) => !first.has(id)) };
}

/** narration the Cut API wrote (media/voice/…) is shown apart from music */
export const isVoice = (m: { path: string }) => /^media[\\/]voice[\\/]/.test(m.path);
