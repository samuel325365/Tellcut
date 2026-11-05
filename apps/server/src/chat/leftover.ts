// A claude an earlier server left running: the server stopped mid-turn (a restart, a crash), and claude went on with the work.
// The session log alone cannot say whether it still runs: a foreground command (a render, an analysis) writes nothing to it for
// up to BASH_MAX_TIMEOUT_MS, and a new turn resumed the same session beside it. So each turn notes the process it started beside
// its thread (<chat>.claude), and a later server counts that turn as running while that very process is alive. A pid alone is
// not enough (Windows soon hands it to another program): the live process must have started before the note was written.
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAlive, processStarted } from '@tellcut/media-node';
import { QUIET_MS, sessionLog } from './recover.ts';

/** the process a turn started (the shell, and claude below it), when (ms) and in which session */
export interface ClaudeNote { pid: number; at: number; session: string }
/** how a process is looked at (a test's stand-in: fake processes); `started` may answer at once or later */
export interface Liveness { alive(pid: number): boolean; started(pid: number): number | null | Promise<number | null> }
export const LIVENESS: Liveness = { alive: isAlive, started: (pid) => processStarted(pid) };
export type Verdict = 'same' | 'unknown' | 'gone';

/** ps tells a start to the second, and the clock may have been set a little meanwhile */
const SLACK = 2000;

export const noteFile = (chat: string) => `${chat}.claude`;

export function writeNote(chat: string, n: ClaudeNote) {
  try { writeFileSync(noteFile(chat), JSON.stringify(n)); } catch { /* not kept: a later server goes by the session log, as before */ }
}

export function readNote(chat: string): ClaudeNote | null {
  try {
    const n = JSON.parse(readFileSync(noteFile(chat), 'utf8'));
    return Number.isInteger(n?.pid) && n.pid > 0 && typeof n.at === 'number' && typeof n.session === 'string' ? n : null;
  } catch { return null; }
}

/** removed when it still names `pid` (a later turn's note stays) */
export function clearNote(chat: string, pid: number) {
  if (readNote(chat)?.pid === pid) try { rmSync(noteFile(chat), { force: true }); } catch { /* left: judged again, and gone by then */ }
}

/** 'same': alive and started before the note (that very process); 'unknown': alive, its start cannot be told; 'gone' */
export function judge(n: ClaudeNote, l: { alive(pid: number): boolean; started(pid: number): number | null }): Verdict {
  if (!l.alive(n.pid)) return 'gone';
  return byStart(n, l.started(n.pid));
}
const byStart = (n: ClaudeNote, t: number | null): Verdict => (t === null ? 'unknown' : t <= n.at + SLACK ? 'same' : 'gone');

/**
 * What each noted process was found to be, by pid and note time. Its start is asked once (PowerShell on Windows, a few tenths of
 * a second or more), without blocking the server: 'pending' until the answer is in, which `ready` waits for. Then only whether it
 * still lives is looked at: a pid is not reused while its process lives, so a live one stays what it was and a gone one gone.
 */
export class Verdicts {
  private known = new Map<string, Verdict>();
  private asking = new Map<string, Promise<void>>();
  constructor(private l: Liveness) {}

  of(n: ClaudeNote): Verdict | 'pending' {
    const key = `${n.pid}@${n.at}`, v = this.known.get(key);
    if (v === 'gone') return v;
    if (!this.l.alive(n.pid)) { this.known.set(key, 'gone'); this.asking.delete(key); return 'gone'; }
    if (v) return v;
    if (!this.asking.has(key)) {
      const t = this.l.started(n.pid);
      if (!(t instanceof Promise)) { this.known.set(key, byStart(n, t)); return this.known.get(key)!; }
      const done = t.then((x) => byStart(n, x), (): Verdict => 'unknown').then((x) => {
        if (this.asking.get(key) === done) { this.asking.delete(key); if (!this.known.has(key)) this.known.set(key, x); }
      });
      this.asking.set(key, done);
    }
    return 'pending';
  }

  /** waits until `n`'s process is judged (at once when it already is) */
  async ready(n: ClaudeNote): Promise<void> {
    if (this.of(n) === 'pending') await this.asking.get(`${n.pid}@${n.at}`);
  }
}

/** A live process whose start cannot be told counts as the turn while the turn could still be at work by the old measure: its
 *  session log (or the note, before claude wrote any) written within QUIET_MS. */
export function recentlyActive(n: ClaudeNote, now = Date.now(), home?: string): boolean {
  let t = n.at;
  const log = sessionLog(n.session, home);
  if (log) try { t = Math.max(t, statSync(log).mtimeMs); } catch { /* gone: the note's time */ }
  return now - t < QUIET_MS;
}
