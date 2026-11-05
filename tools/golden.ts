// Golden pictures of the common blocks (toolkit phase 2b):  npm run golden -- [--update] [<name prefix>]
// Draws each sample of packages/plugin-common/src/samples.ts and compares it with the saved picture. Exit code 1 when one changed or is missing.
import { join } from 'node:path';
import { createRegistry } from '@tellcut/engine';
import { goldenPlatformDir, goldenSummary, TELLCUT_ROOT, runGolden, type GoldenCase } from '@tellcut/media-node';
import { samples } from '@tellcut/plugin-common/samples';
import { plugins } from '@tellcut/plugins';
import { parseArgsOrExit } from './args.ts';

const args = parseArgsOrExit(process.argv.slice(2), { '--update': 'switch' }, '用法：npm run golden -- [--update] [<名稱開頭>]', { maxWords: 1 });
const update = args.has('--update'), only = args.words[0];
const chosen = (samples as GoldenCase[]).filter((c) => !only || c.name.startsWith(only));
if (!chosen.length) { console.error(`沒有符合「${only}」的 golden 案例`); process.exit(2); }
const goldenDir = join(TELLCUT_ROOT, 'packages/plugin-common/golden');
const results = await runGolden(chosen, { registry: createRegistry(plugins), goldenDir, platformDir: goldenPlatformDir(goldenDir), work: join(TELLCUT_ROOT, 'projects/_golden'), update, log: (l) => console.error(l) });
const notes = goldenSummary(results);
console.log(notes.length ? notes.join('\n') : `${results.length} 張 golden 全部相符`);
process.exit(results.some((r) => r.status === 'changed' || r.status === 'new') ? 1 : 0);
