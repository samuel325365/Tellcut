// In-process job queue (spec §6.2): at most `concurrency` running, status/progress/log tail, cancellation, SSE.
import { EventEmitter } from 'node:events';
import { isTerminal, type JobInfo, type JobStatus } from '@tellcut/protocol';
import { HttpError, sendJson, type Router } from './http.ts';

export { isTerminal, type JobInfo, type JobStatus };
export interface JobCtx { signal: AbortSignal; progress(p: number, message?: string): void; log(line: string): void }
export type JobRun = (ctx: JobCtx) => Promise<unknown>;

const LOG_KEEP = 200, FINISHED_KEEP = 100;
/** What clients see: the log trimmed to its last 20 lines. */
export const publicInfo = (j: JobInfo): JobInfo => ({ ...j, log: j.log.slice(-20) });

export class JobQueue extends EventEmitter {
  private jobs = new Map<string, { info: JobInfo; run: JobRun; ac: AbortController }>();
  private waiting: string[] = [];
  private running = 0;
  private seq = 0;
  constructor(private concurrency = 2) { super(); this.setMaxListeners(0); }

  /** background: starts at once and takes no slot (sheets, transcripts, beats wait in their own limiter, spec 2026-10-14 §7),
   *  so a long transcription never holds up an export or a source analysis queued after it. */
  add(kind: string, project: string, label: string, run: JobRun, o: { background?: boolean } = {}): JobInfo {
    const id = `${kind}-${Date.now().toString(36)}-${++this.seq}`;
    const info: JobInfo = { id, kind, project, label, status: 'queued', progress: 0, message: '', log: [], created: Date.now() };
    this.jobs.set(id, { info, run, ac: new AbortController() });
    this.changed(info);
    if (o.background) this.start(id, false);
    else { this.waiting.push(id); this.pump(); }
    return info;
  }
  get(id: string) { return this.jobs.get(id)?.info; }
  list(): JobInfo[] { return [...this.jobs.values()].map((j) => j.info).sort((a, b) => b.created - a.created || b.id.localeCompare(a.id)); }
  active(kind: string, project?: string) { return this.list().filter((j) => j.kind === kind && (!project || j.project === project) && !isTerminal(j.status)); }

  cancel(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    if (j.info.status === 'queued') { this.waiting = this.waiting.filter((x) => x !== id); this.finish(j.info, 'cancelled'); }
    else if (j.info.status === 'running') j.ac.abort();
    return true;
  }
  cancelAll() { for (const id of [...this.jobs.keys()]) this.cancel(id); }

  wait(id: string): Promise<JobInfo> {
    const j = this.get(id);
    if (!j) return Promise.reject(new Error(`No job "${id}"`));
    if (isTerminal(j.status)) return Promise.resolve(j);
    return new Promise((ok) => {
      const on = (x: JobInfo) => { if (x.id === id && isTerminal(x.status)) { this.off('change', on); ok(x); } };
      this.on('change', on);
    });
  }

  private pump() {
    while (this.running < this.concurrency && this.waiting.length) this.start(this.waiting.shift()!, true);
  }
  private start(id: string, counted: boolean) {
    const j = this.jobs.get(id)!;
    if (counted) this.running++;
    Object.assign(j.info, { status: 'running', started: Date.now() });
    this.changed(j.info);
    const ctx: JobCtx = {
      signal: j.ac.signal,
      progress: (p, m) => { j.info.progress = Math.max(0, Math.min(1, p)); if (m !== undefined) j.info.message = m; this.changed(j.info); },
      log: (line) => { j.info.log.push(line); if (j.info.log.length > LOG_KEEP) j.info.log.splice(0, j.info.log.length - LOG_KEEP); this.changed(j.info); },
    };
    Promise.resolve().then(() => j.run(ctx)).then(
      (result) => { if (j.ac.signal.aborted) this.finish(j.info, 'cancelled'); else { j.info.result = result; j.info.progress = 1; this.finish(j.info, 'done'); } },
      (e) => (j.ac.signal.aborted ? this.finish(j.info, 'cancelled') : this.finish(j.info, 'failed', String((e as Error)?.message ?? e))),
    ).finally(() => { if (counted) { this.running--; this.pump(); } });
  }
  private finish(info: JobInfo, status: JobStatus, error?: string) {
    Object.assign(info, { status, finished: Date.now() }, error ? { error } : {});
    this.changed(info);
    const done = this.list().filter((x) => isTerminal(x.status));
    for (const old of done.slice(FINISHED_KEEP)) this.jobs.delete(old.id);
  }
  private changed(info: JobInfo) { this.emit('change', info); }
}

export function jobRoutes(r: Router, queue: JobQueue) {
  const need = (id: string) => { const j = queue.get(id); if (!j) throw new HttpError(404, `No job "${id}"`); return j; };
  r.get('/api/jobs', (_req, res) => sendJson(res, 200, queue.list().map(publicInfo)));
  r.get('/api/jobs/:id', (_req, res, { id }) => sendJson(res, 200, publicInfo(need(id))));
  r.del('/api/jobs/:id', (_req, res, { id }) => { need(id); queue.cancel(id); sendJson(res, 200, { ok: true }); });
  r.get('/api/jobs/:id/events', (req, res, { id }) => {
    const first = need(id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const off = () => { queue.off('change', on); };
    const send = (j: JobInfo) => { res.write(`data: ${JSON.stringify(publicInfo(j))}\n\n`); if (isTerminal(j.status)) { off(); res.end(); } };
    const on = (j: JobInfo) => { if (j.id === id) send(j); };
    queue.on('change', on);
    req.on('close', off);
    res.on('close', off);
    send(first);
  });
}
