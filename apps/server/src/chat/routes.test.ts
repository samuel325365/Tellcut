import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeProjects, startApp } from '../test-utils.ts';
import { ChatRunner, chatEnv, claudeArgs, composePrompt, touchedProjects, turnCost } from './runner.ts';
import { ANALYSIS_DONE, chatRoutes } from './routes.ts';
import type { JobInfo } from '../jobs.ts';
import { analysisState, analysisStatus } from '@tellcut/protocol';
import { createServer } from 'node:http';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { router } from '../http.ts';
import { findPreset, missingPresetBlock, presetBlock } from '@tellcut/media-node';
import { ProjectStore } from '../projects.ts';

const FAKE = `node "${fileURLToPath(new URL('./fake-claude.mjs', import.meta.url))}"`;
async function lines(res: Response): Promise<any[]> { return (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
const post = (b: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

test('every project file the chat may write is one its system prompt names (else the chat believes it is refused)', () => {
  const prompt = readFileSync(join(TELLCUT_ROOT, 'apps/server/chat-prompt.md'), 'utf8');
  const files = claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' }).flatMap((a) => /^Write\(projects\/\*\/(.+)\)$/.exec(a)?.[1] ?? []);
  expect(files).toContain('brand.md');
  for (const f of files) expect(prompt, f).toContain(`\`${f}\``);
});

test('claude runs locked down: no settings files (only its own --settings), five tools, tellcut commands allowed, the prompt file appended', () => {
  const a = claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' });
  expect(a).toEqual(expect.arrayContaining(['-p', '--permission-mode', 'dontAsk', '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config',
    '--tools', 'Read,Write,Edit,Bash,Glob', 'Bash(npm run tellcut *)', 'Bash(npm run check *)', 'Write(projects/*/cut.ts)', 'Write(projects/*/fx/*.js)', 'Edit(projects/*/fx/*.js)', 'Bash(npm run voice *)', 'Bash(npm run score *)', 'Write(projects/*/narration.json)', 'Write(projects/*/score/*.js)', 'Write(projects/*/proposal.json)', '--append-system-prompt-file', 'P.md', '--session-id', 'u']));
  expect(claudeArgs({ session: 'u', resume: true, promptFile: 'P.md' })).toEqual(expect.arrayContaining(['--resume', 'u']));
  // guardrails: secrets and npm's shell override stay out of reach
  expect(claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' })).toEqual(expect.arrayContaining(['--disallowedTools', 'Read(~/.ssh/**)', 'Read(~/.claude/**)', 'Bash(*--script-shell*)', 'Agent', 'Skill']));
  // and the other places a home folder keeps tokens and passwords
  expect(claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' })).toEqual(expect.arrayContaining(['Read(~/.npmrc)', 'Read(~/.git-credentials)', 'Read(~/.netrc)', 'Read(~/.docker/**)', 'Read(~/.kube/**)', 'Read(~/.azure/**)', 'Read(~/.gnupg/**)']));
});

test('the account file, the API keys of the outside sources and a relocated Claude config folder are not readable either', () => {
  const deny = (a: string[]) => a.slice(a.indexOf('--disallowedTools'));
  const a = claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' });
  expect(deny(a)).toEqual(expect.arrayContaining(['Read(~/.claude.json)', 'Read(./sources.local.json)']));
  // permission paths are POSIX-style; an absolute one starts with //
  expect(deny(claudeArgs({ session: 'u', resume: false, promptFile: 'P.md', configDir: 'D:\\cc\\login' }))).toEqual(expect.arrayContaining(['Read(//d/cc/login/**)']));
  expect(deny(claudeArgs({ session: 'u', resume: false, promptFile: 'P.md', configDir: '/home/u/cc/' }))).toEqual(expect.arrayContaining(['Read(//home/u/cc/**)']));
  expect(deny(a).some((x) => x.startsWith('Read(//'))).toBe(false);
});

test('the page chat reads its own settings, which keep every CLAUDE.md out of its context', () => {
  const file = fileURLToPath(new URL('../../chat-settings.json', import.meta.url));
  const a = claudeArgs({ session: 'u', resume: false, promptFile: 'P.md', settingsFile: file });
  expect(a[a.indexOf('--settings') + 1]).toBe(file);
  expect(JSON.parse(readFileSync(file, 'utf8')).claudeMdExcludes).toEqual(expect.arrayContaining(['**/CLAUDE.md', '**/CLAUDE.local.md', '**/AGENTS.md', '**/.claude/rules/**']));
  expect(claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' })).not.toContain('--settings');
});

test("the chat inherits no Claude Code session: its CLAUDE* variables are dropped, the user's login folder kept, the cache fixed at 1 hour, no auto memory, long commands in the foreground", () => {
  const e = chatEnv({ PATH: 'p', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_PID: '9', CLAUDE_EFFORT: 'high',
    CLAUDE_CODE_PROMPT_CACHE_TTL: '5m', CLAUDE_CONFIG_DIR: 'D:/cc', ANTHROPIC_API_KEY: 'k' }, 'http://127.0.0.1:5199');
  expect(e).toEqual({ PATH: 'p', CLAUDE_CONFIG_DIR: 'D:/cc', TELLCUT_URL: 'http://127.0.0.1:5199', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    BASH_DEFAULT_TIMEOUT_MS: '600000', BASH_MAX_TIMEOUT_MS: '1800000' });
  expect(chatEnv({ CLAUDE_CODE_PROMPT_CACHE_TTL: '' }).CLAUDE_CODE_PROMPT_CACHE_TTL).toBe('1h');
  expect(chatEnv({ TELLCUT_CHAT_CACHE_TTL: '5m' }).CLAUDE_CODE_PROMPT_CACHE_TTL).toBe('5m');
});

test('a message streams back as chat events, is kept in the thread, and the next one resumes the same conversation', async () => {
  const root = makeProjects(), log = join(root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const ev = await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '第一句 "引號" & 100%\n第二行', from: 'editor' })));
    expect(ev.map((e) => e.type)).toEqual(['text', 'text', 'tool', 'done']);
    expect(ev.at(-1)).toMatchObject({ status: 'done', text: '收到：第二行' });
    // the same conversation from the home page's chat box: Claude is told the editor is not open
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '再一句', from: 'home' })));
    const runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(runs[0].stdin).toBe('(Current project: Demo (demo). The editor is open.)\n\n第一句 "引號" & 100%\n第二行');
    expect(runs[1].stdin).toMatch(/^\(Current project: Demo \(demo\)\. The user is talking to you from the home page's chat box and the editor is not open/);
    expect(runs[0].argv).toEqual(expect.arrayContaining(['--session-id']));
    const sid = runs[0].argv[runs[0].argv.indexOf('--session-id') + 1];
    expect(runs[1].argv).toEqual(expect.arrayContaining(['--resume', sid]));
    const t = await (await fetch(`${base}/api/chat/demo`)).json();
    expect(t.thread.messages.map((m: any) => [m.role, m.status ?? null])).toEqual([['user', null], ['assistant', 'done'], ['user', null], ['assistant', 'done']]);
    expect(t.thread.messages[1].tools[0].label).toBe('執行：npm run tellcut -- show demo');
    expect(t.thread.messages[1].usage).toEqual({ input: 3, cacheWrite: 100, cacheRead: 2000, output: 50 });
    // a client that does not say where it is (a script): nothing about the editor (R3-H10)
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '腳本' })));
    expect(JSON.parse(readFileSync(log, 'utf8').trim().split('\n')[2]).stdin).toBe('(Current project: Demo (demo).)\n\n腳本');
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test("the page's language goes to Claude with every message", async () => {
  const root = makeProjects(), log = join(root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: 'x', from: 'editor', lang: 'en' })));
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: 'y', from: 'editor', lang: 'ja' })));
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: 'z', from: 'editor', lang: 'xx' })));
    const runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(runs[0].stdin).toMatch(/^\(UI language: English\)\n\n\(Current project: /);
    expect(runs[1].stdin).toMatch(/^\(UI language: Japanese \(日本語\)\)\n\n\(Current project: /);
    expect(runs[2].stdin).toMatch(/^\(Current project: /);
    expect(runs[2].stdin).not.toContain('UI language');
    // the thread keeps the last language a message came with (an unknown one changes nothing), for the server's own messages
    expect((await (await fetch(`${base}/api/chat/demo`)).json()).thread.lang).toBe('ja');
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test('one reply at a time; a page that comes back attaches; stop keeps what was said and the next message resumes', async () => {
  const root = makeProjects();
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const first = fetch(`${base}/api/chat/home/messages`, post({ text: '慢慢說' }));
    await new Promise((r) => setTimeout(r, 400));
    const busy = await fetch(`${base}/api/chat/home/messages`, post({ text: 'x' }));
    // the page words it in its own language from the code (the Chinese stays for the command line)
    expect([busy.status, await busy.json()]).toEqual([409, { error: '還在回覆中', code: 'chat.busy' }]);
    const att = fetch(`${base}/api/chat/home/stream`);
    expect((await fetch(`${base}/api/chat/home/stop`, post({}))).status).toBe(200);
    const a = await lines(await first), b = await lines(await att);
    expect(a.at(-1)).toMatchObject({ type: 'done', status: 'stopped' });
    expect(b.at(-1)).toMatchObject({ type: 'done', status: 'stopped' });
    const t = await (await fetch(`${base}/api/chat/home`)).json();
    expect(t.thread.messages[1]).toMatchObject({ role: 'assistant', status: 'stopped', text: expect.stringMatching(/^.+$/) });
    expect(t.thread.messages[1]).not.toHaveProperty('usage');
    expect((await fetch(`${base}/api/chat/home/messages`, post({ text: '繼續' }))).status).toBe(200);
  } finally { await app.close(); }
});

test('a failing claude ends the turn with its reason; clearing starts a new conversation; unknown projects are refused', async () => {
  const root = makeProjects();
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const ev = await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '壞掉' })));
    expect(ev.at(-1)).toMatchObject({ type: 'done', status: 'error', error: expect.stringContaining('boom') });
    const before = (await (await fetch(`${base}/api/chat/demo`)).json()).thread.sessionId;
    expect((await fetch(`${base}/api/chat/demo`, { method: 'DELETE' })).status).toBe(200);
    const after = (await (await fetch(`${base}/api/chat/demo`)).json()).thread;
    expect([after.messages, after.sessionId === before]).toEqual([[], false]);
    expect((await fetch(`${base}/api/chat/nope/messages`, post({ text: 'x' }))).status).toBe(404);
    expect((await fetch(`${base}/api/chat/demo/messages`, post({ text: '  ' }))).status).toBe(400);
  } finally { await app.close(); }
});

test('a claude that cannot be found tells how to install it', async () => {
  const { app, base } = await startApp({ projectsDir: makeProjects(), claude: 'claude-does-not-exist-xyz' });
  try {
    const ev = await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: 'hi' })));
    expect(ev.at(-1)).toMatchObject({ type: 'done', status: 'error', error: expect.stringContaining('找不到 claude 指令'), code: 'chat.notFound' });
    expect((await (await fetch(`${base}/api/chat/home`)).json()).thread.messages.at(-1)).toMatchObject({ status: 'error', code: 'chat.notFound' });
  } finally { await app.close(); }
});

test('a first message that failed before claude started leaves the next one starting fresh; a forgotten conversation restarts on its own', async () => {
  const root = makeProjects(), log = join(root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log;
  process.env.CLAUDECODE = '1';
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const bad = await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '開不了' })));
    expect(bad.at(-1)).toMatchObject({ status: 'error', error: expect.stringContaining('還沒登入') });
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '第二句' })));
    let runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(runs[1].argv).toContain('--session-id');                    // never started: not --resume
    expect(runs.every((r: any) => !r.nested)).toBe(true);             // CLAUDECODE is not passed on
    expect(runs.every((r: any) => r.cacheTtl === '1h')).toBe(true);   // the 1-hour prompt cache is asked for
    writeFileSync(log + '.forget', '');
    const ok = await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '第三句' })));
    expect(ok.at(-1)).toMatchObject({ status: 'done', text: '收到：第三句' });
    runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect([runs[2].argv.includes('--resume'), runs[3].argv.includes('--session-id')]).toEqual([true, true]);
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; delete process.env.CLAUDECODE; }
});

test('a user message left without a reply (the server restarted) reads as interrupted', async () => {
  const root = makeProjects();
  mkdirSync(join(root, 'demo/.history/chat'), { recursive: true });
  writeFileSync(join(root, 'demo/.history/chat/chat.json'), JSON.stringify({ sessionId: '11111111-1111-1111-1111-111111111111', started: true,
    messages: [{ role: 'user', text: '半路', time: 't' }] }));
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const t = (await (await fetch(`${base}/api/chat/demo`)).json()).thread;
    expect(t.messages.map((m: any) => [m.role, m.status ?? null])).toEqual([['user', null], ['assistant', 'interrupted']]);
  } finally { await app.close(); }
});

test('the chat keeps its transcript out of the project versions, and a planted session id never reaches the command line', async () => {
  const root = makeProjects();
  mkdirSync(join(root, 'demo/.history/chat'), { recursive: true });
  writeFileSync(join(root, 'demo/.history/chat/chat.json'), JSON.stringify({ sessionId: 'x" & calc & "', started: true, messages: [] }));
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    expect((await (await fetch(`${base}/api/chat/demo`)).json()).thread.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: 'x' })));
    expect(await (await fetch(`${base}/api/projects/demo/history`)).json()).toEqual([]);
  } finally { await app.close(); }
});

test('a turn that cannot start (a prompt file gone) ends with the reason; the thread is not left running for good', () => {
  const root = makeProjects();
  const runner = new ChatRunner({ cmd: FAKE, cwd: root, promptFiles: [join(root, 'gone.md')], projectsDir: root });
  const events: any[] = [];
  expect(runner.send('demo', '你好', null, (e) => events.push(e))).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: 'done', status: 'error', error: expect.stringContaining('gone.md'), code: 'chat.startFailed', detail: expect.stringContaining('gone.md') });
  // it used to stay "running": every message after was refused, and the chat and the project could not be deleted
  expect(runner.running('demo')).toBeNull();
  expect(runner.send('demo', '再一次', null, () => {})).toBe(true);
});

test('a transcript that cannot be written ends the turn with the reason instead of wedging the thread', async () => {
  const root = makeProjects();
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const first = fetch(`${base}/api/chat/demo/messages`, post({ text: '慢慢說' }));
    await new Promise((r) => setTimeout(r, 400));
    rmSync(join(root, 'demo/.history/chat'), { recursive: true, force: true });
    writeFileSync(join(root, 'demo/.history/chat'), 'a file where the folder was');
    const ev = await lines(await first);
    expect(ev.at(-1)).toMatchObject({ type: 'done', status: 'error', code: 'chat.saveFailed', detail: expect.any(String) });
    rmSync(join(root, 'demo/.history/chat'), { force: true });
    expect((await fetch(`${base}/api/chat/demo/messages`, post({ text: '再來' }))).status).toBe(200);
  } finally { await app.close(); }
}, 20000);

test('a home reply that made one new project moves the conversation there; the home chat starts over with a note', async () => {
  const root = makeProjects(), log = join(root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log; process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '想剪一支片' })));
    const ev = await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '好，建專案 trip' })));
    expect(ev.at(-1)).toMatchObject({ type: 'done', status: 'done', moved: 'trip' });
    const home = (await (await fetch(`${base}/api/chat/home`)).json()).thread;
    const trip = (await (await fetch(`${base}/api/chat/trip`)).json()).thread;
    expect(trip.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(home.messages).toHaveLength(1);
    expect(home.messages[0]).toMatchObject({ role: 'assistant', status: 'done', text: expect.stringContaining('已移到專案「Demo」（trip）'),
      notice: { kind: 'moved', project: 'trip', name: 'Demo', others: [] } });
    expect(home.sessionId).not.toBe(trip.sessionId);
    expect([home.started, trip.started]).toEqual([false, true]);
    // the project's chat goes on with the same claude conversation; home starts a new one
    await lines(await fetch(`${base}/api/chat/trip/messages`, post({ text: '片頭短一點' })));
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '另一支' })));
    const runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const sid = runs[0].argv[runs[0].argv.indexOf('--session-id') + 1];
    expect(runs[2].argv).toEqual(expect.arrayContaining(['--resume', sid]));
    expect(runs[3].argv).toEqual(expect.arrayContaining(['--session-id', home.sessionId]));
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; delete process.env.FAKE_CLAUDE_PROJECTS; }
});

test('a home draft that made two projects moves to the one that was built and names the other; nothing moves onto an existing conversation', async () => {
  const root = makeProjects();
  process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    // a draft of this browser's own (two people starting at once each have one)
    const draft = 'home-abc123xyz';
    const two = await lines(await fetch(`${base}/api/chat/${draft}/messages`, post({ text: '建專案 a1 a2' })));   // neither built: the one touched last
    expect(two.at(-1)).toMatchObject({ moved: expect.stringMatching(/^a[12]$/) });
    const movedTo = two.at(-1).moved, other = movedTo === 'a1' ? 'a2' : 'a1';
    const note = (await (await fetch(`${base}/api/chat/${draft}`)).json()).thread.messages;
    expect(note).toHaveLength(1);
    expect(note[0].text).toContain(`（${other}）`);                                         // the other one is named
    expect((await (await fetch(`${base}/api/chat/${movedTo}`)).json()).thread.messages.length).toBeGreaterThan(1);
    expect((await (await fetch(`${base}/api/chat/home`)).json()).thread.messages).toHaveLength(0);   // the old home chat untouched
    mkdirSync(join(root, 'b1', '.history', 'chat'), { recursive: true });
    writeFileSync(join(root, 'b1', '.history', 'chat', 'chat.json'), JSON.stringify({ sessionId: '11111111-1111-4111-8111-111111111111', started: true, messages: [{ role: 'user', text: '舊', time: 't' }] }));
    const had = await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '建專案 b1' })));
    expect(had.at(-1)).not.toHaveProperty('moved');
    expect((await (await fetch(`${base}/api/chat/home`)).json()).thread.messages).toHaveLength(2);
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_PROJECTS; }
});

test("a project another tab's home chat made meanwhile is not taken: only the ones this reply made move it", async () => {
  const root = makeProjects();
  process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const only = await lines(await fetch(`${base}/api/chat/home-tab1aaaa/messages`, post({ text: '別處建 theirs' })));
    expect(only.at(-1)).not.toHaveProperty('moved');
    const both = await lines(await fetch(`${base}/api/chat/home-tab2bbbb/messages`, post({ text: '別處建 theirs2 建專案 mine' })));
    expect(both.at(-1)).toMatchObject({ moved: 'mine' });
    expect((await (await fetch(`${base}/api/chat/home-tab2bbbb`)).json()).thread.messages[0].text).not.toContain('theirs2');
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_PROJECTS; }
});

test('two tabs racing for one id: the reply that lost moves to the project it did make, not the one the other already moved into', async () => {
  // (the brand acceptance films 2 and 3: both tried maitian-bakery, one made maitian-bakery-2, and its conversation stayed on the home page)
  const root = makeProjects();
  process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const ev = await lines(await fetch(`${base}/api/chat/home-tab3cccc/messages`, post({ text: '搶先 bakery 建專案 bakery-2' })));
    expect(ev.at(-1)).toMatchObject({ moved: 'bakery-2' });
    expect((await (await fetch(`${base}/api/chat/bakery`)).json()).thread.messages[0].text).toBe('別人的');   // the other tab's, untouched
    expect((await (await fetch(`${base}/api/chat/bakery-2`)).json()).thread.messages.length).toBeGreaterThan(1);
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_PROJECTS; }
});

test('the projects a turn touched: npm run new, and paths under projects/', () => {
  const t = (detail: string) => ({ kind: 'run' as const, label: '', detail });
  expect([...touchedProjects([t('npm run new -- r3-uk "D:\\旅遊" --size 1080x1920'), t('C:\\s\\tellcut\\projects\\r3-uk\\cut.ts'), t('npm run cut -- other'), t('projects/fish/fx/a.js')])].sort()).toEqual(['fish', 'r3-uk']);
  // flags before the id, quotes of either kind, and the next command on the same line
  expect([...touchedProjects([t('npm run new -- --size 1080x1920 kyoto D:/x'), t("npm run new -- --force --name '京 都' 'kyo2' x && npm run cut -- nope"), t('npm run new -- --audio "k3" y; npm run new -- k4 z'), t('npm run new -- --blank k5 --size 1080x1920')])].sort()).toEqual(['k3', 'k4', 'k5', 'kyo2', 'kyoto']);
});

test("a reply's price is its own: Claude Code's session total minus what the thread saw last; unknown once for an old session", () => {
  const done = (cost: number) => ({ type: 'done' as const, status: 'done' as const, text: '', usage: { input: 1, cacheWrite: 0, cacheRead: 0, output: 1, cost } });
  const t: { spent?: number; spentIn?: string } = {};
  expect(turnCost(t, 's1', false, done(0.0077)).usage.cost).toBe(0.0077);          // a new session: all of it is this turn's
  expect(turnCost(t, 's1', true, done(0.0148)).usage.cost).toBe(0.0071);           // seen 2026-10-17: totals 0.0077 → 0.0148 → 0.0186
  expect(turnCost(t, 's1', true, done(0.0186)).usage.cost).toBe(0.0038);
  const old: { spent?: number; spentIn?: string } = {};
  expect(turnCost(old, 's0', true, done(0.7)).usage).not.toHaveProperty('cost');   // resumed, total never seen: no price this once
  expect(turnCost(old, 's0', true, done(0.75)).usage.cost).toBe(0.05);
});

const job = (kind: string, label: string, status: string, error?: string) => ({ id: `${kind}-${label}`, kind, project: 'demo', label, status, progress: 1, message: '', log: [], created: 0, ...(error ? { error } : {}) }) as JobInfo;
const DONE = [job('analyze', 's1', 'done'), job('extras', 's1', 'done')];

test('when a project analysis is done, a chat that ended its turn waiting for it is told to go on — once, and only then', async () => {
  const root = makeProjects(), sent: Array<[string, string]> = [], calls: any[] = [];
  const runner: any = { running: () => null, send: (t: string, text: string, context: string, _on: unknown, o: unknown) => { sent.push([t, text]); calls.push({ context, o }); return true; } };
  const { afterAnalysis } = chatRoutes(router(), new ProjectStore(root), runner);
  const say = (messages: any[]) => { mkdirSync(join(root, 'demo', '.history', 'chat'), { recursive: true }); writeFileSync(join(root, 'demo', '.history', 'chat', 'chat.json'), JSON.stringify({ sessionId: 's', started: true, messages })); };
  const since = Date.now() - 60000;
  say([{ role: 'user', text: '剪', time: new Date(since - 1000).toISOString() }, { role: 'assistant', text: '分析還在跑，好了會自動接著做', time: new Date(since + 1000).toISOString(), status: 'done' }]);
  afterAnalysis('demo', since, DONE);
  expect(sent).toEqual([['demo', ANALYSIS_DONE]]);
  expect(calls[0].o).toEqual({ auto: 'analysis' });
  expect(calls[0].context).toMatch(/^\(Current project: Demo \(demo\)\. The server sent this message by itself/);   // no language known: none told
  say([{ role: 'assistant', text: '早就講完了', time: new Date(since - 5000).toISOString(), status: 'done' }]);   // ended before the analysis began
  afterAnalysis('demo', since, DONE);
  say([{ role: 'user', text: '我先問一下', time: new Date(since + 2000).toISOString() }]);                              // the user wrote meanwhile
  afterAnalysis('demo', since, DONE);
  expect(sent).toHaveLength(1);
  // the language the user last wrote in goes with it: the English line alone would turn the reply English
  writeFileSync(join(root, 'demo', '.history', 'chat', 'chat.json'), JSON.stringify({ sessionId: 's', started: true, lang: 'zh', messages: [{ role: 'assistant', text: '等分析', time: new Date(since + 1000).toISOString(), status: 'done' }] }));
  afterAnalysis('demo', since, DONE);
  expect(calls[1].context).toMatch(/^\(UI language: Traditional Chinese \(繁體中文\)\)\n\n\(Current project: Demo/);
});

test('an analysis that did not finish: nothing done, no automatic turn; part of it failed, the message says which', async () => {
  const root = makeProjects(), sent: Array<{ text: string; o: any }> = [];
  const runner: any = { running: () => null, send: (_t: string, text: string, _c: string, _on: unknown, o: unknown) => { sent.push({ text, o }); return true; } };
  const { afterAnalysis } = chatRoutes(router(), new ProjectStore(root), runner);
  const since = Date.now() - 60000;
  mkdirSync(join(root, 'demo', '.history', 'chat'), { recursive: true });
  writeFileSync(join(root, 'demo', '.history', 'chat', 'chat.json'), JSON.stringify({ sessionId: 's', started: true, messages: [{ role: 'assistant', text: '等逐字稿', time: new Date(since + 1000).toISOString(), status: 'done' }] }));
  afterAnalysis('demo', since, [job('extras', 's1', 'failed', 'no whisper model'), job('beats', 'm1', 'cancelled')]);
  afterAnalysis('demo', since, []);                                // every job gone from the queue: nothing known to be done
  expect(sent).toEqual([]);
  afterAnalysis('demo', since, [job('analyze', 's1', 'done'), job('extras', 's1', 'failed', 'no whisper model'), job('beats', 'm1', 'done')]);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).not.toBe(ANALYSIS_DONE);
  expect(sent[0].text).toContain('contact sheets and transcript of "s1" (no whisper model)');
  expect(sent[0].text).not.toContain('"m1"');
  expect(sent[0].o).toEqual({ auto: 'analysis-partial' });
});

test("the page's analysing line: which source, which step, for how long; what waits; nothing when all is done", () => {
  const now = 10 * 60000, job = (o: object) => ({ id: 'j', kind: 'extras', project: 'p', label: '03', status: 'running', progress: 0.5, message: 'transcript', log: [], created: 0, started: now - 12 * 60000, ...o }) as any;
  expect(analysisStatus([job({}), job({ status: 'queued', label: '04' }), job({ kind: 'analyze', status: 'queued', label: '05' })], now)).toBe('03：逐字稿（已 12 分鐘）；還有 2 項排隊');
  expect(analysisStatus([job({ kind: 'analyze', message: 'proxy', started: now - 30000 })], now)).toBe('03：代理檔（已 0 分鐘）');
  expect(analysisStatus([job({ status: 'done' }), job({ kind: 'export' })], now)).toBeNull();
  // the same facts as codes, for a page that words them itself
  expect(analysisState([job({}), job({ status: 'queued', label: '04' }), job({ kind: 'analyze', status: 'queued', label: '05' })], now))
    .toEqual({ running: [{ label: '03', step: 'transcript', mins: 12 }], queued: 2 });
  expect(analysisState([job({ kind: 'analyze', message: '' }), job({ message: '' , label: '06' })], now)?.running.map((x) => x.step)).toEqual(['basic', 'extras']);
  expect(analysisState([job({ status: 'done' })], now)).toBeNull();
});

test('GET chat tells the step as a code (analysis) next to the Chinese line (analyzing)', async () => {
  const root = makeProjects(), now = Date.now();
  const live = { id: 'j', kind: 'extras', project: 'demo', label: '03', status: 'running', progress: 0.5, message: 'transcript', log: [], created: 0, started: now - 5000 };
  const queue: any = { active: (kind: string) => (kind === 'extras' ? [live] : []) };
  const rt = router();
  chatRoutes(rt, new ProjectStore(root), { running: () => null, elsewhere: () => false } as any, queue);
  const srv = createServer((q, s) => { void rt.handle(q, s); });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const port = (srv.address() as any).port;
    const body = await (await fetch(`http://127.0.0.1:${port}/api/chat/demo`)).json();
    expect(body.analysis).toEqual({ running: [{ label: '03', step: 'transcript', mins: 0 }], queued: 0 });
    expect(body.analyzing).toBe('03：逐字稿（已 0 分鐘）');
    const home = await (await fetch(`http://127.0.0.1:${port}/api/chat/home`)).json();
    expect(home.analysis).toBeNull();
  } finally { srv.close(); }
});

test('the chat can list a folder with Glob (it tried `ls` every turn and was refused)', () => {
  const a = claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' });
  expect(a[a.indexOf('--tools') + 1].split(',')).toContain('Glob');
  expect(a.slice(a.indexOf('--allowedTools'), a.indexOf('--disallowedTools'))).toContain('Glob');
});

test('the chat may write a project effect as .mjs too (the player and the server load both), and run the token count', () => {
  const a = claudeArgs({ session: 'u', resume: false, promptFile: 'P.md' });
  expect(a).toEqual(expect.arrayContaining(['Write(projects/*/fx/*.mjs)', 'Edit(projects/*/fx/*.mjs)', 'Bash(npm run tokens *)']));
});

test('the system prompt is the chat rules and the shared guides in one file named by its content: an edit reaches the next turn', () => {
  const dir = mkdtempSync(join(tmpdir(), 'compose-')), a = join(dir, 'a.md'), b = join(dir, 'b.md'), out = join(dir, 'cache');
  writeFileSync(a, '# 規則\n'); writeFileSync(b, '# 流程\n\n');
  const f1 = composePrompt([a, b], out);
  expect(readFileSync(f1, 'utf8')).toBe('# 規則\n\n---\n\n# 流程\n');
  expect(composePrompt([a, b], out)).toBe(f1);                 // the same text: the same file, not written again
  writeFileSync(b, '# 流程二\n');
  const f2 = composePrompt([a, b], out);
  expect(f2).not.toBe(f1);
  expect(readFileSync(f2, 'utf8')).toContain('流程二');
  // the real three: the chat's rules first, then quality, then the workflow with its block index
  const real = readFileSync(composePrompt(['apps/server/chat-prompt.md', 'guides/quality.md', 'guides/workflow.md'].map((f) => join(TELLCUT_ROOT, f)), out), 'utf8');
  expect(real.indexOf('# Tellcut editing assistant')).toBe(0);
  expect(real.indexOf('# What makes a good film')).toBeLessThan(real.indexOf('# Workflow and tools'));
  expect(real).toContain('`caption`');
});

test('a project a running home turn is making cannot be deleted; another project can', async () => {
  const root = makeProjects();
  process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    const turn = fetch(`${base}/api/chat/home/messages`, post({ text: '建專案 kyoto 慢' })).then(lines).catch(() => []);
    // until the turn has run `npm run new -- kyoto` (its tool shows in the running turn)
    for (let i = 0; i < 100; i++) {
      const r = (await (await fetch(`${base}/api/chat/home`)).json()).running;
      if (r?.tools.length) break;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    const r = await fetch(`${base}/api/projects/kyoto`, { method: 'DELETE' });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('Agent 正在處理這個專案（對話還在回覆中），等它回完再刪');
    expect((await fetch(`${base}/api/projects/demo`, { method: 'DELETE' })).status).toBe(200);
    await fetch(`${base}/api/chat/home/stop`, { method: 'POST' });
    await turn;
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_PROJECTS; }
}, 20000);

/** a preset folder with one preset, "a" (Travel Highlights, one style "map") */
function presetDirs() {
  const root = mkdtempSync(join(tmpdir(), 'presets-')), repo = join(root, 'repo');
  mkdirSync(join(repo, 'a'), { recursive: true });
  writeFileSync(join(repo, 'a', 'preset.md'), `---\n${JSON.stringify({ name: { zh: '旅行精華', en: 'Travel Highlights' }, summary: { zh: 's' },
    styles: [{ id: 'map', name: { en: 'Map' }, prompt: 'Map.' }],
    fields: [{ id: 'ratio', name: { en: 'Ratio' }, options: [{ id: '9:16', name: { en: '9:16 vertical' }, prompt: 'Make it 9:16.' }] }] })}\n---\nThese are defaults.\n`);
  return { repo, user: join(root, 'user') };
}

test("a message with a preset sends its block after the project line, and keeps only the user's words", async () => {
  const root = makeProjects(), log = join(root, 'fake.log'), dirs = presetDirs();
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: dirs });
  try {
    const block = presetBlock(findPreset(dirs, 'a')!, ['map']);
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '京都', preset: 'a', styles: ['map', 3] })));
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '再一支', preset: 'a', from: 'editor' })));
    const runs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(runs[0].stdin).toBe(`${block}\n\n京都`);
    expect(runs[1].stdin).toBe(`(Current project: Demo (demo). The editor is open.)\n\n${presetBlock(findPreset(dirs, 'a')!, [])}\n\n再一支`);
    const home = (await (await fetch(`${base}/api/chat/home`)).json()).thread;
    expect(home.messages[0]).toMatchObject({ role: 'user', text: '京都', preset: { id: 'a', styles: ['map'] } });
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test("a preset's fields go to Claude and stay on the message, filtered", async () => {
  const root = makeProjects(), log = join(root, 'fake.log'), dirs = presetDirs();
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: dirs });
  try {
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: 'hi', preset: 'a', fields: { ratio: '9:16', bogus: 'x' } })));
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).stdin).toBe(`${presetBlock(findPreset(dirs, 'a')!, [], { ratio: '9:16' })}\n\nhi`);
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: 'again', preset: 'a', fields: { ratio: 'auto' } })));
    const home = (await (await fetch(`${base}/api/chat/home`)).json()).thread;
    expect(home.messages[0].preset).toEqual({ id: 'a', styles: [], fields: { ratio: '9:16' } });
    expect(home.messages.filter((m: any) => m.role === 'user')[1].preset).toEqual({ id: 'a', styles: [] });   // nothing set: no fields key
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test("a project made with a preset's form: its chat line carries the options", async () => {
  const root = makeProjects(), log = join(root, 'fake.log'), dirs = presetDirs();
  const pf = join(root, 'demo', 'project.json'), p = JSON.parse(readFileSync(pf, 'utf8'));
  p.meta.preset = { id: 'a', styles: [], fields: { ratio: '9:16' } };
  writeFileSync(pf, JSON.stringify(p));
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: dirs });
  try {
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: 'x', from: 'editor' })));
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).stdin).toContain('read it again when needed). Options the user set in the form (what the user says in the message still comes first): Ratio: 9:16 vertical.)');
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test('a preset alone is a message', async () => {
  const root = makeProjects(), log = join(root, 'fake.log'), dirs = presetDirs();
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: dirs });
  try {
    const ok = await fetch(`${base}/api/chat/home/messages`, post({ text: '  ', preset: 'a' }));
    expect(ok.status).toBe(200); await lines(ok);
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).stdin).toBe(presetBlock(findPreset(dirs, 'a')!, []));
    expect((await fetch(`${base}/api/chat/home/messages`, post({ text: '' }))).status).toBe(400);
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test('an unknown preset still sends the message and tells Claude it is gone', async () => {
  const root = makeProjects(), log = join(root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: presetDirs() });
  try {
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: 'x', preset: 'nope' })));
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).stdin).toBe(`${missingPresetBlock('nope')}\n\nx`);
    const home = (await (await fetch(`${base}/api/chat/home`)).json()).thread;
    expect(home.messages[0].preset).toBeUndefined();
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test('a home chat that used a preset hands it to the project it makes', async () => {
  const root = makeProjects(), log = join(root, 'fake.log'), dirs = presetDirs();
  process.env.FAKE_CLAUDE_LOG = log; process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: dirs });
  try {
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '想剪', preset: 'a' })));
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '換一個', preset: 'a', styles: ['map'], fields: { ratio: '9:16' } })));
    const ev = await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '好，建專案 trip' })));
    expect(ev.at(-1)).toMatchObject({ moved: 'trip' });
    expect(JSON.parse(readFileSync(join(root, 'trip', 'project.json'), 'utf8')).meta.preset).toEqual({ id: 'a', styles: ['map'], fields: { ratio: '9:16' } });
    expect(readdirSync(join(root, 'trip', '.history')).some((f) => f.endsWith('_preset.json'))).toBe(true);
    // without a preset: nothing written
    await lines(await fetch(`${base}/api/chat/home/messages`, post({ text: '好，建專案 plain' })));
    expect(JSON.parse(readFileSync(join(root, 'plain', 'project.json'), 'utf8')).meta.preset).toBeUndefined();
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; delete process.env.FAKE_CLAUDE_PROJECTS; }
});

test('a project made from a preset says so with every message', async () => {
  const root = makeProjects(), log = join(root, 'fake.log'), dirs = presetDirs();
  process.env.FAKE_CLAUDE_LOG = log;
  const p = JSON.parse(readFileSync(join(root, 'demo', 'project.json'), 'utf8'));
  p.meta.preset = { id: 'a', styles: [] };
  writeFileSync(join(root, 'demo', 'project.json'), JSON.stringify(p));
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE, presetDirs: dirs });
  try {
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '短一點', from: 'home' })));
    expect(JSON.parse(readFileSync(log, 'utf8').trim()).stdin.split('\n\n')[0]).toContain(` Preset: Travel Highlights (${findPreset(dirs, 'a')!.file}; read it again when needed).)`);
    rmSync(join(dirs.repo, 'a'), { recursive: true });
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '再短', from: 'editor' })));
    expect(JSON.parse(readFileSync(log, 'utf8').trim().split('\n')[1]).stdin).toMatch(/^\(Current project: Demo \(demo\)\. The editor is open\. Preset: a\.\)/);
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; }
});

test('the sources ticked in the API menu come with each message and are handed to the agent; none ticked is an empty list', async () => {
  const root = makeProjects(), log = join(root, 'fake.log');
  process.env.FAKE_CLAUDE_LOG = log;
  process.env.FAKE_CLAUDE_PROJECTS = root;
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  const runs = () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  try {
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '一', from: 'editor' })));
    expect(runs()[0].sources).toBe('');
    // ids Tellcut has no adapter for are dropped, and so are repeats
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '二', from: 'editor', sources: ['wikimedia', 'nope', 'freesound', 'wikimedia', 3] })));
    expect(runs()[1].sources).toBe('wikimedia,freesound');
    // the next message carries its own ticks: none is none
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '三', from: 'editor', sources: [] })));
    expect(runs()[2].sources).toBe('');
    // there is no saving ticks on their own any more, and clearing the conversation keeps none
    expect((await fetch(`${base}/api/chat/demo/sources`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"sources":["maps"]}' })).status).toBe(404);
    await lines(await fetch(`${base}/api/chat/demo/messages`, post({ text: '四', from: 'editor', sources: ['maps'] })));
    await fetch(`${base}/api/chat/demo`, { method: 'DELETE' });
    expect((await (await fetch(`${base}/api/chat/demo`)).json()).thread.sources).toBeUndefined();
    // a home draft's ticks move with it into the project it makes (its automatic turn after the analysis uses them)
    const made = await lines(await fetch(`${base}/api/chat/home-tick12345/messages`, post({ text: '建專案 t1', sources: ['maps'] })));
    expect(runs().at(-1).sources).toBe('maps');
    expect(made.at(-1)).toMatchObject({ moved: 't1' });
    expect((await (await fetch(`${base}/api/chat/t1`)).json()).thread.sources).toEqual(['maps']);
  } finally { await app.close(); delete process.env.FAKE_CLAUDE_LOG; delete process.env.FAKE_CLAUDE_PROJECTS; }
});

test('chatEnv hands the ticked sources over as TELLCUT_SOURCES; without a list it sets none', () => {
  expect(chatEnv({}, undefined, ['a', 'b']).TELLCUT_SOURCES).toBe('a,b');
  expect(chatEnv({}, undefined, []).TELLCUT_SOURCES).toBe('');
  expect(chatEnv({ TELLCUT_SOURCES: 'x' }, undefined, ['y']).TELLCUT_SOURCES).toBe('y');
  expect(chatEnv({})).not.toHaveProperty('TELLCUT_SOURCES');
});

test('a thread another server (same projects/) is replying in is busy here too: not resumed a second time, not marked interrupted', async () => {
  const root = makeProjects();
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  const { app, base } = await startApp({ projectsDir: root, claude: FAKE });
  try {
    // the other server took the thread and saved the user's message; its reply is still running
    const file = join(root, 'demo', '.history', 'chat', 'chat.json');
    mkdirSync(join(root, 'demo', '.history', 'chat'), { recursive: true });
    writeFileSync(file, JSON.stringify({ messages: [{ role: 'user', text: '剪短', time: new Date().toISOString() }], sessionId: '11111111-2222-4333-8444-555555555555', started: true }));
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: other.pid, started: Date.now() }));
    // its reply already ended in Claude's log, but the other server has not saved it yet: that server writes it, not this one
    const logs = join(root, '.claude-config', 'projects', 'x');
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, '11111111-2222-4333-8444-555555555555.jsonl'), JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() + 1000).toISOString(), message: { id: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: '剪好了' }] } }));
    process.env.CLAUDE_CONFIG_DIR = join(root, '.claude-config');
    const r = await fetch(`${base}/api/chat/demo/messages`, post({ text: 'x' }));
    expect([r.status, (await r.json()).code]).toEqual([409, 'chat.busy']);
    const got = (await (await fetch(`${base}/api/chat/demo`)).json()).thread;
    expect(got.messages.map((m: any) => [m.role, m.status ?? null])).toEqual([['user', null]]);   // no "interrupted" reply added
    // nor emptied under it: its reply would land on the new conversation
    const del = await fetch(`${base}/api/chat/demo`, { method: 'DELETE' });
    expect([del.status, (await del.json()).code]).toEqual([409, 'chat.busy']);
    expect(JSON.parse(readFileSync(file, 'utf8')).messages).toHaveLength(1);
  } finally { other.kill(); await app.close(); delete process.env.CLAUDE_CONFIG_DIR; }
});
