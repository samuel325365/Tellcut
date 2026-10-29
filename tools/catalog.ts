// The block catalog (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Task 2): every registered item type and sound effect,
// read from the plugins themselves so it never goes stale.  npm run tellcut -- catalog [type] | --find <words>
// guides/workflow.md carries only an index of the shared blocks (formatIndex, kept there by npm run blocks:index); the
// details are looked up here. Every line starts with the block's handle (MRK-03, spec 2026-10-22-block-handles), and a handle
// can be looked up like a type: `catalog MRK-03` (music styles, recipes and clip effects too).
import type { ParamDef, Plugin } from '@tellcut/engine';
import { loadStyles, SCORE_LIBRARY, STYLES } from '@tellcut/media-node';
import { BLOCK_CATEGORY, BLOCK_CATEGORY_EN, BLOCK_PREFIX, CLIP_FX, handleOf, HANDLES, normalizeHandle, PLUGIN_GROUP as GROUP, SFX_CATEGORY, SFX_CATEGORY_EN, SFX_PREFIX } from '@tellcut/protocol';
import { describeRecipe } from './cut/recipes/index.ts';

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
    for (const [name, xs] of grouped(p.items)) out.push(...(name ? [` ${name}：`] : []), ...xs.map(line));
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
  return words.length ? plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).filter((t) => words.every((x) => text(t).includes(x))) : [];
}

export function formatFind(plugins: Plugin[], query: string): string {
  mineOf(plugins);
  const mineFirst = [...plugins].sort((a, b) => Number(b.id === 'mine') - Number(a.id === 'mine'));
  const hits = findBlocks(mineFirst, query);
  if (!hits.length) return `找不到符合「${query}」的積木；換個說法（例如「收據」「路線」「手寫」「計分」），或看整份：npm run tellcut -- catalog`;
  return [`符合「${query}」的積木 ${hits.length} 個：`, ...hits.map(lineOf(Math.max(...hits.map((t) => t.type.length)))), '', '看參數：npm run tellcut -- catalog <類型或代號>'].join('\n');
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
  const clip = CLIP_FX.find((c) => c.key === id);
  if (clip) return `${h} ${clip.label}（片段本身的效果，不是積木）— ${clip.doc}\n  cut.ts：${clip.code}`;
  if (id.startsWith('style:')) {
    const sid = id.slice(6), s = STYLES[sid] ?? (await loadStyles([SCORE_LIBRARY])).styles[sid];
    if (!s) throw new Error(`${h} 是配樂風格 ${sid}，但載入不到它`);
    return `${h} ${s.id} ${s.label}（配樂風格，${STYLES[sid] ? '內建' : '風格庫'}，預設 ${s.defaults.bpm} BPM、${s.defaults.key}）— ${s.doc ?? ''}\n  cut.ts：c.score('${s.id}', { bpm })；或 npm run score -- <專案> --style ${s.id}`;
  }
  return formatType(plugins, id);
}
