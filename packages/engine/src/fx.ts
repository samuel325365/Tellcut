// Project-local item types (toolkit phase 2a): the modules listed in project.json `meta.fx` become one plugin. A module may also
// export `sfx`, an SfxType[] of the project's own synthesised sound effects (ids fx.*), played like the common ones (c.sfx).
import type { ItemType, Plugin, SfxType } from './plugin.ts';

/** message: Chinese, for the command line and agents; code + params: the editor's words for it in its language (err.<code>) */
export interface FxIssue { path: string; message: string; code?: string; params?: Record<string, string | number> }
type Problem = Omit<FxIssue, 'path'>;
const issue = (message: string, code: string, params?: Record<string, string | number>): Problem => ({ message, code, ...(params ? { params } : {}) });
export interface FxResult { plugin: Plugin; errors: FxIssue[]; warnings: FxIssue[] }

/**
 * Load the fx modules through `importer` (the browser's import() or Node's). A module that fails to load or breaks a rule is
 * reported in `errors` and skipped; the others still load.
 */
export async function loadFx(paths: string[], importer: (path: string) => Promise<unknown>): Promise<FxResult> {
  const items: ItemType[] = [], sfx: SfxType[] = [], errors: FxIssue[] = [], warnings: FxIssue[] = [];
  const seen = new Set<string>(), seenSfx = new Set<string>();
  for (const path of paths) {
    let mod: any;
    try { mod = await importer(path); }
    catch (e) { const error = String((e as Error)?.message ?? e); errors.push({ path, ...issue(error, 'fx.loadFailed', { error }) }); continue; }
    const sounds = mod?.sfx, list = mod?.default === undefined && Array.isArray(sounds) ? [] : mod?.default;
    if (!Array.isArray(list)) { errors.push({ path, ...issue('export default 必須是 ItemType[]', 'fx.defaultNotList') }); continue; }
    if (sounds !== undefined && !Array.isArray(sounds)) { errors.push({ path, ...issue('export const sfx 必須是 SfxType[]', 'fx.sfxNotList') }); continue; }
    // ids already taken: by earlier modules, and by earlier entries of this one (a duplicate inside one module reached the registry)
    const mine = new Set(seen);
    const bad = list.map((it: any) => { const p = problem(it, mine); if (!p) mine.add(it.type); return p; }).find(Boolean);
    const mineSfx = new Set(seenSfx);
    const badSfx = ((sounds ?? []) as unknown[]).map((s: any) => { const p = sfxProblem(s, mineSfx); if (!p) mineSfx.add(s.type); return p; }).find(Boolean);
    if (bad || badSfx) { errors.push({ path, ...(bad ?? badSfx)! }); continue; }
    for (const it of list as ItemType[]) {
      seen.add(it.type);
      items.push(it);
      if (!it.doc) warnings.push({ path, ...issue(`${it.type} 沒有 doc（block catalog 會看不到它的說明）`, 'fx.noDoc', { type: it.type }) });
    }
    for (const s of (sounds ?? []) as SfxType[]) {
      seenSfx.add(s.type);
      sfx.push(s);
      if (!s.doc) warnings.push({ path, ...issue(`${s.type} 沒有 doc（block catalog 會看不到它的說明）`, 'fx.noDoc', { type: s.type }) });
    }
  }
  return { plugin: { id: 'fx', items, ...(sfx.length ? { sfx } : {}) }, errors, warnings };
}

function sfxProblem(s: any, seen: Set<string>): Problem | undefined {
  if (typeof s?.type !== 'string' || !s.type.startsWith('fx.')) { const got = String(JSON.stringify(s?.type)); return issue(`音效的 type id 必須以 "fx." 開頭（收到 ${got}）`, 'fx.sfxBadId', { got }); }
  const type = s.type as string;
  if (seen.has(type)) return issue(`音效 type id ${type} 重複`, 'fx.sfxDuplicate', { type });
  if (typeof s.synth !== 'function' || typeof s.duration !== 'function') return issue(`${type} 缺 synth 或 duration`, 'fx.sfxNoSynth', { type });
  if (typeof s.label !== 'string' || !Array.isArray(s.params)) return issue(`${type} 缺 label／params`, 'fx.sfxNoLabel', { type });
  return undefined;
}

function problem(it: any, seen: Set<string>): Problem | undefined {
  if (typeof it?.type !== 'string' || !it.type.startsWith('fx.')) { const got = String(JSON.stringify(it?.type)); return issue(`type id 必須以 "fx." 開頭（收到 ${got}）`, 'fx.badId', { got }); }
  const type = it.type as string;
  if (seen.has(type)) return issue(`type id ${type} 重複`, 'fx.duplicate', { type });
  if (typeof it.build !== 'function' || typeof it.draw !== 'function') return issue(`${type} 缺 build 或 draw`, 'fx.noDraw', { type });
  if (typeof it.label !== 'string' || !Array.isArray(it.params) || (it.kind !== 'scene' && it.kind !== 'overlay')) return issue(`${type} 缺 label／params／kind`, 'fx.noLabel', { type });
  return undefined;
}
