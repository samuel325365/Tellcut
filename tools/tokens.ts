// How many tokens a chat used (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Task 1):
//   npm run tokens -- <project id | home>        the page chat's thread (replies record their usage since phase 1); home: every home conversation
//   npm run tokens -- --session <file.jsonl>     a Claude Code conversation file (~/.claude/projects/<dir>/<session>.jsonl)
//   npm run tokens -- --subagents <file.jsonl>   that conversation and each subagent it ran (<session>/subagents/agent-*.jsonl), one line each
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** `cost`/`priced`: the Claude API price Claude Code reported (US$) and how many replies reported one (page chat, since 2026-10-17) */
/** session files only: `cacheWrite1h` the part of cacheWrite on the 1-hour cache (the rest is 5-minute), `rewrites` replies that wrote
 *  more than REWRITE tokens while reading back clearly less than the previous reply's context (the cache had expired and the whole
 *  conversation was written again), `usd` the estimate at list prices of the replies whose model is in PRICES, `unpriced` the replies
 *  of other models (left out of usd) and `unknownModels` their names */
export interface Totals { replies: number; measured: number; input: number; cacheWrite: number; cacheRead: number; output: number; cost?: number; priced?: number;
  cacheWrite1h?: number; rewrites?: number; usd?: number; unpriced?: number; unknownModels?: string[] }
const empty = (): Totals => ({ replies: 0, measured: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function sumChat(thread: { messages: Array<{ role: string; usage?: { input: number; cacheWrite: number; cacheRead: number; output: number; cost?: number }; [k: string]: unknown }> }): Totals {
  const t = empty();
  let cost = 0, priced = 0;
  for (const m of thread.messages) {
    if (m.role !== 'assistant') continue;
    t.replies++;
    if (!m.usage) continue;
    t.measured++;
    t.input += n(m.usage.input); t.cacheWrite += n(m.usage.cacheWrite); t.cacheRead += n(m.usage.cacheRead); t.output += n(m.usage.output);
    if (typeof m.usage.cost === 'number') { priced++; cost += m.usage.cost; }
  }
  return { ...t, cost, priced };
}

/** US$ per million tokens (platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-24): cache writes cost 1.25× input (5
 *  minutes) or 2× (1 hour), fast mode (usage.speed "fast", Opus 5.5 and 5) twice everything; `long`: a reply whose prompt (input + cache writes + cache reads) is over `above` tokens pays these prices instead */
type Rates = { input: number; output: number; read: number };
export const PRICES: Record<string, Rates & { long?: Rates & { above: number } }> = {
  'claude-opus-5-5': { input: 4, output: 20, read: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, read: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, read: 0.25 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, read: 0.01, long: { above: 100_000, input: 0.5, output: 2.5, read: 0.05 } },
  // older models still found in local session files
  'claude-fable-5': { input: 10, output: 50, read: 1 },
  'claude-opus-5': { input: 5, output: 25, read: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, read: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, read: 0.1 },
};
/** a model id as logged, with any date suffix (claude-haiku-4-5-20251001) dropped */
const priceOf = (model: unknown) => (typeof model === 'string' ? PRICES[model.replace(/-\d{8}$/, '')] : undefined);
export const REWRITE = 40_000;

interface Usage { input_tokens?: unknown; cache_creation_input_tokens?: unknown; cache_read_input_tokens?: unknown; output_tokens?: unknown;
  cache_creation?: { ephemeral_1h_input_tokens?: unknown }; speed?: unknown }
type Line = { type?: unknown; message?: { id?: unknown; model?: unknown; usage?: unknown } };

/** Claude Code writes one line per content block of a model message, each repeating the message's usage: the last line per message id counts. */
export function sumSession(jsonl: string): Totals {
  const last = new Map<string, { usage: unknown; model: unknown }>();
  for (const line of jsonl.split(/\r?\n/)) {
    let e: Line | null;
    try { e = JSON.parse(line) as Line | null; } catch { continue; }
    if (e?.type === 'assistant' && typeof e.message?.id === 'string') last.set(e.message.id, { usage: e.message.usage, model: e.message.model });
  }
  const t = empty();
  let write1h = 0, rewrites = 0, usd = 0, unpriced = 0, prev: number | undefined;
  const unknown = new Set<string>();
  for (const { usage, model } of last.values()) {
    t.replies++;
    if (!usage || typeof usage !== 'object') continue;
    t.measured++;
    const u = usage as Usage;
    const i = n(u.input_tokens), w = n(u.cache_creation_input_tokens), w1 = n(u.cache_creation?.ephemeral_1h_input_tokens), r = n(u.cache_read_input_tokens), o = n(u.output_tokens);
    t.input += i; t.cacheWrite += w; t.cacheRead += r; t.output += o; write1h += w1;
    if (model === '<synthetic>') continue;   // Claude Code's own no-usage notes: not a reply, not priced, not "the previous context"
    // a big write alone may be one turn reading many images or a big file; a rewrite also lost the prefix (read back far less than last time)
    if (prev !== undefined && w > REWRITE && prev - r > REWRITE) rewrites++;
    prev = i + w + r;
    const base = priceOf(model);
    if (!base) { unpriced++; unknown.add(typeof model === 'string' ? model : '?'); continue; }
    const p = base.long && i + w + r > base.long.above ? base.long : base;
    usd += ((u.speed === 'fast' ? 2 : 1) * (i * p.input + (w - w1) * p.input * 1.25 + w1 * p.input * 2 + r * p.read + o * p.output)) / 1e6;
  }
  return { ...t, cacheWrite1h: write1h, rewrites, usd, unpriced, unknownModels: [...unknown] };
}

/** the home page's conversations: one per browser (_home/home-*.json) and the old single one (_home/chat.json) */
export function homeThreads(projectsDir: string): Array<{ messages: Parameters<typeof sumChat>[0]['messages'] }> {
  const home = join(projectsDir, '_home');
  return (existsSync(home) ? readdirSync(home) : []).filter((f) => f === 'chat.json' || /^home-[a-z0-9]{6,24}\.json$/.test(f))
    .flatMap((f) => { try { return [JSON.parse(readFileSync(join(home, f), 'utf8'))]; } catch { return []; } });
}

const unpricedNote = (t: Totals) => (t.unpriced ? `（${t.unpriced} 則用了價格表以外的模型 ${t.unknownModels?.join('、') ?? ''}，沒算進去）` : '');

export function formatTotals(t: Totals): string {
  const total = t.input + t.cacheWrite + t.cacheRead + t.output;
  const row = (label: string, v: number) => `${label}${' '.repeat(Math.max(1, 10 - label.length * 2))}${v.toLocaleString('en-US').padStart(14)}${total ? `  ${((v / total) * 100).toFixed(1).padStart(5)}%` : ''}`;
  return [`回覆 ${t.replies} 則（${t.measured} 則有用量紀錄）`,
    row('新輸入', t.input), row('快取寫入', t.cacheWrite), row('快取讀取', t.cacheRead), row('輸出', t.output), row('合計', total),
    ...(t.cacheWrite1h !== undefined ? [`快取寫入裡 1 小時快取 ${t.cacheWrite1h.toLocaleString('en-US')}、5 分鐘快取 ${(t.cacheWrite - t.cacheWrite1h).toLocaleString('en-US')}`] : []),
    ...(t.rewrites !== undefined ? [`整段重寫（快取過期後整段對話重新寫入）${t.rewrites} 次`] : []),
    ...(t.priced && t.cost !== undefined ? [`改用 Claude API 約 US$${t.cost.toFixed(2)}（${t.priced} 則有 API 換算紀錄；訂閱方案不另外收費）`] : []),
    ...(t.usd !== undefined && t.measured ? [`照 Claude API 牌價估計約 US$${t.usd.toFixed(2)}${unpricedNote(t)}`] : [])].join('\n');
}

/** a session file and the subagents it ran: [name, totals] per file, the session itself first */
export function sessionAndSubagents(file: string): Array<[string, Totals]> {
  const dir = join(file.replace(/\.jsonl$/, ''), 'subagents');
  const agents = existsSync(dir) ? readdirSync(dir).filter((f) => /^agent-.+\.jsonl$/.test(f)) : [];
  const name = (f: string) => { try { return JSON.parse(readFileSync(join(dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).description || f; } catch { return f; } };
  return [['（主對話）', sumSession(readFileSync(file, 'utf8'))] as [string, Totals],
    ...agents.map((f) => [name(f), sumSession(readFileSync(join(dir, f), 'utf8'))] as [string, Totals])];
}

export function formatLine(name: string, t: Totals): string {
  const total = t.input + t.cacheWrite + t.cacheRead + t.output;
  return `${name}：${(total / 1e6).toFixed(1)} M token、整段重寫 ${t.rewrites ?? 0} 次${t.usd !== undefined ? `、改用 Claude API 約 US$${t.usd.toFixed(2)}` : ''}${unpricedNote(t)}`;
}

/** the --subagents report: one line per conversation, then the sum (replies of models outside PRICES are left out and counted) */
export function formatSubagents(all: Array<[string, Totals]>): string {
  const usd = all.reduce((s, [, t]) => s + (t.usd ?? 0), 0), unpriced = all.reduce((s, [, t]) => s + (t.unpriced ?? 0), 0);
  const models = [...new Set(all.flatMap(([, t]) => t.unknownModels ?? []))];
  return [...all.map(([k, t]) => formatLine(k, t)),
    `合計 ${all.length} 個對話，改用 Claude API 約 US$${usd.toFixed(2)}${unpriced ? `（${unpriced} 則用了價格表以外的模型 ${models.join('、')}，沒算進去）` : ''}`].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), projects = join(import.meta.dirname, '..', 'projects');
  if (a[0] === 'home') { console.log(formatTotals(sumChat({ messages: homeThreads(projects).flatMap((t) => t.messages ?? []) }))); process.exit(0); }
  const file = a[0] === '--session' || a[0] === '--subagents' ? a[1] : a[0] ? join(projects, a[0], '.history', 'chat', 'chat.json') : '';
  if (!file) { console.error('用法：npm run tokens -- <專案名|home>   或   npm run tokens -- --session|--subagents <對話紀錄.jsonl>'); process.exit(2); }
  if (!existsSync(file)) { console.error(`找不到 ${file}`); process.exit(1); }
  if (a[0] === '--subagents') { console.log(formatSubagents(sessionAndSubagents(file))); process.exit(0); }
  const text = readFileSync(file, 'utf8');
  console.log(formatTotals(a[0] === '--session' ? sumSession(text) : sumChat(JSON.parse(text))));
}
