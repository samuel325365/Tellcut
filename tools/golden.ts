// Golden pictures of the common blocks (toolkit phase 2b):  npm run golden -- [--update] [<name prefix>]
// Draws each sample of packages/plugin-common/src/samples.ts and compares it with the saved picture. Exit code 1 when one changed or is missing.
import { join } from 'node:path';
import { createRegistry } from '@tellcut/engine';
import { goldenSummary, TELLCUT_ROOT, runGolden, type GoldenCase } from '@tellcut/media-node';
import { samples } from '@tellcut/plugin-common/samples';
import { plugins } from '@tellcut/plugins';

const update = process.argv.includes('--update'), only = process.argv.slice(2).find((a) => !a.startsWith('-'));
const chosen = (samples as GoldenCase[]).filter((c) => !only || c.name.startsWith(only));
if (!chosen.length) { console.error(`沒有符合「${only}」的 golden 案例`); process.exit(2); }
const results = await runGolden(chosen, { registry: createRegistry(plugins), goldenDir: join(TELLCUT_ROOT, 'packages/plugin-common/golden'), work: join(TELLCUT_ROOT, 'projects/_golden'), update, log: (l) => console.error(l) });
const notes = goldenSummary(results);
console.log(notes.length ? notes.join('\n') : `${results.length} 張 golden 全部相符`);
process.exit(results.some((r) => r.status === 'changed' || r.status === 'new') ? 1 : 0);
