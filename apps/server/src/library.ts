// The user's own library (spec 2026-10-29-my-library §4.2–4.4): saving a project's fx or music style into it, its cards for
// the editor and the gallery, an entry's files (the gallery's preview loads its module from here), renaming, deleting, and
// copying an entry into a project. Reading and writing is media-node's (library/), shared with `npm run tellcut -- library`.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { blockDir, findFxFile, fxState, libraryRoot, LibraryError, listLibrary, loadEntry, loadProjectFx, loadStyles, PROJECT_ID, previewBlock, projectLinks, readBlock, readStyle, removeBlock, removeStyle, renameStyle,
  renameType, saveBlock, saveStyle, stylesDir, THUMB_FILE, useBlock, useStyle, type OnConflict } from '@tellcut/media-node';
import type { LibraryBlockInfo, LibraryIndex, LibraryStyleInfo, LibraryUsage, ProjectLibraryInfo } from '@tellcut/protocol';
import { HttpError, readJson, sendJson, type Router } from './http.ts';
import { sendProjectFile, type ProjectStore } from './projects.ts';

/** a refusal of media-node's as the page reads it: 409 when the user has a choice to make or a file is in use, 404 for a missing entry, else 400 */
async function guard<T>(f: () => Promise<T> | T): Promise<T> {
  try { return await f(); }
  catch (e) {
    if (!(e instanceof LibraryError)) throw e;
    const status = e.code === 'library.idTaken' || e.code === 'library.locked' ? 409 : e.code === 'library.noEntry' ? 404 : 400;
    throw new HttpError(status, e.message, { code: e.code, params: e.params });
  }
}

const conflictOf = (x: unknown): OnConflict | undefined => (x === 'replace' || x === 'keep-both' ? x : undefined);
const str = (x: unknown) => (typeof x === 'string' ? x : undefined);
const projectJson = (dir: string): any => { try { return JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')); } catch { return {}; } };
/** a preset.md's frontmatter, read loosely (usage only needs its name, blocks and score) */
function frontOf(file: string): any {
  try { const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8')); return m ? JSON.parse(m[1]) : null; } catch { return null; }
}
const folders = (dir: string) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };

export interface LibraryOptions { projectsDir: string; store: ProjectStore;
  /** draws a saved entry's thumbnail (in the background); tests pass a stand-in so no Chrome starts */
  thumb: (root: string, slug: string) => Promise<unknown> }

/** the library's cards. `nameOf`: a project's name by its id (the cards say where an entry came from by name; a project since
 *  deleted has none, and the page shows the id) */
export async function libraryIndex(root: string, nameOf: (id: string) => string | undefined = () => undefined): Promise<LibraryIndex> {
  const lib = listLibrary(root), blocks: LibraryBlockInfo[] = [], names = new Map<string, string | undefined>();
  const from = (f: { project: string; file: string }) => {
    if (!names.has(f.project)) names.set(f.project, nameOf(f.project));
    const name = names.get(f.project);
    return name ? { ...f, name } : f;
  };
  for (const e of lib.blocks) {
    const items = (await loadEntry(root, e)).plugin.items ?? [];   // kept until its files change (loadEntry)
    const thumb = existsSync(join(blockDir(root, e.slug), THUMB_FILE)) ? `/api/library/blocks/${e.slug}/${THUMB_FILE}?v=${e.version}` : null;
    for (const t of e.types) {
      const it = items.find((x) => x.type === t.type);
      if (!it) continue;   // a broken module: its cards are left out until it loads again
      blocks.push({ slug: e.slug, type: t.type, name: t.name, desc: t.desc, ...(t.category ? { category: t.category } : {}), kind: it.kind, params: it.params, main: e.main, thumb,
        from: from(e.from), savedAt: e.savedAt, version: e.version, group: e.types.map((x) => x.type).filter((x) => x !== t.type), ...(e.theme ? { theme: e.theme } : {}) });
    }
  }
  const loaded = lib.styles.length ? await loadStyles([stylesDir(root)]) : { styles: {} as Record<string, { defaults: { bpm: number; key: string } }> };
  const styles: LibraryStyleInfo[] = lib.styles.map((s) => ({ slug: s.slug, id: s.id, name: s.name, desc: s.desc, defaults: loaded.styles[s.id]?.defaults ?? { bpm: 100, key: 'C' }, from: from(s.from), savedAt: s.savedAt }));
  return { blocks, styles };
}

/** the projects using a copy of block `slug` (each keeps its copy), and the user's presets naming the entry. A copy counts only while
 *  meta.fx names it: an add undone in the editor leaves the copy and its link behind, unused (as the editor's liveLinks reads it) */
export function libraryUsage(projectsDir: string, slug: string, kind: 'block' | 'style'): LibraryUsage {
  const projects = kind === 'block' ? folders(projectsDir).filter((n) => PROJECT_ID.test(n)).filter((n) => {
    try {
      const link = JSON.parse(readFileSync(join(projectsDir, n, 'fx', 'lib', 'links.json'), 'utf8'))[slug], fx = projectJson(join(projectsDir, n)).meta?.fx;
      return typeof link?.file === 'string' && Array.isArray(fx) && fx.includes(link.file);
    } catch { return false; }
  }).length : 0;
  const pdir = join(projectsDir, '_presets'), presets: string[] = [];
  for (const n of folders(pdir).filter((x) => x.startsWith('my-'))) {
    const f = frontOf(join(pdir, n, 'preset.md'));
    if (kind === 'block' ? Array.isArray(f?.blocks) && f.blocks.includes(slug) : f?.score === slug) presets.push(f.name?.zh ?? f.name?.en ?? f.name?.ja ?? n);
  }
  return { projects, presets };
}

export function libraryRoutes(r: Router, o: LibraryOptions) {
  const root = libraryRoot(o.projectsDir);
  const project = (id: unknown) => { if (typeof id !== 'string') throw new HttpError(400, 'project is missing'); return { id, dir: o.store.dir(id) }; };
  const conflict = (c: { name: string }) => new HttpError(409, `"${c.name}" is already in My blocks`, { code: 'library.conflict', params: { name: c.name }, conflict: c });

  // a project's name from its project.json (an id that is not a project, or one without a name, has none)
  const nameOf = (id: string) => {
    if (!PROJECT_ID.test(id)) return undefined;
    const name = projectJson(join(o.projectsDir, id)).meta?.name;
    return typeof name === 'string' && name.trim() ? name : undefined;
  };
  r.get('/api/library', async (_req, res) => sendJson(res, 200, await libraryIndex(root, nameOf)));

  // before the files route, which would take "usage" for a file
  r.get('/api/library/blocks/:slug/usage', (_req, res, { slug }) => guard(() => {
    if (!readBlock(root, slug)) throw new HttpError(404, 'Not found');
    sendJson(res, 200, libraryUsage(o.projectsDir, slug, 'block'));
  }));
  // an entry's own files only (its module, what it imports, its fonts) and its thumbnail; never entry.json, never anything else
  r.get('/api/library/blocks/:slug/*', (req, res, { slug, rest }) => guard(() => {
    const e = readBlock(root, slug), path = posix.normalize(rest);
    if (!e || !(e.files.includes(path) || path === THUMB_FILE)) throw new HttpError(404, 'Not found');
    sendProjectFile(req, res, join(blockDir(root, slug), ...path.split('/')));   // nosniff, and as a document a sandbox (projects.ts)
  }));

  r.post('/api/library/blocks', async (req, res, _p, url) => {
    const b: any = await readJson(req), p = project(b?.project), type = str(b?.type);
    if (!type) throw new HttpError(400, 'type is missing');
    const fx = projectJson(p.dir).meta?.fx;
    const file = await findFxFile(p.dir, Array.isArray(fx) ? fx : [], type);
    if (!file) throw new HttpError(404, `No module of "${p.id}" defines ${type}`, { code: 'library.noBlock', params: { type } });
    if (url.searchParams.get('dry')) { sendJson(res, 200, { dry: true, ...await guard(() => previewBlock({ root, projectDir: p.dir, projectId: p.id, file, type })) }); return; }
    const names = { [type]: { ...(str(b.name) ? { name: str(b.name) } : {}), ...(str(b.desc) !== undefined ? { desc: str(b.desc) } : {}), ...(str(b.category) ? { category: str(b.category) } : {}) } };
    const out = await guard(() => saveBlock({ root, projectDir: p.dir, projectId: p.id, file, names, onConflict: conflictOf(b.onConflict) }));
    if ('conflict' in out) throw conflict(out.conflict);
    void o.thumb(root, out.entry.slug).catch(() => {});
    sendJson(res, 200, out);
  });

  r.put('/api/library/blocks/:slug/types/:type', async (req, res, { slug, type }) => {
    const b: any = await readJson(req);
    sendJson(res, 200, await guard(() => renameType(root, slug, type, { name: str(b?.name), desc: str(b?.desc), category: str(b?.category) })));
  });
  r.del('/api/library/blocks/:slug', (_req, res, { slug }) => guard(() => { removeBlock(root, slug); sendJson(res, 200, { ok: true }); }));

  r.post('/api/library/styles', async (req, res) => {
    const b: any = await readJson(req), p = project(b?.project), id = str(b?.id);
    if (!id) throw new HttpError(400, 'id is missing');
    const out = await guard(() => saveStyle({ root, projectDir: p.dir, projectId: p.id, id, name: str(b.name), desc: str(b.desc), onConflict: conflictOf(b.onConflict) }));
    if ('conflict' in out) throw conflict(out.conflict);
    sendJson(res, 200, out);
  });
  r.put('/api/library/styles/:slug', async (req, res, { slug }) => {
    const b: any = await readJson(req);
    sendJson(res, 200, await guard(() => renameStyle(root, slug, { name: str(b?.name), desc: str(b?.desc) })));
  });
  r.get('/api/library/styles/:slug/usage', (_req, res, { slug }) => guard(() => {
    if (!readStyle(root, slug)) throw new HttpError(404, 'Not found');
    sendJson(res, 200, libraryUsage(o.projectsDir, slug, 'style'));
  }));
  r.del('/api/library/styles/:slug', (_req, res, { slug }) => guard(() => { removeStyle(root, slug); sendJson(res, 200, { ok: true }); }));

  r.get('/api/projects/:id/library', async (_req, res, { id }) => {
    const p = project(id), lib = listLibrary(root), own = await loadStyles([join(p.dir, 'score')]);
    const info: ProjectLibraryInfo = {
      links: projectLinks(root, p.dir).map((l) => ({ slug: l.slug, file: l.file, types: l.types, outdated: l.latest !== null && l.latest !== l.version, gone: l.latest === null })),
      savedFiles: lib.blocks.filter((e) => e.from.project === p.id).map((e) => e.from.file),
      savedStyles: lib.styles.filter((s) => s.from.project === p.id).map((s) => s.id),
      styles: Object.values(own.styles).map((s) => ({ id: s.id, label: s.label, file: posix.join('score', relative(join(p.dir, 'score'), s.file).split(sep).join('/')) })),
    };
    sendJson(res, 200, info);
  });

  r.post('/api/projects/:id/library/use', async (req, res, { id }) => {
    const b: any = await readJson(req), p = project(id);
    if (str(b?.style)) { sendJson(res, 200, await guard(() => useStyle({ root, projectDir: p.dir, slug: b.style }))); return; }
    if (!str(b?.slug)) throw new HttpError(400, 'slug is missing');
    const fx = projectJson(p.dir).meta?.fx;
    const used = await guard(() => useBlock({ root, projectDir: p.dir, projectId: p.id, slug: b.slug, fx: Array.isArray(fx) ? fx : [] }));
    // `fx`: the project's fx folder as it is now, the same stamp live.ts sends with the fx-changed this copy sets off: the tab that
    // asked loads the copy itself and skips that event, other tabs load it on the event
    sendJson(res, 200, { ...used, fx: fxState(p.dir) });
  });

  // the draft is removed when a new one is asked for and when its dialog closes: an old one never opens again
  r.del('/api/projects/:id/preset-draft', (_req, res, { id }) => { rmSync(join(project(id).dir, 'preset-draft.json'), { force: true }); sendJson(res, 200, { ok: true }); });

  // the agent's draft of a preset, read into the save dialog
  r.get('/api/projects/:id/preset-draft', async (_req, res, { id }) => {
    const f = join(project(id).dir, 'preset-draft.json');
    if (!existsSync(f)) throw new HttpError(404, 'No preset draft');
    let draft: any;
    try { draft = JSON.parse(readFileSync(f, 'utf8')); } catch { throw new HttpError(422, 'The preset draft is not JSON', { code: 'preset.badDraft' }); }
    // the names of the blocks each module the film used holds, for the dialog's "bring along" line (one that does not load is left out)
    const dir = project(id).dir, blocks: Array<{ file: string; names: string[] }> = [];
    for (const fx of Array.isArray(draft?.fx) ? draft.fx.filter((x: unknown): x is string => typeof x === 'string') : []) {
      const r = await loadProjectFx(dir, [fx]).catch(() => null), items = r?.plugin.items ?? [];
      if (items.length) blocks.push({ file: fx, names: items.map((t) => t.label) });
    }
    sendJson(res, 200, { ...draft, blocks });
  });
}
