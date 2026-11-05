// The block gallery's data side (spec 2026-10-17-block-gallery): what /api/gallery returns, the tiny projects a preview plays, the filter.
import { BLOCK_CATEGORY, handleOf, normalizeHandle, SFX_CATEGORY, type GalleryBlock, type GalleryCaption, type GalleryIndex, type GalleryRecipe, type GallerySfx, type GalleryStyle, type LibraryBlockInfo } from '@tellcut/protocol';

import { t, DICTS, type Key } from './i18n/index.ts';
import { blockText } from './i18n/blocks.ts';

export type { GalleryBlock, GalleryIndex, GalleryRecipe, GallerySfx, GalleryStyle };
export type Tab = 'blocks' | 'captions' | 'titles' | 'sfx' | 'styles' | 'recipes';

/** the line a caption template is shown with, in the UI language, with its word times (spec 2026-11-04-caption-styles §5) */
export const CAPTION_LINE: Record<string, { text: string; words: Array<[number, number]> }> = {
  zh: { text: '今天帶你去吃【台南】最強的牛肉湯', words: [[0.25, 2], [0.55, 4], [0.85, 6], [1.2, 8], [1.6, 11], [2.05, 14]] },
  en: { text: 'We walked all the way to the 【Colosseum】', words: [[0.25, 2], [0.5, 9], [0.8, 13], [1.0, 17], [1.25, 21], [1.45, 24], [1.7, 28], [2.0, 38]] },
  ja: { text: '京都の【朝ごはん】は本当においしい', words: [[0.2, 3], [0.6, 7], [0.9, 8], [1.3, 11], [1.7, 15]] },
};
/** the title a title template is shown with, in the UI language (spec 2026-11-05-title-templates) */
export const TITLE_LINE: Record<string, { text: string; kicker: string; sub: string }> = {
  zh: { text: '一座城市的\n三天兩夜', kicker: '第一章', sub: '義大利・羅馬' },
  en: { text: 'Three Days\nin a City', kicker: 'CHAPTER ONE', sub: 'Rome, Italy' },
  ja: { text: 'ある街の\n三日間', kicker: '第一章', sub: 'イタリア・ローマ' },
};
/** a title template drawn by common.heading (`heading`: the gallery's entry for that block), in the UI language */
export function titleProject(heading: GalleryBlock, template: string, lang: string, params?: Record<string, unknown>) {
  const line = TITLE_LINE[lang] ?? TITLE_LINE.zh;
  const p = blockProject(heading, params ? { ...line, ...params } : { ...line, template });
  return { ...p, meta: { ...p.meta, background: '#4a5a52' } };
}
/** a caption template drawn by common.caption (`caption`: the gallery's entry for that block) over a picture, in the UI language */
export function captionProject(caption: GalleryBlock, template: string, lang: string, params?: Record<string, unknown>) {
  const line = CAPTION_LINE[lang] ?? CAPTION_LINE.zh;
  // a template of the user's own: its parameters themselves (the preview project has no copy of it)
  const p = blockProject(caption, params ? { ...line, ...params } : { ...line, template });
  return { ...p, meta: { ...p.meta, background: '#4a5a52' } };
}

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

/** One of My blocks as blockProject shows a shared one: its module comes from the entry's folder (the player's project url, libraryPlayer);
 *  the look picked, else the theme of the project it was saved from (spec 2026-10-29-my-library §3.4). */
export function mineProject(b: LibraryBlockInfo, params: Record<string, unknown>, themeId = 'none') {
  const theme = THEMES[themeId]?.theme ?? b.theme;
  return {
    version: 1,
    meta: { name: b.type, width: 1080, height: 1920, fps: 30, duration: PREVIEW_LEN, plugins: ['fx'], background: '#3a4256', mix: MIX, fx: [b.main], ...(theme ? { theme } : {}) },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'g', kind: b.kind, items: [{ id: 'block', type: b.type, start: 0, end: PREVIEW_LEN, params }] }],
  };
}

/** what the gallery needs of the project it was opened from (gallery-link.ts) */
export interface OwnProject {
  name: string;
  /** its own blocks (fx.*, from the modules meta.fx names), as gallery cards */
  blocks: GalleryBlock[];
  meta: { plugins: string[]; fx?: string[]; theme?: Record<string, unknown> };
}

/** The modules of meta.fx that are the project's own: a copy of one of My blocks (fx/lib/<slug>/) is listed under Mine already. */
export const ownModules = (fx: string[] | undefined) => (fx ?? []).filter((m) => !/^(\.\/)?fx\/lib\//.test(m.replace(/\\/g, '/')));

/** The project's own blocks as cards. Whether one needs footage is told as the server tells it for the shared ones, from its
 *  parameters and media() hook (the server also reads its code, which the page does not). */
export function ownBlocks(items: Array<{ type: string; label: string; doc?: string; kind: string; params: GalleryBlock['params']; footage?: string; media?: unknown }>): GalleryBlock[] {
  return items.filter((x) => x.kind === 'scene' || x.kind === 'overlay').map((x) => ({
    plugin: 'fx', group: t('group.fx'), type: x.type, label: x.label, doc: x.doc ?? '', kind: x.kind as GalleryBlock['kind'], params: x.params,
    needsMedia: x.footage !== 'optional' && (x.params.some((d) => d.type === 'source-ref' || d.type === 'media-ref') || typeof x.media === 'function'),
  }));
}

/** One of the project's own blocks as blockProject shows a shared one: its modules load from the project folder (the player's
 *  projectPlayer url); the look picked, else the project's own theme. */
export function ownProject(o: OwnProject, b: GalleryBlock, params: Record<string, unknown>, themeId = 'none') {
  const theme = THEMES[themeId]?.theme ?? o.meta.theme;
  return {
    version: 1,
    meta: { name: b.type, width: 1080, height: 1920, fps: 30, duration: PREVIEW_LEN, plugins: o.meta.plugins, background: '#3a4256', mix: MIX, fx: o.meta.fx ?? [], ...(theme ? { theme } : {}) },
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
  const block = (b: GalleryBlock) => matches(query, handleOf(b.type), b.type, ...fields(b.type, b), b.group, groupName(b.plugin, b.group));
  if (tab === 'blocks') return g.blocks.filter((b) => !isCaptionBlock(b) && !isTitleBlock(b) && block(b));
  if (tab === 'titles') return (g.titles ?? []).filter((c: GalleryCaption) => matches(query, handleOf(`title:${c.id}`), c.id, ...fields(`title:${c.id}`, c), ...Object.values(c.params).map(String)));
  if (tab === 'sfx') return g.sfx.filter((s) => matches(query, handleOf(s.type), s.type, ...fields(s.type, s)));
  if (tab === 'styles') return g.styles.filter((s) => matches(query, handleOf(`style:${s.id}`), s.id, ...fields(`style:${s.id}`, s)));
  if (tab === 'captions') return (g.captions ?? []).filter((c: GalleryCaption) => matches(query, handleOf(`caption:${c.id}`), c.id, ...fields(`caption:${c.id}`, c), ...Object.values(c.params).map(String)));
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
/** the caption blocks' category: shown in the Captions tab with the templates, not among the Blocks tab's categories */
export const CAPTION_CATEGORY = 'caption';
export const isCaptionBlock = (b: GalleryBlock) => b.category === CAPTION_CATEGORY;
/** the title blocks' category: likewise shown in the Titles tab with the title templates */
export const TITLE_CATEGORY = 'title';
export const isTitleBlock = (b: GalleryBlock) => b.category === TITLE_CATEGORY;
/** the last category: what a clip itself does (not blocks, listed with them) */
export const CLIP_CATEGORY = 'clip';

/** the first category, the user's own blocks (shown even when empty: it says how to fill it) */
export const MINE_CATEGORY = 'mine';
/** before it, the blocks of the project the gallery was opened from (only when it has some) */
export const PROJECT_CATEGORY = 'project';

/** The gallery's categories with their counts: the project's own blocks (opened from a project that has some: `ownCount`), My
 *  blocks (when the page has the library: `mineCount`), the catalog's order (BLOCK_CATEGORY), then plugin groups as they come, then
 *  clip effects. */
export function galleryCategories(blocks: GalleryBlock[], clipCount: number, mineCount?: number, ownCount = 0): Array<{ key: string; label: string; count: number }> {
  const count = new Map<string, number>(), plugins: Array<{ key: string; label: string }> = [];
  for (const b of blocks) {
    if (isCaptionBlock(b) || isTitleBlock(b)) continue;
    const k = blockCategory(b);
    if (!count.has(k) && k.startsWith('plugin:')) plugins.push({ key: k, label: groupName(b.plugin, b.group) });
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [
    ...(ownCount ? [{ key: PROJECT_CATEGORY, label: t('group.fx'), count: ownCount }] : []),
    ...(mineCount === undefined ? [] : [{ key: MINE_CATEGORY, label: t('cat.mine'), count: mineCount }]),
    ...Object.keys(BLOCK_CATEGORY).filter((k) => count.has(k)).map((key) => ({ key, label: t(`cat.block.${key}` as Key), count: count.get(key)! })),
    ...plugins.map((p) => ({ ...p, count: count.get(p.key)! })),
    ...(clipCount ? [{ key: CLIP_CATEGORY, label: t('cat.clip'), count: clipCount }] : []),
  ];
}

export const scoreUrl = (id: string, o: { seed: number; bpm?: number; key?: string }) =>
  `/api/gallery/score/${encodeURIComponent(id)}.wav?seed=${o.seed}${o.bpm ? `&bpm=${o.bpm}` : ''}${o.key ? `&key=${encodeURIComponent(o.key)}` : ''}`;

/** a shared block's or template's thumbnail in the UI language: the server gives the translated picture where the golden one shows
 *  Chinese (the gallery and the properties panel's template grid) */
export const thumbIn = (src: string | undefined, lang: string) => (src && lang !== 'zh' ? `${src}?lang=${lang}` : src);
