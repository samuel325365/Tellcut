// common.gauge counts its guilt zones as "not set" in any of the three languages (GUILT_ZONES): the English and Japanese ones
// must be the words this dictionary writes into a gauge added in that UI. Here, not in plugin-common's gauge.test.ts, so the
// shared blocks' tests do not reach into the editor (health scan 5).
import { GUILT_ZONES } from '../../../../packages/plugin-common/src/gauge.ts';
import { plugins } from '@tellcut/plugins';
import { VALUES_EN, VALUES_JA } from './values.ts';

test("the gauge's guilt zones in every language are the default and the words the English and Japanese UI write", () => {
  const gauge = plugins.flatMap((p) => p.items ?? []).find((t) => t.type === 'common.gauge')!;
  const zones = gauge.params.find((d) => d.key === 'zones')!.default;
  expect(GUILT_ZONES).toEqual([zones, VALUES_EN['common.gauge.zones'], VALUES_JA['common.gauge.zones']]);
});
