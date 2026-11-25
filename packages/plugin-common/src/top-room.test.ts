// topRoom: how far down an item at the top reaches, for the cut script's avoidBurned fallback (captions pushed under it)
import { progress } from './progress.ts';
import { header } from './header.ts';
import { topRoom } from './top-room.ts';

const safe = { top: 0.06, side: 0.05 };
const drawn = (defs: Array<{ key: string; default: unknown }>, own: Record<string, unknown> = {}) => ({ ...Object.fromEntries(defs.map((d) => [d.key, d.default])), ...own });
const bar = (own: Record<string, unknown> = {}) => topRoom('common.progress', drawn(progress.params, own), 1080, 1920, safe);
const head = (own: Record<string, unknown> = {}) => topRoom('common.header', drawn(header.params, own), 1080, 1920, safe);

test('progress on the top margin: a bar, segments and plain dots by their thickness, paws by the lane; the rest unknown', () => {
  expect(bar()).toBeCloseTo(0.06 + 12 / 1920, 6);                       // the default: a 12 px bar
  expect(bar({ thickness: 30 })).toBeCloseTo(0.06 + 30 / 1920, 6);
  expect(bar({ mode: 'segments' })).toBeCloseTo(0.06 + 12 / 1920, 6);
  expect(bar({ mode: 'dots' })!).toBeGreaterThan(bar()!);
  expect(bar({ mode: 'dots', icons: '🍜,🍣' })).toBeNull();
  expect(bar({ mode: 'paws' })).toBeCloseTo(0.06 + 0.035, 6);
  for (const own of [{ mode: 'rocket' }, { mode: 'ring' }, { position: 'bottom' }, { y: 0.3 }]) expect(bar(own)).toBeNull();
  expect(topRoom('common.slam', {}, 1080, 1920, safe)).toBeNull();
});

test('header chip and kicker: under the progress lane, a line (or two) of their type; a title too long wraps and reaches further', () => {
  const lane = 0.06 + 0.035, chip = head()!;
  expect(chip).toBeGreaterThan(lane + 0.03);                             // one line of 3 % type
  expect(chip).toBeLessThan(lane + 0.03 * 2);
  expect(head({ text: '這是一個非常非常長而且一行絕對放不下的章節標題這是一個非常非常長而且一行絕對放不下的章節標題' })!).toBeGreaterThan(chip + 0.03);
  expect(head({ look: 'kicker' })!).toBeGreaterThan(chip);
  expect(head({ look: 'big' })).toBeNull();
  expect(head({ y: 0.2 })).toBeGreaterThan(0.2);
});
