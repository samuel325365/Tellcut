// The player that renders checks, stills and exports is a build (apps/player/dist); after a block or the engine changes it must be rebuilt,
// or pictures silently come from the old code. This tells when the build is older than the source it is made from, and builds it
// again without pulling it from under a process using it. The editor page (apps/editor/dist) is a build too and is told the same way.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildInto, buildLock } from './build-swap.ts';
import { withLock } from './locks.ts';
import { TELLCUT_ROOT } from './paths.ts';

/** tests and the helpers only tests import, named with a `test` or `e2e` word: x.test.ts, a.e2e.test.ts, test-setup.ts,
 *  test-fixture.ts, editor-test-kit.ts, e2e-kit.ts. No bundle reaches them, so editing one leaves a build fresh. */
const TEST_FILE = /(^|[-.])(test|e2e)[-.]/;

/** the newest modification time (ms) of a source file under `dir` (tests, their helpers and builds left out) */
function newest(dir: string): number {
  let t = 0;
  if (!existsSync(dir)) return t;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'golden') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) t = Math.max(t, newest(p));
    else if (/\.(ts|tsx|css)$/.test(e.name) && !TEST_FILE.test(e.name)) t = Math.max(t, statSync(p).mtimeMs);
  }
  return t;
}

const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);

/** Whether the vite build of `apps/<app>` is missing ('missing'), older than what it is made from ('stale') or fresh (null): its own
 *  source and page, every package but Node-only media-node, and the installed packages (package-lock.json: an npm install that
 *  changed a dependency changes what the build bundles). */
function buildState(root: string, app: 'player' | 'editor'): 'missing' | 'stale' | null {
  const built = join(root, 'apps', app, 'dist', 'index.html');
  if (!existsSync(built)) return 'missing';
  const at = statSync(built).mtimeMs, pkgs = join(root, 'packages');
  const dirs = [join(root, 'apps', app, 'src'), ...(existsSync(pkgs) ? readdirSync(pkgs).filter((d) => d !== 'media-node').map((d) => join(pkgs, d, 'src')) : [])];
  const src = Math.max(...dirs.map(newest), mtime(join(root, 'apps', app, 'index.html')), mtime(join(root, 'package-lock.json')));
  return src > at + 1000 ? 'stale' : null;
}

/** A sentence when apps/player/dist is missing or older than the engine, the plugins or the player's own source; otherwise null. */
export function playerBuildStale(root = TELLCUT_ROOT): string | null {
  const s = buildState(root, 'player');
  return s === 'missing' ? '播放器還沒建置：先跑 npm run build:player'
    : s === 'stale' ? '播放器的建置檔比原始碼舊（積木或引擎改過）：畫面會用舊程式算出來。先跑 npm run build:player' : null;
}

/** The same for apps/editor/dist: a sentence when the editor page would be served from older code than its source; otherwise null. */
export function editorBuildStale(root = TELLCUT_ROOT): string | null {
  const s = buildState(root, 'editor');
  return s === 'missing' ? '編輯器還沒建置：先跑 npm run build:editor'
    : s === 'stale' ? '編輯器的建置檔比原始碼舊（編輯器、積木或引擎改過）：頁面會用舊程式。先跑 npm run build:editor' : null;
}

/** the player built into `out` (vite); null when it built, else the end of what it said */
const viteBuild = (root: string) => (out: string): string | null => {
  const b = spawnSync(`npm run -s build -w @tellcut/player -- --outDir "${out}" --emptyOutDir`, { cwd: root, shell: true, encoding: 'utf8', windowsHide: true });
  return b.status === 0 ? null : (b.stderr || b.stdout || '').trim().split(/\r?\n/).slice(-2).join(' ／ ');
};

/** Builds a stale player again without pulling it from under whoever is using it (an export, batch:render, another check): one
 *  process builds at a time (a lock; the next finds it fresh and does nothing), into a folder of its own, then each file is moved
 *  into apps/player/dist on its own, index.html last, so a page loads either build whole; the chunks the build before named stay
 *  for the pages already open on it, older ones go (build-swap.ts). null when the build is fresh after, else the sentence why not.
 *  `force`: build even when fresh (npm run build:player, which goes this way too: vite's own build empties dist first, and a
 *  check or export loading the player meanwhile got 404s for the fonts it had not copied back yet). */
export async function rebuildPlayer(o: { root?: string; build?: (out: string) => string | null; force?: boolean } = {}): Promise<string | null> {
  const root = o.root ?? TELLCUT_ROOT;
  mkdirSync(join(root, '.cache'), { recursive: true });
  return withLock(buildLock(root, 'player'), async () => {
    const stale = playerBuildStale(root);
    if (!stale && !o.force) return null;
    // only assets/ is cleaned: the fonts and the rest outside it come from public/ and are the same in every build
    const failed = buildInto(root, 'player', o.build ?? viteBuild(root), { clean: 'assets/' });
    if (failed !== null) return stale ? `${stale}（自動建置失敗：${failed}）` : `播放器建置失敗：${failed}`;
    return playerBuildStale(root);
  });
}
