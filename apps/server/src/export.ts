// Export jobs (spec §7): snapshot → cut clips → frame capture → mix → exports/<name>-<YYYYMMDD-HHmm>.mp4 (+ .log).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Project, Registry } from '@tellcut/engine';
import { listExports, nextExportBase, prepareProject, refreshCredits, renderVideo, sitePath } from '@tellcut/media-node';
import { HttpError, readJson, sendJson, type Router } from './http.ts';
import type { JobCtx, JobQueue } from './jobs.ts';
import type { ProjectStore } from './projects.ts';

const BodyZ = z.object({ from: z.number().min(0).optional(), to: z.number().positive().optional() }).strict();

export async function runExport(o: { dir: string; id: string; project: Project; from?: number; to?: number; registry: Registry; ctx: JobCtx }) {
  const { dir, project, ctx } = o;
  const exportsDir = join(dir, 'exports');
  mkdirSync(exportsDir, { recursive: true });
  const base = nextExportBase(dir, project.meta.name, o.id);
  const tag = `${Date.now().toString(36)}-${process.pid}`;
  const snap = join(dir, `.export-${tag}.json`), indexRel = `cache/index-${tag}.json`;
  const lines: string[] = [];
  const log = (l: string) => { lines.push(l); ctx.log(l); };
  const t0 = Date.now();
  try {
    log(`export ${o.id} ${o.from ?? 0}–${o.to ?? project.meta.duration} s`);
    writeFileSync(snap, JSON.stringify(project));
    ctx.progress(0, 'prepare');
    await prepareProject(dir, o.registry, { project, indexFile: indexRel, signal: ctx.signal, log,
      onProgress: (d, n) => ctx.progress(0.25 * (n ? d / n : 1), `prepare ${d}/${n}`) });
    await renderVideo({
      target: { project: `${sitePath(dir)}/.export-${tag}.json`, media: 'cache', index: indexRel },
      out: `${base}.mp4`, from: o.from, to: o.to, signal: ctx.signal, log,
      onProgress: (f, n) => ctx.progress(0.25 + 0.7 * (f / n), `frame ${f}/${n}`),
    });
    const seconds = +((Date.now() - t0) / 1000).toFixed(1);
    log(`done in ${seconds} s`);
    // the credits of what this film uses; a credits file that cannot be written must not fail the export
    try { if (refreshCredits(dir, { project })) log('credits → media/CREDITS.md'); } catch (e) { log(`credits not written: ${(e as Error).message}`); }
    const rel = (p: string) => `exports/${p.slice(exportsDir.length + 1)}`;
    return { file: rel(`${base}.mp4`), log: rel(`${base}.log`), seconds };
  } catch (e) {
    log(ctx.signal.aborted ? 'cancelled' : `failed: ${(e as Error)?.message ?? e}`);
    throw e;
  } finally {
    writeFileSync(`${base}.log`, lines.join('\n') + '\n');
    rmSync(snap, { force: true });
    rmSync(join(dir, indexRel), { force: true });
  }
}

/** `registryFor`: the registry of one project (the shared plugins plus its own fx) and the fx that did not load */
export function exportRoutes(r: Router, store: ProjectStore, queue: JobQueue, registryFor: (dir: string, project: Project) => Promise<{ registry: Registry; fxErrors: Array<{ path: string; message: string }> }>) {
  r.post('/api/projects/:id/export', async (req, res, { id }) => {
    const parsed = BodyZ.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid export range', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const dir = store.dir(id), project = store.read(id);   // the snapshot: edits after this point do not affect the export
    const { from, to } = parsed.data, d = project.meta.duration;
    if ((to ?? d) > d + 1e-6 || (from ?? 0) >= (to ?? d)) throw new HttpError(400, `Invalid export range ${from ?? 0}–${to ?? d} s (project is ${d} s)`);
    if (queue.active('export').length) throw new HttpError(409, 'An export is already queued or running');
    const range = from !== undefined || to !== undefined ? ` ${from ?? 0}–${to ?? d} s` : '';
    sendJson(res, 202, queue.add('export', id, `${project.meta.name}${range}`, async (ctx) => {
      // an effect that does not load would be left out of the film (or fail deep in the player): say which, before rendering
      const { registry, fxErrors } = await registryFor(dir, project);
      if (fxErrors.length) throw new Error(`專案的效果載入失敗：${fxErrors.map((e) => `${e.path}：${e.message}`).join('；')}`);
      return runExport({ dir, id, project, from, to, registry, ctx });
    }));
  });
  r.get('/api/projects/:id/exports', (_req, res, { id }) => {
    const d = join(store.dir(id), 'exports');
    sendJson(res, 200, listExports(store.dir(id)).map(({ name: f, size, mtime }) => {
      const logName = f.replace(/\.mp4$/, '.log');
      return { file: `exports/${f}`, url: `/api/projects/${encodeURIComponent(id)}/files/exports/${encodeURIComponent(f)}`, size, mtime,
        log: existsSync(join(d, logName)) ? `exports/${logName}` : null };
    }));
  });
}
