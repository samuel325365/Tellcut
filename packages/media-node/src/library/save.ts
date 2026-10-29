// Saving into the user's library (spec 2026-10-29-my-library §4.2): an fx module with the files it imports and the project
// files it names (fonts, pictures), or a music style. The entry keeps the project's layout (fx/…, media/…), so
// media.fileUrl('media/…') finds the same file in a preview of the entry and in any project it is copied into.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { loadProjectFx } from '../fx.ts';
import { loadStyles, SCORE_LIBRARY } from '../score/local.ts';
import { STYLES } from '../score/styles.ts';
import { blockDir, blocksDir, LibraryError, listLibrary, readBlock, slugFor, stylesDir, versionOf, writeBlockEntry, writeStyleEntry,
  type BlockEntry, type LibraryFrom, type LibraryType, type StyleEntry } from './store.ts';

export type OnConflict = 'replace' | 'keep-both';
export interface SaveBlockInput { root: string; projectDir: string; projectId: string; file: string;
  names?: Record<string, Partial<Omit<LibraryType, 'type'>>>; onConflict?: OnConflict }
export type SaveResult = { entry: BlockEntry; skipped: string[] } | { conflict: { slug: string; name: string; types: string[] } };

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"\n]+)['"]/g;
const MEDIA = /['"](media\/[^'"\n]+)['"]/g;
const COMPUTED = /`[^`]*media\/[^`]*\$\{[^`]*`/g;
const toPosix = (p: string) => p.split(sep).join('/');

/** the project files `file` needs (paths relative to the project): its relative imports, followed, and the media/… files it
 *  names in a plain string. A path built at run time cannot be followed: it is listed in `skipped`. An import that leaves
 *  fx/ is refused, as the entry is copied into fx/lib/<slug>/ where it would no longer be found. */
export function collectFiles(projectDir: string, file: string): { files: string[]; skipped: string[] } {
  const root = resolve(projectDir), fxRoot = join(root, 'fx');
  const files = new Set<string>(), skipped: string[] = [], todo = [resolve(root, file)];
  while (todo.length) {
    const abs = todo.pop()!, rel = toPosix(relative(root, abs));
    if (files.has(rel)) continue;
    if (!abs.startsWith(fxRoot + sep)) throw new LibraryError('library.outsideFx', `${rel} 在 fx 資料夾之外`, { file: rel });
    if (!existsSync(abs)) { skipped.push(rel); continue; }
    files.add(rel);
    const src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(IMPORT)) todo.push(resolve(dirname(abs), m[1]));
    for (const m of src.matchAll(MEDIA)) {
      const p = resolve(root, m[1]);
      if (p.startsWith(join(root, 'media') + sep) && existsSync(p)) files.add(toPosix(relative(root, p)));
      else skipped.push(m[1]);
    }
    for (const m of src.matchAll(COMPUTED)) skipped.push(m[0]);
  }
  return { files: [...files], skipped };
}

/** `from` in quotes changed to `to` when it appears exactly once (a block's type id in its module); null otherwise */
export function renameId(src: string, from: string, to: string): string | null {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp(`(['"])${esc}\\1`, 'g');
  const hits = src.match(re);
  return hits?.length === 1 ? src.replace(re, (_m, q) => `${q}${to}${q}`) : null;
}

/** the module (of `fx`, relative to the project) that defines block `type`; each is loaded alone, so a broken one does not hide the others */
export async function findFxFile(projectDir: string, fx: string[] | undefined, type: string): Promise<string | null> {
  for (const path of fx ?? []) {
    const r = await loadProjectFx(projectDir, [path]);
    if (r.plugin.items?.some((t) => t.type === type) || r.plugin.sfx?.some((s) => s.type === type)) return path;
  }
  return null;
}

const sameFrom = (a: LibraryFrom, b: LibraryFrom) => a.project === b.project && a.file === b.file;
const projectMeta = (dir: string): { theme?: unknown } => { try { return JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).meta ?? {}; } catch { return {}; } };
/** an id not in `taken`: x-2, x-3… */
const freeId = (id: string, taken: Set<string>) => { for (let i = 2; ; i++) if (!taken.has(`${id}-${i}`)) return `${id}-${i}`; };

export async function saveBlock(i: SaveBlockInput): Promise<SaveResult> {
  const loaded = await loadProjectFx(i.projectDir, [i.file]);
  if (loaded.errors.length) throw new LibraryError('library.loadFailed', `${i.file} 載入失敗：${loaded.errors[0].message}`, { file: i.file });
  const items = loaded.plugin.items ?? [];
  if (!items.length) throw new LibraryError('library.noBlocks', `${i.file} 裡沒有積木`, { file: i.file });
  const { files, skipped } = collectFiles(i.projectDir, i.file);
  const from: LibraryFrom = { project: i.projectId, file: i.file };
  const lib = listLibrary(i.root), ids = items.map((t) => t.type);
  const hit = lib.blocks.filter((e) => e.types.some((t) => ids.includes(t.type)));
  // the same file saved again (edited since) is an update; anything else the user decides
  const mine = hit.find((e) => sameFrom(e.from, from)), others = hit.filter((e) => e !== mine);
  const renames = new Map<string, string>();
  let slug = mine?.slug, drop = mine ? [mine] : [];
  if (others.length) {
    if (!i.onConflict) return { conflict: { slug: others[0].slug, name: others[0].types[0]?.name ?? others[0].slug, types: ids.filter((x) => others.some((e) => e.types.some((t) => t.type === x))) } };
    if (i.onConflict === 'replace') { slug ??= others[0].slug; drop = hit; }
    else {
      const taken = new Set([...lib.blocks.flatMap((e) => e.types.map((t) => t.type)), ...ids]);
      for (const x of ids) if (others.some((e) => e.types.some((t) => t.type === x))) { const to = freeId(x, taken); taken.add(to); renames.set(x, to); }
    }
  }
  const types: LibraryType[] = items.map((t) => {
    const n = i.names?.[t.type] ?? {}, type = renames.get(t.type) ?? t.type;
    const category = n.category ?? t.category;
    return { type, name: n.name?.trim() || t.label, desc: (n.desc ?? t.doc ?? '').trim(), ...(category ? { category } : {}) };
  });
  const taken = new Set(lib.blocks.filter((e) => !drop.includes(e)).map((e) => e.slug));
  slug ??= slugFor(types[0].name, types[0].type.replace(/^fx\./, ''), taken);

  // copied into a folder of its own first, then put in place: a failure leaves the library as it was
  const stage = join(blocksDir(i.root), `.${slug}.tmp-${process.pid}-${Date.now()}`);
  try {
    for (const f of files) { mkdirSync(dirname(join(stage, f)), { recursive: true }); copyFileSync(join(i.projectDir, f), join(stage, f)); }
    for (const [x, to] of renames) {
      const fx = files.filter((f) => f.startsWith('fx/')), texts = fx.map((f) => readFileSync(join(stage, f), 'utf8'));
      const at = texts.map((s) => renameId(s, x, to)), one = at.filter((s) => s !== null).length === 1 && texts.filter((s) => s.includes(x)).length === 1;
      const k = at.findIndex((s) => s !== null);
      if (!one || k < 0) throw new LibraryError('library.renameFailed', `${x} 在程式裡出現不只一次，沒辦法自動改名`, { type: x });
      writeFileSync(join(stage, fx[k]), at[k]!);
    }
    const entry: BlockEntry = { slug, types, main: i.file, files, from, savedAt: new Date().toISOString(), version: versionOf(stage, files),
      ...(projectMeta(i.projectDir).theme ? { theme: projectMeta(i.projectDir).theme } : {}) };
    for (const e of drop) rmSync(blockDir(i.root, e.slug), { recursive: true, force: true });
    rmSync(blockDir(i.root, slug), { recursive: true, force: true });
    renameSync(stage, blockDir(i.root, slug));
    writeBlockEntry(i.root, entry);
    return { entry: readBlock(i.root, slug)!, skipped };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

export async function saveStyle(i: { root: string; projectDir: string; projectId: string; id: string; name?: string; desc?: string; onConflict?: OnConflict }):
  Promise<{ entry: StyleEntry } | { conflict: { slug: string; name: string } }> {
  const own = await loadStyles([join(i.projectDir, 'score')]), s = own.styles[i.id];
  if (!s) throw new LibraryError('library.noStyle', `專案裡沒有配樂風格 ${i.id}`, { id: i.id });
  const file = posix.join('score', toPosix(relative(join(i.projectDir, 'score'), s.file)));
  const from: LibraryFrom = { project: i.projectId, file };
  const lib = listLibrary(i.root), hit = lib.styles.find((e) => e.id === i.id);
  let id = i.id, slug: string | undefined, drop: StyleEntry | undefined;
  if (hit && sameFrom(hit.from, from)) { slug = hit.slug; drop = hit; }
  else if (hit) {
    if (!i.onConflict) return { conflict: { slug: hit.slug, name: hit.name } };
    if (i.onConflict === 'replace') { slug = hit.slug; drop = hit; }
    else {
      const shared = await loadStyles([SCORE_LIBRARY]);
      id = freeId(i.id, new Set([...lib.styles.map((e) => e.id), ...Object.keys(STYLES), ...Object.keys(shared.styles)]));
    }
  }
  let text = readFileSync(s.file, 'utf8');
  if (id !== i.id) {
    const renamed = renameId(text, i.id, id);
    if (renamed === null) throw new LibraryError('library.renameFailed', `${i.id} 在程式裡出現不只一次，沒辦法自動改名`, { type: i.id });
    text = renamed;
  }
  slug ??= slugFor(id, id, new Set(lib.styles.map((e) => e.slug)));
  mkdirSync(stylesDir(i.root), { recursive: true });
  if (drop && drop.slug !== slug) for (const ext of ['.js', '.json']) rmSync(join(stylesDir(i.root), `${drop.slug}${ext}`), { force: true });
  writeFileSync(join(stylesDir(i.root), `${slug}.js.tmp`), text);
  renameSync(join(stylesDir(i.root), `${slug}.js.tmp`), join(stylesDir(i.root), `${slug}.js`));
  const entry: StyleEntry = { slug, id, name: i.name?.trim() || s.label, desc: (i.desc ?? s.doc ?? '').trim(), from, savedAt: new Date().toISOString(),
    version: versionOf(stylesDir(i.root), [`${slug}.js`]) };
  writeStyleEntry(i.root, entry);
  return { entry };
}
