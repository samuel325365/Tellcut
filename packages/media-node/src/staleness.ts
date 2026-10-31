// The player that renders checks, stills and exports is a build (apps/player/dist); after a block or the engine changes it must be rebuilt,
// or pictures silently come from the old code. This tells when the build is older than the source it is made from, and builds it
// again without pulling it from under a process using it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renameRetry, replaceFile } from './fsutil.ts';
import { withLock } from './locks.ts';
import { TELLCUT_ROOT } from './paths.ts';

/** the newest modification time (ms) of a source file under `dir` (tests and builds left out) */
function newest(dir: string): number {
  let t = 0;
  if (!existsSync(dir)) return t;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'golden') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) t = Math.max(t, newest(p));
    else if (/\.(ts|tsx|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) t = Math.max(t, statSync(p).mtimeMs);
  }
  return t;
}

/** A sentence when apps/player/dist is missing or older than the engine, the plugins or the player's own source; otherwise null. */
export function playerBuildStale(root = TELLCUT_ROOT): string | null {
  const built = join(root, 'apps', 'player', 'dist', 'index.html');
  if (!existsSync(built)) return '播放器還沒建置：先跑 npm run build:player';
  const at = statSync(built).mtimeMs, pkgs = join(root, 'packages');
  const dirs = [join(root, 'apps', 'player', 'src'), ...(existsSync(pkgs) ? readdirSync(pkgs).filter((d) => d !== 'media-node').map((d) => join(pkgs, d, 'src')) : [])];
  const src = Math.max(...dirs.map(newest));
  return src > at + 1000 ? '播放器的建置檔比原始碼舊（積木或引擎改過）：畫面會用舊程式算出來。先跑 npm run build:player' : null;
}

const files = (dir: string, sub = ''): string[] =>
  existsSync(join(dir, sub)) ? readdirSync(join(dir, sub), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(dir, `${sub}${e.name}/`) : [`${sub}${e.name}`])) : [];
const same = (a: string, b: string) => existsSync(b) && statSync(a).size === statSync(b).size && readFileSync(a).equals(readFileSync(b));

/** the player built into `out` (vite); null when it built, else the end of what it said */
const viteBuild = (root: string) => (out: string): string | null => {
  const b = spawnSync(`npm run -s build -w @tellcut/player -- --outDir "${out}" --emptyOutDir`, { cwd: root, shell: true, encoding: 'utf8', windowsHide: true });
  return b.status === 0 ? null : (b.stderr || b.stdout || '').trim().split(/\r?\n/).slice(-2).join(' ／ ');
};

/** Builds a stale player again without pulling it from under whoever is using it (an export, batch:render, another check): one
 *  process builds at a time (a lock; the next finds it fresh and does nothing), into a folder of its own, then each file is moved
 *  into apps/player/dist on its own, index.html last, so a page loads either build whole; the chunks the build before named stay
 *  for the pages already open on it, older ones go. null when the build is fresh after, else the sentence why not. */
export async function rebuildPlayer(o: { root?: string; build?: (out: string) => string | null } = {}): Promise<string | null> {
  const root = o.root ?? TELLCUT_ROOT, cache = join(root, '.cache'), dist = join(root, 'apps', 'player', 'dist'), list = join(dist, '.build.json');
  mkdirSync(cache, { recursive: true });
  return withLock(join(cache, 'player-build.lock'), async () => {
    const stale = playerBuildStale(root);
    if (!stale) return null;
    const out = join(cache, `player-build-${process.pid}`);
    rmSync(out, { recursive: true, force: true });
    try {
      const failed = (o.build ?? viteBuild(root))(out);
      if (failed !== null) return `${stale}（自動建置失敗：${failed}）`;
      let before: string[] | null = null;
      try { before = JSON.parse(readFileSync(list, 'utf8')); } catch { /* built by npm run build:player: nothing is known to be old */ }
      const made = files(out).filter((f) => f !== 'index.html');
      for (const f of [...made, 'index.html']) {
        if (f !== 'index.html' && same(join(out, f), join(dist, f))) continue;
        mkdirSync(dirname(join(dist, f)), { recursive: true });
        renameRetry(join(out, f), join(dist, f));
      }
      if (before) for (const f of files(dist, 'assets/').filter((f) => !made.includes(f) && !before.includes(f))) try { rmSync(join(dist, f), { force: true }); } catch { /* open: the next build takes it */ }
      replaceFile(list, JSON.stringify(made));
      return playerBuildStale(root);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
}
