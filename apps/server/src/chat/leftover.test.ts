// A claude an earlier server left running (leftover.ts): its process is told apart by its pid and when it started; the processes
// here are fakes (liveness injected), the turns that do run use the fake claude.
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { makeProjects } from '../test-utils.ts';
import { judge, readNote, writeNote } from './leftover.ts';
import { RECOVERED_NOTE } from './recover.ts';
import { ChatRunner } from './runner.ts';
import { chatFile } from './store.ts';
import type { ChatEvent } from './stream.ts';

const FAKE = `node "${fileURLToPath(new URL('./fake-claude.mjs', import.meta.url))}"`;
const SID = '44444444-5555-4666-8777-888888888888', PID = 4242;

/**
 * A thread whose turn an earlier server started a minute ago: the user's message, claude's note, and a session log that says
 * claude is in the middle of a command it started just now (no end of turn, written a moment ago: by the log alone, still at work).
 * proc: what the fake process is (alive, started when); kills: the pids stop ended.
 */
function setup(proc: { alive: boolean; started: number | null }, o: { logAge?: number; noteAge?: number } = {}) {
  const root = makeProjects(), file = chatFile(root, 'demo'), at = Date.now() - (o.noteAge ?? 60_000);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify({ sessionId: SID, started: true, messages: [{ role: 'user', text: '剪', time: new Date(at - 1000).toISOString() }] }));
  writeNote(file, { pid: PID, at, session: SID });
  const config = join(root, '.claude-config'), logs = join(config, 'projects', 'x'), log = join(logs, `${SID}.jsonl`);
  mkdirSync(logs, { recursive: true });
  writeFileSync(log, JSON.stringify({ type: 'assistant', timestamp: new Date(at + 1000).toISOString(),
    message: { id: 'm1', stop_reason: 'tool_use', content: [{ type: 'text', text: '分析好了，開始輸出。' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm run tellcut -- render demo' } }] } }));
  const t = (Date.now() - (o.logAge ?? 1000)) / 1000;
  utimesSync(log, t, t);
  const kills: number[] = [];
  const runner = new ChatRunner({ cmd: FAKE, cwd: TELLCUT_ROOT, promptFiles: [join(TELLCUT_ROOT, 'apps/server/chat-prompt.md')], projectsDir: root,
    liveness: { alive: () => proc.alive, started: () => proc.started }, kill: (pid) => kills.push(pid), watchMs: 10 });
  const thread = () => JSON.parse(readFileSync(file, 'utf8'));
  return { root, file, at, config, runner, kills, thread };
}
/** a turn's events to its end */
const turn = (r: ChatRunner, text: string) => new Promise<ChatEvent[]>((ok, no) => {
  const got: ChatEvent[] = [];
  if (!r.send('demo', text, null, (e) => { got.push(e); if (e.type === 'done') ok(got); })) no(new Error('refused'));
});
let was: string | undefined;
beforeEach(() => { was = process.env.CLAUDE_CONFIG_DIR; });
afterEach(() => { if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = was; });

test('a process is the noted one while it lives and started before the note; a pid alive again under a later process is not', () => {
  const n = { pid: PID, at: 1_000_000, session: SID };
  expect(judge(n, { alive: () => true, started: () => 999_000 })).toBe('same');
  expect(judge(n, { alive: () => true, started: () => 1_001_000 })).toBe('same');   // ps tells whole seconds
  expect(judge(n, { alive: () => true, started: () => 1_060_000 })).toBe('gone');   // the pid handed to another program
  expect(judge(n, { alive: () => false, started: () => 999_000 })).toBe('gone');
  expect(judge(n, { alive: () => true, started: () => null })).toBe('unknown');
});

test('a claude an earlier server left running is still the turn: the next message is refused, the thread left as it is, no second resume', () => {
  const s = setup({ alive: true, started: Date.now() - 61_000 });
  process.env.CLAUDE_CONFIG_DIR = s.config;
  const before = readFileSync(s.file, 'utf8');
  expect(s.runner.running('demo')).toEqual({ text: '', tools: [] });   // the page shows it running (and can stop it)
  expect(s.runner.elsewhere('demo')).toBe(true);
  expect(s.runner.busyWith('demo')).toBe('demo');                      // the project is not deleted under it
  expect(s.runner.recover('demo', s.thread())).toBeNull();
  expect(s.runner.send('demo', '再來', null, () => {})).toBe(false);
  expect(readFileSync(s.file, 'utf8')).toBe(before);                   // no "interrupted" reply, no new message
  expect(readNote(s.file)?.pid).toBe(PID);
});

test('one that is gone (or whose pid another program has now) is over at once: its log is final, recovered without the quiet window, and the next message resumes', async () => {
  const s = setup({ alive: true, started: Date.now() + 5000 });          // the pid is alive, but under a process started later
  process.env.CLAUDE_CONFIG_DIR = s.config;
  expect(s.runner.running('demo')).toBeNull();
  expect(s.runner.recover('demo', s.thread())!.messages.at(-1)).toMatchObject({ role: 'assistant', status: 'done', notice: { kind: 'recovered' } });
  const log = join(s.root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log;
  try {
    const ev = await turn(s.runner, '再來');
    expect(ev.at(-1)).toMatchObject({ type: 'done', status: 'done', text: '收到：再來' });
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).argv).toEqual(expect.arrayContaining(['--resume', SID]));
  } finally { delete process.env.FAKE_CLAUDE_LOG; }
  expect(s.thread().messages.map((m: any) => [m.role, m.notice?.kind ?? m.status ?? null])).toEqual([['user', null], ['assistant', 'recovered'], ['user', null], ['assistant', 'done']]);
  expect(readNote(s.file)).toBeNull();                                 // the new turn's note went with it
});

test('a live process whose start cannot be told is the turn while its session log could still be written, by the old measure', () => {
  const busy = setup({ alive: true, started: null });
  process.env.CLAUDE_CONFIG_DIR = busy.config;
  expect(busy.runner.elsewhere('demo')).toBe(true);
  expect(busy.runner.stop('demo')).toBe(false);                       // not surely that process: not ended
  expect(busy.kills).toEqual([]);
  const quiet = setup({ alive: true, started: null }, { logAge: 40 * 60_000, noteAge: 50 * 60_000 });
  process.env.CLAUDE_CONFIG_DIR = quiet.config;
  expect(quiet.runner.elsewhere('demo')).toBe(false);
});

test('a page following a leftover claude can stop it, and is told with the recovered reply once it is over', async () => {
  const proc = { alive: true, started: Date.now() - 61_000 }, s = setup(proc);
  process.env.CLAUDE_CONFIG_DIR = s.config;
  const done = new Promise<ChatEvent>((ok) => { s.runner.attach('demo', (e) => { if (e.type === 'done') ok(e); }); });
  expect(s.runner.stop('demo')).toBe(true);
  expect(s.kills).toEqual([PID]);
  proc.alive = false;                                                  // the tree ended
  expect(await done).toMatchObject({ type: 'done', status: 'done', text: '分析好了，開始輸出。' });
  const last = s.thread().messages.at(-1);
  expect(last).toMatchObject({ role: 'assistant', status: 'done', notice: { kind: 'recovered' } });
  expect(last.text).toBe(`分析好了，開始輸出。\n\n${RECOVERED_NOTE}`);
  expect(readNote(s.file)).toBeNull();
  expect(s.runner.attach('demo', () => {})).toBeNull();                // nothing runs any more
});

test("a turn notes the process it started while it runs, and the note goes when it ends", async () => {
  const root = makeProjects(), file = chatFile(root, 'demo');
  const runner = new ChatRunner({ cmd: FAKE, cwd: TELLCUT_ROOT, promptFiles: [join(TELLCUT_ROOT, 'apps/server/chat-prompt.md')], projectsDir: root });
  let noted: ReturnType<typeof readNote> = null;
  const ended = new Promise<void>((ok) => {
    runner.send('demo', '慢慢說', null, (e) => {
      if (e.type === 'text' && !noted) { noted = readNote(file); runner.stop('demo'); }
      if (e.type === 'done') ok();
    });
  });
  await ended;
  expect(noted).toMatchObject({ pid: expect.any(Number), session: JSON.parse(readFileSync(file, 'utf8')).sessionId });
  expect(readNote(file)).toBeNull();
}, 30_000);
