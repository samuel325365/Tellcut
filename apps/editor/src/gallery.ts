// The block gallery's data side (spec 2026-10-17-block-gallery): what /api/gallery returns, the tiny projects a preview plays, the filter.
import { blockPreviewProject, clipPreviewProject, comboPreviewProject, DEFAULT_MIX } from '@tellcut/engine';
import { aliasText, BLOCK_CATEGORY, CLIP_GROUPS, handleOf, normalizeHandle, SEARCH_ALIASES, SFX_CATEGORY, wordFinder, type CardGround, type ClipFx, type ClipGroup, type GalleryBlock, type GalleryBlockTemplate, type GalleryBlockVariant, type GalleryCaption, type GalleryCombo, type GalleryIndex, type GalleryRecipe, type GallerySfx, type GalleryStyle, type LibraryBlockInfo } from '@tellcut/protocol';

import { t, DICTS, type Key } from './i18n/index.ts';
import { blockText } from './i18n/blocks.ts';

export type { GalleryBlock, GalleryBlockTemplate, GalleryBlockVariant, GalleryCombo, GalleryIndex, GalleryRecipe, GallerySfx, GalleryStyle };
export type Tab = 'blocks' | 'captions' | 'titles' | 'sfx' | 'combos' | 'styles' | 'recipes';

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

/** A 1080×1920 film of one block, as the golden pictures use (engine blockPreviewProject, shared with a saved block's thumbnail);
 *  a block that works on the picture under it (`over`) plays over the gallery's street, the picture its card is drawn over; any
 *  other plays on its card's ground. The card it plays as is the picked variant's, else the picked template's, else the block's:
 *  its shape and length are that card's own (absent: 9:16 and 3 s, as that card's sample was drawn), and so is its ground, but a
 *  template's card drawn on the plain ground keeps the block's own. `tpl`: the template whose params are what is set. `variant`:
 *  the variant whose sample the params are, and its sample's theme unless the theme menu picks one, and a gallery picture for the
 *  sources its sample shows (the server answers them with the made-up map the golden cards show in those windows). */
export function blockProject(b: GalleryBlock, params: Record<string, unknown>, themeId = 'none', tpl?: GalleryBlockTemplate, variant?: GalleryBlockVariant) {
  const card: CardGround = variant ?? tpl ?? b, background = variant ? variant.bg : tpl?.bg ?? b.bg, { aspect, len } = card;
  const theme = THEMES[themeId]?.theme ?? variant?.theme;
  return blockPreviewProject({ type: b.type, kind: b.kind, plugins: [b.plugin], params, theme, ...(b.over === 'picture' ? { ground: true } : {}),
    ...(background && b.over !== 'picture' ? { background } : {}), ...(aspect ? { aspect } : {}), ...(len ? { len } : {}), ...(variant?.stand?.length ? { stand: variant.stand } : {}) });
}

/** whether two sets of params are the same (key order aside): a template is the one set when its params are exactly what is set */
export const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
/** the block's template whose params are exactly what is set, if one is */
export const pickedTemplate = (b: GalleryBlock, set: Record<string, unknown>) => b.templates?.find((x) => sameParams(x.params, set));
/** the variant whose value is the only thing set ({ [param]: value } exactly), if one is */
export const pickedVariant = (b: GalleryBlock, set: Record<string, unknown>): GalleryBlockVariant | undefined => {
  const keys = Object.keys(set), v = b.variants;
  return v && keys.length === 1 && keys[0] === v.param ? v.list.find((x) => x.value === set[v.param]) : undefined;
};

/** One of My blocks as blockProject shows a shared one: its module comes from the entry's folder (the player's project url, libraryPlayer);
 *  the look picked, else the theme of the project it was saved from (spec 2026-10-29-my-library §3.4). */
export function mineProject(b: LibraryBlockInfo, params: Record<string, unknown>, themeId = 'none') {
  return blockPreviewProject({ type: b.type, kind: b.kind, plugins: ['fx'], params, fx: [b.main], theme: THEMES[themeId]?.theme ?? b.theme });
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
export function ownBlocks(items: Array<{ type: string; label: string; doc?: string; kind: string; params: GalleryBlock['params']; footage?: string; media?: unknown; templates?: GalleryBlockTemplate[];
  variants?: { param: string; list: Array<{ value: string; label: string; doc: string; sample?: string }> } }>): GalleryBlock[] {
  return items.filter((x) => x.kind === 'scene' || x.kind === 'overlay').map((x) => ({
    plugin: 'fx', group: t('group.fx'), type: x.type, label: x.label, doc: x.doc ?? '', kind: x.kind as GalleryBlock['kind'], params: x.params,
    needsMedia: x.footage !== 'optional' && (x.params.some((d) => d.type === 'source-ref' || d.type === 'media-ref') || typeof x.media === 'function'),
    // its templates and variants too (no picture: a project's own blocks have no golden ones)
    ...(x.templates?.length ? { templates: x.templates.map(({ id, label, doc, params }) => ({ id, label, doc, params })) } : {}),
    ...(x.variants?.list.length ? { variants: { param: x.variants.param, list: x.variants.list.map(({ value, label, doc }) => ({ value, label, doc })) } } : {}),
  }));
}

/** One of the project's own blocks as blockProject shows a shared one: its modules load from the project folder (the player's
 *  projectPlayer url); the look picked, else the project's own theme. */
export function ownProject(o: OwnProject, b: GalleryBlock, params: Record<string, unknown>, themeId = 'none') {
  return blockPreviewProject({ type: b.type, kind: b.kind, plugins: o.meta.plugins, params, fx: o.meta.fx ?? [], theme: THEMES[themeId]?.theme ?? o.meta.theme });
}

/** A clip effect's preview (engine clipPreviewProject): the gallery's street (and map, for a transition) with what the effect puts
 *  on its clips; null for one the gallery cannot show (no face, no burned-in captions to work on). */
export const clipProject = (f: ClipFx) => (f.preview ? clipPreviewProject(f.preview, f.key) : null);

/** A combo's live preview (engine comboPreviewProject): the street with the combo placed on it as Add to timeline places it, its
 *  sounds and shake included; null when the server sent no layers for it. */
export const comboProject = (c: GalleryCombo) => (c.layers ? comboPreviewProject({ layers: c.layers, plugins: c.plugins ?? [], name: `combo:${c.id}`, ending: !!c.ending }) : null);

/** the clip effects of one group, in CLIP_FX's order, that match the search: handle, names and doc in Chinese, the UI language and
 *  English (the editor's labels, Properties' Transition and Shape menus, are English in every language), and the cut.ts line */
export function clipMatches(f: ClipFx, query: string) {
  const here = shown(f.key, f), en = blockText(f.key, f, 'en');
  return matches(query, handleOf(f.key), f.key, f.label, f.doc, f.code, here.label, here.doc, en.label, en.doc);
}
/** the clip effects in their groups (transitions, shapes, the rest), each group's name in the UI language; empty groups left out */
export function clipSections(list: readonly ClipFx[]): Array<{ group: ClipGroup; label: string; clips: ClipFx[] }> {
  return CLIP_GROUPS.map((group) => ({ group, label: t(`gallery.clipGroup.${group}` as Key), clips: list.filter((f) => f.group === group) })).filter((x) => x.clips.length);
}

/** A silent film with one sound effect a moment in, so the player plays it through the same synthesis the films use. */
export function sfxProject(s: GallerySfx, params: Record<string, unknown>) {
  return {
    version: 1,
    meta: { name: s.type, width: 360, height: 640, fps: 30, duration: 3, plugins: [s.plugin], background: '#3a4256', mix: DEFAULT_MIX },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'fx', kind: 'sfx', gain: 0, items: [{ id: 'sound', type: s.type, start: 0.2, end: 2.8, params, gain: 0 }] }],
  };
}

/** A card matches when the query is in one of its fields (case does not matter), or names its handle (mrk3 finds MRK-03). A Latin
 *  query that starts with a letter or digit is found only at a word's start, so `ring` finds "ringing" and `common.ring` but not
 *  "during"; any other character in it (CJK) keeps the plain substring test (protocol wordFinder, which catalog --find shares). */
export function matches(query: string, handle: string | undefined, ...fields: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const has = wordFinder(q);
  return [handle ?? '', ...fields].some((f) => has(f.toLowerCase())) || (!!handle && normalizeHandle(q) === handle);
}

/** the shown text of a card: its name and description in the UI language (the Chinese ones when there is no translation) */
export const shown = (id: string, x: { label: string; doc: string }) => blockText(id, x);
/** a plugin group's name in the UI language (core, common, fx have one; a sample film's own keeps its own) */
export const groupName = (plugin: string, group: string) => (`group.${plugin}` in DICTS.zh ? t(`group.${plugin}` as Key) : group);

/** One small picture of a card's strip: a variant of the block or one of its templates, with its name and doc in the UI language
 *  and what picking it sets (a variant: its option alone; a template: its params). */
export interface Look {
  /** `variant:<value>` or `template:<id>` */
  key: string;
  kind: 'variant' | 'template';
  id: string;
  label: string;
  doc: string;
  thumb?: string;
  bg?: string;
  set: Record<string, unknown>;
}
/** the id a look's English and Japanese texts are kept under: `<type>@<value>`, `<type>#<id>` */
const lookTextId = (b: GalleryBlock, kind: Look['kind'], id: string) => `${b.type}${kind === 'variant' ? '@' : '#'}${id}`;
/** a card's looks: its variants in their order, then its templates */
export function looksOf(b: GalleryBlock): Look[] {
  const v = b.variants, look = (kind: Look['kind'], id: string, x: { label: string; doc: string; thumb?: string; bg?: string }, set: Record<string, unknown>): Look => {
    const s = shown(lookTextId(b, kind, id), x);
    return { key: `${kind}:${id}`, kind, id, label: s.label, doc: s.doc, ...(x.thumb ? { thumb: x.thumb } : {}), ...(x.bg ? { bg: x.bg } : {}), set };
  };
  return [...(v?.list ?? []).map((x) => look('variant', x.value, x, { [v!.param]: x.value })), ...(b.templates ?? []).map((x) => look('template', x.id, x, { ...x.params }))];
}

/** a block's own fields the search reads: handle, type, names and doc (the original and the UI language's), search aliases
 *  (protocol SEARCH_ALIASES), group */
const blockMatches = (b: GalleryBlock, query: string) => { const y = shown(b.type, b); return matches(query, handleOf(b.type), b.type, b.label, b.doc, y.label, y.doc, aliasText(b.type), b.group, groupName(b.plugin, b.group)); };
/** a look's words: its value or id, and its name and doc in Chinese, the UI language and English, and its search aliases one by one
 *  (protocol SEARCH_ALIASES: words for it no text contains, which like its names pick it when typed in full) */
function lookWords(b: GalleryBlock, kind: Look['kind'], id: string, x: { label: string; doc: string }) {
  const key = lookTextId(b, kind, id), here = shown(key, x), en = blockText(key, x, 'en');
  return { names: [id, x.label, here.label, en.label], docs: [x.doc, here.doc, en.doc], aliases: Object.hasOwn(SEARCH_ALIASES, key) ? [...SEARCH_ALIASES[key]] : [] };
}
const lookSources = (b: GalleryBlock) => [...(b.variants?.list ?? []).map((x) => ({ kind: 'variant' as const, id: x.value, x })), ...(b.templates ?? []).map((x) => ({ kind: 'template' as const, id: x.id, x }))];
/** the keys of the looks (looksOf) the query is found in */
export function lookHits(b: GalleryBlock, query: string): string[] {
  if (!query.trim()) return [];
  return lookSources(b).filter(({ kind, id, x }) => { const w = lookWords(b, kind, id, x); return matches(query, undefined, ...w.names, ...w.docs, ...w.aliases); }).map(({ kind, id }) => `${kind}:${id}`);
}
/** The look a card shows in place of its own picture for this query: the first the query is found in when the block's own fields
 *  do not have it. A look's name typed in full (its value, id or name in any language, or one of its search aliases) is that look
 *  even when the block's doc names it in passing (progress's doc lists every mode), so searching "ring" shows the ring. */
export function lookHit(b: GalleryBlock, query: string): { variant?: string; template?: string } | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const all = lookSources(b), as = (x: { kind: Look['kind']; id: string }) => (x.kind === 'variant' ? { variant: x.id } : { template: x.id });
  const exact = all.find(({ kind, id, x }) => { const w = lookWords(b, kind, id, x); return [...w.names, ...w.aliases].some((n) => n.toLowerCase() === q); });
  if (exact) return as(exact);
  if (blockMatches(b, query)) return undefined;
  const hits = lookHits(b, query), first = all.find((x) => hits.includes(`${x.kind}:${x.id}`));
  return first && as(first);
}
/** the look's key a lookHit names */
export const lookKey = (h: { variant?: string; template?: string }) => (h.variant !== undefined ? `variant:${h.variant}` : `template:${h.template}`);

/** The cards of a tab whose handle, name, label or doc (in the shown language or the original) matches the query; a block also by
 *  one of its variants or templates (lookHits). */
export function filterGallery(g: GalleryIndex, tab: Tab, query: string) {
  const fields = (id: string, x: { label: string; doc: string }) => { const y = shown(id, x); return [x.label, x.doc, y.label, y.doc]; };
  const block = (b: GalleryBlock) => blockMatches(b, query) || lookHits(b, query).length > 0;
  if (tab === 'blocks') return g.blocks.filter((b) => !isCaptionBlock(b) && !isTitleBlock(b) && block(b));
  if (tab === 'titles') return (g.titles ?? []).filter((c: GalleryCaption) => matches(query, handleOf(`title:${c.id}`), c.id, ...fields(`title:${c.id}`, c), ...Object.values(c.params).map(String)));
  if (tab === 'sfx') return g.sfx.filter((s) => matches(query, handleOf(s.type), s.type, ...fields(s.type, s)));
  if (tab === 'styles') return g.styles.filter((s) => matches(query, handleOf(`style:${s.id}`), s.id, ...fields(`style:${s.id}`, s)));
  // a combo is found by its layers too: their names, blocks and templates
  if (tab === 'combos') return (g.combos ?? []).filter((c) => matches(query, c.handle ?? handleOf(`combo:${c.id}`), c.id, ...fields(`combo:${c.id}`, c), ...c.parts.flatMap((x) => [x.name, x.type ?? '', x.template ?? ''])));
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
