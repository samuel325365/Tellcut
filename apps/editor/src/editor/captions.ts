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
 * than the longest of them. With none, common.caption lighting up word by word (spec 2026-11-04-caption-styles §3).
 */
export function captionLook(p: Project, id: string): CaptionLook {
  const kinds = new Map(p.tracks.flatMap((t) => (t.items as any[]).map((i) => [i.id, t.kind] as const)));
  const times = resolveTimes(p), at = times.get(id)?.start ?? 0;
  const said = p.tracks.flatMap((t) => (t.items as any[]).filter((i) => CAPTION_TYPES.has(i.type) && i.parent !== undefined && i.parent !== id
    && (kinds.get(i.parent) === 'video' || kinds.get(i.parent) === 'audio') && String(i.params?.text ?? '').trim()).map((i) => ({ i, track: t.id })));
  // none yet: the shared caption block, lighting up word by word (the project's default template, when it has one, is its look)
  if (!said.length) return { type: 'common.caption', params: {}, options: { karaoke: true } };
  const near = said.reduce((a, b) => (Math.abs((times.get(b.i.id)?.start ?? 0) - at) < Math.abs((times.get(a.i.id)?.start ?? 0) - at) ? b : a));
  const same = said.filter((x) => x.i.type === near.i.type);
  const params = Object.fromEntries(Object.entries(near.i.params ?? {}).filter(([k]) => !OWN.has(k)));
  const options: CaptionOptions = { maxChars: Math.max(...same.map((x) => [...String(x.i.params.text).trim()].length)) };
  if (Array.isArray(near.i.params?.words)) options.karaoke = true;
  return { track: near.track, type: near.i.type, params, options };
}

/** what a caption keeps when a template is put on it: its words, their timing, who says them and where it sits; the rest (style,
 *  colours, font, size, animation) is the template's */
const KEEP = new Set(['text', 'words', 'speaker', 'name', 'role', 'tag', 'gloss', 'quote', 'point', 'y', 'align', 'tint']);

/** Every common.caption on `track` drawn with `template` (a template id; '' for the project's default): its look parameters are
 *  dropped so the template's show (spec 2026-11-04-caption-styles §4). Returns how many captions changed. */
export function applyCaptionTemplate(d: Project, track: string, template: string): number {
  let n = 0;
  for (const t of d.tracks) {
    if (t.id !== track) continue;
    for (const it of t.items as any[]) {
      if (it.type !== 'common.caption') continue;
      const params = Object.fromEntries(Object.entries(it.params ?? {}).filter(([k]) => KEEP.has(k)));
      if (template) params.template = template;
      it.params = params;
      n++;
    }
  }
  return n;
}

/** the project's default caption template ('' for none): every caption that names no template of its own draws with it */
export function setCaptionTemplate(d: Project, template: string) {
  if (template) d.meta.captionTemplate = template;
  else delete d.meta.captionTemplate;
}
