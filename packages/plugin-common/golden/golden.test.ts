import { join } from 'node:path';
import { createRegistry } from '@tellcut/engine';
import { goldenSummary, TELLCUT_ROOT, runGolden, type GoldenCase } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { commonItems } from '../src/index.ts';
import { samples } from '../src/samples.ts';

test('every common block has a golden case', () => {
  const have = new Set(samples.map((c) => c.type));
  expect(commonItems.map((i) => i.type).filter((t) => !have.has(t))).toEqual([]);
});

test('every golden picture still matches (npm run golden -- --update after a change you meant)', async () => {
  const r = await runGolden(samples as GoldenCase[], { registry: createRegistry(plugins), goldenDir: join(TELLCUT_ROOT, 'packages/plugin-common/golden'), work: join(TELLCUT_ROOT, 'projects/_golden') });
  expect(goldenSummary(r)).toEqual([]);
// 432 stills took 9 min 20 s alone on 2026-10-24 (group B2) and over 10 min next to the other browser tests
}, 1_200_000);
