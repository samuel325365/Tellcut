// One headless Claude Code run per chat message (spec 2026-10-16-in-editor-chat §3.2), locked down to the tools Tellcut
// needs: no settings files (only its own --settings: no user or project permissions, plugins or hooks), five tools, the tellcut commands allowed, nothing else asked.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chatFile, closeDangling, freshThread, isHome, readThread, writeThread, type ChatThread } from './store.ts';
import { NOT_FOUND, StreamParser, type ChatEvent, type ChatTool, type Usage } from './stream.ts';
import { withRecovered } from './recover.ts';
import { BASH_DEFAULT_TIMEOUT_MS, BASH_MAX_TIMEOUT_MS } from './timeouts.ts';
import { claudeEnv, lockHolder, renameRetry, tryLock, writeProjectFile } from '@tellcut/media-node';
import type { ChatMessage, Lang, PresetChoice } from '@tellcut/protocol';

/**
 * The turn's own price: Claude Code reports the session's running total (a resumed session carries it on), so the total the
 * thread saw last for this session is taken off. A session the thread has no total for yet (one that started before totals
 * were kept) gives no price this once rather than a wrong one.
 */
export function turnCost<E extends { usage?: Usage }>(t: { spent?: number; spentIn?: string }, session: string, resumed: boolean, done: E): E {
  const total = done.usage?.cost;
  if (total === undefined || !done.usage) return done;
  // a session started by this turn had spent nothing before it
  const known = t.spentIn === session ? t.spent ?? 0 : resumed ? null : 0;
  t.spent = total; t.spentIn = session;
  const { cost: _, ...rest } = done.usage;
  return { ...done, usage: known === null ? rest : { ...rest, cost: Math.round(Math.max(0, total - known) * 1e6) / 1e6 } };
}

/** A folder as a Read rule's absolute path: permission paths are POSIX-style and `//` starts an absolute one (C:\x → //c/x). */
const absRule = (dir: string) => `Read(//${dir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d: string) => d.toLowerCase()).replace(/^\/+|\/+$/g, '')}/**)`;

/** settingsFile: the page chat's own settings (apps/server/chat-settings.json) — it keeps every CLAUDE.md out, so the chat
 *  follows chat-prompt.md alone: tellcut/CLAUDE.md is for developers and the folders above tellcut/ are anyone's.
 *  configDir: CLAUDE_CONFIG_DIR when the login lives there (chatEnv keeps it), kept from Read like ~/.claude */
export function claudeArgs(o: { session: string; resume: boolean; promptFile: string; settingsFile?: string; configDir?: string }): string[] {
  return ['-p', '--input-format', 'text', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'dontAsk', '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config',
    // Glob lists a folder (read-only): without it the chat tried `ls` every turn and was refused
    '--tools', 'Read,Write,Edit,Bash,Glob',
    '--allowedTools', 'Bash(npm run tellcut *)', 'Bash(npm run new *)', 'Bash(npm run inspect *)', 'Bash(npm run cut *)', 'Bash(npm run check *)', 'Bash(npm run voice *)', 'Bash(npm run score *)', 'Bash(npm run tokens *)', 'Read', 'Glob',
    'Write(projects/*/cut.ts)', 'Edit(projects/*/cut.ts)', 'Write(projects/*/fx/*.js)', 'Edit(projects/*/fx/*.js)', 'Write(projects/*/fx/*.mjs)', 'Edit(projects/*/fx/*.mjs)',
    // narration text, the storyboard (review3 R3-H8), the brand card (a brand film, 2026-10-28) and a project's own music styles (toolkit phase 3); promoting a style stays with Claude Code
    'Write(projects/*/narration.json)', 'Edit(projects/*/narration.json)', 'Write(projects/*/storyboard.md)', 'Edit(projects/*/storyboard.md)', 'Write(projects/*/brand.md)', 'Edit(projects/*/brand.md)', 'Write(projects/*/score/*.js)', 'Edit(projects/*/score/*.js)',
    // a proposal's ops are written to a file first: pipes (echo … | propose -) are refused like every compound command
    'Write(projects/*/proposal.json)', 'Edit(projects/*/proposal.json)',
    // the draft of a preset of the user's own, and an entry of their library changed from the gallery (spec 2026-10-29-my-library §4.3, §4.5)
    'Write(projects/*/preset-draft.json)', 'Edit(projects/*/preset-draft.json)', 'Write(projects/_library/blocks/*/fx/*.js)', 'Edit(projects/_library/blocks/*/fx/*.js)',
    // guardrails, not a sandbox (spec §1.2): secrets and npm's shell override stay out of reach
    '--disallowedTools', 'Read(~/.ssh/**)', 'Read(~/.claude/**)', 'Read(~/.aws/**)', 'Read(~/.config/**)', 'Read(~/AppData/**)', 'Bash(*--script-shell*)',
    'Read(~/.npmrc)', 'Read(~/.git-credentials)', 'Read(~/.netrc)', 'Read(~/.docker/**)', 'Read(~/.kube/**)', 'Read(~/.azure/**)', 'Read(~/.gnupg/**)',
    // the Claude account file, the outside sources' API keys (sources.local.json, not in git), a login kept elsewhere
    'Read(~/.claude.json)', 'Read(./sources.local.json)', ...(o.configDir ? [absRule(o.configDir)] : []),
    // a second lock only: --tools already leaves Agent and Skill out and --disable-slash-commands turns skills off; kept in
    // case a Claude Code release widens --tools (the developers' subagents and skills in tellcut/.claude stay out of the chat)
    'Agent', 'Skill',
    ...(o.settingsFile ? ['--settings', o.settingsFile] : []),
    // no --add-dir: tellcut/ is handed over on its own and its parent may be anyone's Desktop; footage outside is reached through the Tellcut tools
    '--append-system-prompt-file', o.promptFile,
    ...(o.resume ? ['--resume', o.session] : ['--session-id', o.session])];
}

/** Whether the command's program exists (on PATH, with Windows' PATHEXT): a missing claude is told before spawning,
 *  because a localized cmd.exe reports it in its own words and code page. */
export function onPath(cmd: string): boolean {
  const m = /^\s*(?:"([^"]+)"|(\S+))/.exec(cmd), prog = m?.[1] ?? m?.[2];
  if (!prog) return false;
  if (/[\\/]/.test(prog)) return existsSync(prog);
  const exts = process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')] : [''];
  return (process.env.PATH ?? '').split(delimiter).some((d) => d && exts.some((e) => existsSync(join(d, prog + e))));
}

/** The page chat's environment: no Claude Code session's variables (claudeEnv), and only the chat's own values set.
 *  sources: the ones the user ticked in the API menu — the only ones `assets` lets the agent use (none ticked: none) */
export function chatEnv(base: NodeJS.ProcessEnv, serverUrl?: string, sources?: string[]): NodeJS.ProcessEnv {
  const env = claudeEnv(base);
  if (serverUrl) env.TELLCUT_URL = serverUrl;
  if (sources) env.TELLCUT_SOURCES = sources.join(',');
  // users answer minutes apart: keep the 1-hour prompt cache, which Claude Code only gives a subscription within plan usage
  // by default (API keys, usage credits and cloud providers would fall back to 5 minutes); a developer's own TTL is not inherited
  env.CLAUDE_CODE_PROMPT_CACHE_TTL = base.TELLCUT_CHAT_CACHE_TTL || '1h';
  // auto memory is keyed by the folder (tellcut/): what a developer's session saved there must not steer the chat
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  // a command past its timeout is moved to the background, its output in a file under ~/AppData that the chat may not Read:
  // it runs the command again. Renders and analyses finish in the foreground instead.
  env.BASH_DEFAULT_TIMEOUT_MS = String(BASH_DEFAULT_TIMEOUT_MS);
  env.BASH_MAX_TIMEOUT_MS = String(BASH_MAX_TIMEOUT_MS);
  return env;
}

/**
 * The page chat's system prompt (review3 R3-L2): its own rules, then the guides it shares with the developers' batch subagents,
 * as one file named by its content (.cache/chat-prompt-<hash>.md): turns at the same time never see a half-written one, and
 * a conversation that goes on after an edit gets the new one. Claude Code takes a single --append-system-prompt-file.
 */
export function composePrompt(parts: string[], dir: string): string {
  const text = parts.map((p) => readFileSync(p, 'utf8').trim()).join('\n\n---\n\n') + '\n';
  const file = join(dir, `chat-prompt-${createHash('sha1').update(text).digest('hex').slice(0, 12)}.md`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameRetry(tmp, file);
    // earlier versions: claude reads its file when it starts, so an hour-old one is nobody's any more
    for (const f of readdirSync(dir)) {
      const old = join(dir, f);
      try { if (/^chat-prompt-[0-9a-f]{12}\.md$/.test(f) && old !== file && Date.now() - statSync(old).mtimeMs > 3600_000) rmSync(old, { force: true }); } catch { /* gone */ }
    }
  }
  return file;
}

/** Arguments are fixed strings or paths; the user's words only ever go through stdin. */
const quote = (a: string) => `"${a.replace(/"/g, '\\"')}"`;

interface Turn { child: ChildProcess; parser: StreamParser; tools: ChatTool[]; listeners: Set<(e: ChatEvent) => void>; stopped: boolean; release: () => void }

/** a thread's turn is held by the server running it (beside its chat file): another server on the same projects/ sees it */
const turnLock = (file: string) => `${file}.lock`;

/** project folders (with a project.json; not _home and the like) */
function projectIds(dir: string): Set<string> {
  try { return new Set(readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(dir, d.name, 'project.json'))).map((d) => d.name)); }
  catch { return new Set(); }
}

/** the id in what follows `npm run new --`, read the way tools/new.ts reads it: words in either quotes, `--flag value` pairs
 *  skipped (--force, --audio and --blank take no value); the caller cuts it at the next command on the line */
function newProjectId(rest: string): string | undefined {
  const words = [...rest.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((w) => w[1] ?? w[2] ?? w[3]);
  for (let i = 0; i < words.length; i++) {
    if (!words[i].startsWith('--')) return words[i];
    if (!['--force', '--audio', '--blank'].includes(words[i])) i++;
  }
}

/** the projects a turn's tools named: `npm run new -- <id>` and paths under projects/<id>/ */
export function touchedProjects(tools: ChatTool[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tools) {
    for (const m of t.detail.matchAll(/npm run new --([^;&|\n]*)/g)) { const id = newProjectId(m[1]); if (id) ids.add(id); }
    for (const m of t.detail.matchAll(/projects[\\/]([^\\/\s"']+)[\\/]/g)) ids.add(m[1]);
  }
  return ids;
}

export class ChatRunner {
  private turns = new Map<string, Turn>();

  /** this server's address, for the Tellcut commands Claude runs (npm run new tells it to start analysing; tellcut propose…) */
  serverUrl?: string;
  /** promptFiles: the chat's own rules (apps/server/chat-prompt.md), then guides/quality.md and guides/workflow.md: put together
   *  for every turn (composePrompt), so an edit to any of them reaches the next message without a server restart */
  constructor(private o: { cmd: string; cwd: string; promptFiles: string[]; settingsFile?: string; projectsDir: string }) {}

  /**
   * After a home reply that made new projects: the conversation goes on in the project's chat (same claude session) — the one
   * that was built (it has a cut.ts), else the one touched last; others made on the way (a first try in the wrong shape) are
   * named in the note. This home conversation keeps only the note. The project's id, or null.
   */
  private handOver(thread: string, home: ChatThread, before: Set<string>, tools: ChatTool[]): string | null {
    // only projects this turn made: another home chat (a second tab) may be making one at the same time. One that already has a
    // conversation is that tab's, even when this turn's tools named it (both tried the same id and this one fell back to `<id>-2`)
    const mine = touchedProjects(tools), dir = this.o.projectsDir;
    const made = [...projectIds(dir)].filter((id) => !before.has(id) && mine.has(id) && !existsSync(chatFile(dir, id)));
    if (!made.length) return null;
    const touched = (id: string) => { try { return statSync(join(dir, id, 'project.json')).mtimeMs; } catch { return 0; } };
    const built = made.filter((id) => existsSync(join(dir, id, 'cut.ts')));
    const id = (built.length ? built : made).sort((a, b) => touched(b) - touched(a))[0], target = chatFile(dir, id);
    const name = (pid: string) => { try { return JSON.parse(readFileSync(join(dir, pid, 'project.json'), 'utf8')).meta?.name || pid; } catch { return pid; } };
    const others = made.filter((x) => x !== id);
    writeThread(target, home);
    // the preset this conversation used last goes with it into the project
    const preset = home.messages.filter((m) => m.role === 'user' && m.preset).at(-1)?.preset;
    if (preset) try {
      const p = JSON.parse(readFileSync(join(dir, id, 'project.json'), 'utf8'));
      writeProjectFile(join(dir, id), { ...p, meta: { ...p.meta, preset } }, 'preset');
    } catch (e) { console.warn(`preset not written into ${id}: ${(e as Error).message}`); }
    writeThread(chatFile(dir, thread), { ...freshThread(), messages: [
      { role: 'assistant', text: `這串對話已移到專案「${name(id)}」（${id}）：上方的對話選單已切到它，可以在這裡繼續；要剪接細調，點左邊的專案進編輯器。${others.length ? `這次也建了沒用到的專案：${others.map((x) => `「${name(x)}」（${x}）`).join('、')}，不需要的話可以刪掉。` : ''}`, time: new Date().toISOString(), status: 'done',
        notice: { kind: 'moved', project: id, name: name(id), others: others.map((x) => ({ id: x, name: name(x) })) } }] });
    return id;
  }

  /** the thread of a running turn working on `project`: its own conversation, or one whose tools named it (a home draft making it) */
  busyWith(project: string): string | null {
    for (const [thread, t] of this.turns) if (thread === project || touchedProjects(t.tools).has(project)) return thread;
    return this.elsewhere(project) ? project : null;
  }

  /** another server on the same projects/ is replying in this thread (its turn's lock is live) */
  elsewhere(thread: string): boolean {
    try { return !this.turns.has(thread) && !!lockHolder(turnLock(chatFile(this.o.projectsDir, thread))); } catch { return false; }
  }

  running(thread: string): { text: string; tools: ChatTool[] } | null {
    const t = this.turns.get(thread);
    return t ? { text: t.parser.partial, tools: [...t.tools] } : null;
  }

  /** Starts a turn; false when one is already running in this thread. */
  /** o.lang: the page's language, kept on the thread for the messages the server sends later; o.auto: a server-sent message;
   *  o.sources: the APIs ticked with this message, kept on the thread for this turn and the server's automatic ones after it */
  send(thread: string, text: string, context: string | null, on: (e: ChatEvent) => void, o: { preset?: PresetChoice; lang?: Lang; auto?: ChatMessage['auto']; sources?: string[] } = {}): boolean {
    if (this.turns.has(thread)) return false;
    const file = chatFile(this.o.projectsDir, thread);
    mkdirSync(dirname(file), { recursive: true });
    // another server on the same projects/ is replying here: a second --resume of that session would mix the two up
    const release = tryLock(turnLock(file));
    if (!release) return false;
    // a reply that finished while the server was down goes back in first (the conversation reads in order)
    let th: ChatThread;
    try { const read = readThread(file); th = closeDangling(withRecovered(read) ?? read); } catch (e) { release(); throw e; }
    const { preset, lang, auto, sources } = o;
    th.messages.push({ role: 'user', text, time: new Date().toISOString(), ...(preset ? { preset } : {}), ...(auto ? { auto } : {}) });
    if (lang) th.lang = lang;
    if (sources) th.sources = sources;
    if (!onPath(this.o.cmd)) {
      th.messages.push({ role: 'assistant', text: '', time: new Date().toISOString(), status: 'error', error: NOT_FOUND, code: 'chat.notFound' });
      writeThread(file, th);
      release();
      on({ type: 'done', status: 'error', text: '', error: NOT_FOUND, code: 'chat.notFound' });
      return true;
    }
    try { writeThread(file, th); } catch (e) { release(); throw e; }
    // the home chat that makes a project hands its conversation over to it (see handOver)
    const before = isHome(thread) ? projectIds(this.o.projectsDir) : null;
    const turn: Turn = { child: null as unknown as ChildProcess, parser: new StreamParser(), tools: [], listeners: new Set([on]), stopped: false, release };
    this.turns.set(thread, turn);
    let closed = false, session = th.sessionId, resumed = false;
    const emit = (e: ChatEvent) => {
      if (e.type === 'tool') turn.tools.push(e.tool);
      if (e.type === 'done') return end(e);
      for (const l of turn.listeners) l(e);
    };
    const end = (e: Extract<ChatEvent, { type: 'done' }>) => {
      if (closed) return;
      closed = true;
      let done: Extract<ChatEvent, { type: 'done' }> = turn.stopped ? { type: 'done', status: 'stopped', text: turn.parser.partial } : e;
      try {
        const t2 = readThread(file);
        t2.sessionId = session;
        // only a session claude actually started can be resumed (a failure before that leaves the next one fresh)
        if (turn.parser.initialized) t2.started = true;
        done = turnCost(t2, session, resumed, done);
        t2.messages.push({ role: 'assistant', text: done.text || turn.parser.partial, time: new Date().toISOString(), tools: turn.tools, status: done.status, ...(done.error ? { error: done.error } : {}),
          ...(done.code ? { code: done.code } : {}), ...(done.detail !== undefined ? { detail: done.detail } : {}), ...(done.usage ? { usage: done.usage } : {}) });
        writeThread(file, t2);
        const moved = before && done.status === 'done' ? this.handOver(thread, t2, before, turn.tools) : null;
        if (moved) done = { ...done, moved };
      } catch (err) {
        done = { type: 'done', status: 'error', text: done.text, error: `對話紀錄寫不進去：${(err as Error).message}`, code: 'chat.saveFailed', detail: (err as Error).message };
      } finally {
        this.turns.delete(thread);   // never left "running"
        turn.release();
      }
      for (const l of turn.listeners) l(done);
    };
    // a turn that cannot start (a prompt file gone, a rename an antivirus held) ends with the reason: thrown, it stayed "running"
    // for good, and from the retry below (inside the child's close) it took the whole server down
    const launch = (resume: boolean) => {
      try { start(resume); } catch (err) { end({ type: 'done', status: 'error', text: turn.parser.partial, error: `沒辦法開始回覆：${(err as Error).message}`, code: 'chat.startFailed', detail: (err as Error).message }); }
    };
    const start = (resume: boolean) => {
      resumed = resume;
      const env = chatEnv(process.env, this.serverUrl, th.sources ?? []);
      const args = claudeArgs({ session, resume, promptFile: composePrompt(this.o.promptFiles, join(this.o.cwd, '.cache')), settingsFile: this.o.settingsFile, configDir: env.CLAUDE_CONFIG_DIR || undefined });
      const child = spawn(`${this.o.cmd} ${args.map(quote).join(' ')}`, { cwd: this.o.cwd, env, shell: true, windowsHide: true });
      turn.child = child;
      let buf = '', stderr = '';
      child.stdout!.setEncoding('utf8');
      child.stdout!.on('data', (d: string) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); for (const e of turn.parser.push(line)) emit(e); }
      });
      child.stderr!.setEncoding('utf8');
      child.stderr!.on('data', (d: string) => { stderr += d; });
      child.on('error', (err) => { for (const e of turn.parser.finish(null, `${stderr}\n${err.message}`)) emit(e); });
      child.on('close', (code) => {
        if (buf.trim()) for (const e of turn.parser.push(buf)) emit(e);
        // claude no longer has this conversation (its files were cleaned up): start a new one with the same message
        if (resume && !turn.parser.initialized && !turn.stopped && /no conversation found/i.test(stderr)) {
          session = randomUUID();
          turn.parser = new StreamParser();
          launch(false);
          return;
        }
        for (const e of turn.parser.finish(code, stderr)) emit(e);
        if (!closed) end({ type: 'done', status: turn.stopped ? 'stopped' : 'done', text: turn.parser.partial });
      });
      child.stdin!.on('error', () => {});
      child.stdin!.end([context, text].filter(Boolean).join('\n\n'));
    };
    launch(th.started);
    return true;
  }

  /** Follows the running turn (a page that came back); returns the unsubscribe, or null when nothing runs. */
  attach(thread: string, on: (e: ChatEvent) => void): (() => void) | null {
    const t = this.turns.get(thread);
    if (!t) return null;
    t.listeners.add(on);
    return () => { t.listeners.delete(on); };
  }

  stop(thread: string): boolean {
    const t = this.turns.get(thread);
    if (!t) return false;
    t.stopped = true;
    killTree(t.child);
    return true;
  }

  stopAll() { for (const id of [...this.turns.keys()]) this.stop(id); }
}

/** Ends the shell and its claude. Not once it has exited: Windows soon hands its pid to another process, and taskkill /T would
 *  end that one's whole tree (it took vitest workers with it). */
export function killTree(child: ChildProcess, run: typeof spawn = spawn) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  // the shell's child (claude) must go too: on Windows only taskkill /T reaches it
  if (process.platform === 'win32') run('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  else child.kill('SIGINT');
}
