// The block gallery's data (spec 2026-10-17-block-gallery): every block, sound effect, music style and recipe, read from the same
// places `npm run tellcut -- catalog` reads, so the gallery never needs updating by hand. Score previews are generated on request and cached.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import type { ItemType, ParamDef, Plugin } from '@tellcut/engine';
import { libraryRoot, loadStyles, SCORE_LIBRARY, sendFile, stylesDir, TELLCUT_ROOT, STYLES } from '@tellcut/media-node';
// the recipes are tools code (they drive Cut); the gallery only reads their names, notes and examples. Moving them into a package of
// their own would split Cut's API in two for that: kept as the one place the server reads from tools/ (review 2)
import { RECIPES } from '../../../tools/cut/recipes/index.ts';
// the golden cases are the blocks' pictures already kept (and checked) in git: the gallery's cards show them (the golden folder is
// served at run time as the gallery's pictures, so its index is a declared export of plugin-common, not a path into its tests)
import { cases } from '@tellcut/plugin-common/golden/cases';
import { CORE_CATEGORY, PLUGIN_GROUP as GROUP, type GalleryBlock, type GalleryIndex, type GallerySfx, type GalleryStyle } from '@tellcut/protocol';
import { HttpError, sendJson, type Router } from './http.ts';

/** A block that reads a project's photos, clips or files draws little or nothing here. The sample films pass those as json params
 *  with a null default, so the params alone don't tell: a media() hook or code that asks ctx.media for a picture does, unless the
 *  block says its footage is optional. */
const needsMedia = (t: ItemType) => t.footage !== 'optional' && (t.params.some((d) => d.type === 'source-ref' || d.type === 'media-ref') || typeof t.media === 'function'
  || /media\.(stillUrl|video|fileUrl)\(/.test(`${t.build}${t.draw}${t.ready ?? ''}`));

const GOLDEN_DIR = join(TELLCUT_ROOT, 'packages/plugin-common/golden');
const GOLDEN_FILE = /^[a-z0-9-]+-t\d+\.\d{2}\.png$/;
/** each block's thumbnail: its first case at its last moment (the animation settled) */
const THUMBS = new Map<string, string>();
for (const c of cases) if (!THUMBS.has(c.type)) THUMBS.set(c.type, `/api/gallery/thumb/${c.name}-t${c.at[c.at.length - 1].toFixed(2)}.png`);

export async function galleryIndex(plugins: Plugin[], library = SCORE_LIBRARY): Promise<GalleryIndex> {
  const order = (p: Plugin) => (p.id === 'core' ? 0 : p.id === 'common' ? 1 : 2);
  const sorted = [...plugins].sort((a, b) => order(a) - order(b));
  const blocks = sorted.flatMap((p) => (p.items ?? []).map((t): GalleryBlock => ({
    plugin: p.id, group: GROUP[p.id] ?? '外掛', type: t.type, label: t.label, doc: t.doc ?? '', kind: t.kind, params: t.params, needsMedia: needsMedia(t),
    ...(t.category ?? CORE_CATEGORY[t.type] ? { category: t.category ?? CORE_CATEGORY[t.type] } : {}), ...(THUMBS.has(t.type) ? { thumb: THUMBS.get(t.type) } : {}),
  })));
  const sfx = sorted.flatMap((p) => (p.sfx ?? []).map((s): GallerySfx => ({ plugin: p.id, type: s.type, label: s.label, doc: s.doc ?? '', params: s.params, ...(s.category ? { category: s.category } : {}) })));
  const lib = await loadStyles([library]);
  const styles: GalleryStyle[] = [
    ...Object.values(STYLES).map((s) => ({ id: s.id, label: s.label, doc: s.doc, defaults: s.defaults, origin: 'built-in' as const })),
    ...Object.values(lib.styles).map((s) => ({ id: s.id, label: s.label, doc: s.doc ?? '', defaults: s.defaults, origin: 'library' as const })),
  ];
  const recipes = Object.values(RECIPES).map((r) => ({ id: r.id, label: r.label, doc: r.doc, notes: r.notes ?? [], example: r.example }));
  return { blocks, sfx, styles, recipes };
}

/** composes a preview in a child process (score-child.ts), so the server keeps answering meanwhile; a refused one throws its reason */
function compose(a: { style: string; library: string; seed: number; bpm?: number; key?: string; file: string }): Promise<void> {
  const child = fileURLToPath(new URL('./score-child.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', child, JSON.stringify(a)], { cwd: TELLCUT_ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new HttpError(code === 2 ? 400 : 500, err.trim() || `score preview failed (${code})`))));
  });
}

const num = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function galleryRoutes(r: Router, o: { plugins: Plugin[]; projectsDir: string; library?: string }) {
  const composing = new Map<string, Promise<void>>();
  r.get('/api/gallery', async (_req, res) => sendJson(res, 200, await galleryIndex(o.plugins, o.library)));
  r.get('/api/gallery/thumb/:file', (req, res, { file }, url) => {
    const f = join(GOLDEN_DIR, file);
    if (!GOLDEN_FILE.test(file) || !existsSync(f)) throw new HttpError(404, 'Not found');
    // the English or Japanese UI: the picture with its words in that language (npm run thumbs), when the golden one shows Chinese
    const lang = url.searchParams.get('lang'), local = lang === 'en' || lang === 'ja' ? join(GOLDEN_DIR, 'thumbs', lang, file) : '';
    sendFile(req, res, local && existsSync(local) ? local : f);
  });
  // a 12-second preview of a music style; the same request comes from the cache
  r.get('/api/gallery/score/:style', async (req, res, { style }, url) => {
    const id = style.replace(/\.wav$/, ''), seed = num(url.searchParams.get('seed')) ?? 1, bpm = num(url.searchParams.get('bpm')), key = url.searchParams.get('key') || undefined;
    // a shared style, or one of the user's own (spec 2026-10-29-my-library §3.4): composed from the folder it is in
    const shared = o.library ?? SCORE_LIBRARY, mine = stylesDir(libraryRoot(o.projectsDir));
    const own = STYLES[id] ? undefined : (await loadStyles([shared])).styles[id] ?? (await loadStyles([mine])).styles[id];
    if (!STYLES[id] && !own) throw new HttpError(404, `No music style "${id}"`);
    const library = own && resolve(own.file).startsWith(resolve(mine) + sep) ? mine : shared;
    // a style from a file is named by its content too: one replaced in My blocks (or edited) under the same id is composed afresh
    const version = own ? `-${createHash('sha1').update(readFileSync(own.file)).digest('hex').slice(0, 8)}` : '';
    const dir = join(o.projectsDir, '_gallery'), file = join(dir, `score-${library === mine ? 'mine-' : ''}${id}${version}-${seed}-${bpm ?? 'd'}-${(key ?? 'd').replace(/[^\w#]/g, '')}.wav`);
    // the same preview asked twice at once (a double click) is composed once
    if (!existsSync(file)) {
      let job = composing.get(file);
      if (!job) { job = compose({ style: id, library, seed, bpm, key, file }).finally(() => composing.delete(file)); composing.set(file, job); }
      await job;
    }
    sendFile(req, res, file);
  });
}
