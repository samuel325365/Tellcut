import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { materialOf, planAudition } from './audition.ts';

test('a timeline item gives back its raw material: the source or music it uses, an effect with its own settings', () => {
  const p: any = fixture();
  p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 't1', type: 'x.title', start: 3, end: 5.5, params: { text: 'hi' }, transform: { x: 0.1, y: 0, scale: 2, ox: 0.5, oy: 0.5 } }] });
  expect(materialOf(p, 'c2')).toEqual({ kind: 'clip', source: 's', from: 10, len: 6 });           // 4 s at speed 2, frozen after 3 s
  p.tracks[1].items[1].freezeAt = null;
  expect(materialOf(p, 'c2')).toEqual({ kind: 'clip', source: 's', from: 10, len: 8 });
  expect(materialOf(p, 'a1')).toEqual({ kind: 'clip', source: 'a', from: 2, len: 2 });
  expect(materialOf(p, 'm1')).toEqual({ kind: 'music', media: 'm', from: 0, len: 10 });
  expect(materialOf(p, 'tap')).toMatchObject({ kind: 'sfx', type: 'x.tap', params: {} });
  expect(materialOf(p, 'tap')!.kind === 'sfx' && (materialOf(p, 'tap') as any).len).toBeCloseTo(0.1, 6);
  expect(materialOf(p, 't1')).toEqual({ kind: 'overlay', type: 'x.title', params: { text: 'hi' }, transform: { x: 0.1, y: 0, scale: 2, ox: 0.5, oy: 0.5 }, len: 2.5, track: 'overlay' });
  expect(materialOf(p, 'blk')).toEqual({ kind: 'overlay', type: 'x.block', params: {}, len: 4, track: 'scene' });
  expect(materialOf(p, 'nope')).toBe(null);
});

test('a timeline item auditions from its own start even near the end (the preview\'s project grows); a library material moves earlier', () => {
  const p: any = fixture();                                                 // 20 s
  const run = (plan: any) => { const d = structuredClone(p); plan.recipe(d); return d; };
  const items = (d: any) => d.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.start, i.end]));
  let plan = planAudition(p, { kind: 'clip', source: 's', from: 0, len: 4.5 }, 18, { inPlace: true });
  let d = run(plan);
  expect([plan.from, plan.until, items(d), d.meta.duration, p.meta.duration]).toEqual([18, 22.5, [[[18, 22.5]], [[18, 22.5]]], 22.5, 20]);
  plan = planAudition(p, { kind: 'clip', source: 's', from: 0, len: 4.5 }, 18, {});
  expect([plan.from, plan.until, run(plan).meta.duration]).toEqual([15.5, 20, 20]);
  // a library material longer than the whole project plays whole
  plan = planAudition(p, { kind: 'clip', source: 's', from: 0, len: 26 }, 3, {});
  expect([plan.from, plan.until, run(plan).meta.duration]).toEqual([0, 26, 26]);
  // the player starts over from 0 when asked to play in the last 50 ms: an audition never starts there
  plan = planAudition(p, { kind: 'overlay', type: 'x', len: 0.04 }, 19.97, { inPlace: true });
  expect(plan.from).toBeLessThan(19.95);
  expect(plan.until).toBeGreaterThan(plan.from);
});
test('a photo auditions alone, without a sound track', () => {
  const p: any = fixture(); p.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' };
  const plan = planAudition(p, { kind: 'clip', source: 'ph', from: 0, len: 3 }, 2, {});
  const d = structuredClone(p); plan.recipe(d);
  expect(d.tracks.filter((t: any) => !t.muted).map((t: any) => t.kind)).toEqual(['video']);
});

test('a sound file on the sound-effect track (c.sfxFile) auditions for its own length, named by its file', () => {
  const p: any = fixture();
  p.tracks.push({ id: 'fx2', kind: 'sfx', gain: 0, items: [{ id: 'f1', type: 'core.file', start: 2, end: 3.25, params: { path: 'media/sfx/ding.wav' }, gain: -6 }] });
  const m = materialOf(p, 'f1')!;
  expect(m).toEqual({ kind: 'sfx', type: 'core.file', params: { path: 'media/sfx/ding.wav' }, len: 1.25 });
  const plan = planAudition(p, m, 2, { inPlace: true, registry: { sfx: () => undefined, item: () => undefined } as any });
  expect([plan.from, plan.until, plan.label]).toEqual([2, 3.75, 'SFX media/sfx/ding.wav']);
  const d = structuredClone(p); plan.recipe(d);
  const it = d.tracks.filter((t: any) => !t.muted).flatMap((t: any) => t.items)[0];
  expect(it).toMatchObject({ type: 'core.file', start: 2, end: 3.25, params: { path: 'media/sfx/ding.wav' } });
});
