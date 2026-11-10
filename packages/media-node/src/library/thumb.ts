// A saved block's preview film and thumbnail (spec 2026-10-29-my-library §3.4, §4.2): the block alone over a plain ground,
// as the gallery shows the shared blocks, its module loaded from the entry's own folder.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_MIX, type Plugin, type Project } from '@tellcut/engine';
import { renameRetry } from '../fsutil.ts';
import { projectRegistry } from '../fx.ts';
import { renderStills } from '../stills.ts';
import { blockDir, blocksDir, readBlock, type BlockEntry } from './store.ts';

export const PREVIEW_LEN = 3;
export const THUMB_FILE = 'thumb.png';

/** 1080×1920, 3 s, one item; `theme` replaces the one saved with the entry */
export function previewProject(e: BlockEntry, type: string, kind: 'scene' | 'overlay', o: { params?: Record<string, unknown>; theme?: unknown } = {}): Project {
  const theme = o.theme ?? e.theme;
  return {
    version: 1,
    meta: { name: type, width: 1080, height: 1920, fps: 30, duration: PREVIEW_LEN, plugins: ['fx'], background: '#3a4256', mix: DEFAULT_MIX, fx: [e.main], ...(theme ? { theme } : {}) },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'g', kind, items: [{ id: 'block', type, start: 0, end: PREVIEW_LEN, params: o.params ?? {} }] }],
  } as unknown as Project;
}

/** runs jobs one at a time (each thumbnail starts a headless Chrome: saving a preset with several blocks asked for them all at
 *  once); a key already waiting is not queued again (the job reads the entry when it starts, so it draws the newest version), while
 *  one asked for during its own run is queued after it */
export function serialQueue() {
  const waiting = new Map<string, Promise<unknown>>();
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(key: string, job: () => Promise<T>): Promise<T> => {
    const w = waiting.get(key);
    if (w) return w as Promise<T>;
    const p = tail.then(() => { waiting.delete(key); return job(); });
    waiting.set(key, p);
    tail = p.catch(() => {});
    return p;
  };
}
const thumbs = serialQueue();

/** draws the entry's first block halfway into thumb.png; a failure (no Chrome, a block that throws) is only a warning: the card shows an icon */
export function makeThumb(root: string, slug: string, plugins: Plugin[]): Promise<string | null> {
  return thumbs(`${root}\0${slug}`, () => drawThumb(root, slug, plugins));
}

async function drawThumb(root: string, slug: string, plugins: Plugin[]): Promise<string | null> {
  const e = readBlock(root, slug), dir = blockDir(root, slug);
  if (!e) return null;
  // drawn from a copy of the entry in a folder of this job's own (a dot name: listLibrary skips it), where the stills' cache/ goes
  // too: a save putting a new version in place meanwhile, or another process drawing the same entry, never meets this job's files
  const job = join(blocksDir(root), `.${slug}.thumb-${process.pid}-${Date.now()}`);
  try {
    for (const f of e.files) { mkdirSync(dirname(join(job, f)), { recursive: true }); copyFileSync(join(dir, f), join(job, f)); }
    const first = await projectRegistry(job, plugins, { meta: { fx: [e.main] } });
    const t = first.registry.item(e.types[0].type);
    if (!t) throw new Error(first.fx.errors[0]?.message ?? `${e.types[0].type} did not load`);
    const project = previewProject(e, t.type, t.kind);
    const [f] = await renderStills({ dir: job, project, times: [PREVIEW_LEN / 2], registry: first.registry, outDir: join(job, 'out'), tag: 'thumb', maxSide: 640 });
    renameRetry(f, join(dir, THUMB_FILE));
    return join(dir, THUMB_FILE);
  } catch (err) {
    console.warn(`library thumbnail ${slug}: ${(err as Error).message}`);
    return null;
  } finally {
    rmSync(job, { recursive: true, force: true });
  }
}
