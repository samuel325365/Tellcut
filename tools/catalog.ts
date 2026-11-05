// The block catalog (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Task 2): every registered item type and sound effect,
// read from the plugins themselves so it never goes stale.  npm run tellcut -- catalog [type] | --find <words>
// guides/workflow.md carries only an index of the shared blocks (formatIndex, kept there by npm run blocks:index); the
// details are looked up here. Every line starts with the block's handle (MRK-03, spec 2026-10-22-block-handles), and a handle
// can be looked up like a type: `catalog MRK-03` (music styles, recipes and clip effects too).
import { OLD_TEXT, type ParamDef, type Plugin } from '@tellcut/engine';
import { loadStyles, SCORE_LIBRARY, STYLES } from '@tellcut/media-node';
import { BLOCK_CATEGORY, BLOCK_CATEGORY_EN, BLOCK_PREFIX, CLIP_FX, handleOf, HANDLES, normalizeHandle, PLUGIN_GROUP as GROUP, SFX_CATEGORY, SFX_CATEGORY_EN, SFX_PREFIX } from '@tellcut/protocol';
import { TEMPLATES, TITLE_TEMPLATES, type CaptionTemplate } from '@tellcut/plugin-common';
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
  return [cap ? `字幕範本 ${hits.length} 個${query ? `（符合「${query}」）` : ''}（common.caption 的 template 參數填 id；整支片的預設：project.json 的 meta.captionTemplate）：`
    : `標題範本 ${hits.length} 個${query ? `（符合「${query}」）` : ''}（common.heading 的 template 參數填 id；整支片的預設：c.titleTemplate('<id>')）：`, ...hits.map(templateLine(kind)), '',
    cap ? "看某個範本設了什麼：npm run tellcut -- catalog CAP-01；講話字幕：c.speechCaptions(clip, { type: 'common.caption', karaoke: true, params: { template: '<id>' } })"
      : "看某個範本設了什麼：npm run tellcut -- catalog TTL-01；用法：c.effect('common.heading', { at, len, text, kicker, sub, template: '<id>' })"].join('\n');
}

type Entry = { type: string; label: string; doc?: string; category?: string; params?: ParamDef[]; onRequest?: boolean };
/** the user's own blocks (the plugin `mine`, spec 2026-10-29-my-library §4.3): no handle, marked 我的 in its place */
let MINE = new Set<string>();
const mineOf = (plugins: Plugin[]) => { MINE = new Set(plugins.filter((p) => p.id === 'mine').flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])].map((t) => t.type))); };
/** the handle column: as wide as the longest handle (SFX-HIT-02); blank for a project's own fx, 我的 for the user's own */
const handleCol = (id: string) => (MINE.has(id) ? '我的' : handleOf(id) ?? '').padEnd(10);
const lineOf = (w: number) => (t: Entry) => `  ${handleCol(t.type)}  ${t.type.padEnd(w)}  ${t.label}${t.doc ? ` — ${t.doc}` : ''}`;
const numberOf = (h: string) => /\d+$/.exec(h)![0];

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
    // the old core.title / core.caption are not offered (kept only so older projects open; catalog <type> still shows them)
    for (const [name, xs] of grouped(p.items.filter((t) => !OLD_TEXT[t.type]))) out.push(...(name ? [` ${name}：`] : []), ...xs.map(line));
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
  out.push('片段本身的效果（不是積木，在 cut.ts 裡呼叫）：', ...CLIP_FX.map((c) => `  ${handleCol(c.key)}  ${c.label}：${c.code}`), '');
  out.push(`字幕範本（${TEMPLATES.length} 個，common.caption 的 template）：npm run tellcut -- catalog CAP`, '');
  out.push('找積木：npm run tellcut -- catalog --find <關鍵字>；看某個積木的參數：npm run tellcut -- catalog <類型或代號>；cut.ts 的方法：npm run tellcut -- cut-api');
  return out.join('\n');
}

/** every word (case does not matter) is in the block's type, label, doc, or one of its params' key, label or options; a handle
 *  (mrk-3 as well as MRK-03) finds its block */
export function findBlocks(plugins: Plugin[], query: string): Entry[] {
  const h = normalizeHandle(query);
  if (h) return plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).filter((t) => handleOf(t.type) === h);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = (t: Entry) => [t.type, t.label, t.doc ?? '', ...(t.params ?? []).flatMap((d) => [d.key, d.label, ...(d.type === 'enum' ? d.options : [])])].join(' ').toLowerCase();
  return words.length ? plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).filter((t) => !OLD_TEXT[t.type] && words.every((x) => text(t).includes(x))) : [];
}

export function formatFind(plugins: Plugin[], query: string): string {
  mineOf(plugins);
  const mineFirst = [...plugins].sort((a, b) => Number(b.id === 'mine') - Number(a.id === 'mine'));
  const hits = findBlocks(mineFirst, query), caps = normalizeHandle(query) ? [] : findTemplates(query), ttls = normalizeHandle(query) ? [] : findTemplates(query, 'title');
  // caption templates fold into one line: there are many, and they are all the one block
  const capLine = [...(caps.length ? [`字幕範本 ${caps.length} 個符合（${caps.slice(0, 3).map((t) => t.id).join('、')}${caps.length > 3 ? '…' : ''}）：npm run tellcut -- catalog CAP --find ${query}`] : []),
    ...(ttls.length ? [`標題範本 ${ttls.length} 個符合（${ttls.slice(0, 3).map((t) => t.id).join('、')}${ttls.length > 3 ? '…' : ''}）：npm run tellcut -- catalog TTL --find ${query}`] : [])];
  if (!hits.length && capLine.length) return capLine.join('\n');
  if (!hits.length) return `找不到符合「${query}」的積木；換個說法（例如「收據」「路線」「手寫」「計分」），或看整份：npm run tellcut -- catalog`;
  return [`符合「${query}」的積木 ${hits.length} 個：`, ...hits.map(lineOf(Math.max(...hits.map((t) => t.type.length)))), ...capLine, '', '看參數：npm run tellcut -- catalog <類型或代號>'].join('\n');
}

/** one category of the block index: each block as its handle's number and short name, in handle order; a block that kept the
 *  handle of a category it left shows the whole handle, after the others */
function indexLine(xs: Entry[], prefix: string): string {
  const name = (t: Entry) => '`' + t.type.replace(/^common\./, '') + '`';
  const parts = xs.map((t) => { const h = handleOf(t.type); return { t, h, own: !!h && h === `${prefix}-${numberOf(h)}` }; });
  const no = (h?: string) => (h ? Number(numberOf(h)) : Infinity);
  parts.sort((a, b) => Number(b.own) - Number(a.own) || no(a.h) - no(b.h));
  return parts.map(({ t, h, own }) => (own ? `${numberOf(h!)} ` : h ? `${h} ` : '') + name(t)).join(', ');
}

/** the block index of guides/workflow.md (between the block-index marks): one line per category with its handle prefix, then
 *  the blocks as number and short name */
export function formatIndex(plugins: Plugin[]): string {
  const common = plugins.find((p) => p.id === 'common');
  // a block used only when asked for (onRequest) is not offered here: the agent picks from this index
  const items: Entry[] = (common?.items ?? []).filter((t) => !t.onRequest), sfx: Entry[] = common?.sfx ?? [];
  const lines = Object.entries(BLOCK_CATEGORY_EN).map(([k, cat]) => ({ cat, p: BLOCK_PREFIX[k as keyof typeof BLOCK_PREFIX], xs: items.filter((t) => t.category === k) }))
    .filter((c) => c.xs.length).map((c) => `- ${c.cat} (${c.p}): ${indexLine(c.xs, c.p)}`);
  if (sfx.length) lines.push(`- Sound effects (\`c.sfx\`; a sound file the project made itself goes in with \`c.sfxFile\`):`, ...Object.entries(SFX_CATEGORY_EN)
    .map(([k, cat]) => ({ cat, p: SFX_PREFIX[k as keyof typeof SFX_PREFIX], xs: sfx.filter((s) => s.category === k) }))
    .filter((c) => c.xs.length).map((c) => `  - ${c.cat} (${c.p}): ${indexLine(c.xs, c.p)}`));
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
  return [head, ...(t.params.length ? t.params.map((d) => `  ${d.key}（${d.label}）：${describe(d)}`) : ['  （沒有參數）'])].join('\n');
}

/** `catalog <類型或代號>`: a type as formatType shows it; a handle (any case, mrk-3 too) as what it names — a block's or sound
 *  effect's params, a music style, a recipe's content format, a clip effect's cut.ts call */
export async function formatLookup(plugins: Plugin[], query: string): Promise<string> {
  const h = normalizeHandle(query);
  if (!h) return formatType(plugins, query);
  const id = HANDLES[h];
  if (!id) throw new Error(`沒有 ${h} 這個代號；找積木：npm run tellcut -- catalog --find <關鍵字>`);
  if (id.startsWith('recipe:')) return `${h} ${describeRecipe(id.slice(7))}`;
  if (id.startsWith('caption:')) {
    const t = TEMPLATES.find((x) => x.id === id.slice(8));
    if (!t) throw new Error(`${h} 是字幕範本 ${id.slice(8)}，但找不到它`);
    return [`${h} ${t.id} ${t.label}（字幕範本，common.caption）— ${t.doc}`, ...Object.entries(t.params).map(([k, v]) => `  ${k}：${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
      `  用法：c.effect('common.caption', { at, len, text, template: '${t.id}' })；整支片：project.json 的 meta.captionTemplate: '${t.id}'；字幕自己給的參數蓋過範本`].join('\n');
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
