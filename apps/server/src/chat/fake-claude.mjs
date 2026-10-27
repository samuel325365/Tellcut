// A stand-in for headless Claude Code in the chat tests: the same stream-json shapes as `claude -p` (plan 18 "實測").
// stdin decides the script: 「慢」 streams slowly (to stop it), 「壞」 fails on stderr, anything else answers 「收到：<last line>」.
// Each run appends { argv, stdin } to $FAKE_CLAUDE_LOG.
import { appendFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', async () => {
  const argv = process.argv.slice(2);
  if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ argv, stdin, nested: !!process.env.CLAUDECODE, cacheTtl: process.env.CLAUDE_CODE_PROMPT_CACHE_TTL, sources: process.env.TELLCUT_SOURCES }) + '\n');
  // fails before starting: not logged in
  if (stdin.includes('開不了')) { process.stderr.write('Not logged in · Please run /login\n'); process.exit(1); }
  // --resume of a conversation claude no longer has ($FAKE_CLAUDE_LOG.forget present)
  if (argv.includes('--resume') && process.env.FAKE_CLAUDE_LOG && existsSync(process.env.FAKE_CLAUDE_LOG + '.forget')) {
    process.stderr.write(`No conversation found with session ID: ${argv[argv.indexOf('--resume') + 1]}\n`); process.exit(1);
  }
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  const session = argv[argv.indexOf('--session-id') + 1] ?? argv[argv.indexOf('--resume') + 1];
  const delta = (text) => out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, session_id: session });
  out({ type: 'system', subtype: 'init', session_id: session, tools: ['Bash', 'Edit', 'Read', 'Write'], apiKeySource: 'none' });
  if (stdin.includes('壞')) { process.stderr.write('something\nboom\n'); process.exit(1); }
  // 「建專案 a b」: makes projects a and b in $FAKE_CLAUDE_PROJECTS (a copy of demo), like `npm run new` would
  // 「別處建 x」: project x appears meanwhile without this run making it (another tab's home chat)
  const make = (id) => {
    mkdirSync(join(process.env.FAKE_CLAUDE_PROJECTS, id), { recursive: true });
    copyFileSync(join(process.env.FAKE_CLAUDE_PROJECTS, 'demo', 'project.json'), join(process.env.FAKE_CLAUDE_PROJECTS, id, 'project.json'));
  };
  const made = /建專案 ([\w -]+)/.exec(stdin), elsewhere = /別處建 ([\w-]+)/.exec(stdin);
  if (elsewhere && process.env.FAKE_CLAUDE_PROJECTS) make(elsewhere[1]);
  if (made && process.env.FAKE_CLAUDE_PROJECTS) for (const id of made[1].trim().split(/\s+/)) {
    make(id);
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `toolu_new_${id}`, name: 'Bash', input: { command: `npm run new -- ${id} D:/footage` } }] }, session_id: session });
  }
  // after the projects it makes: a slow turn that made one is still running (the delete refuses it)
  if (stdin.includes('慢')) {
    for (let i = 0; i < 30; i++) { delta(`字${i}`); await new Promise((r) => setTimeout(r, 100)); }
  }
  const last = stdin.trim().split('\n').at(-1);
  delta('收到：'); delta(last);
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm run tellcut -- show demo' } }] }, session_id: session });
  out({ type: 'result', subtype: 'success', is_error: false, result: `收到：${last}`, session_id: session, permission_denials: [],
    usage: { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 2000, output_tokens: 50 } });
});
