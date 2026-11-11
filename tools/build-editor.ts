// npm run build:editor: the editor is built beside the one in use and moved into apps/editor/dist file by file, index.html last,
// under a lock (tools/build-swap.ts). vite's plain build empties dist first and writes it again over seconds, and a running server
// serves /editor/ from that dist: a page loaded meanwhile came up broken.
import { spawnSync } from 'node:child_process';
import { editorBuildStale } from '../packages/media-node/src/staleness.ts';
import { TELLCUT_ROOT } from '../packages/media-node/src/paths.ts';
import { parseArgsOrExit } from './args.ts';
import { swapBuild } from './build-swap.ts';

/** vite into `out`, its output shown as it goes; null when it built */
const viteInto = (root: string) => (out: string): string | null => {
  const b = spawnSync(`npm run -s build -w @tellcut/editor -- --outDir "${out}" --emptyOutDir`, { cwd: root, shell: true, stdio: 'inherit', windowsHide: true });
  return b.status === 0 ? null : `vite 結束代碼 ${b.status ?? b.signal}`;
};

// it takes nothing: --help prints the usage instead of building, and a stray word is refused
parseArgsOrExit(process.argv.slice(2), {}, '用法：npm run build:editor', { maxWords: 0 });
const failed = await swapBuild({ root: TELLCUT_ROOT, app: 'editor', build: viteInto(TELLCUT_ROOT) });
if (failed) { console.error(`編輯器建置失敗：${failed}`); process.exit(1); }
// a source changed while it built: the page is in, but already older than its source
const stale = editorBuildStale(TELLCUT_ROOT);
if (stale) { console.error(stale); process.exit(1); }
