// The presets' routes (spec 2026-10-23-presets-and-languages §3): the list for the home page and each preset's poster and preview.
// Presets of the user's own (spec 2026-10-29-my-library §3.5–3.7, §4.5): saved from a film (the agent's draft as the user edited it,
// its blocks and music style saved into My blocks along the way) or from the custom form, then edited, renamed, given a poster or
// deleted; only my-* ones. One from the form (or from nothing: the home page's "New preset") is saved through the same dialog, its
// points first filled from the options chosen. Reading and parsing them is media-node's (presets.ts, preset-write.ts), shared with `check`.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin, Project } from '@tellcut/engine';
import { parseProject } from '@tellcut/engine';
import { blockDir, cleanFields, ffmpeg, findPreset, libraryRoot, listLibrary, loadPresets, loadStyles, posterFromImage, PresetDraftZ, presetInfo, projectRegistry, renderStills,
  projectLinks, saveBlock, saveStyle, THUMB_FILE, writeUserPreset, deleteUserPreset, type Preset, type PresetDirs, type PresetLibrary, type PresetPoint } from '@tellcut/media-node';
import type { Lang } from '@tellcut/protocol';
import { HttpError, readJson, sendJson, type Router } from './http.ts';
import { posterOf, sendProjectFile, type ProjectStore } from './projects.ts';
import type { ProjectHolds } from './delete.ts';

const FILES = new Set(['poster.jpg', 'preview.webm']);
const LANGS = new Set(['zh', 'en', 'ja']);
const POSTER_MAX = 10 * 1024 * 1024;

/** draws a preset's poster from a project: the timeline at `at` seconds, else the frame the home page shows for it */
export type PresetPoster = (o: { dir: string; project: Project; at?: number }, out: string) => Promise<void>;
export interface PresetRouteOptions { projectsDir: string; store: ProjectStore; plugins: Plugin[]; poster?: PresetPoster; thumb: (root: string, slug: string) => Promise<unknown>; holds?: ProjectHolds }

export function projectPoster(plugins: Plugin[]): PresetPoster {
  return async ({ dir, project, at }, out) => {
    const tmp = mkdtempSync(join(tmpdir(), 'preset-poster-'));
    try {
      let still: string;
      if (at !== undefined) {
        const { registry } = await projectRegistry(dir, plugins, project);
        [still] = await renderStills({ dir, project, times: [at], registry, outDir: tmp, tag: 'poster', maxSide: 1280 });
      } else {
        const p = posterOf(project), src = p && project.sources[p.source];
        if (!p || !src) throw new Error('the project has no clip to take a poster from');
        still = join(tmp, 'still.png');
        await ffmpeg(['-y', '-ss', String(p.t), '-i', resolve(dir, (src as { path: string }).path), '-frames:v', '1', still]);
      }
      await posterFromImage(still, out);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  };
}

const langOf = (x: unknown): Lang => (typeof x === 'string' && LANGS.has(x) ? x as Lang : 'zh');
const str = (x: unknown) => (typeof x === 'string' ? x : '');
/** the dialog's points: each with its prompt, or (a point of a saved preset left as it was: its prompt stays here) named by what it
 *  was, `orig`, which finds its prompt among `had`; else the user's own words are the prompt */
function pointsOf(x: unknown, had: PresetPoint[] = []): PresetPoint[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((p) => {
    if (!p || typeof p.text !== 'string' || !p.text.trim()) return [];
    const text = p.text.trim(), old = typeof p.orig === 'string' && p.orig.trim() === text ? had.find((h) => h.text === text) : undefined;
    return [{ text, prompt: (typeof p.prompt === 'string' && p.prompt.trim() ? p.prompt : old?.prompt ?? text).trim() }];
  });
}

export function presetRoutes(r: Router, dirs: PresetDirs, o?: PresetRouteOptions) {
  const library = (): PresetLibrary | undefined => {
    if (!o) return undefined;
    const root = libraryRoot(o.projectsDir), lib = listLibrary(root);
    return { ...lib, thumb: (slug) => (existsSync(join(blockDir(root, slug), THUMB_FILE)) ? `/api/library/blocks/${slug}/${THUMB_FILE}` : null) };
  };
  const mine = (id: string): Preset => {
    const p = /^my-/.test(id) ? findPreset(dirs, id) : null;
    if (!p?.mine) throw new HttpError(/^my-/.test(id) ? 404 : 400, `Not a preset of the user's own: ${id}`, { code: 'preset.notMine' });
    return p;
  };
  const answer = (res: Parameters<typeof sendJson>[0], p: Preset) => sendJson(res, 200, presetInfo(findPreset(dirs, p.id) ?? p, library()));

  r.get('/api/presets', (_req, res) => { const lib = library(); sendJson(res, 200, { presets: loadPresets(dirs).map((p) => presetInfo(p, lib)) }); });
  r.get('/api/presets/:id/:file', (req, res, { id, file }) => {
    const p = FILES.has(file) ? findPreset(dirs, id) : null;
    const dir = p && join(p.mine ? dirs.user : dirs.repo, id);
    if (!dir || !existsSync(join(dir, file))) throw new HttpError(404, 'Not found');
    sendProjectFile(req, res, join(dir, file));
  });
  if (!o) return;
  const root = libraryRoot(o.projectsDir), poster = o.poster ?? projectPoster(o.plugins);

  // the custom form as the points "Save as my preset" opens on (each option's name and its line for the agent), before anything is saved
  r.post('/api/presets/form-points', async (req, res) => { const b: any = await readJson(req); sendJson(res, 200, { points: fromForm(dirs, b, langOf(b?.lang)).points }); });

  r.post('/api/presets', async (req, res) => {
    const b: any = await readJson(req), lang = langOf(b?.lang);
    if (b?.from === 'form') {
      // the dialog sends the points as the user left them; without them, the form's own (an older page)
      const form = fromForm(dirs, b, lang), points = Array.isArray(b.points) ? pointsOf(b.points, form.points) : form.points;
      if (!points.length) throw new HttpError(400, 'A preset needs at least one point', { code: 'preset.noPoints' });
      answer(res, writeUserPreset(dirs, { ...form, points, name: str(b.name), summary: str(b.summary), lang, ...(typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? { color: b.color } : {}), genres: true }));
      return;
    }
    if (b?.from !== 'project' || typeof b.project !== 'string') throw new HttpError(400, 'from must be project or form');
    const dir = o.store.dir(b.project), file = join(dir, 'preset-draft.json');
    // its blocks are read and its poster drawn from the folder for a while: a delete waits (delete.ts)
    const release = o.holds?.hold(b.project, { text: '正在把這個專案存成片型，存好後再刪', code: 'delete.busyPreset' });
    try {
      if (!existsSync(file)) throw new HttpError(404, 'No preset draft', { code: 'preset.noDraft' });
      let raw: unknown;
      try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new HttpError(422, 'The preset draft is not JSON', { code: 'preset.badDraft' }); }
      const draft = PresetDraftZ.safeParse(raw);
      if (!draft.success) throw new HttpError(422, `The preset draft is not one: ${draft.error.issues[0]?.message}`, { code: 'preset.badDraft' });
      const d = draft.data, inc = b.include ?? {}, lib = listLibrary(root), points = pointsOf(b.points ?? d.points);
      // refused as the form's are, before any block or music style goes into My blocks
      if (!points.length) throw new HttpError(400, 'A preset needs at least one point', { code: 'preset.noPoints' });
      // the film's own blocks and music style go into My blocks too (as they are; a clash is kept apart), so the preset can bring them
      const blocks: string[] = [], links = projectLinks(root, dir);
      if (inc.blocks) for (const fx of d.fx ?? []) {
        // a copy of an entry of My blocks (fx/lib/<slug>/…) is that entry (final review I1); one deleted there since is left out
        const copy = links.find((l) => fx === l.file || fx.startsWith(`fx/lib/${l.slug}/`));
        if (copy) { if (copy.latest !== null && !blocks.includes(copy.slug)) blocks.push(copy.slug); continue; }
        const had = lib.blocks.find((e) => e.from.project === b.project && e.from.file === fx);
        if (had) { if (!blocks.includes(had.slug)) blocks.push(had.slug); continue; }
        try {
          const s = await saveBlock({ root, projectDir: dir, projectId: b.project, file: fx, onConflict: 'keep-both' });
          if ('entry' in s) { blocks.push(s.entry.slug); void o.thumb(root, s.entry.slug).catch(() => {}); }
        } catch (e) { console.warn(`preset ${b.project}: ${fx} not saved to My blocks: ${(e as Error).message}`); }
      }
      let score: string | undefined;
      if (inc.score && d.score) {
        score = lib.styles.find((s) => s.id === d.score)?.slug;
        if (!score && (await loadStyles([join(dir, 'score')])).styles[d.score]) {
          const s = await saveStyle({ root, projectDir: dir, projectId: b.project, id: d.score, onConflict: 'keep-both' }).catch(() => null);
          if (s && 'entry' in s) score = s.entry.slug;
        }
      }
      let project: Project | null = null;
      try { project = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))); } catch { /* a broken project still saves its preset, without a poster */ }
      const theme = inc.theme ? d.theme ?? project?.meta.theme : undefined;
      const p = writeUserPreset(dirs, { name: str(b.name) || d.name, summary: str(b.summary) || d.summary, points, lang,
        ...(d.ratio ? { ratios: [d.ratio] } : project ? { ratios: [ratioOf(project)] } : {}), ...(d.length ? { length: d.length } : {}),
        ...(theme ? { theme } : {}), ...(score ? { score } : {}), ...(blocks.length ? { blocks } : {}) });
      if (project) await poster({ dir, project, ...(typeof b.posterAt === 'number' ? { at: b.posterAt } : {}) }, join(dirs.user, p.id, 'poster.jpg')).catch((e) => console.warn(`preset poster ${p.id}: ${(e as Error).message}`));
      rmSync(file, { force: true });
      answer(res, p);
    } finally { release?.(); }
  });

  r.put('/api/presets/:id', async (req, res, { id }) => {
    const p = mine(id), b: any = await readJson(req), lang = langOf(b?.lang), inc = b?.include;
    const keep = (k: 'theme' | 'score' | 'blocks') => (inc && inc[k] === false ? undefined : p[k]);
    if (Array.isArray(b?.points) && !pointsOf(b.points, p.points).length) throw new HttpError(400, 'A preset needs at least one point', { code: 'preset.noPoints' });
    answer(res, writeUserPreset(dirs, { name: str(b?.name) || (p.name[lang] ?? Object.values(p.name)[0] ?? id), summary: typeof b?.summary === 'string' ? b.summary : p.summary[lang] ?? Object.values(p.summary)[0] ?? '',
      points: Array.isArray(b?.points) ? pointsOf(b.points, p.points) : p.points, lang, color: p.color, ratios: p.ratios, length: p.length, genres: p.genres,
      theme: keep('theme'), score: keep('score') as string | undefined, blocks: keep('blocks') as string[] | undefined }, id));
  });

  r.del('/api/presets/:id', (_req, res, { id }) => { mine(id); deleteUserPreset(dirs, id); sendJson(res, 200, { ok: true }); });

  r.post('/api/presets/:id/poster', async (req, res, { id }) => {
    const p = mine(id), chunks: Buffer[] = [];
    let n = 0;
    for await (const c of req) { n += (c as Buffer).length; if (n > POSTER_MAX) throw new HttpError(413, 'The picture is too large'); chunks.push(c as Buffer); }
    const tmp = mkdtempSync(join(tmpdir(), 'preset-upload-')), src = join(tmp, 'upload');
    try {
      writeFileSync(src, Buffer.concat(chunks));
      await posterFromImage(src, join(dirs.user, p.id, 'poster.jpg')).catch(() => { throw new HttpError(400, 'Not a picture', { code: 'preset.badPoster' }); });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    answer(res, p);
  });
}

/** the project's ratio in lowest terms (1080×1920 → 9:16) */
function ratioOf(p: Project): string {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a), w = p.meta.width, h = p.meta.height, k = g(w, h) || 1;
  return `${w / k}:${h / k}`;
}

/** the custom form as points in the user's words (each option's name; its prompt for the agent), plus the ratio and length it fixes */
function fromForm(dirs: PresetDirs, b: any, lang: Lang): { points: PresetPoint[]; ratios?: string[]; length?: [number, number] } {
  const custom = findPreset(dirs, 'custom');
  const fields = custom ? cleanFields(custom, b?.fields) : {}, points: PresetPoint[] = [];
  for (const f of custom?.fields ?? []) {
    const v = fields[f.id];
    if (v === undefined) continue;
    const opt = f.options.find((x) => x.id === v);
    points.push(opt ? { text: opt.name[lang] ?? opt.name.en ?? opt.name.zh ?? v, prompt: opt.prompt }
      : { text: { zh: `約 ${v} 秒`, en: `About ${v} s`, ja: `約 ${v} 秒` }[lang], prompt: `Make the film about ${v} s long (within 10%).` });
  }
  for (const e of Array.isArray(b?.examples) ? b.examples : []) if (typeof e === 'string' && e.trim()) points.push({ text: e.trim(), prompt: e.trim() });
  const secs = Number(fields.length);
  return { points, ...(fields.ratio ? { ratios: [fields.ratio] } : {}), ...(secs > 0 ? { length: [Math.round(secs * 0.9), Math.round(secs * 1.1)] as [number, number] } : {}) };
}
