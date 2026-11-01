// npm test: the fast group, then the browser group with at most two files at once (why it is a run of its own: vitest.workspace.ts).
// Both always run; the exit code fails when either did. Arguments go to both runs (a file filter, -t "<name>"); a group with
// no file matching them passes.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = (group) => spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--passWithNoTests', ...group, ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' }).status ?? 1;

const fast = vitest(['--project', 'fast']);
const browser = vitest(['--project', 'browser', '--maxWorkers', '2', '--minWorkers', '1']);
if (fast || browser) console.error(`\nnpm test: ${[fast && 'fast', browser && 'browser'].filter(Boolean).join(' and ')} failed`);
process.exit(fast || browser);
