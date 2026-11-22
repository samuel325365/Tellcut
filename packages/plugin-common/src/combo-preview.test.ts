// The gallery's live preview of each shared combo (engine comboPreviewProject): what plays is what Add to timeline would place on a
// clip, so the shake moves the street and the sounds reach the mix, not only the pictures the golden samples draw.
import { COMBO_PREVIEW_LEAD, comboPreviewProject, createRegistry, expandCombo, planAudio, PREVIEW_GROUND, resolveTimes, videoState, type VideoItem } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { combos } from './combos.ts';

const registry = createRegistry(plugins);
const preview = (id: string) => {
  const c = combos.find((x) => x.id === id)!, layers = expandCombo(c, registry);
  const owners = [...new Set(layers.flatMap((l) => (l.type ? [plugins.find((p) => p.items?.some((x) => x.type === l.type) || p.sfx?.some((x) => x.type === l.type))!.id] : [])))];
  return { c, layers, p: comboPreviewProject({ layers, plugins: owners, name: `combo:${id}`, ending: !!c.ending }) };
};
const resolver = { audio: () => ({ url: 'x', offset: 0 }) };

test.each(combos.map((c) => c.id))('combo %s: every layer placed on the street, each sound in the audio plan at its time', (id) => {
  const { layers, p } = preview(id), times = resolveTimes(p), items = p.tracks.flatMap((t) => t.items as Array<{ id: string; type?: string; parent?: string }>);
  // every picture layer is an item hung on the street
  for (const l of layers.filter((x) => x.kind === 'effect')) expect(items.find((x) => x.type === l.type && x.parent === 'ground'), `${id}/${l.name}`).toBeTruthy();
  // every sound plays, in the order and spacing the combo gives
  const plan = planAudio(p, times, resolver, 'http://127.0.0.1/'), sounds = layers.filter((x) => x.kind === 'sfx');
  expect(plan.sfx.map((s) => s.type).sort()).toEqual(sounds.map((s) => s.type).sort());
  const first = Math.min(...sounds.map((s) => s.at)), t0 = Math.min(...plan.sfx.map((s) => s.t));
  for (const s of sounds) expect(plan.sfx.some((x) => x.type === s.type && Math.abs(x.t - t0 - (s.at - first)) < 1e-6), `${id}/${s.name}`).toBe(true);
  // nothing starts before the film or runs past it, and the film starts on the plain street
  for (const x of items) { const r = times.get(x.id)!; expect(r.start).toBeGreaterThanOrEqual(0); expect(r.end).toBeLessThanOrEqual(p.meta.duration + 1e-6); }
  expect(Math.min(...items.filter((x) => x.id !== 'ground').map((x) => times.get(x.id)!.start))).toBeCloseTo(COMBO_PREVIEW_LEAD, 6);
});

test('impact, punchline and rush shake the street: the picture moves inside its frame during the shake and is still after it', () => {
  for (const id of ['impact', 'punchline', 'rush']) {
    const { layers, p } = preview(id), ground = p.tracks[p.tracks.findIndex((t) => t.id === 'v')].items[0] as VideoItem;
    const shake = layers.find((l) => l.kind === 'shake')!, s = ground.shake![0];
    expect(ground.source).toBe(PREVIEW_GROUND);
    expect(s).toMatchObject({ dur: shake.len, px: shake.px });
    const at = (t: number) => videoState(ground, 0, p.meta.duration, t, 1080, 1920, {});
    const moved = [0.05, 0.1, 0.15].map((d) => at(s.at + d)).some((v) => Math.hypot(v.shakeX, v.shakeY) > 1);
    expect(moved, id).toBe(true);
    const after = at(s.at + s.dur + 0.05);
    expect([after.shakeX, after.shakeY], id).toEqual([0, 0]);
  }
});

test('glitchcut: its scratch comes ahead of the moment, so the film starts that much earlier; closing ends the film with its fade', () => {
  const g = preview('glitchcut'), plan = planAudio(g.p, resolveTimes(g.p), resolver, 'http://127.0.0.1/');
  const lead = Math.max(...g.layers.map((l) => -l.at));
  expect(lead).toBeGreaterThan(0);
  expect(plan.sfx.find((s) => s.type === 'common.scratch')!.t).toBeCloseTo(COMBO_PREVIEW_LEAD + lead - 0.1, 6);
  const k = preview('closing'), times = resolveTimes(k.p), ends = k.p.tracks.filter((t) => t.kind !== 'video' && t.kind !== 'sfx').flatMap((t) => t.items.map((i) => times.get(i.id)!.end));
  expect(k.c.ending).toBe(true);
  expect(Math.max(...ends)).toBeCloseTo(k.p.meta.duration, 6);
  expect(planAudio(k.p, times, resolver, 'http://127.0.0.1/').sfx.map((s) => s.type).sort()).toEqual(['common.clunk', 'common.rattle']);
});
