// c.combo (engine combos.ts): a named moment's layers as ordinary items, riding on the clip playing then.
import { applyTemplate, corePlugin, type ItemType } from '@tellcut/engine';
import { commonItems } from '@tellcut/plugin-common';
import { fresh, items } from './cut-test-kit.ts';

const flash = corePlugin.items.find((t) => t.type === 'core.flash')! as ItemType, speedlines = commonItems.find((t) => t.type === 'common.speedlines')!;

test('c.combo places every layer at its offset, templates applied, all on the clip playing then; the shake on that clip', () => {
  const c = fresh();
  const a = c.clip('v', { from: 0, len: 2 }), b = c.clip('v', { from: 2, len: 4 });
  const ids = c.combo('impact', { at: 3 });
  expect(Object.keys(ids)).toEqual(['lines', 'flash', 'hit']);
  const all: any[] = c.p.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ ...i, track: t.id })));
  const of = (id: string) => all.find((i) => i.id === id)!;
  // in the clip's own seconds (it starts at 2): the moment is 1 s into it
  expect([of(ids.lines).type, of(ids.lines).track, of(ids.lines).start, of(ids.lines).end, of(ids.lines).parent]).toEqual(['common.speedlines', 'text', 1, 1.8, b]);
  expect(of(ids.lines).params).toEqual(applyTemplate(speedlines, 'burst-center'));
  expect([of(ids.flash).type, of(ids.flash).track, of(ids.flash).parent]).toEqual(['core.flash', 'top', b]);
  expect(of(ids.flash).params).toEqual(applyTemplate(flash, 'bloom-pop', { y: 0.4, peak: 0.65, fall: 0.35, power: 3 }));
  expect([of(ids.hit).type, of(ids.hit).track, of(ids.hit).gain, of(ids.hit).start, of(ids.hit).end]).toEqual(['common.impact', 'sfx', -6, 1, 2.4]);
  expect(items(c, 'v1').find((i) => i.id === b).shake).toEqual([{ at: 1, dur: 0.4, px: 28, hz: 18 }]);
  expect(items(c, 'v1').find((i) => i.id === a).shake).toBeUndefined();
});

test('c.combo: its handle, sound off, a layer left out or changed; a layer before 0 starts at 0 and keeps its end', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 4 });
  const ids = c.combo('cmb-2', { at: 0.05, sound: false, parts: { split: { shift: 1 } } });
  expect(Object.keys(ids)).toEqual(['scan', 'split']);
  const t = items(c, 'text');
  // scan starts 0.1 s before the moment: at 0.05 that is before the film, so it starts at 0 and ends where it would have
  expect(t.find((i) => i.id === ids.scan)).toMatchObject({ start: 0, end: 0.45 });
  expect(t.find((i) => i.id === ids.split).params).toMatchObject({ look: 'rgb', shift: 1, seed: 9 });
  expect(c.p.tracks.some((t) => t.id === 'sfx')).toBe(false);
  expect(Object.keys(fresh().combo('impact', { at: 0, parts: { lines: false, shake: { px: 10 } } }))).toEqual(['flash', 'hit']);
});

test('c.combo with no clip at the moment: the layers stay at film time, the shake is left out and save() says so, never an error', async () => {
  const c = fresh();
  const ids = c.combo('impact', { at: 1 });
  expect(items(c, 'text').find((i) => i.id === ids.lines)).toMatchObject({ start: 1, end: 1.8 });
  expect(items(c, 'text').find((i) => i.id === ids.lines).parent).toBeUndefined();
  await c.save();
  expect(c.notes).toEqual(["c.combo('impact')：1 秒沒有主軌片段，鏡頭晃動那一層（shake）沒有放（晃動是片段本身的效果）"]);
});

test('c.combo errors name the combo and what it has', () => {
  const c = fresh();
  expect(() => c.combo('slam')).toThrow("c.combo('slam')：沒有這個組合；有：impact（CMB-01 重擊）、glitchcut（CMB-02 故障切換）、punchline（CMB-03 笑點）、rewind（CMB-04 倒帶）、reveal（CMB-05 揭曉）、celebrate（CMB-06 慶祝）、leader（CMB-07 片頭倒數）、memory（CMB-08 回憶）");
  expect(() => c.combo('MRK-03')).toThrow("c.combo('MRK-03')：MRK-03 是 common.stamp 的代號，不是組合");
  expect(() => c.combo('impact', { parts: { line: false } })).toThrow("c.combo('impact')：組合 impact 沒有「line」這一層；它有：lines、flash、hit、shake");
  expect(() => c.combo('impact', { at: -1 })).toThrow("c.combo('impact') 的 at 不能小於 0");
});
