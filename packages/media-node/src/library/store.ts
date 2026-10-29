// The user's own library (spec 2026-10-29-my-library §4.1): blocks and music styles saved from projects, kept in
// projects/_library/ (not in git, like every project). The tools and the server read and write it only through here.
//   blocks/<slug>/entry.json   the entry (BlockEntry without its slug); fx/…, media/… laid out as in the project; thumb.jpg
//   score/<slug>.js, <slug>.json  a music style and its entry (StyleEntry without its slug)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const libraryRoot = (projectsDir: string) => join(projectsDir, '_library');

/** one card: a block type of an entry, with the name and description the user sees */
export interface LibraryType { type: string; name: string; desc: string; category?: string }
/** where an entry was saved from: a project and the file in it */
export interface LibraryFrom { project: string; file: string }
/** an fx module and what it needs; `main` and `files` are relative to the entry's folder, laid out as in the project */
export interface BlockEntry { slug: string; types: LibraryType[]; main: string; files: string[]; from: LibraryFrom; savedAt: string; version: string;
  /** the source project's theme when it was saved: the thumbnail and previews draw with it */
  theme?: unknown }
export interface StyleEntry { slug: string; id: string; name: string; desc: string; from: LibraryFrom; savedAt: string; version: string }

/** a refusal the page words in its language (err.<code>, with params) */
export class LibraryError extends Error {
  constructor(public code: string, message: string, public params: Record<string, string> = {}) { super(message); }
}

export const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const checkSlug = (slug: string) => { if (!SLUG.test(slug)) throw new LibraryError('library.badSlug', `不是合格的名稱：${slug}`, { slug }); };

export const blocksDir = (root: string) => join(root, 'blocks');
export const stylesDir = (root: string) => join(root, 'score');
export function blockDir(root: string, slug: string) { checkSlug(slug); return join(blocksDir(root), slug); }

const readJson = (file: string): any => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
/** writes through a temporary file, so a failure never leaves half a file */
export function writeJsonFile(file: string, value: unknown) {
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

export function readBlock(root: string, slug: string): BlockEntry | null {
  const e = readJson(join(blockDir(root, slug), 'entry.json'));
  return e && Array.isArray(e.types) ? { ...e, slug } : null;
}
export function readStyle(root: string, slug: string): StyleEntry | null {
  checkSlug(slug);
  const e = readJson(join(stylesDir(root), `${slug}.json`));
  return e && typeof e.id === 'string' && existsSync(join(stylesDir(root), `${slug}.js`)) ? { ...e, slug } : null;
}
export function writeBlockEntry(root: string, e: BlockEntry) { const { slug, ...rest } = e; writeJsonFile(join(blockDir(root, slug), 'entry.json'), rest); }
export function writeStyleEntry(root: string, e: StyleEntry) { const { slug, ...rest } = e; checkSlug(slug); writeJsonFile(join(stylesDir(root), `${slug}.json`), rest); }

const names = (dir: string, f: (n: string) => boolean) => { try { return readdirSync(dir).filter(f).sort(); } catch { return []; } };

/** every entry, by slug; a folder that is not an entry (half written, edited by hand) is left out */
export function listLibrary(root: string): { blocks: BlockEntry[]; styles: StyleEntry[] } {
  const blocks = names(blocksDir(root), (n) => SLUG.test(n)).map((s) => readBlock(root, s)).filter((e): e is BlockEntry => !!e);
  const styles = names(stylesDir(root), (n) => n.endsWith('.json') && SLUG.test(n.slice(0, -5))).map((n) => readStyle(root, n.slice(0, -5))).filter((e): e is StyleEntry => !!e);
  return { blocks, styles };
}

export function removeBlock(root: string, slug: string) {
  const dir = blockDir(root, slug);
  if (!existsSync(dir)) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${slug}`, { slug });
  rmSync(dir, { recursive: true, force: true });
}
export function removeStyle(root: string, slug: string) {
  if (!readStyle(root, slug)) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${slug}`, { slug });
  for (const ext of ['.js', '.json']) rmSync(join(stylesDir(root), `${slug}${ext}`), { force: true });
}

/** a card's name, description or category changed; the others stay */
export function renameType(root: string, slug: string, type: string, patch: Partial<Omit<LibraryType, 'type'>>): BlockEntry {
  const e = readBlock(root, slug), t = e?.types.find((x) => x.type === type);
  if (!e || !t) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${slug} ${type}`, { slug });
  for (const k of ['name', 'desc', 'category'] as const) if (typeof patch[k] === 'string') t[k] = patch[k]!.trim() || (k === 'name' ? t.name : '');
  if (t.category === '') delete t.category;
  writeBlockEntry(root, e);
  return e;
}
export function renameStyle(root: string, slug: string, patch: { name?: string; desc?: string }): StyleEntry {
  const e = readStyle(root, slug);
  if (!e) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${slug}`, { slug });
  if (patch.name?.trim()) e.name = patch.name.trim();
  if (typeof patch.desc === 'string') e.desc = patch.desc.trim();
  writeStyleEntry(root, e);
  return e;
}

/** the files' contents in path order, hashed: a new version whenever any of them changes */
export function versionOf(dir: string, files: string[]): string {
  const h = createHash('sha1');
  for (const f of [...files].sort()) { h.update(f); h.update('\0'); h.update(readFileSync(join(dir, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 12);
}

/** a slug from a name (ASCII words joined by hyphens), else from `fallback`; -2, -3… when taken */
export function slugFor(name: string, fallback: string, taken: Set<string>): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/, '');
  const base = clean(name) || clean(fallback) || 'item';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
