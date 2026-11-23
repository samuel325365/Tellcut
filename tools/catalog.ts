// The block catalog (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Task 2): every registered item type and sound effect,
// read from the plugins themselves so it never goes stale.  npm run tellcut -- catalog [type] | --find <words>
// guides/workflow.md carries only an index of the shared blocks (formatIndex, kept there by npm run blocks:index); the
// details are looked up here. Every line starts with the block's handle (MRK-03, spec 2026-10-22-block-handles), and a handle
// can be looked up like a type: `catalog MRK-03` (music styles, recipes, clip effects and combos too).
import { OLD_BLOCKS, templateName, variantCode, type BlockTemplate, type BlockVariant, type Combo, type ComboPart, type ItemType, type ParamDef, type Plugin } from '@tellcut/engine';
import { loadStyles, SCORE_LIBRARY, STYLES } from '@tellcut/media-node';
import { BLOCK_CATEGORY, BLOCK_CATEGORY_EN, BLOCK_PREFIX, CLIP_FX, CLIP_GROUPS, type ClipFx, type ClipGroup, handleOf, HANDLES, normalizeHandle, PLUGIN_GROUP as GROUP, SFX_CATEGORY, SFX_CATEGORY_EN, SFX_PREFIX } from '@tellcut/protocol';
import { TEMPLATES, TITLE_TEMPLATES, type CaptionTemplate } from '@tellcut/plugin-common';
import { BLOCKS_EN } from '@tellcut/editor/i18n/blocks.en';
import { describeRecipe } from './cut/recipes/index.ts';

type Kind = 'caption' | 'title';
const LIST: Record<Kind, CaptionTemplate[]> = { caption: TEMPLATES, title: TITLE_TEMPLATES };
/** a template's words for --find: its id, names and what it sets */
const templateText = (t: CaptionTemplate) => [t.id, t.label, t.doc, ...Object.entries(t.params).map(([k, v]) => `${k} ${String(v)}`)].join(' ').toLowerCase();
const templateLine = (kind: Kind) => (t: CaptionTemplate) => `  ${(handleOf(`${kind}:${t.id}`) ?? '').padEnd(10)}  ${t.id.padEnd(12)}  ${t.label} — ${t.doc}`;
/** the caption (or title) templates matching every word of `query` (all of them without one) */
export function findTemplates(query = '', kind: Kind = 'caption'): CaptionTemplate[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return LIST[kind].filter((t) => words.every((w) => templateText(t).includes(w)));
}

/** `catalog CAP [--find <words>]` and `catalog TTL …`: the caption or title templates, one a line (the block's template parameter takes the id) */
export function formatTemplates(query = '', kind: Kind = 'caption'): string {
  const hits = findTemplates(query, kind), cap = kind === 'caption';
  if (!hits.length) return `沒有符合「${query}」的${cap ? '字幕' : '標題'}範本；全部：npm run tellcut -- catalog ${cap ? 'CAP' : 'TTL'}`;
  return [cap ? `字幕範本 ${hits.length} 個${query ? `（符合「${query}」）` : ''}（common.caption 的 template 參數填 id；整支片的預設：c.captionTemplate('<id>')）：`
    : `標題範本 ${hits.length} 個${query ? `（符合「${query}」）` : ''}（common.heading 的 template 參數填 id；整支片的預設：c.titleTemplate('<id>')）：`, ...hits.map(templateLine(kind)), '',
    cap ? "看某個範本設了什麼：npm run tellcut -- catalog CAP-01；講話字幕：c.speechCaptions(clip, { type: 'common.caption', karaoke: true, params: { template: '<id>' } })"
      : "看某個範本設了什麼：npm run tellcut -- catalog TTL-01；用法：c.effect('common.heading', { at, len, text, kicker, sub, template: '<id>' })"].join('\n');
}

type Entry = { type: string; label: string; doc?: string; category?: string; params?: ParamDef[]; onRequest?: boolean; templates?: BlockTemplate[]; variants?: ItemType['variants'] };
/** the user's own blocks (the plugin `mine`, spec 2026-10-29-my-library §4.3): no handle, marked 我的 in its place */
let MINE = new Set<string>();
const mineOf = (plugins: Plugin[]) => { MINE = new Set(plugins.filter((p) => p.id === 'mine').flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])].map((t) => t.type))); };
/** the handle column: as wide as the longest handle (SFX-HIT-02); blank for a project's own fx, 我的 for the user's own */
const handleCol = (id: string) => (MINE.has(id) ? '我的' : handleOf(id) ?? '').padEnd(10);
const lineOf = (w: number) => (t: Entry) => `  ${handleCol(t.type)}  ${t.type.padEnd(w)}  ${t.label}${t.doc ? ` — ${t.doc}` : ''}`;
const numberOf = (h: string) => /\d+$/.exec(h)![0];

/** the clip effects' groups as the catalog names them (the gallery's three headings) */
const CLIP_GROUP_NAME: Record<ClipGroup, string> = { transition: '轉場（c.clip／c.photo 的 transition，接前一段）', shape: '形狀（clip、photo、beside 的 shape，畫面裁成那個形狀）', motion: '晃動、跟著臉、避開原片字幕' };
const clipLine = (c: ClipFx) => `  ${handleCol(c.key)}  ${c.label}：${c.code}`;
/** a clip effect's words for --find: its key, names, doc and cut.ts line in Chinese and English (片段 / clip: those words list them all) */
const clipText = (c: ClipFx) => ['片段', 'clip', c.key, c.label, c.doc, c.code, BLOCKS_EN[c.key]?.label ?? '', BLOCKS_EN[c.key]?.doc ?? ''].join(' ').toLowerCase();
/** the clip effects matching every word of `query` (a handle: the one it names) */
export function findClipFx(query: string): ClipFx[] {
  const h = normalizeHandle(query);
  if (h) return CLIP_FX.filter((c) => handleOf(c.key) === h);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? CLIP_FX.filter((c) => words.every((w) => clipText(c).includes(w))) : [];
}

/** the combos of the plugins (engine combos.ts) */
const combosOf = (plugins: Plugin[]): Combo[] => plugins.flatMap((p) => p.combos ?? []);
const comboLine = (c: Combo) => `  ${(handleOf(`combo:${c.id}`) ?? '').padEnd(10)}  ${c.id.padEnd(10)}  ${c.label} — ${c.doc}`;
/** a combo's words for --find: its id, names, doc and its layers' names, types and templates (and combo / 組合: those words list them all) */
const comboText = (c: Combo) => ['combo', '組合', c.id, c.label, c.doc, ...c.parts.flatMap((p) => [p.name, p.type ?? '', p.template ?? ''])].join(' ').toLowerCase();
/** the combos matching every word of `query` (a handle: the combo it names) */
export function findCombos(plugins: Plugin[], query: string): Combo[] {
  const h = normalizeHandle(query);
  if (h) return combosOf(plugins).filter((c) => handleOf(`combo:${c.id}`) === h);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? combosOf(plugins).filter((c) => words.every((w) => comboText(c).includes(w))) : [];
}
const PART_KIND: Record<ComboPart['kind'], string> = { effect: '畫面', sfx: '音效', shake: '鏡頭晃動' };
/** `catalog CMB-01` / `catalog combo:<id>`: the combo and each of its layers, its times from the moment */
export function formatCombo(c: Combo): string {
  const h = handleOf(`combo:${c.id}`), what = (p: ComboPart) => [p.type, p.template && `範本 ${p.template}`, p.layer && `layer ${p.layer}`, p.gain !== undefined && `${p.gain} dB`,
    p.px !== undefined && `${p.px} px`, p.hz !== undefined && `${p.hz} Hz`].filter(Boolean).join('，');
  return [`${h ? `${h} ` : ''}${c.id} ${c.label}（組合）— ${c.doc}`, '  各層（秒數相對那一刻，負的是提前開始）：',
    ...c.parts.map((p) => `    ${p.name}（${PART_KIND[p.kind]}${what(p) ? `：${what(p)}` : ''}）${p.at} 秒起 ${p.len} 秒${p.params ? `：${JSON.stringify(p.params)}` : ''}`),
    `  用法：c.combo('${c.id}', { at })；sound: false 不要音效；parts: { ${c.parts[0].name}: false } 拿掉一層，parts: { ${c.parts[0].name}: { …參數 } } 改那層的參數；全部掛在那一刻主軌正在播的片段上`].join('\n');
}

/** items (or sounds) in catalog order: by category (the order of `names`, BLOCK_CATEGORY by default) when they have one, else as
 *  registered; the ones the agent uses only when asked for (onRequest) last, in a group of their own */
function grouped(all: Entry[], names: Record<string, string> = BLOCK_CATEGORY): Array<[string | null, Entry[]]> {
  const items = all.filter((t) => !t.onRequest), asked = all.filter((t) => t.onRequest);
  const cats = Object.keys(names);
  const out: Array<[string | null, Entry[]]> = !items.some((t) => t.category) ? [[null, items]]
    : [...cats.map((c): [string, Entry[]] => [names[c], items.filter((t) => t.category === c)]), ['其他', items.filter((t) => !t.category || !cats.includes(t.category))]];
  out.push(['只在使用者指名時用（使用者沒指名就不要用）', asked]);
  return out.filter(([, xs]) => xs.length);
}

export function formatCatalog(plugins: Plugin[]): string {
  mineOf(plugins);
  // the user's own first (the agent tries them before anything else), then core
  const rank = (p: Plugin) => (p.id === 'mine' ? 0 : p.id === 'core' ? 1 : 2);
  const ordered = [...plugins].sort((a, b) => rank(a) - rank(b));
  const items = ordered.flatMap((p) => p.items ?? []), sfx = ordered.flatMap((p) => p.sfx ?? []);
  const w = Math.max(0, ...[...items, ...sfx].map((t) => t.type.length));
  const line = lineOf(w);
  const out: string[] = [];
  for (const p of ordered) {
    if (!p.items?.length) continue;
    out.push(`${p.id}（${GROUP[p.id] ?? '外掛'}）`);
    // the old blocks are not offered (kept only so older projects open; catalog <type> still shows them)
    for (const [name, xs] of grouped(p.items.filter((t) => !OLD_BLOCKS[t.type]))) out.push(...(name ? [` ${name}：`] : []), ...xs.map(line));
    out.push('');
  }
  if (sfx.length) {
    out.push('音效（c.sfx(類型, …)；專案自己的音檔用 c.sfxFile(路徑, …)）：');
    for (const [name, xs] of grouped(sfx, SFX_CATEGORY)) out.push(...(name ? [` ${name}：`] : []), ...xs.map(line));
    out.push('');
  }
  const grades = ordered.filter((p) => Object.keys(p.grades ?? {}).length).map((p) => `  ${p.id}：${Object.keys(p.grades!).join('、')}`);
  if (grades.length) out.push('調色（畫面項目的 grade 欄位）：', ...grades, '');
  // not blocks but things a clip itself does (toolkit phase 5): said here so they are found where blocks are looked for
  out.push('片段本身的效果（不是積木，寫在片段上，在 cut.ts 裡呼叫）：', ...CLIP_GROUPS.flatMap((g) => {
    const xs = CLIP_FX.filter((c) => c.group === g);
    return xs.length ? [` ${CLIP_GROUP_NAME[g]}：`, ...xs.map(clipLine)] : [];
  }), '');
  const combos = combosOf(ordered);
  if (combos.length) out.push("組合（一個重點時刻的畫面、音效、鏡頭晃動一次放好：c.combo('<id>', { at })；看它有哪幾層：catalog <代號>）：", ...combos.map(comboLine), '');
  out.push(`字幕範本（${TEMPLATES.length} 個，common.caption 的 template）：npm run tellcut -- catalog CAP`, `標題範本（${TITLE_TEMPLATES.length} 個，common.heading 的 template）：npm run tellcut -- catalog TTL`, '');
  out.push('找積木：npm run tellcut -- catalog --find <關鍵字>；看某個積木的參數：npm run tellcut -- catalog <類型或代號>；cut.ts 的方法：npm run tellcut -- cut-api');
  return out.join('\n');
}

const wordsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);
const joined = (xs: string[]) => xs.join(' ').toLowerCase();
/** a param's options as words of its block: not those of the param the block's variants name, which are the variants' own words
 *  (else `--find rocket` would hit the block itself and list no look) */
const optionWords = (t: Entry, d: ParamDef) => (d.type === 'enum' && d.key !== t.variants?.param ? d.options : []);
/** the block's own words for --find: its type, label, doc, and its params' keys, labels and options */
const blockText = (t: Entry) => joined([t.type, t.label, t.doc ?? '', ...(t.params ?? []).flatMap((d) => [d.key, d.label, ...optionWords(t, d)])]);
/** the block's words a variant or template may lean on for the rest of the query: as blockText but without the params' labels,
 *  which name the looks one by one (progress' size: 「ring：圓環的大小」), so two words from two different looks never meet in one */
const partBase = (t: Entry) => joined([t.type, t.label, t.doc ?? '', ...(t.params ?? []).flatMap((d) => [d.key, ...optionWords(t, d)])]);
const variantText = (t: Entry, v: BlockVariant) => { const en = BLOCKS_EN[`${t.type}@${v.value}`]; return joined([v.value, v.label, v.doc, en?.label ?? '', en?.doc ?? '']); };
const templatePartText = (t: Entry, x: BlockTemplate) => { const en = BLOCKS_EN[`${t.type}#${x.id}`]; return joined([x.id, x.label, x.doc, en?.label ?? '', en?.doc ?? '']); };
/** a variant or template matches when every word is in its own text or its block's, and at least one is in its own text and is not
 *  just the block's name (`--find 進度條` is the block, not the look whose doc says 進度條) */
function partHits(t: Entry, words: string[], own: string): boolean {
  const base = partBase(t), name = joined([t.type, t.label]);
  return words.every((w) => own.includes(w) || base.includes(w)) && words.some((w) => own.includes(w) && !name.includes(w));
}

/** the variants and templates of block `t` that `query` matches (see partHits); none for a handle, which names the block itself */
export function findParts(t: Entry, query: string): { variants: BlockVariant[]; templates: BlockTemplate[] } {
  const words = normalizeHandle(query) ? [] : wordsOf(query);
  if (!words.length) return { variants: [], templates: [] };
  return { variants: (t.variants?.list ?? []).filter((v) => partHits(t, words, variantText(t, v))), templates: templatesOf(t).filter((x) => partHits(t, words, templatePartText(t, x))) };
}

/** every word (case does not matter) is in the block's type, label, doc or one of its params' key, label or options, or one of its
 *  variants or templates matches (findParts); a handle (mrk-3 as well as MRK-03) finds its block */
export function findBlocks(plugins: Plugin[], query: string): Entry[] {
  const h = normalizeHandle(query);
  if (h) return plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).filter((t) => handleOf(t.type) === h);
  const words = wordsOf(query);
  const hit = (t: Entry) => words.every((x) => blockText(t).includes(x)) || Object.values(findParts(t, query)).some((xs) => xs.length);
  return words.length ? plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).filter((t) => !OLD_BLOCKS[t.type] && hit(t)) : [];
}

/** after a block's line when none of its parts is listed: how many looks and templates it has and where to see them */
function partsNote(t: Entry): string {
  const n = t.variants?.list.length ?? 0, m = templatesOf(t).length;
  return n || m ? `（${[n ? `${n} 種樣式` : '', m ? `${m} 個範本` : ''].filter(Boolean).join('、')}：catalog ${t.type}）` : '';
}

/** the found blocks' lines, each followed by its matching variants and templates as the option c.effect takes (mode: 'rocket'),
 *  the codes padded to one width; `parts` says whether any part line was written */
function blockLines(hits: Entry[], query: string): { lines: string[]; parts: boolean } {
  const found = hits.map((t) => findParts(t, query));
  const rows = hits.map((t, i) => [...found[i].variants.map((v) => ({ code: variantCode(t.variants!.param, v.value), label: v.label, doc: v.doc })),
    ...found[i].templates.map((x) => ({ code: variantCode('template', x.id), label: x.label, doc: x.doc }))]);
  const cw = Math.max(0, ...rows.flat().map((r) => r.code.length)), line = lineOf(Math.max(...hits.map((t) => t.type.length)));
  const lines = hits.flatMap((t, i) => (rows[i].length ? [line(t), ...rows[i].map((r) => `${' '.repeat(16)}${r.code.padEnd(cw)}  ${r.label} — ${r.doc}`)] : [line(t) + partsNote(t)]));
  return { lines, parts: rows.some((r) => r.length) };
}

export function formatFind(plugins: Plugin[], query: string): string {
  mineOf(plugins);
  const mineFirst = [...plugins].sort((a, b) => Number(b.id === 'mine') - Number(a.id === 'mine'));
  const hits = findBlocks(mineFirst, query), caps = normalizeHandle(query) ? [] : findTemplates(query), ttls = normalizeHandle(query) ? [] : findTemplates(query, 'title');
  const combos = findCombos(plugins, query), comboLines = combos.length ? [`組合 ${combos.length} 個符合（c.combo('<id>', { at })；看各層：catalog <代號>）：`, ...combos.map(comboLine)] : [];
  // the clip effects come with the combos: not blocks, but where a transition or a shape is looked for
  const clips = findClipFx(query);
  if (clips.length) comboLines.push(`片段本身的效果 ${clips.length} 個符合（不是積木，寫在片段上；看說明：catalog <代號>）：`, ...clips.map(clipLine));
  // caption templates fold into one line: there are many, and they are all the one block
  const capLine = [...(caps.length ? [`字幕範本 ${caps.length} 個符合（${caps.slice(0, 3).map((t) => t.id).join('、')}${caps.length > 3 ? '…' : ''}）：npm run tellcut -- catalog CAP --find ${query}`] : []),
    ...(ttls.length ? [`標題範本 ${ttls.length} 個符合（${ttls.slice(0, 3).map((t) => t.id).join('、')}${ttls.length > 3 ? '…' : ''}）：npm run tellcut -- catalog TTL --find ${query}`] : [])];
  if (!hits.length && (capLine.length || comboLines.length)) return [...comboLines, ...capLine].join('\n');
  if (!hits.length) return `找不到符合「${query}」的積木；換個說法（例如「收據」「路線」「手寫」「計分」），或看整份：npm run tellcut -- catalog`;
  const { lines, parts } = blockLines(hits, query);
  return [`符合「${query}」的積木 ${hits.length} 個：`, ...lines, ...comboLines, ...capLine, '',
    `看參數和全部樣式：npm run tellcut -- catalog <類型或代號>${parts ? "；縮排的那幾行是 c.effect 的寫法（例如 mode: 'rocket'、template: 'rocket'）" : ''}`].join('\n');
}

/** one category of the block index: its name, its handle prefix in brackets, then each block as its handle's number and short name,
 *  in handle order; a block that kept the handle of a category it left shows the whole handle, after the others. The prefix is left
 *  out when no block listed carries it (a category holding only moved blocks): there it would point at no handle at all. */
function indexLine(cat: string, xs: Entry[], prefix: string): string {
  const name = (t: Entry) => '`' + t.type.replace(/^common\./, '') + '`';
  const parts = xs.map((t) => { const h = handleOf(t.type); return { t, h, own: !!h && h === `${prefix}-${numberOf(h)}` }; });
  const no = (h?: string) => (h ? Number(numberOf(h)) : Infinity);
  parts.sort((a, b) => Number(b.own) - Number(a.own) || no(a.h) - no(b.h));
  const head = parts.some((x) => x.own) ? `${cat} (${prefix})` : cat;
  return `${head}: ` + parts.map(({ t, h, own }) => (own ? `${numberOf(h!)} ` : h ? `${h} ` : '') + name(t)).join(', ');
}

/** a block's named templates (a sound effect has none) */
const templatesOf = (t: Entry) => t.templates ?? [];

/** the block index of guides/workflow.md (between the block-index marks): one line per category with its handle prefix, then
 *  the blocks as number and short name; then the blocks' named templates (`<block>/<id>` and its English doc), then the sounds */
export function formatIndex(plugins: Plugin[]): string {
  const common = plugins.find((p) => p.id === 'common');
  // a block used only when asked for (onRequest), or kept only for older projects, is not offered here: the agent picks from this index
  const items: Entry[] = (common?.items ?? []).filter((t) => !t.onRequest && !OLD_BLOCKS[t.type]), sfx: Entry[] = common?.sfx ?? [];
  const lines = Object.entries(BLOCK_CATEGORY_EN).map(([k, cat]) => ({ cat, p: BLOCK_PREFIX[k as keyof typeof BLOCK_PREFIX], xs: items.filter((t) => t.category === k) }))
    .filter((c) => c.xs.length).map((c) => `- ${indexLine(c.cat, c.xs, c.p)}`);
  // the looks of the shared blocks, core's too (core.flash), only their values: catalog --find describes each
  const core = plugins.find((p) => p.id === 'core');
  const looks: Entry[] = [...(common?.items ?? []), ...(core?.items ?? [])].filter((t) => t.variants?.list.length && !t.onRequest && !OLD_BLOCKS[t.type]);
  if (looks.length) lines.push('- Block variants (the param in brackets picks the look; `catalog --find <words>` describes them):',
    ...looks.map((t) => `  - \`${t.type.replace(/^common\./, '')}\` (${t.variants!.param}): ${t.variants!.list.map((v) => v.value).join(', ')}`));
  const tpls = items.flatMap((t) => templatesOf(t).map((x) => ({ type: t.type, x })));
  if (tpls.length) lines.push("- Block templates (`c.effect(type, { template: '<id>' })`: the template's params go in first, the script's own over them):",
    ...tpls.map(({ type, x }) => `  - \`${templateName(type, x.id)}\`: ${BLOCKS_EN[`${type}#${x.id}`]?.doc ?? x.doc}`));
  const combos = combosOf(plugins);
  if (combos.length) lines.push("- Combos (CMB) (`c.combo('<id>', { at })`: a key moment's picture layers, sounds and the clip's shake placed at once; `catalog CMB-01` lists its layers): "
    + combos.map((c) => { const h = handleOf(`combo:${c.id}`); return `${h ? `${numberOf(h)} ` : ''}\`${c.id}\``; }).join(', '));
  if (sfx.length) lines.push(`- Sound effects (\`c.sfx\`; a sound file the project made itself goes in with \`c.sfxFile\`):`, ...Object.entries(SFX_CATEGORY_EN)
    .map(([k, cat]) => ({ cat, p: SFX_PREFIX[k as keyof typeof SFX_PREFIX], xs: sfx.filter((s) => s.category === k) }))
    .filter((c) => c.xs.length).map((c) => `  - ${indexLine(c.cat, c.xs, c.p)}`));
  return lines.join('\n');
}

const describe = (d: ParamDef) => describeBase(d) + (d.theme ? `（沒填時取專案 theme ${d.themeIfSet ? '自己設的' : '的'} ${d.theme}${d.themeIfSet ? '，沒設就用預設' : ''}）` : '');
function describeBase(d: ParamDef): string {
  const def = (v: unknown) => (v === '' ? '（空）' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  switch (d.type) {
    case 'number': {
      const range = d.min !== undefined && d.max !== undefined ? `，範圍 ${d.min}–${d.max}` : d.min !== undefined ? `，最小 ${d.min}` : d.max !== undefined ? `，最大 ${d.max}` : '';
      return `數字，預設 ${d.default}${range}`;
    }
    case 'enum': return `選項 ${d.options.join(' / ')}，預設 ${d.default}`;
    case 'color': return `顏色，預設 ${def(d.default)}`;
    case 'bool': return `是／否，預設 ${d.default ? '是' : '否'}`;
    case 'string': return `文字，預設 ${def(d.default)}`;
    case 'text': return `多行文字，預設 ${def(d.default).replace(/\n/g, '\\n')}`;
    case 'source-ref': return `素材 id，預設 ${def(d.default)}`;
    case 'media-ref': return `音樂 id，預設 ${def(d.default)}`;
    case 'json': return `JSON，預設 ${def(d.default)}`;
  }
}

/** edit distance (letters added, removed or changed) */
export function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function formatType(plugins: Plugin[], type: string): string {
  const all = plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]);
  const t = all.find((x) => x.type === type);
  if (!t) {
    const near = all.map((x) => x.type).sort((a, b) => distance(type, a) - distance(type, b)).slice(0, 3);
    throw new Error(`找不到 ${type}；最接近的是：${near.join('、')}`);
  }
  const h = handleOf(t.type);
  const head = `${h ? `${h} ` : ''}${t.type} ${t.label}${t.doc ? ` — ${t.doc}` : ''}`;
  const old = OLD_BLOCKS[t.type] ? [`  （舊積木，只為了讓舊專案打得開：新片用 ${OLD_BLOCKS[t.type]}）`] : [];
  const tpls = templatesOf(t), named = tpls.length ? [`  範本（c.effect('${t.type}', { at, len, template: '<id>' })；範本的參數先放，自己給的蓋在上面）：`,
    ...tpls.map((x) => `    ${x.id}（${x.label}）— ${x.doc}：${JSON.stringify(x.params)}`)] : [];
  // the looks one param picks (engine variants.ts), each with its value padded to one width
  const vs = (t as Entry).variants, vw = Math.max(0, ...(vs?.list ?? []).map((v) => v.value.length));
  const looks = vs?.list.length ? [`  樣式（${vs.param}，c.effect('${t.type}', { at, len, ${vs.param}: '<value>' })）：`, ...vs.list.map((v) => `    ${v.value.padEnd(vw)}  ${v.label} — ${v.doc}`)] : [];
  return [head, ...old, ...looks, ...(t.params.length ? t.params.map((d) => `  ${d.key}（${d.label}）：${describe(d)}`) : ['  （沒有參數）']), ...named].join('\n');
}

/** `catalog <類型或代號>`: a type as formatType shows it; a handle (any case, mrk-3 too) as what it names — a block's or sound
 *  effect's params, a music style, a recipe's content format, a clip effect's cut.ts call */
export async function formatLookup(plugins: Plugin[], query: string): Promise<string> {
  const h = normalizeHandle(query), id = h ? HANDLES[h] : query;
  if (h && !id) throw new Error(`沒有 ${h} 這個代號；找積木：npm run tellcut -- catalog --find <關鍵字>`);
  if (id.startsWith('combo:')) {
    const c = combosOf(plugins).find((x) => x.id === id.slice(6));
    if (!c) throw new Error(`${h ? `${h} 是` : '沒有'}組合 ${id.slice(6)}${h ? '，但找不到它' : ''}；全部的組合：npm run tellcut -- catalog --find combo`);
    return formatCombo(c);
  }
  if (!h) return formatType(plugins, query);
  if (id.startsWith('recipe:')) return `${h} ${describeRecipe(id.slice(7))}`;
  if (id.startsWith('caption:')) {
    const t = TEMPLATES.find((x) => x.id === id.slice(8));
    if (!t) throw new Error(`${h} 是字幕範本 ${id.slice(8)}，但找不到它`);
    return [`${h} ${t.id} ${t.label}（字幕範本，common.caption）— ${t.doc}`, ...Object.entries(t.params).map(([k, v]) => `  ${k}：${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
      `  用法：c.effect('common.caption', { at, len, text, template: '${t.id}' })；整支片：c.captionTemplate('${t.id}')；字幕自己給的參數蓋過範本`].join('\n');
  }
  if (id.startsWith('title:')) {
    const t = TITLE_TEMPLATES.find((x) => x.id === id.slice(6));
    if (!t) throw new Error(`${h} 是標題範本 ${id.slice(6)}，但找不到它`);
    return [`${h} ${t.id} ${t.label}（標題範本，common.heading）— ${t.doc}`, ...Object.entries(t.params).map(([k, v]) => `  ${k}：${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
      `  用法：c.effect('common.heading', { at, len, text, kicker, sub, template: '${t.id}' })；整支片：c.titleTemplate('${t.id}')；標題自己給的參數蓋過範本`].join('\n');
  }
  const clip = CLIP_FX.find((c) => c.key === id);
  if (clip) return `${h} ${clip.label}（片段本身的效果，不是積木）— ${clip.doc}\n  cut.ts：${clip.code}`;
  if (id.startsWith('style:')) {
    const sid = id.slice(6), s = STYLES[sid] ?? (await loadStyles([SCORE_LIBRARY])).styles[sid];
    if (!s) throw new Error(`${h} 是配樂風格 ${sid}，但載入不到它`);
    return `${h} ${s.id} ${s.label}（配樂風格，${STYLES[sid] ? '內建' : '風格庫'}，預設 ${s.defaults.bpm} BPM、${s.defaults.key}）— ${s.doc ?? ''}\n  cut.ts：c.score('${s.id}', { bpm })；或 npm run score -- <專案> --style ${s.id}`;
  }
  return formatType(plugins, id);
}
