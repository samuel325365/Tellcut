// The player that renders checks, stills and exports is a build (apps/player/dist); after a block or the engine changes it must be rebuilt,
// or pictures silently come from the old code. This tells when the build is older than the source it is made from.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
