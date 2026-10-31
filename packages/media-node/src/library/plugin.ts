// The user's own blocks as one plugin (id `mine`), for the catalog and the gallery: each entry's module loaded from its own
// folder. Projects never load this plugin: they load the copy `useBlock` put in their fx/lib/ (spec 2026-10-29-my-library §4.4).
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { FxIssue, FxResult, ItemType, Plugin, SfxType } from '@tellcut/engine';
import { loadProjectFx } from '../fx.ts';
import { blockDir, listLibrary, type BlockEntry } from './store.ts';

/** what an entry's modules are now: its version and each module file's size and time (an edit in place shows before a refresh) */
function entryState(dir: string, e: BlockEntry): string {
  return [e.version, e.main, ...e.files.filter((f) => /\.m?js$/.test(f)).sort().map((f) => {
    try { const st = statSync(join(dir, f)); return `${f}|${st.size}|${st.mtimeMs}`; } catch { return `${f}|gone`; }
  })].join('\n');
}

const loaded = new Map<string, { state: string; result: Promise<FxResult> }>();
/** an entry's module loaded, kept until any of its module files changes: the library's cards are asked for on every page that shows
 *  them, and loading every entry each time grew slow with the library */
export function loadEntry(root: string, e: BlockEntry): Promise<FxResult> {
  const dir = blockDir(root, e.slug), state = entryState(dir, e), had = loaded.get(dir);
  if (had?.state === state) return had.result;
  const result = loadProjectFx(dir, [e.main]);
  loaded.set(dir, { state, result });
  result.catch(() => { if (loaded.get(dir)?.result === result) loaded.delete(dir); });
  return result;
}

export async function libraryPlugin(root: string): Promise<{ plugin: Plugin; errors: FxIssue[] }> {
  const items: ItemType[] = [], sfx: SfxType[] = [], errors: FxIssue[] = [], seen = new Set<string>();
  for (const e of listLibrary(root).blocks) {
    const r = await loadEntry(root, e);
    errors.push(...r.errors.map((x) => ({ ...x, path: `${e.slug}/${x.path}` })));
    for (const t of [...(r.plugin.items ?? []), ...(r.plugin.sfx ?? [])]) {
      if (seen.has(t.type)) { errors.push({ path: `${e.slug}/${e.main}`, message: `${t.type} 跟另一個我的積木重複，略過` }); continue; }
      seen.add(t.type);
      if ('draw' in t) items.push(t as ItemType); else sfx.push(t as SfxType);
    }
  }
  return { plugin: { id: 'mine', items, ...(sfx.length ? { sfx } : {}) }, errors };
}
