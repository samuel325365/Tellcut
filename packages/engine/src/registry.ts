import type { ItemType, ParamDef, Plugin, SfxType } from './plugin.ts';
import { paramDefault, type Theme } from './theme.ts';
import type { Project } from './schema.ts';

export interface Registry {
  item(type: string): ItemType | undefined;
  sfx(type: string): SfxType | undefined;
  /** every registered item type / sound effect, in registration order (the library lists them) */
  itemTypes(): ItemType[];
  sfxTypes(): SfxType[];
  grades: Record<string, string>;
  /** Stylesheet text per plugin id (only the plugins a project lists are injected). */
  cssById: Record<string, string>;
  /** SVG filter definitions per plugin id (injected like the stylesheets). */
  svgById: Record<string, string>;
}

export function createRegistry(plugins: Plugin[]): Registry {
  const items = new Map<string, ItemType>();
  const sfx = new Map<string, SfxType>();
  const grades: Record<string, string> = {};
  const cssById: Record<string, string> = {};
  const svgById: Record<string, string> = {}, svgIds = new Set<string>();
  for (const p of plugins) {
    for (const it of p.items ?? []) {
      if (items.has(it.type)) throw new Error(`Duplicate item type "${it.type}"`);
      items.set(it.type, it);
    }
    for (const s of p.sfx ?? []) {
      if (sfx.has(s.type)) throw new Error(`Duplicate sfx type "${s.type}"`);
      sfx.set(s.type, s);
    }
    Object.assign(grades, p.grades ?? {});
    if (p.css) cssById[p.id] = p.css;
    if (p.svg) {
      // filters share one document: a plugin prefix keeps two plugins' "dawn" apart
      for (const [, , fid] of p.svg.matchAll(/\bid=(["'])([^"']+)\1/g)) {
        if (!fid.startsWith(`${p.id}-`)) throw new Error(`Plugin "${p.id}": SVG filter id "${fid}" must start with "${p.id}-"`);
        if (svgIds.has(fid)) throw new Error(`Duplicate SVG filter id "${fid}" (plugin "${p.id}")`);
        svgIds.add(fid);
      }
      svgById[p.id] = p.svg;
    }
  }
  return { item: (t) => items.get(t), sfx: (t) => sfx.get(t), itemTypes: () => [...items.values()], sfxTypes: () => [...sfx.values()], grades, cssById, svgById };
}

/** The item's params with every missing key filled from its type's ParamDef defaults. */
export function withDefaults(defs: ParamDef[], params: Record<string, unknown> = {}, theme?: Theme): Record<string, any> {
  return { ...Object.fromEntries(defs.map((d) => [d.key, theme ? paramDefault(d, theme) : d.default])), ...params };
}

/** Whether the project draws with three.js: an item on a track that is not muted is of a type marked `three`, or names one in a
 *  parameter (a block that hosts another, such as common.card's picture window). The player loads three only then. */
export function usesThree(p: Project, r: Registry): boolean {
  const is3d = (t: unknown) => typeof t === 'string' && !!r.item(t)?.three;
  return p.tracks.some((tr) => (tr.kind === 'scene' || tr.kind === 'overlay') && !tr.muted
    && (tr.items as Array<{ type: string; params?: Record<string, unknown> }>).some((it) => is3d(it.type) || Object.values(it.params ?? {}).some(is3d)));
}
