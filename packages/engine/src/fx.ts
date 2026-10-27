// Project-local item types (toolkit phase 2a): the modules listed in project.json `meta.fx` become one plugin. A module may also
// export `sfx`, an SfxType[] of the project's own synthesised sound effects (ids fx.*), played like the common ones (c.sfx).
import type { ItemType, Plugin, SfxType } from './plugin.ts';

export interface FxIssue { path: string; message: string }
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
    catch (e) { errors.push({ path, message: String((e as Error)?.message ?? e) }); continue; }
    const sounds = mod?.sfx, list = mod?.default === undefined && Array.isArray(sounds) ? [] : mod?.default;
    if (!Array.isArray(list)) { errors.push({ path, message: 'export default 必須是 ItemType[]' }); continue; }
    if (sounds !== undefined && !Array.isArray(sounds)) { errors.push({ path, message: 'export const sfx 必須是 SfxType[]' }); continue; }
    // ids already taken: by earlier modules, and by earlier entries of this one (a duplicate inside one module reached the registry)
    const mine = new Set(seen);
    const bad = list.map((it: any) => { const p = problem(it, mine); if (!p) mine.add(it.type); return p; }).find(Boolean);
    const mineSfx = new Set(seenSfx);
    const badSfx = ((sounds ?? []) as unknown[]).map((s: any) => { const p = sfxProblem(s, mineSfx); if (!p) mineSfx.add(s.type); return p; }).find(Boolean);
    if (bad || badSfx) { errors.push({ path, message: (bad ?? badSfx)! }); continue; }
    for (const it of list as ItemType[]) {
      seen.add(it.type);
      items.push(it);
      if (!it.doc) warnings.push({ path, message: `${it.type} 沒有 doc（block catalog 會看不到它的說明）` });
    }
    for (const s of (sounds ?? []) as SfxType[]) {
      seenSfx.add(s.type);
      sfx.push(s);
      if (!s.doc) warnings.push({ path, message: `${s.type} 沒有 doc（block catalog 會看不到它的說明）` });
    }
  }
  return { plugin: { id: 'fx', items, ...(sfx.length ? { sfx } : {}) }, errors, warnings };
}

function sfxProblem(s: any, seen: Set<string>): string | undefined {
  if (typeof s?.type !== 'string' || !s.type.startsWith('fx.')) return `音效的 type id 必須以 "fx." 開頭（收到 ${JSON.stringify(s?.type)}）`;
  if (seen.has(s.type)) return `音效 type id ${s.type} 重複`;
  if (typeof s.synth !== 'function' || typeof s.duration !== 'function') return `${s.type} 缺 synth 或 duration`;
  if (typeof s.label !== 'string' || !Array.isArray(s.params)) return `${s.type} 缺 label／params`;
  return undefined;
}

function problem(it: any, seen: Set<string>): string | undefined {
  if (typeof it?.type !== 'string' || !it.type.startsWith('fx.')) return `type id 必須以 "fx." 開頭（收到 ${JSON.stringify(it?.type)}）`;
  if (seen.has(it.type)) return `type id ${it.type} 重複`;
  if (typeof it.build !== 'function' || typeof it.draw !== 'function') return `${it.type} 缺 build 或 draw`;
  if (typeof it.label !== 'string' || !Array.isArray(it.params) || (it.kind !== 'scene' && it.kind !== 'overlay')) return `${it.type} 缺 label／params／kind`;
  return undefined;
}
