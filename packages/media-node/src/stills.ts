// Stills of a project version that is not saved (a proposal, spec 2026-10-15-proposals-magnetic §6): a snapshot next to
// project.json, its clips cut into the cache, frames captured by the player — the export's path, a few frames only.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project, Registry } from '@tellcut/engine';
import { ffmpeg } from './ffmpeg.ts';
import { prepareProject } from './prepare.ts';
import { openPage, playerUrl, sitePath, type PageHost, type PageSession } from './render.ts';

/** tells apart the snapshots of pages one process opens at once (golden draws several cases side by side) */
let opened = 0;

/** The name part of a snapshot (`.export-<stamp>.json`, `cache/index-<stamp>.json`): the writing process id comes last, so
 *  the server's start-up cleanup (apps/server cleanup.ts, SNAPSHOT_FILE / SNAPSHOT_INDEX) can tell a dead process's leftover.
 *  `n` tells apart snapshots one process has open at once. */
export function snapshotStamp(n?: number, pid = process.pid, now = Date.now()): string {
  return `${now.toString(36)}${n === undefined ? '' : `_${n}`}-${pid}`;
}
/** a snapshot next to project.json and its index in cache/, made with snapshotStamp; group 1 is the writing process id */
export const SNAPSHOT_FILE = /^\.export-\w+-(\d+)\.json$/;
export const SNAPSHOT_INDEX = /^index-\w+-(\d+)\.json$/;

/** The player on a snapshot of `project` (its media cut into the cache first), for `use`; everything is cleaned up after.
 *  `host`: a Chrome to open the page in (openPage's), instead of one started for it. */
export async function withProjectPage<T>(o: { dir: string; project: Project; registry: Registry; log?: (s: string) => void; host?: PageHost }, use: (s: PageSession) => Promise<T>): Promise<T> {
  const stamp = snapshotStamp(opened++);
  const snap = join(o.dir, `.export-${stamp}.json`), indexRel = `cache/index-${stamp}.json`;
  writeFileSync(snap, JSON.stringify(o.project));
  try {
    await prepareProject(o.dir, o.registry, { project: o.project, indexFile: indexRel, log: o.log ?? (() => {}) });
    const s = await openPage(playerUrl({ project: `${sitePath(o.dir)}/.export-${stamp}.json`, media: 'cache', index: indexRel }), '__tellcut',
      { size: { w: o.project.meta.width, h: o.project.meta.height }, host: o.host });   // the project's size: no page just to measure it
    try { return await use(s); } finally { await s.close(); }
  } finally {
    rmSync(snap, { force: true });
    rmSync(join(o.dir, indexRel), { force: true });
  }
}

/** maxSide: scale each still down so its long side is at most this (the chat's `frames`: an image costs ⌈w/28⌉×⌈h/28⌉
 *  tokens and Claude 4.7+ keeps up to 2576 px / 4784 tokens unscaled, so 1080×1920 ≈ 2,691 tokens and 540×960 ≈ 700 —
 *  about 4 times less, and the small one shows layout, cuts and captions as well) */
export async function renderStills(o: { dir: string; project: Project; times: number[]; registry: Registry; outDir: string; tag: string; maxSide?: number; log?: (s: string) => void }): Promise<string[]> {
  mkdirSync(o.outDir, { recursive: true });
  const { width: W, height: H } = o.project.meta, scale = o.maxSide && Math.max(W, H) > o.maxSide ? o.maxSide / Math.max(W, H) : 1;
  return withProjectPage(o, async (s) => {
    const out: string[] = [];
    for (const t of o.times) {
      await s.frame(Math.round(t * s.fps));
      const f = join(o.outDir, `${o.tag}-t${t.toFixed(2)}.png`);
      if (scale === 1) writeFileSync(f, await s.png());
      else {
        const full = `${f}.${process.pid}.full.png`;   // pid: two runs on the same time don't share the capture
        writeFileSync(full, await s.png());
        try { await ffmpeg(['-i', full, '-vf', `scale=${Math.round(W * scale / 2) * 2}:-2:flags=lanczos`, f]); } finally { rmSync(full, { force: true }); }
      }
      out.push(f);
    }
    return out;
  });
}
