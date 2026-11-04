// "Captions from speech" in the editor: the new captions look like the speech captions the film already has (the agent's cut
// made them with c.speechCaptions: a caption block, its style, karaoke words, short pieces), not like a plain core.caption of
// whole sentences beside them. Pure: the project in, the block and the caption plan's options out.
import { resolveTimes, type Project } from '@tellcut/engine';
import type { CaptionOptions } from '@tellcut/plugin-common/speech';

/** the caption blocks speech is put in */
const CAPTION_TYPES = new Set(['common.caption', 'core.caption']);
/** a caption's own words and timing: never copied from one caption to the next */
const OWN = new Set(['text', 'words', 'gloss', 'speaker', 'name']);

export interface CaptionLook { track?: string; type: string; params: Record<string, unknown>; options: CaptionOptions }

/**
 * How new captions for clip `id` should look: like the film's speech captions (captions hung on a video or sound clip) nearest
 * to it in time, on their track: the same block and settings, karaoke when theirs light up word by word, and pieces no longer
 * than the longest of them. With none, plain core.caption sentences.
 */
export function captionLook(p: Project, id: string): CaptionLook {
  const kinds = new Map(p.tracks.flatMap((t) => (t.items as any[]).map((i) => [i.id, t.kind] as const)));
  const times = resolveTimes(p), at = times.get(id)?.start ?? 0;
  const said = p.tracks.flatMap((t) => (t.items as any[]).filter((i) => CAPTION_TYPES.has(i.type) && i.parent !== undefined && i.parent !== id
    && (kinds.get(i.parent) === 'video' || kinds.get(i.parent) === 'audio') && String(i.params?.text ?? '').trim()).map((i) => ({ i, track: t.id })));
  if (!said.length) return { type: 'core.caption', params: {}, options: {} };
  const near = said.reduce((a, b) => (Math.abs((times.get(b.i.id)?.start ?? 0) - at) < Math.abs((times.get(a.i.id)?.start ?? 0) - at) ? b : a));
  const same = said.filter((x) => x.i.type === near.i.type);
  const params = Object.fromEntries(Object.entries(near.i.params ?? {}).filter(([k]) => !OWN.has(k)));
  const options: CaptionOptions = { maxChars: Math.max(...same.map((x) => [...String(x.i.params.text).trim()].length)) };
  if (Array.isArray(near.i.params?.words)) options.karaoke = true;
  return { track: near.track, type: near.i.type, params, options };
}
