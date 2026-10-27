// A reply finished while the server was down (restarted mid-turn: claude keeps running and finishes the work, but nobody is
// there to write its reply into the thread — seen 2026-10-18 on a film whose automatic turn ended after a restart). Claude Code
// keeps its own log of the session (~/.claude/projects/<folder>/<session>.jsonl): the reply is rebuilt from it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ChatMessage, ChatThread, ChatTool } from '@tellcut/protocol';
import { toolOf } from './stream.ts';
import { BASH_MAX_TIMEOUT_MS } from './timeouts.ts';

/** the log Claude Code keeps for a session (it files it under a folder named after the working directory); in
 *  CLAUDE_CONFIG_DIR when the login lives there (chatEnv keeps that variable for the chat), else ~/.claude */
export function sessionLog(sessionId: string, home?: string): string | null {
  const root = join(home ? join(home, '.claude') : process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
  try {
    for (const d of readdirSync(root)) { const f = join(root, d, `${sessionId}.jsonl`); if (existsSync(f)) return f; }
  } catch { /* no Claude Code folder */ }
  return null;
}

/** How long the log must be quiet before its reply counts as finished: a claude left running by a restart can sit in one
 *  foreground Bash command (renders, analyses) for up to BASH_MAX_TIMEOUT_MS without writing to it. Shorter, a reply cut off
 *  mid-turn was saved as final and the next message resumed a session still in use. */
export const QUIET_MS = BASH_MAX_TIMEOUT_MS + 60_000;

/** the Chinese note for old pages; a page that knows notice.kind 'recovered' words it itself */
export const RECOVERED_NOTE = '（這段回覆是在 Tellcut 伺服器重新啟動時完成的，從 Agent 的紀錄補回。）';

/**
 * The reply to the thread's last message, rebuilt from the session log — when the thread is waiting for one (its last message
 * is the user's, or an empty interrupted reply) and the log has the assistant's words after that message. A turn whose last
 * assistant message ended it (stop_reason end_turn) is taken at once; otherwise a log written in the last `quietMs` may belong to a
 * turn still running: left for later. Its price is the session's cost-state total minus what the
 * thread saw last (as turnCost does).
 */
export function recoverReply(t: ChatThread, o: { home?: string; now?: number; quietMs?: number } = {}): ChatMessage | null {
  const msgs = t.messages, last = msgs.at(-1);
  const waiting = last?.role === 'user' ? last : last?.role === 'assistant' && last.status === 'interrupted' && !last.text && msgs.at(-2)?.role === 'user' ? msgs.at(-2)! : null;
  if (!waiting || !t.started) return null;
  const log = sessionLog(t.sessionId, o.home);
  if (!log) return null;
  const since = Date.parse(waiting.time);
  const texts: string[] = [], tools: ChatTool[] = [], usage = new Map<string, any>();
  let lastTime = '', total: number | undefined, ended = false, text: string, mtime: number;
  // a log that cannot be read (antivirus holding it, rotated away) recovers nothing: a throw here left the turn lock held
  try { text = readFileSync(log, 'utf8'); mtime = statSync(log).mtimeMs; } catch { return null; }
  for (const line of text.split(/\r?\n/)) {
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e?.type === 'cost-state' && typeof e.totalCostUSD === 'number') { total = e.totalCostUSD; continue; }
    if (e?.type !== 'assistant' || !(Date.parse(e.timestamp) > since)) continue;
    lastTime = e.timestamp;
    ended = e.message?.stop_reason === 'end_turn';
    if (typeof e.message?.id === 'string' && e.message.usage) usage.set(e.message.id, e.message.usage);
    for (const c of e.message?.content ?? []) {
      if (c?.type === 'text' && String(c.text).trim()) texts.push(String(c.text).trim());
      if (c?.type === 'tool_use') tools.push(toolOf(String(c.name), c.input));
    }
  }
  if (!texts.length) return null;
  if (!ended && (o.now ?? Date.now()) - mtime < (o.quietMs ?? QUIET_MS)) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0), sum = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const u of usage.values()) { sum.input += n(u.input_tokens); sum.cacheWrite += n(u.cache_creation_input_tokens); sum.cacheRead += n(u.cache_read_input_tokens); sum.output += n(u.output_tokens); }
  const cost = total !== undefined && t.spentIn === t.sessionId && t.spent !== undefined ? Math.round(Math.max(0, total - t.spent) * 1e6) / 1e6 : undefined;
  const reply: ChatMessage & { spentTotal?: number } = { role: 'assistant', text: `${texts.join('\n\n')}\n\n${RECOVERED_NOTE}`, time: lastTime, tools, status: 'done', notice: { kind: 'recovered' }, usage: { ...sum, ...(cost !== undefined ? { cost } : {}) } };
  if (total !== undefined) reply.spentTotal = total;
  return reply;
}

/** The thread with a recovered reply put in (an empty interrupted one replaced); null when there is nothing to recover. */
export function withRecovered(t: ChatThread, o: { home?: string; now?: number; quietMs?: number } = {}): ChatThread | null {
  const reply = recoverReply(t, o);
  if (!reply) return null;
  const msgs = t.messages.at(-1)?.role === 'assistant' ? t.messages.slice(0, -1) : [...t.messages];
  // the session's running cost moves on with it (the next reply's price is measured from here)
  const { spentTotal, ...clean } = reply as ChatMessage & { spentTotal?: number };
  return { ...t, messages: [...msgs, clean], ...(spentTotal !== undefined ? { spent: spentTotal, spentIn: t.sessionId } : {}) };
}
