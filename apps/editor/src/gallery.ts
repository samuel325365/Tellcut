// The block gallery's data side (spec 2026-10-17-block-gallery): what /api/gallery returns, the tiny projects a preview plays, the filter.
import { BLOCK_CATEGORY, handleOf, normalizeHandle, SFX_CATEGORY, type GalleryBlock, type GalleryIndex, type GalleryRecipe, type GallerySfx, type GalleryStyle } from '@tellcut/protocol';

import { t, DICTS, type Key } from './i18n/index.ts';
import { blockText } from './i18n/blocks.ts';

export type { GalleryBlock, GalleryIndex, GalleryRecipe, GallerySfx, GalleryStyle };
export type Tab = 'blocks' | 'sfx' | 'styles' | 'recipes';

/** the looks the preview can show a block in (the project theme the common blocks read); their names are the gallery.theme.<id> texts */
export const THEMES: Record<string, { theme?: Record<string, unknown> }> = {
  none: {},
  warm: { theme: { palette: { accent: '#ff6b35', accent2: '#2ec4b6', hl: '#ffd23f', ink: '#3b2314', paper: '#fff3e0' } } },
  cool: { theme: { palette: { accent: '#3a86ff', accent2: '#8338ec', hl: '#8ecae6', ink: '#14213d', paper: '#f1f5ff' } } },
  mono: { theme: { palette: { accent: '#111111', accent2: '#555555', hl: '#ffffff', ink: '#111111', paper: '#f5f5f5' }, radius: 4 } },
};

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.2 } };
export const PREVIEW_LEN = 3;

/** A 1080×1920 film of one block, as the golden pictures use: a mid grey-blue ground, the block over the whole length. */
export function blockProject(b: GalleryBlock, params: Record<string, unknown>, themeId = 'none') {
  const theme = THEMES[themeId]?.theme;
  return {
    version: 1,
    meta: { name: b.type, width: 1080, height: 1920, fps: 30, duration: PREVIEW_LEN, plugins: [b.plugin], background: '#3a4256', mix: MIX, ...(theme ? { theme } : {}) },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'g', kind: b.kind, items: [{ id: 'block', type: b.type, start: 0, end: PREVIEW_LEN, params }] }],
  };
}

/** A silent film with one sound effect a moment in, so the player plays it through the same synthesis the films use. */
export function sfxProject(s: GallerySfx, params: Record<string, unknown>) {
  return {
    version: 1,
    meta: { name: s.type, width: 360, height: 640, fps: 30, duration: 3, plugins: [s.plugin], background: '#3a4256', mix: MIX },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'fx', kind: 'sfx', gain: 0, items: [{ id: 'sound', type: s.type, start: 0.2, end: 2.8, params, gain: 0 }] }],
  };
}

/** a card matches when the query is in one of its fields (case does not matter), or names its handle (mrk3 finds MRK-03) */
export function matches(query: string, handle: string | undefined, ...fields: string[]) {
  const q = query.trim().toLowerCase();
  return !q || [handle ?? '', ...fields].some((f) => f.toLowerCase().includes(q)) || (!!handle && normalizeHandle(q) === handle);
}

/** the shown text of a card: its name and description in the UI language (the Chinese ones when there is no translation) */
export const shown = (id: string, x: { label: string; doc: string }) => blockText(id, x);
/** a plugin group's name in the UI language (core, common, fx have one; a sample film's own keeps its own) */
export const groupName = (plugin: string, group: string) => (`group.${plugin}` in DICTS.zh ? t(`group.${plugin}` as Key) : group);

/** The cards of a tab whose handle, name, label or doc (in the shown language or the original) matches the query. */
export function filterGallery(g: GalleryIndex, tab: Tab, query: string) {
  const fields = (id: string, x: { label: string; doc: string }) => { const y = shown(id, x); return [x.label, x.doc, y.label, y.doc]; };
  if (tab === 'blocks') return g.blocks.filter((b) => matches(query, handleOf(b.type), b.type, ...fields(b.type, b), b.group, groupName(b.plugin, b.group)));
  if (tab === 'sfx') return g.sfx.filter((s) => matches(query, handleOf(s.type), s.type, ...fields(s.type, s)));
  if (tab === 'styles') return g.styles.filter((s) => matches(query, handleOf(`style:${s.id}`), s.id, ...fields(`style:${s.id}`, s)));
  return g.recipes.filter((r) => matches(query, handleOf(`recipe:${r.id}`), r.id, ...fields(`recipe:${r.id}`, r)));
}

/** The sound effects by category (SFX_CATEGORY's order), then any without one (a sample film's own) under 其他. */
export function sfxSections(list: GallerySfx[]): Array<{ key: string; label: string; sfx: GallerySfx[] }> {
  const named = Object.keys(SFX_CATEGORY).map((key) => ({ key, label: t(`cat.sfx.${key}` as Key), sfx: list.filter((s) => s.category === key) }));
  const rest = list.filter((s) => !s.category || !(s.category in SFX_CATEGORY));
  return [...named, { key: 'other', label: t('cat.sfx.other'), sfx: rest }].filter((x) => x.sfx.length);
}

/** where a block sits in the gallery: its category (core ones are given one by the server), else its plugin (a sample film's own) */
export const blockCategory = (b: GalleryBlock) => b.category ?? `plugin:${b.plugin}`;
/** cards of one category in handle order (TXT-01, TXT-02…; core blocks take their place among them), ones without a handle last */
export const byHandle = (a: string, b: string) => { const n = (id: string) => { const h = handleOf(id); return h ? Number(/\d+$/.exec(h)![0]) : Infinity; }; return n(a) - n(b); };
/** the last category: what a clip itself does (not blocks, listed with them) */
export const CLIP_CATEGORY = 'clip';

/** The gallery's categories with their counts: the catalog's order (BLOCK_CATEGORY), then plugin groups as they come, then clip effects. */
export function galleryCategories(blocks: GalleryBlock[], clipCount: number): Array<{ key: string; label: string; count: number }> {
  const count = new Map<string, number>(), plugins: Array<{ key: string; label: string }> = [];
  for (const b of blocks) {
    const k = blockCategory(b);
    if (!count.has(k) && k.startsWith('plugin:')) plugins.push({ key: k, label: groupName(b.plugin, b.group) });
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [
    ...Object.keys(BLOCK_CATEGORY).filter((k) => count.has(k)).map((key) => ({ key, label: t(`cat.block.${key}` as Key), count: count.get(key)! })),
    ...plugins.map((p) => ({ ...p, count: count.get(p.key)! })),
    ...(clipCount ? [{ key: CLIP_CATEGORY, label: t('cat.clip'), count: clipCount }] : []),
  ];
}

export const scoreUrl = (id: string, o: { seed: number; bpm?: number; key?: string }) =>
  `/api/gallery/score/${encodeURIComponent(id)}.wav?seed=${o.seed}${o.bpm ? `&bpm=${o.bpm}` : ''}${o.key ? `&key=${encodeURIComponent(o.key)}` : ''}`;
