// Cross-checks plugin params against the project: media refs inside params must name a declared source.
import { allItems, type Project, type SceneItem } from './schema.ts';
import type { ItemType } from './plugin.ts';
import { withDefaults, type Registry } from './registry.ts';

/** Problems with the media an item's params point at (empty = fine). */
export function itemMediaIssues(type: ItemType, item: SceneItem, project: Project, types?: (type: string) => ItemType | undefined): string[] {
  if (!type.media) return [];
  let m: { videos: Array<{ source: string }>; stills: Array<{ source: string }> };
  try { m = type.media({ ...item, params: withDefaults(type.params, item.params) }, project, types); }
  catch (e) { return [`media(): ${(e as Error)?.message ?? e}`]; }
  const bad = new Set([...m.videos, ...m.stills].map((r) => r.source).filter((s) => !(s in project.sources)));
  return [...bad].map((s) => `unknown source "${s}"`);
}

/** itemMediaIssues for every scene/overlay item, as `Item "<id>" (<type>): <issue>` lines. */
export function mediaIssues(project: Project, registry: Registry): string[] {
  return allItems(project).flatMap(({ track, item }) => {
    if (track.kind !== 'scene' && track.kind !== 'overlay') return [];
    const it = item as SceneItem, type = registry.item(it.type);
    return type ? itemMediaIssues(type, it, project, (t) => registry.item(t)).map((m) => `Item "${it.id}" (${it.type}): ${m}`) : [];
  });
}
