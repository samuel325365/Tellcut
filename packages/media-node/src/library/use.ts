// Using a library entry in a project (spec 2026-10-29-my-library §4.4): it is copied in, never pointed at, so an fx still
// loads only from the project's own folder and a later change in the library leaves films already made alone. The copy
// goes in fx/lib/<slug>/ (its own imports keep working); the files it names under media/ go to the same place in the
// project, or under media/lib/<slug>/ when the project already has a different file there. fx/lib/links.json records which
// entry and version each copy is, for "from My blocks" and "Update" in the editor. project.json is the caller's to change:
// the editor adds the file to meta.fx with an edit of its own, the agent writes c.fx(file) in cut.ts.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadProjectFx } from '../fx.ts';
import { blockDir, LibraryError, readBlock, readStyle, SLUG, stylesDir, swapDir, writeJsonFile } from './store.ts';
import { COPY_ENTRY, copyEntryModule, stampImports } from './save.ts';

export interface UseResult { file: string; types: string[]; copied: string[] }
export interface ProjectLink { slug: string; file: string; types: string[]; version: string; latest: string | null }
type Links = Record<string, { file: string; version: string; types: string[] }>;

const linksFile = (projectDir: string) => join(projectDir, 'fx', 'lib', 'links.json');
function readLinks(projectDir: string): Links {
  try { const x = JSON.parse(readFileSync(linksFile(projectDir), 'utf8')); return x && typeof x === 'object' ? x : {}; } catch { return {}; }
}
const same = (a: string, b: string) => readFileSync(a).equals(readFileSync(b));

export async function useBlock(o: { root: string; projectDir: string; projectId: string; slug: string; fx?: string[] }): Promise<UseResult> {
  const e = readBlock(o.root, o.slug);
  if (!e) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${o.slug}`, { slug: o.slug });
  const ids = e.types.map((t) => t.type), links = readLinks(o.projectDir), link = links[o.slug];
  // the project's own blocks (a copy of this very entry aside: using it again is its update)
  const others = await loadProjectFx(o.projectDir, (o.fx ?? []).filter((f) => f !== link?.file));
  const have = new Set([...(others.plugin.items ?? []).map((t) => t.type), ...(others.plugin.sfx ?? []).map((s) => s.type)]);
  const clash = ids.find((x) => have.has(x));
  if (clash) {
    // the project it was saved from already has it: nothing to copy
    if (o.projectId === e.from.project && (o.fx ?? []).includes(e.from.file)) return { file: e.from.file, types: ids, copied: [] };
    throw new LibraryError('library.idTaken', `專案裡已經有 ${clash}`, { type: clash });
  }
  const src = blockDir(o.root, o.slug), lib = `fx/lib/${o.slug}`, copied: string[] = [], moved = new Map<string, string>();
  for (const f of e.files.filter((x) => x.startsWith('media/'))) {
    let to = f;
    if (existsSync(join(o.projectDir, f))) {
      if (same(join(src, f), join(o.projectDir, f))) continue;
      to = `media/lib/${o.slug}/${f}`;
      moved.set(f, to);
    }
    mkdirSync(dirname(join(o.projectDir, to)), { recursive: true });
    copyFileSync(join(src, f), join(o.projectDir, to));
    copied.push(to);
  }
  // the copy is made in a folder of its own and then put in place, so a failure leaves the project's copy as it was (final review I3);
  // its _entry.js re-exports the entry's module: meta.fx names that file, whatever the module is called (final review C1). That
  // re-export and every import of the copy carry the entry's version, so an Update is loaded afresh by an open editor and by the
  // server, not taken from their module cache (stampImports)
  const stage = join(o.projectDir, 'fx', 'lib', `.${o.slug}.tmp-${process.pid}-${Date.now()}`);
  try {
    for (const f of e.files.filter((x) => x.startsWith('fx/'))) {
      let text = readFileSync(join(src, f), 'utf8');
      for (const [a, b] of moved) text = text.split(`'${a}'`).join(`'${b}'`).split(`"${a}"`).join(`"${b}"`);
      if (/\.m?js$/.test(f)) text = stampImports(text, e.version);
      mkdirSync(dirname(join(stage, f.slice(3))), { recursive: true });
      writeFileSync(join(stage, f.slice(3)), text);
      copied.push(`${lib}/${f.slice(3)}`);
    }
    writeFileSync(join(stage, COPY_ENTRY), copyEntryModule(e.main.slice(3), e.version));
    swapDir(stage, join(o.projectDir, lib));
  } finally { rmSync(stage, { recursive: true, force: true }); }
  const file = `${lib}/${COPY_ENTRY}`;
  writeJsonFile(linksFile(o.projectDir), { ...links, [o.slug]: { file, version: e.version, types: ids } });
  return { file, types: ids, copied };
}

/** the project's texts that can name a copy of My blocks (by `fx/lib/<slug>/…`), each with its path relative to the project:
 *  project.json, cut.ts and the other files at the top (an export's snapshot, the preset draft), every older version and proposal in
 *  .history/, and the fx modules (one may import from a copy) */
function namingTexts(projectDir: string): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const read = (rel: string) => { try { out.push({ path: rel, text: readFileSync(join(projectDir, rel), 'utf8') }); } catch { /* gone or unreadable */ } };
  const walk = (rel: string, keep: (name: string) => boolean) => {
    let list;
    try { list = readdirSync(join(projectDir, rel), { withFileTypes: true }); } catch { return; }
    for (const e of list) { const r = `${rel}/${e.name}`; if (e.isDirectory()) walk(r, keep); else if (keep(e.name)) read(r); }
  };
  for (const e of (() => { try { return readdirSync(projectDir, { withFileTypes: true }); } catch { return []; } })())
    if (e.isFile() && /\.(json|m?[jt]s)$/.test(e.name)) read(e.name);
  walk('.history', () => true);
  walk('fx', (n) => /\.m?js$/.test(n));
  return out;
}

const DAY = 24 * 3600_000;
/** Removes the copies of My blocks (fx/lib/<slug>/, with their link) that nothing in the project names any more: an add undone in the
 *  editor leaves its copy behind on purpose, as a redo or an older version in .history/ still points at it. A copy goes only when
 *  neither project.json, cut.ts, any version or proposal kept in .history/, nor another fx module names it, and it was made more than
 *  `minAge` ago (a day: the agent copies an entry before writing the cut.ts that uses it). Files it put under media/ are left: another
 *  part of the project may use them. The server runs this at its start, when no editor is changing the project. Returns the slugs. */
export function pruneCopies(projectDir: string, o: { now?: number; minAge?: number } = {}): string[] {
  const links = readLinks(projectDir), slugs = Object.keys(links).filter((s) => SLUG.test(s));
  if (!slugs.length) return [];
  const now = o.now ?? Date.now(), minAge = o.minAge ?? DAY, texts = namingTexts(projectDir), removed: string[] = [];
  for (const slug of slugs) {
    const own = `fx/lib/${slug}/`;
    if (texts.some((t) => !t.path.startsWith(own) && t.text.includes(`lib/${slug}/`))) continue;
    const dir = join(projectDir, 'fx', 'lib', slug);
    let made = 0;
    try { made = statSync(join(dir, COPY_ENTRY)).mtimeMs; } catch { try { made = statSync(dir).mtimeMs; } catch { /* already gone: only its link is left */ } }
    if (now - made <= minAge) continue;
    try { rmSync(dir, { recursive: true, force: true }); } catch { continue; }   // a file in use: tried again at the next start
    delete links[slug];
    removed.push(slug);
  }
  if (removed.length) writeJsonFile(linksFile(projectDir), links);
  return removed;
}

/** the copies in a project, each with the library's version now (null: the entry was deleted) */
export function projectLinks(root: string, projectDir: string): ProjectLink[] {
  return Object.entries(readLinks(projectDir)).filter(([slug]) => SLUG.test(slug))
    .map(([slug, l]) => ({ slug, file: l.file, types: l.types ?? [], version: l.version, latest: readBlock(root, slug)?.version ?? null }));
}

/** a library music style into the project's score/ (under its id: c.score('<id>') finds it there); a different file already there
 *  (the project's own, perhaps edited since it was saved) is never written over */
export function useStyle(o: { root: string; projectDir: string; slug: string }): { file: string; id: string } {
  const e = readStyle(o.root, o.slug);
  if (!e) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${o.slug}`, { slug: o.slug });
  const file = `score/${e.id}.js`, src = join(stylesDir(o.root), `${o.slug}.js`), to = join(o.projectDir, file);
  if (existsSync(to)) {
    if (same(src, to)) return { file, id: e.id };
    throw new LibraryError('library.idTaken', `專案裡已經有自己的 ${file}（內容不同），沒有蓋掉它`, { type: e.id });
  }
  mkdirSync(join(o.projectDir, 'score'), { recursive: true });
  copyFileSync(src, to);
  return { file, id: e.id };
}
