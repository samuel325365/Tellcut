// Admission rule (d) of the combos (spec 2026-11-16-combos): each combo's peak picture (the middle of its sample's three moments,
// combo-<id>) must be farther than TEMPLATE_LIKENESS from every other combo's peak, by the block templates' measure (media-node's
// likeness.ts: 64 × 64 grey, edge maps of unit spread, mean absolute difference). The measure cannot see a flat brightening, which is
// why every combo also has a picture layer with a shape (src/combos.test.ts).
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { meanAbsDiff, printOf, readPng, TELLCUT_ROOT, TEMPLATE_LIKENESS } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { samples } from '../src/samples.ts';

const GOLDEN = join(TELLCUT_ROOT, 'packages/plugin-common/golden');

/** a combo's peak print (a missing picture fails: npm run golden -- --update combo-<id>) */
function peakOf(id: string): Float32Array {
  const s = samples.find((x) => x.name === `combo-${id}`);
  if (!s) throw new Error(`沒有樣本 combo-${id}`);
  const f = join(GOLDEN, `${s.name}-t${s.at[1].toFixed(2)}.png`);
  if (!existsSync(f)) throw new Error(`沒有 golden 圖：${f}（npm run golden -- --update ${s.name}）`);
  return printOf(readPng(f));
}

test('admission rule (d): every combo\'s peak picture differs from every other combo\'s', () => {
  const ids = plugins.flatMap((p) => p.combos ?? []).map((c) => c.id), peaks = new Map(ids.map((id) => [id, peakOf(id)]));
  const near: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = meanAbsDiff(peaks.get(ids[i])!, peaks.get(ids[j])!);
    if (d <= TEMPLATE_LIKENESS) near.push(`${ids[i]} 和 ${ids[j]} 最強的那一格太像：${d.toFixed(3)}`);
  }
  expect(near).toEqual([]);
});
