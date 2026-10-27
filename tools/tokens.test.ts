import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatLine, formatSubagents, formatTotals, sessionAndSubagents, sumChat, sumSession, type Totals } from './tokens.ts';

/** one model message of a session file: input 0, `w` cache writes (`w1` of them 1-hour), `r` cache reads, 1000 output */
const m = (id: string, w: number, w1: number, r: number, model = 'claude-opus-5-5') => JSON.stringify({ type: 'assistant', message: { id, model,
  usage: { input_tokens: 0, cache_creation_input_tokens: w, cache_creation: { ephemeral_1h_input_tokens: w1, ephemeral_5m_input_tokens: w - w1 }, cache_read_input_tokens: r, output_tokens: 1000 } } });
const synthetic = (id: string) => JSON.stringify({ type: 'assistant', message: { id, model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } });

test('a chat thread: replies with usage are added up; replies without it are counted apart', () => {
  const t = sumChat({ messages: [
    { role: 'user', text: 'a' },
    { role: 'assistant', text: 'b', usage: { input: 1, cacheWrite: 10, cacheRead: 100, output: 1000 } },
    { role: 'assistant', text: 'c', status: 'stopped' },
    { role: 'assistant', text: 'd', usage: { input: 2, cacheWrite: 20, cacheRead: 200, output: 2000, cost: 0.42 } },
  ] });
  expect(t).toEqual({ replies: 3, measured: 2, input: 3, cacheWrite: 30, cacheRead: 300, output: 3000, cost: 0.42, priced: 1 });
  expect(formatTotals(t)).toContain('改用 Claude API 約 US$0.42（1 則有 API 換算紀錄；訂閱方案不另外收費）');
});

test('a Claude Code session file: one count per model message (its streamed lines repeat the usage), bad lines skipped', () => {
  const u = (o: number) => ({ input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: o });
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    JSON.stringify({ type: 'assistant', message: { id: 'm1', usage: u(5) } }),
    JSON.stringify({ type: 'assistant', message: { id: 'm1', usage: u(9) } }),
    '{ broken',
    JSON.stringify({ type: 'assistant', message: { id: 'm2', usage: u(1) } }),
    JSON.stringify({ type: 'assistant', message: { id: 'm3' } }),
  ].join('\n');
  expect(sumSession(lines)).toMatchObject({ replies: 3, measured: 2, input: 2, cacheWrite: 4, cacheRead: 6, output: 10 });
});

test('a session file: 1-hour and 5-minute cache writes apart, rewrites, the list-price estimate', () => {
  const t = sumSession([synthetic('s0'),   // Claude Code's note first: the next reply is still the first one (its write is the prompt)
    m('a', 50_000, 0, 10_000), m('b', 2_000, 0, 60_000), synthetic('s1'),
    m('c', 60_000, 0, 10_000),   // the prefix was lost: read 10k after a 62k context, the rest written again
    m('d', 1_000, 1_000, 70_000),
    m('e', 80_000, 0, 71_000)].join('\n'));   // one turn reading many images: a big write but the prefix was read back whole
  expect(t).toMatchObject({ cacheWrite: 193_000, cacheWrite1h: 1_000, rewrites: 1, unpriced: 0 });
  // writes 192k × $5 + 1k × $8, reads 221k × $0.20, output 5k × $20 (per million)
  expect(t.usd).toBeCloseTo(0.96 + 0.008 + 0.0442 + 0.1, 6);
  expect(formatTotals(t)).toContain('整段重寫（快取過期後整段對話重新寫入）1 次');
  expect(formatTotals(t)).not.toContain('價格表以外');
});

test('a session file: Haiku 5.5 priced by prompt length; a model outside the table leaves only its own replies out', () => {
  // short prompt: 50k reads × $0.01 + 1k output × $0.50; over 100k: 150k reads × $0.05 + 1k output × $2.50
  expect(sumSession(m('h1', 0, 0, 50_000, 'claude-haiku-5-5')).usd).toBeCloseTo(0.0005 + 0.0005, 9);
  expect(sumSession(m('h2', 0, 0, 150_000, 'claude-haiku-5-5')).usd).toBeCloseTo(0.0075 + 0.0025, 9);
  // Sonnet 5.5 reads at $0.20 (0.1× input; it was priced at $0.10, Sonnet subagents read half their cost); Fable 5 at $1
  expect(sumSession(m('s', 0, 0, 1_000_000, 'claude-sonnet-5-5')).usd).toBeCloseTo(0.2 + 0.01, 9);
  expect(sumSession(m('f', 0, 0, 1_000_000, 'claude-fable-5')).usd).toBeCloseTo(1 + 0.05, 9);
  // fast mode (Opus 5.5, Opus 5) costs twice the list price
  const fast = JSON.parse(m('x', 0, 0, 1_000_000));
  fast.message.usage.speed = 'fast';
  expect(sumSession(JSON.stringify(fast)).usd).toBeCloseTo(2 * (0.2 + 0.02), 9);
  // a dated id is priced as its model: Haiku 4.5 reads $0.10, output $5
  expect(sumSession(m('d', 0, 0, 1_000_000, 'claude-haiku-4-5-20251001')).usd).toBeCloseTo(0.1 + 0.005, 9);
  const t = sumSession([m('a', 0, 0, 1_000_000), m('b', 0, 0, 1_000_000, 'some-other-model'), m('c', 0, 0, 1_000_000, 'some-other-model')].join('\n'));
  expect(t).toMatchObject({ unpriced: 2, unknownModels: ['some-other-model'] });
  expect(t.usd).toBeCloseTo(0.2 + 0.02, 9);   // the Opus reply alone
  expect(formatTotals(t)).toContain('照 Claude API 牌價估計約 US$0.22（2 則用了價格表以外的模型 some-other-model，沒算進去）');
});

test('the report: totals and the share each part has', () => {
  const s = formatTotals({ replies: 3, measured: 2, input: 3, cacheWrite: 30, cacheRead: 300, output: 3000 });
  expect(s).toContain('回覆 3 則（2 則有用量紀錄）');
  expect(s).toMatch(/輸出 +3,000/);
  expect(s).toMatch(/合計 +3,333/);
});

test('the home page: every conversation of it (one per browser) added up', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { homeThreads } = await import('./tokens.ts');
  const dir = mkdtempSync(join(tmpdir(), 'tok-')), home = join(dir, '_home');
  mkdirSync(home);
  const reply = (input: number) => ({ role: 'assistant', text: 'x', usage: { input, cacheWrite: 0, cacheRead: 0, output: 1, cost: 0.5 } });
  writeFileSync(join(home, 'home-aaaaaaaa.json'), JSON.stringify({ messages: [reply(10)] }));
  writeFileSync(join(home, 'home-bbbbbbbb.json'), JSON.stringify({ messages: [reply(5), reply(1)] }));
  writeFileSync(join(home, 'notes.txt'), 'not a thread');
  const t = sumChat({ messages: homeThreads(dir).flatMap((x) => x.messages) });
  expect([t.replies, t.input, t.cost]).toEqual([3, 16, 1.5]);
});

/** a session file and its subagents in a temp dir: an Opus main conversation, a described Haiku Explore agent, an agent without meta */
function sessionFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tok-')), file = join(dir, 'sess.jsonl'), sub = join(dir, 'sess', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(file, [m('a', 50_000, 0, 10_000), m('b', 60_000, 0, 10_000)].join('\n'));   // b lost the 60k prefix: one rewrite
  writeFileSync(join(sub, 'agent-a1.jsonl'), m('x', 0, 0, 50_000, 'claude-haiku-5-5'));
  writeFileSync(join(sub, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Find the renderer' }));
  writeFileSync(join(sub, 'agent-b2.jsonl'), [m('y', 0, 0, 1_000_000), m('z', 0, 0, 0, 'mystery-model')].join('\n'));
  writeFileSync(join(sub, 'notes.jsonl'), m('n', 0, 0, 1));   // not an agent file
  return file;
}

test('a session and its subagents: one entry per file, named by the meta description or the file name', () => {
  const all = sessionAndSubagents(sessionFixture());
  expect(all.map(([k]) => k).sort()).toEqual(['agent-b2.jsonl', 'Find the renderer', '（主對話）'].sort());
  expect(all[0][0]).toBe('（主對話）');
  expect(all[0][1]).toMatchObject({ replies: 2, rewrites: 1 });
  expect(Object.fromEntries(all)['Find the renderer'].usd).toBeCloseTo(0.001, 9);   // a Haiku agent no longer drops out
});

test('one line per conversation, and the sum that leaves out only the unpriced replies', () => {
  const t: Totals = { replies: 2, measured: 2, input: 0, cacheWrite: 1_000_000, cacheRead: 2_400_000, output: 100_000, rewrites: 3, usd: 12.345, unpriced: 0 };
  expect(formatLine('review', t)).toBe('review：3.5 M token、整段重寫 3 次、改用 Claude API 約 US$12.35');
  expect(formatLine('chat', { replies: 1, measured: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 })).toBe('chat：0.0 M token、整段重寫 0 次');
  expect(formatLine('x', { ...t, unpriced: 1, unknownModels: ['m9'] })).toContain('、改用 Claude API 約 US$12.35（1 則用了價格表以外的模型 m9，沒算進去）');
  const s = formatSubagents(sessionAndSubagents(sessionFixture())).split('\n');
  expect(s).toHaveLength(4);
  // main: writes 110k × $5, reads 20k × $0.20, output 2k × $20 = 0.594; Haiku agent 0.001; agent b2 Opus 0.22, mystery left out
  expect(s[3]).toBe('合計 3 個對話，改用 Claude API 約 US$0.82（1 則用了價格表以外的模型 mystery-model，沒算進去）');
});

test('the --subagents command prints the same report; a missing file is an error', () => {
  const cli = join(import.meta.dirname, 'tokens.ts'), file = sessionFixture();
  const out = execFileSync(process.execPath, ['--import', 'tsx', cli, '--subagents', file], { encoding: 'utf8' });
  expect(out.trim()).toBe(formatSubagents(sessionAndSubagents(file)));
  const r = spawnSync(process.execPath, ['--import', 'tsx', cli, '--subagents', join(tmpdir(), 'no-such-session.jsonl')], { encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('找不到');
}, 30_000);
