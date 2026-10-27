import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECOVERED_NOTE, recoverReply, sessionLog, withRecovered } from './recover.ts';
import { chatEnv } from './runner.ts';
import { BASH_MAX_TIMEOUT_MS } from './timeouts.ts';

const SID = '11111111-2222-4333-8444-555555555555';
function home(lines: object[], ageMs = 40 * 60000) {
  const h = mkdtempSync(join(tmpdir(), 'rec-')), dir = join(h, '.claude', 'projects', 'C--x-tellcut');
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${SID}.jsonl`);
  writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n'));
  const t = (Date.now() - ageMs) / 1000;
  utimesSync(f, t, t);
  return h;
}
const say = (ts: string, id: string, content: object[], usage = { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 }) =>
  ({ type: 'assistant', timestamp: ts, message: { id, content, usage } });
const thread = (extra: object[] = []): any => ({ sessionId: SID, started: true, spent: 0.5, spentIn: SID, messages: [
  { role: 'user', text: '剪', time: '2026-10-17T17:00:00.000Z' }, { role: 'assistant', text: '好', time: '2026-10-17T17:01:00.000Z', status: 'done' },
  { role: 'user', text: '（自動訊息）素材分析做完了…', time: '2026-10-17T17:30:00.000Z' }, ...extra] });

test('a reply that finished while the server was down is rebuilt from the session log: its words, steps, tokens and price', () => {
  const h = home([
    say('2026-10-17T17:00:30.000Z', 'm0', [{ type: 'text', text: '舊的回覆' }]),                                   // before the message: not part of it
    say('2026-10-17T17:30:20.000Z', 'm1', [{ type: 'text', text: '分析好了，開始剪。' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm run cut -- f1' } }]),
    say('2026-10-17T17:30:20.000Z', 'm1', [{ type: 'text', text: '' }]),                                          // the same message's next block repeats its usage
    say('2026-10-17T17:55:06.000Z', 'm2', [{ type: 'text', text: '做好了：2 分 15 秒。' }]),
    { type: 'cost-state', totalCostUSD: 2.75 },
  ]);
  expect(sessionLog(SID, h)).toMatch(/\.jsonl$/);
  const r = recoverReply(thread(), { home: h })!;
  expect(r.text).toBe(`分析好了，開始剪。\n\n做好了：2 分 15 秒。\n\n${RECOVERED_NOTE}`);
  expect(r.tools!.map((t) => t.label)).toEqual(['執行：npm run cut -- f1']);
  expect(r.notice).toEqual({ kind: 'recovered' });   // the page words the note itself; the text keeps the Chinese one
  expect(r).toMatchObject({ role: 'assistant', status: 'done', time: '2026-10-17T17:55:06.000Z', usage: { input: 2, cacheWrite: 20, cacheRead: 200, output: 10, cost: 2.25 } });
  // the empty interrupted reply the page saw is replaced, and the running cost moves on
  const t = withRecovered(thread([{ role: 'assistant', text: '', time: '2026-10-17T18:00:00.000Z', status: 'interrupted' }]), { home: h })!;
  expect(t.messages.map((m) => [m.role, m.status ?? null])).toEqual([['user', null], ['assistant', 'done'], ['user', null], ['assistant', 'done']]);
  expect([t.spent, t.spentIn]).toEqual([2.75, SID]);
});

test('nothing is recovered while the log is still being written, when nothing was said after the message, or when the thread is not waiting', () => {
  const lines = [say('2026-10-17T17:40:00.000Z', 'm1', [{ type: 'text', text: '還在做' }])];
  expect(recoverReply(thread(), { home: home(lines, 10000) })).toBeNull();                                                      // written 10 s ago
  // a claude left over from a restart may sit in one foreground command (Bash) that long without writing its log
  expect(recoverReply(thread(), { home: home(lines, 10 * 60000) })).toBeNull();
  expect(recoverReply(thread(), { home: home(lines, BASH_MAX_TIMEOUT_MS) })).toBeNull();
  expect(chatEnv({}).BASH_MAX_TIMEOUT_MS).toBe(String(BASH_MAX_TIMEOUT_MS));
  expect(recoverReply(thread(), { home: home([say('2026-10-17T17:40:00.000Z', 'm1', [{ type: 'tool_use', name: 'Read', input: { file_path: 'a' } }])]) })).toBeNull();
  expect(recoverReply(thread([{ role: 'assistant', text: '答了', time: '2026-10-17T17:50:00.000Z', status: 'done' }]), { home: home(lines) })).toBeNull();
  expect(recoverReply({ ...thread(), started: false }, { home: home(lines) })).toBeNull();
  expect(recoverReply(thread(), { home: mkdtempSync(join(tmpdir(), 'rec-none-')) })).toBeNull();
});

test("a login kept in CLAUDE_CONFIG_DIR (the chat keeps that variable) has its session logs there", () => {
  const h = home([say('2026-10-17T17:30:20.000Z', 'm1', [{ type: 'text', text: '好' }])]), was = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = join(h, '.claude');
  try { expect(sessionLog(SID)).toBe(join(h, '.claude', 'projects', 'C--x-tellcut', `${SID}.jsonl`)); }
  finally { if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = was; }
});

test('a turn the log shows ended (stop_reason end_turn) is recovered at once; one that stopped at a tool call waits for the quiet window', () => {
  const done = { ...say('2026-10-17T17:55:06.000Z', 'm2', [{ type: 'text', text: '做好了。' }]) };
  (done.message as any).stop_reason = 'end_turn';
  expect(recoverReply(thread(), { home: home([done], 1000) })?.text).toBe(`做好了。\n\n${RECOVERED_NOTE}`);
  const mid = say('2026-10-17T17:55:06.000Z', 'm2', [{ type: 'text', text: '先輸出。' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm run render -- f1' } }]);
  (mid.message as any).stop_reason = 'tool_use';
  expect(recoverReply(thread(), { home: home([mid], 1000) })).toBeNull();
});

test('runner.ts loads first without tripping on the cycle with recover.ts (the server crashed at start, 2026-10-27)', () => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', "await import('./apps/server/src/chat/runner.ts')"],
    { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8', windowsHide: true });
  expect(r.stderr).not.toMatch(/before initialization/);
  expect(r.status).toBe(0);
}, 30_000);
