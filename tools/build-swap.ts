// A vite build moved into the dist a running server serves without pulling it from under the pages using it. vite's own build
// empties dist first and writes it again over seconds, so a page loaded meanwhile (the editor in the browser, a check or an export
// opening the player) got 404s. Here the build goes into a folder of its own under .cache/, under a lock (one build of an app at a
// time), and each file is then moved into dist on its own, index.html last: a page loads either build whole. The files the build
// before made stay for pages already open on it (a page fetched the old index.html a moment ago and asks for its chunks now);
// older ones go. media-node's rebuildPlayer (check's own rebuild, npm run build:player) moves the player the same way.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
// the files alone, not the package: a build tool has no need of all of media-node
import { renameRetry, replaceFile } from '../packages/media-node/src/fsutil.ts';
import { withLock } from '../packages/media-node/src/locks.ts';

/** what each move records in dist: the files that build made (index.html and the record itself left out) */
export const RECORD = '.build.json';

/** every file under `dir`, relative to it with `/` */
export const filesUnder = (dir: string, sub = ''): string[] =>
  existsSync(join(dir, sub)) ? readdirSync(join(dir, sub), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(dir, `${sub}${e.name}/`) : [`${sub}${e.name}`])) : [];
const same = (a: string, b: string) => existsSync(b) && statSync(a).size === statSync(b).size && readFileSync(a).equals(readFileSync(b));

/** Moves the build in `out` into `dist`: every new or changed file first (one already there with the same bytes stays as it is),
 *  index.html last and always (its time is what tells the build fresh, media-node staleness.ts); then removes the files of dist
 *  that neither this build nor the one before made. With no record of the build before (the first move, or a dist vite emptied)
 *  nothing is known to be old and nothing is removed; the next move removes what is left. `rename` is for tests. */
export function moveBuildInto(out: string, dist: string, o: { rename?: (from: string, to: string) => void } = {}): { moved: string[]; removed: string[] } {
  const record = join(dist, RECORD);
  let before: string[] | null = null;
  try { before = JSON.parse(readFileSync(record, 'utf8')); } catch { /* no record yet: nothing is known to be old */ }
  const made = filesUnder(out).filter((f) => f !== 'index.html' && f !== RECORD);
  const moved: string[] = [], removed: string[] = [];
  for (const f of [...made, 'index.html']) {
    if (f !== 'index.html' && same(join(out, f), join(dist, f))) continue;
    mkdirSync(dirname(join(dist, f)), { recursive: true });
    renameRetry(join(out, f), join(dist, f), o.rename ?? renameSync);
    moved.push(f);
  }
  if (before) {
    const keep = new Set([...made, ...before, 'index.html', RECORD]);
    for (const f of filesUnder(dist).filter((f) => !keep.has(f))) {
      try { rmSync(join(dist, f), { force: true }); removed.push(f); } catch { /* open: the next build takes it */ }
    }
  }
  replaceFile(record, JSON.stringify(made));
  return { moved, removed };
}

/** `apps/<app>` built by `build(out)` (null when it built, else why not) into `.cache/<app>-build-<pid>/`, under the lock
 *  `.cache/<app>-build.lock`, and moved into `apps/<app>/dist` (moveBuildInto). null when it is in, else why not; a build that
 *  fails leaves the dist in use as it was. The build folder is removed either way. */
export async function swapBuild(o: { root: string; app: string; build: (out: string) => string | null }): Promise<string | null> {
  const cache = join(o.root, '.cache'), dist = join(o.root, 'apps', o.app, 'dist');
  mkdirSync(cache, { recursive: true });
  return withLock(join(cache, `${o.app}-build.lock`), async () => {
    const out = join(cache, `${o.app}-build-${process.pid}`);
    rmSync(out, { recursive: true, force: true });
    try {
      const failed = o.build(out);
      if (failed !== null) return failed;
      if (!existsSync(join(out, 'index.html'))) return `建置結果沒有 index.html：${out}`;
      moveBuildInto(out, dist);
      return null;
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
}
