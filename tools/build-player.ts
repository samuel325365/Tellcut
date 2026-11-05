// npm run build:player: the player is built beside the one in use and moved into apps/player/dist file by file, index.html
// last, under the same lock as check's own rebuild (media-node rebuildPlayer). vite's plain build empties dist first and copies
// the ~1,500 font files back last, so a check, export or golden run loading the player meanwhile got 404s for its fonts.
import { spawnSync } from 'node:child_process';
import { rebuildPlayer, TELLCUT_ROOT } from '@tellcut/media-node';

/** vite into `out`, its output shown as it goes; null when it built */
const viteInto = (root: string) => (out: string): string | null => {
  const b = spawnSync(`npm run -s build -w @tellcut/player -- --outDir "${out}" --emptyOutDir`, { cwd: root, shell: true, stdio: 'inherit', windowsHide: true });
  return b.status === 0 ? null : `vite 結束代碼 ${b.status ?? b.signal}`;
};

const failed = await rebuildPlayer({ force: true, build: viteInto(TELLCUT_ROOT) });
if (failed) { console.error(failed); process.exit(1); }
