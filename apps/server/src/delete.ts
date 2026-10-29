// Deleting a project for good (spec 2026-10-20-home-gallery-refresh §5): the home page asks what goes with it first, and a project
// Claude, a job or an analysis is working on is refused. The folder is renamed away first: on Windows a file another program holds
// fails the rename, which leaves the project whole, instead of a delete that stops halfway.
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isTerminal } from '@tellcut/protocol';
import { lockHolder, PROJECT_ID } from '@tellcut/media-node';
import { HttpError, sendJson, type Router } from './http.ts';
import type { ProjectStore } from './projects.ts';
import type { JobQueue } from './jobs.ts';
import type { ChatRunner } from './chat/runner.ts';

function files(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) { const f = join(dir, e.name); if (e.isDirectory()) files(f, out); else out.push(f); }
  return out;
}

/** the finished films: the editor's exports/ and the command line's output/ (any depth); an interrupted export's .video.mp4 is not one */
export const countVideos = (dir: string) => ['exports', 'output'].flatMap((d) => files(join(dir, d))).filter((f) => /\.mp4$/i.test(f) && !/\.video\.mp4$/i.test(f)).length;

export const countFx = (dir: string) => existsSync(join(dir, 'fx')) ? readdirSync(join(dir, 'fx')).filter((f) => /\.m?js$/.test(f)).length : 0;

/** Work on a project the job queue does not list (an import converting HEICs into media/, a preset saved from it drawing its
 *  poster): a delete under it would leave the folder to be recreated, half, by the work's next write. */
export class ProjectHolds {
  private held = new Map<string, string[]>();
  /** returns the release (calling it again does nothing) */
  hold(id: string, label: string): () => void {
    const k = id.toLowerCase(), list = this.held.get(k) ?? [];   // NTFS: Demo and demo are one folder
    list.push(label); this.held.set(k, list);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const l = this.held.get(k) ?? [], i = l.indexOf(label);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) this.held.delete(k);
    };
  }
  /** what holds it, or null */
  label(id: string): string | null { return this.held.get(id.toLowerCase())?.[0] ?? null; }
}

export interface Busy { text: string; code: string; params?: Record<string, string> }
/** why the project cannot go now, in words (and as a code the page words in its language); null when nothing is working on it */
export function projectBusy(id: string, dir: string, o: { queue: JobQueue; chat: ChatRunner; holds?: ProjectHolds }): Busy | null {
  if (o.chat.busyWith(id)) return { text: 'Agent 正在處理這個專案（對話還在回覆中），等它回完再刪', code: 'delete.busyChat' };
  const job = o.queue.list().find((j) => j.project.toLowerCase() === id.toLowerCase() && !isTerminal(j.status));
  const label = job?.label ?? o.holds?.label(id);
  if (label) return { text: `這個專案還有工作在進行（${label}），等它結束或取消後再刪`, code: 'delete.busyJob', params: { label } };
  // an analysis the command line runs (npm run tellcut -- inspect) holds a lock the server's queue does not know of
  if (files(join(dir, 'cache')).some((f) => f.endsWith('.lock') && lockHolder(f))) return { text: '這個專案正在分析素材，等分析完再刪', code: 'delete.busyAnalysis' };
  return null;
}

/** Renames the project away, then removes it. A failed rename (a file in use) changes nothing; a failed removal after it leaves
 *  the .deleting- folder to the next start's cleanup (cleanup.ts). */
export function removeProject(root: string, id: string, ops: { renameSync: typeof renameSync; rmSync: typeof rmSync } = { renameSync, rmSync }): void {
  const away = join(root, `.deleting-${id}-${process.pid}-${Date.now()}`);
  try { ops.renameSync(join(root, id), away); }
  catch { throw new HttpError(409, '有檔案正被別的程式使用（例如播放器開著這個專案的影片），關掉後再試', { code: 'delete.locked' }); }
  try { ops.rmSync(away, { recursive: true, force: true }); } catch { /* gone from the list already; cleanup finishes it */ }
}

export function deleteRoutes(r: Router, store: ProjectStore, o: { queue: JobQueue; chat: ChatRunner; holds?: ProjectHolds; live: { forget(id: string): void } }) {
  const guard = (id: string) => { if (id.startsWith('_') || !PROJECT_ID.test(id)) throw new HttpError(400, '這個資料夾不能刪', { code: 'delete.forbidden' }); return store.dir(id); };
  r.get('/api/projects/:id/delete-preview', (_req, res, { id }) => {
    const dir = guard(id);
    const busy = projectBusy(id, dir, o);
    sendJson(res, 200, { videos: countVideos(dir), fx: countFx(dir), busy: busy?.text ?? null, ...(busy ? { busyCode: { code: busy.code, ...(busy.params ? { params: busy.params } : {}) } } : {}) });
  });
  r.del('/api/projects/:id', (_req, res, { id }) => {
    const dir = guard(id), busy = projectBusy(id, dir, o);
    if (busy) throw new HttpError(409, busy.text, { code: busy.code, ...(busy.params ? { params: busy.params } : {}) });
    o.live.forget(id);   // its folder watchers would hold the folder open (the rename fails on Windows)
    removeProject(store.root, id);
    store.forget(id);
    sendJson(res, 200, { ok: true });
  });
}
