// My caption templates (spec 2026-11-04-caption-styles §8): a caption's look saved under a name in the user's library,
// projects/_library/captions/<slug>.json. Like My blocks it is used by copying: the editor puts its parameters into the project's
// meta.captionTemplates (as my-<slug>), so a film never reads the library while it plays or exports.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LibraryError, SLUG, slugFor, writeJsonFile } from './store.ts';

export interface CaptionEntry { slug: string; name: string; desc: string; params: Record<string, unknown>; savedAt: string }

export const captionsDir = (root: string) => join(root, 'captions');
const fileOf = (root: string, slug: string) => {
  if (!SLUG.test(slug)) throw new LibraryError('library.badSlug', `不是合格的名稱：${slug}`, { slug });
  return join(captionsDir(root), `${slug}.json`);
};
/** what a caption template may set: its look, never a caption's own words, timing or speaker */
const OWN = new Set(['text', 'words', 'speaker', 'name', 'role', 'tag', 'gloss', 'quote', 'point', 'y', 'align', 'tint', 'template']);

export function listCaptions(root: string): CaptionEntry[] {
  let names: string[] = [];
  try { names = readdirSync(captionsDir(root)).filter((n) => n.endsWith('.json') && SLUG.test(n.slice(0, -5))); } catch { return []; }
  return names.flatMap((n) => {
    try {
      const e = JSON.parse(readFileSync(join(captionsDir(root), n), 'utf8'));
      return e && typeof e.name === 'string' && e.params && typeof e.params === 'object' ? [{ slug: n.slice(0, -5), name: e.name, desc: String(e.desc ?? ''), params: e.params, savedAt: String(e.savedAt ?? '') }] : [];
    } catch { return []; }
  }).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Saves a caption's look as a template of the user's own; its words, timing and speaker are left out. */
export function saveCaption(root: string, o: { name: string; desc?: string; params: Record<string, unknown> }): CaptionEntry {
  const name = o.name.trim();
  if (!name) throw new LibraryError('library.noName', '字幕範本要有名字');
  const params = Object.fromEntries(Object.entries(o.params ?? {}).filter(([k, v]) => !OWN.has(k) && v !== undefined));
  if (!Object.keys(params).length) throw new LibraryError('library.emptyCaption', '這個字幕沒有可以存的外觀設定');
  mkdirSync(captionsDir(root), { recursive: true });
  const slug = slugFor(name, 'caption', new Set(listCaptions(root).map((e) => e.slug)));
  const entry = { slug, name, desc: (o.desc ?? '').trim(), params, savedAt: new Date().toISOString() };
  const { slug: _s, ...rest } = entry;
  writeJsonFile(fileOf(root, slug), rest);
  return entry;
}

export function removeCaption(root: string, slug: string) {
  const f = fileOf(root, slug);
  if (!existsSync(f)) throw new LibraryError('library.noEntry', `沒有 ${slug}`, { slug });
  rmSync(f, { force: true });
}
