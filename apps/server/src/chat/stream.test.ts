import { StreamParser, toolOf } from './stream.ts';

const L = (o: unknown) => JSON.stringify(o);
test('text deltas, tool calls, denials and the result become chat events', () => {
  const p = new StreamParser();
  const ev = [
    L({ type: 'system', subtype: 'init', session_id: 's' }),
    L({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '好，' } } }),
    L({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm run tellcut -- show seattle' } }] } }),
    L({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: 'C:\\x\\sheet-1.jpg' } }] } }),
    L({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'touch x.txt' } }] } }),
    L({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_use_id: 't3', message: 'denied' }),
    L({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '完成。' } } }),
    L({ type: 'result', subtype: 'success', is_error: false, result: '好，完成。', session_id: 's' }),
    'not json',
  ].flatMap((l) => p.push(l));
  expect(ev).toEqual([
    { type: 'text', delta: '好，' },
    { type: 'tool', tool: { kind: 'run', verb: 'run', arg: 'npm run tellcut -- show seattle', label: '執行：npm run tellcut -- show seattle', detail: 'npm run tellcut -- show seattle' } },
    { type: 'tool', tool: { kind: 'read', verb: 'read', arg: 'sheet-1.jpg', label: '讀取：sheet-1.jpg', detail: 'C:\\x\\sheet-1.jpg' } },
    { type: 'tool', tool: { kind: 'run', verb: 'run', arg: 'touch x.txt', label: '執行：touch x.txt', detail: 'touch x.txt' } },
    { type: 'tool', tool: { kind: 'denied', verb: 'denied', arg: 'touch x.txt', label: '已拒絕：touch x.txt', detail: 'denied' } },
    { type: 'text', delta: '完成。' },
  ]);
  // the turn ends when the process does
  expect(p.finish(0, '')).toEqual([{ type: 'done', status: 'done', text: '好，完成。' }]);
  expect(p.finish(0, '')).toEqual([]);
});

test('no result: a missing claude, a missing login, or the end of stderr', () => {
  expect(new StreamParser().finish(9009, "'claude' is not recognized as an internal or external command"))
    .toEqual([{ type: 'done', status: 'error', text: '', error: expect.stringContaining('找不到 claude 指令'), code: 'chat.notFound' }]);
  expect(new StreamParser().finish(1, 'Invalid API key · Please run /login'))
    .toEqual([{ type: 'done', status: 'error', text: '', error: expect.stringContaining('還沒登入'), code: 'chat.notLoggedIn', detail: 'Invalid API key · Please run /login' }]);
  // the page words these in its language from the code; error stays the Chinese for old pages
  expect(new StreamParser().finish(3, '')).toEqual([{ type: 'done', status: 'error', text: '', error: 'claude 結束（代碼 3）', code: 'chat.exited', detail: '3' }]);
  const p = new StreamParser(); p.push(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '一半' } } }));
  expect(p.finish(1, 'a\nb\nboom')).toEqual([{ type: 'done', status: 'error', text: '一半', error: expect.stringContaining('boom') }]);   // raw words: no code
  const q = new StreamParser(); q.push(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }));
  expect(q.finish(1, '')).toEqual([{ type: 'done', status: 'error', text: '', error: expect.stringContaining('還沒登入'), code: 'chat.notLoggedIn', detail: 'Not logged in · Please run /login' }]);
});

test('text written before a tool call stays in the reply (the result only holds the last part)', () => {
  const p = new StreamParser();
  const d = (t: string) => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } });
  const start = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text', text: '' } } });
  const ev = [start, d('我先看看。'), JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file_path: 'a.png' } }] } }),
    start, d('好了。'), JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '好了。' })].flatMap((l) => p.push(l));
  expect(ev.filter((e) => e.type === 'text').map((e: any) => e.delta).join('')).toBe('我先看看。\n\n好了。');
  expect(p.finish(0, '')).toEqual([{ type: 'done', status: 'done', text: '我先看看。\n\n好了。' }]);
});

test('the result carries the turn usage (Claude Code 2.1: result.usage) and the cost at API prices (total_cost_usd)', () => {
  const res = (extra: object) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'x', ...extra });
  const done = (...lines: string[]) => { const p = new StreamParser(); lines.forEach((l) => p.push(l)); return p.finish(0, '').at(-1); };
  const usage = { input_tokens: 2, cache_creation_input_tokens: 2448, cache_read_input_tokens: 535, output_tokens: 4, service_tier: 'standard' };
  expect(done(res({ usage, total_cost_usd: 0.0123 }))).toEqual({ type: 'done', status: 'done', text: 'x', usage: { input: 2, cacheWrite: 2448, cacheRead: 535, output: 4, cost: 0.0123 } });
  expect(done(res({ usage: { output_tokens: 7 } }))).toMatchObject({ usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 7 } });
  expect(done(res({}))).not.toHaveProperty('usage');
  expect(done(res({ subtype: 'error_max_turns', is_error: true, usage }))).toMatchObject({ status: 'error', usage: { output: 4 } });
});

test('a notice from the last turn is answered first: its empty result does not end the turn, the usage adds up', () => {
  // seen 2026-10-17: a background command that stopped is reported as the resumed session starts; claude answers it (an
  // empty result), then the user's message. The reply is everything up to the process's end.
  const p = new StreamParser(), d = (t: string) => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } });
  const r = (o: object) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...o });
  const ev = [r({ result: '', usage: { output_tokens: 0 }, total_cost_usd: 0.01 }), d('分鏡在這裡。'), r({ result: '分鏡在這裡。', usage: { input_tokens: 3, output_tokens: 500 }, total_cost_usd: 0.35 })].flatMap((l) => p.push(l));
  expect(ev.some((e) => e.type === 'done')).toBe(false);
  expect(p.finish(0, '')).toEqual([{ type: 'done', status: 'done', text: '分鏡在這裡。', usage: { input: 3, cacheWrite: 0, cacheRead: 0, output: 500, cost: 0.35 } }]);
});

test('a folder listing shows as one in the chat, in words', () => {
  expect(toolOf('Glob', { pattern: 'projects/trip/fx/*' })).toEqual({ kind: 'read', verb: 'list', arg: 'projects/trip/fx/*', label: '列出：projects/trip/fx/*', detail: 'projects/trip/fx/*' });
});

test('every tool line carries a code and its argument, next to the Chinese label old pages show', () => {
  expect(toolOf('Bash', { command: 'x'.repeat(100) })).toMatchObject({ verb: 'run', arg: 'x'.repeat(80) });
  expect(toolOf('Edit', { file_path: 'C:\\p\\cut.ts' })).toMatchObject({ kind: 'write', verb: 'write', arg: 'cut.ts', label: '寫入：cut.ts' });
  expect(toolOf('Write', { file_path: '/p/a.js' })).toMatchObject({ verb: 'write', arg: 'a.js' });
  const p = new StreamParser();
  p.push(L({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'd1', name: 'Bash', input: { command: 'rm -rf x' } }] } }));
  expect(p.push(L({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_use_id: 'd1', message: 'no' }))).toEqual([
    { type: 'tool', tool: { kind: 'denied', verb: 'denied', arg: 'rm -rf x', label: '已拒絕：rm -rf x', detail: 'no' } }]);
});
