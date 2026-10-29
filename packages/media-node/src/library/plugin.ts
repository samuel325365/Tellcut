// The user's own blocks as one plugin (id `mine`), for the catalog and the gallery: each entry's module loaded from its own
// folder. Projects never load this plugin: they load the copy `useBlock` put in their fx/lib/ (spec 2026-10-29-my-library §4.4).
import type { FxIssue, ItemType, Plugin, SfxType } from '@tellcut/engine';
import { loadProjectFx } from '../fx.ts';
import { blockDir, listLibrary } from './store.ts';

export async function libraryPlugin(root: string): Promise<{ plugin: Plugin; errors: FxIssue[] }> {
  const items: ItemType[] = [], sfx: SfxType[] = [], errors: FxIssue[] = [], seen = new Set<string>();
  for (const e of listLibrary(root).blocks) {
    const r = await loadProjectFx(blockDir(root, e.slug), [e.main]);
    errors.push(...r.errors.map((x) => ({ ...x, path: `${e.slug}/${x.path}` })));
    for (const t of [...(r.plugin.items ?? []), ...(r.plugin.sfx ?? [])]) {
      if (seen.has(t.type)) { errors.push({ path: `${e.slug}/${e.main}`, message: `${t.type} 跟另一個我的積木重複，略過` }); continue; }
      seen.add(t.type);
      if ('draw' in t) items.push(t as ItemType); else sfx.push(t as SfxType);
    }
  }
  return { plugin: { id: 'mine', items, ...(sfx.length ? { sfx } : {}) }, errors };
}
