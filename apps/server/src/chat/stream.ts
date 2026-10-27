// Headless Claude Code's stream-json, line by line, as chat events (spec 2026-10-16-in-editor-chat §3.3). Shapes measured
// on Claude Code 2.1.281 (plan 18 "實測"): text deltas, tool_use blocks, permission_denied, result.
import { basename } from 'node:path';
import type { ChatErrorCode, ChatEvent, ChatTool, Usage } from '@tellcut/protocol';

export type { ChatEvent, ChatTool, Usage };

/** result.usage as measured on Claude Code 2.1.x: { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens, … } */
export function usageOf(result: any): Usage | undefined {
  const u = result?.usage;
  if (!u || typeof u !== 'object') return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { input: n(u.input_tokens), cacheWrite: n(u.cache_creation_input_tokens), cacheRead: n(u.cache_read_input_tokens), output: n(u.output_tokens) };
}

const GAP = '\n\n';
const NOT_LOGGED_IN ='Claude Code 還沒登入：請在終端機執行 claude 並登入';
export const NOT_FOUND = '找不到 claude 指令：請先安裝 Claude Code（npm install -g @anthropic-ai/claude-code）';
/** a failure as the done event carries it: the Chinese words, and the code and raw cause the page words it from */
export type Failure = { error: string; code?: ChatErrorCode; detail?: string };
const loginTrouble = (s: string) => /\/login|not logged in|log ?in|authenticat|invalid api key/i.test(s);

export function toolOf(name: string, input: any): ChatTool {
  if (name === 'Bash' || name === 'PowerShell') { const c = String(input?.command ?? ''); return { kind: 'run', verb: 'run', arg: c.slice(0, 80), label: `執行：${c.slice(0, 80)}`, detail: c }; }
  if (name === 'Read') { const f = String(input?.file_path ?? ''), n = basename(f.replace(/\\/g, '/')); return { kind: 'read', verb: 'read', arg: n, label: `讀取：${n}`, detail: f }; }
  if (name === 'Write' || name === 'Edit') { const f = String(input?.file_path ?? ''), n = basename(f.replace(/\\/g, '/')); return { kind: 'write', verb: 'write', arg: n, label: `寫入：${n}`, detail: f }; }
  if (name === 'Glob') { const g = String(input?.pattern ?? ''); return { kind: 'read', verb: 'list', arg: g.slice(0, 80), label: `列出：${g.slice(0, 80)}`, detail: g }; }
  return { kind: 'other', label: name, detail: JSON.stringify(input ?? {}) };
}

export class StreamParser {
  private text = '';
  private ended = false;
  /** claude got as far as starting the session (it exists from here on, so the next message resumes it) */
  initialized = false;
  private calls = new Map<string, ChatTool>();

  push(line: string): ChatEvent[] {
    let e: any;
    try { e = JSON.parse(line); } catch { return []; }
    if (e?.type === 'system' && e.subtype === 'init') { this.initialized = true; return []; }
    // a new text block after earlier text (before or after tool calls): keep both, a blank line apart
    if (e?.type === 'stream_event' && e.event?.type === 'content_block_start' && e.event.content_block?.type === 'text' && this.text && !this.text.endsWith(GAP)) {
      this.text += GAP;
      return [{ type: 'text', delta: GAP }];
    }
    if (e?.type === 'stream_event' && e.event?.type === 'content_block_delta' && e.event.delta?.type === 'text_delta') {
      const d = String(e.event.delta.text ?? '');
      this.text += d;
      return d ? [{ type: 'text', delta: d }] : [];
    }
    if (e?.type === 'assistant' && Array.isArray(e.message?.content)) {
      const out: ChatEvent[] = [];
      for (const c of e.message.content) if (c?.type === 'tool_use') {
        const tool = toolOf(String(c.name), c.input);
        this.calls.set(String(c.id), tool);
        out.push({ type: 'tool', tool });
      }
      return out;
    }
    if (e?.type === 'system' && e.subtype === 'permission_denied') {
      const call = this.calls.get(String(e.tool_use_id));
      const what = call ? call.detail.slice(0, 80) || call.label : String(e.tool_name);
      return [{ type: 'tool', tool: { kind: 'denied', verb: 'denied', arg: what, label: `已拒絕：${what}`, detail: String(e.message ?? '') } }];
    }
    if (e?.type === 'result') {
      // one process can give several results: a notice left from the last turn (a background command that stopped) is answered
      // first, then the user's message. So a result does not end the turn — the process ending does (finish); they add up.
      this.results++;
      const usage = usageOf(e);
      if (usage) { this.hasUsage = true; for (const k of ['input', 'cacheWrite', 'cacheRead', 'output'] as const) this.usage[k] += usage[k]; }
      // Claude Code's cost is the process's running total
      if (typeof e.total_cost_usd === 'number' && Number.isFinite(e.total_cost_usd)) this.cost = Math.max(this.cost ?? 0, e.total_cost_usd);
      if (!this.text && typeof e.result === 'string') this.lastResult = e.result;
      if (e.is_error || e.subtype !== 'success') { const why = String(e.result ?? e.subtype ?? 'error'); this.error = loginTrouble(why) ? { error: NOT_LOGGED_IN, code: 'chat.notLoggedIn', detail: why } : { error: why }; }
      else this.error = undefined;
    }
    return [];
  }

  private results = 0;
  private usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  private hasUsage = false;
  private cost: number | undefined;
  private lastResult = '';
  private error: Failure | undefined;

  /**
   * The process ended: the turn's reply (all its results together), or — without any result — a failure (no claude, no login,
   * or whatever stderr says).
   */
  finish(code: number | null, stderr: string): ChatEvent[] {
    if (this.ended) return [];
    this.ended = true;
    if (this.results) {
      const usage = this.hasUsage || this.cost !== undefined ? { usage: { ...this.usage, ...(this.cost !== undefined ? { cost: this.cost } : {}) } } : {};
      // result.result is only the last message's text: what streamed is the whole reply
      if (this.error) return [{ type: 'done', status: 'error', text: this.text, ...this.error, ...usage }];
      return [{ type: 'done', status: 'done', text: this.text || this.lastResult, ...usage }];
    }
    const tail = stderr.trim().split(/\r?\n/).slice(-5).join('\n');
    const f: Failure = code === 9009 || code === 127 || /not recognized|not found|ENOENT/i.test(stderr) ? { error: NOT_FOUND, code: 'chat.notFound' }
      : loginTrouble(stderr) ? { error: NOT_LOGGED_IN, code: 'chat.notLoggedIn', detail: tail }
      : tail ? { error: tail } : { error: `claude 結束（代碼 ${code}）`, code: 'chat.exited', detail: String(code) };
    return [{ type: 'done', status: 'error', text: this.text, ...f }];
  }

  /** Text received so far (a stopped turn keeps it). */
  get partial() { return this.text; }
}
