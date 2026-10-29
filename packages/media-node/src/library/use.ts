// Using a library entry in a project (spec 2026-10-29-my-library §4.4): it is copied in, never pointed at, so an fx still
// loads only from the project's own folder and a later change in the library leaves films already made alone. The copy
// goes in fx/lib/<slug>/ (its own imports keep working); the files it names under media/ go to the same place in the
// project, or under media/lib/<slug>/ when the project already has a different file there. fx/lib/links.json records which
// entry and version each copy is, for "from My blocks" and "Update" in the editor. project.json is the caller's to change:
// the editor adds the file to meta.fx with an edit of its own, the agent writes c.fx(file) in cut.ts.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadProjectFx } from '../fx.ts';
import { blockDir, LibraryError, readBlock, readStyle, SLUG, stylesDir, writeJsonFile } from './store.ts';

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
  rmSync(join(o.projectDir, lib), { recursive: true, force: true });
  for (const f of e.files.filter((x) => x.startsWith('fx/'))) {
    const to = `${lib}/${f.slice(3)}`;
    let text = readFileSync(join(src, f), 'utf8');
    for (const [a, b] of moved) text = text.split(`'${a}'`).join(`'${b}'`).split(`"${a}"`).join(`"${b}"`);
    mkdirSync(dirname(join(o.projectDir, to)), { recursive: true });
    writeFileSync(join(o.projectDir, to), text);
    copied.push(to);
  }
  const file = `${lib}/${e.main.slice(3)}`;
  writeJsonFile(linksFile(o.projectDir), { ...links, [o.slug]: { file, version: e.version, types: ids } });
  return { file, types: ids, copied };
}

/** the copies in a project, each with the library's version now (null: the entry was deleted) */
export function projectLinks(root: string, projectDir: string): ProjectLink[] {
  return Object.entries(readLinks(projectDir)).filter(([slug]) => SLUG.test(slug))
    .map(([slug, l]) => ({ slug, file: l.file, types: l.types ?? [], version: l.version, latest: readBlock(root, slug)?.version ?? null }));
}

/** a library music style into the project's score/ (under its id: c.score('<id>') finds it there) */
export function useStyle(o: { root: string; projectDir: string; slug: string }): { file: string; id: string } {
  const e = readStyle(o.root, o.slug);
  if (!e) throw new LibraryError('library.noEntry', `我的積木裡沒有 ${o.slug}`, { slug: o.slug });
  const file = `score/${e.id}.js`;
  mkdirSync(join(o.projectDir, 'score'), { recursive: true });
  copyFileSync(join(stylesDir(o.root), `${o.slug}.js`), join(o.projectDir, file));
  return { file, id: e.id };
}
