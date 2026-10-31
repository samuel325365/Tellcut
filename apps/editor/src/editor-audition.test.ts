// The Editor: auditioning a clip, music, an effect or a sound effect alone, and what ends an audition.
import { corePlugin, createRegistry } from '@tellcut/engine';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { Editor } from './editor.ts';
import { fakes, tracksOf, shown } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('auditioning a video segment plays only that segment, with its own sound, at the playhead; the timeline keeps the real project; it ends by itself', async () => {
  const { api, bridge, saved } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const real = ed.store.get().project;
  ed.seek(5);
  bridge.calls.length = 0;
  expect(ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 })).toBe(true);
  const p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => [t.kind, t.items.map((i: any) => [i.source, i.in, i.start, i.end])]))
    .toEqual([['video', [['s', 1, 5, 7]]], ['audio', [['s', 1, 5, 7]]]]);
  expect(ed.store.get().project).toBe(real);                // no extra rows, no muted tracks on the timeline
  expect(ed.store.get().audition!.label).toContain('s');
  expect(bridge.calls.filter((c: any) => c[0] === 'play')).toEqual([['play', 5]]);
  bridge.onTime(4);                        // a late report of another position: ignored
  bridge.onTime(5); bridge.onTime(6.5);
  expect(ed.store.get().audition).not.toBe(null);
  bridge.onTime(7.02);
  expect(ed.store.get().audition).toBe(null);
  expect(shown(bridge)).toBe(real);
  expect([ed.store.get().playhead, ed.store.get().playing]).toEqual([5, false]);
  await vi.advanceTimersByTimeAsync(2000);
  expect([saved.length, ed.store.get().canUndo]).toEqual([0, false]);   // nothing saved, nothing to undo
});

test('auditioning music plays it alone from its start, at the playhead; the end of the project ends it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(4);
  ed.audition({ kind: 'music', media: 'm' });
  const p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.media, i.in, i.start]))).toEqual([[['m', 0, 4]]]);
  expect(bridge.calls.filter((c: any) => c[0] === 'play').at(-1)).toEqual(['play', 4]);
  bridge.onEnded();
  expect([ed.store.get().audition, ed.store.get().playhead]).toEqual([null, 4]);
});

test('an effect or a sound effect is auditioned alone at the playhead (earlier if it would run past the end)', async () => {
  const { api, bridge } = fakes();
  const registry = createRegistry([corePlugin, { id: 'x', sfx: [{ type: 'x.tap', label: '點', params: [], duration: () => 0.3, synth() {} }] } as any]);
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.seek(6);
  ed.audition({ kind: 'overlay', type: 'core.flash' });
  let p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.type, i.start, i.end]))).toEqual([[['core.flash', 6, 8]]]);
  ed.audition({ kind: 'sfx', type: 'x.tap' });           // a new audition replaces the running one
  p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.type, i.start, i.end]))).toEqual([[['x.tap', 6, 6.3]]]);
  ed.endAudition();
  expect(ed.store.get().playhead).toBe(6);                 // back where the first audition started
  ed.seek(19.5);
  ed.audition({ kind: 'overlay', type: 'core.flash' });
  expect(shown(bridge).tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.start, i.end]))).toEqual([[[18, 20]]]);
});

test('a type that may exist only once can still be auditioned (the one in the project is hidden meanwhile)', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  const { api, bridge } = fakes({ project: async () => { const p: any = fixture(); p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'e1', type: 'x.end', start: 0, end: 1, params: {} }] }); return p; } });
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  expect(ed.audition({ kind: 'overlay', type: 'x.end' })).toBe(true);
});

test('double-clicking a timeline item auditions its raw material alone, where the item is; there is nothing to add', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(15);
  expect(ed.auditionItem('c2')).toBe(true);              // 4–8 s at speed 2 from 10 s of source s
  const p = shown(bridge);
  expect(p.tracks.filter((t: any) => !t.muted).map((t: any) => t.items.map((i: any) => [i.source, i.in, i.start, i.end, i.speed ?? i.rate])))
    .toEqual([[['s', 10, 4, 10, 1]], [['s', 10, 4, 10, 1]]]);  // at the item's start; the source it shows: frozen after 3 s at speed 2
  expect(bridge.calls.filter((c: any) => c[0] === 'play').at(-1)).toEqual(['play', 4]);
  expect(ed.store.get().audition).toMatchObject({ addable: false, result: 4 });
  expect(ed.addAuditioned()).toBe(false);
  ed.run('exitCrop');                                    // Esc: the playhead waits at the item, Space plays the result there
  expect([ed.store.get().audition, ed.store.get().playhead, ed.store.get().playing]).toEqual([null, 4, false]);
  ed.auditionItem('m1');
  ed.playResult();                                       // the banner's "play the result"
  expect([ed.store.get().audition, ed.store.get().playing, bridge.calls.at(-1)]).toEqual([null, true, ['play', 0]]);
  expect(ed.store.get().project!.tracks.some((t) => t.muted)).toBe(false);
});

test('Space, Esc or any edit ends an audition; the edit goes to the real project', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(3);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 4 });
  ed.run('playPause');
  expect([ed.store.get().audition, ed.store.get().playing, ed.store.get().playhead]).toEqual([null, false, 3]);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 4 });
  ed.run('exitCrop');
  expect(ed.store.get().audition).toBe(null);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 4 });
  ed.select(['c1']);
  ed.run('delete');
  const p: any = ed.store.get().project;
  expect([ed.store.get().audition, p.tracks.length, p.tracks.some((t: any) => t.muted)]).toEqual([null, 6, false]);   // the fixture's 6 tracks, none left over
  expect(tracksOf(p, 'video')[0].items.map((i: any) => i.id)).toEqual(['c2']);
});

test('"add" puts the auditioned material at the playhead where the audition started; the library adds what is picked', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(9);
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onTime(9); bridge.onTime(10);
  expect(ed.addAuditioned()).toBe(true);
  let p: any = ed.store.get().project;
  expect(ed.store.get().audition).toBe(null);
  expect(p.tracks.some((t: any) => t.muted)).toBe(false);
  expect(tracksOf(p, 'video').flatMap((t: any) => t.items).filter((i: any) => i.start === 9).map((i: any) => [i.in, i.end])).toEqual([[1, 11]]);
  expect(ed.addMaterial({ kind: 'music', media: 'm' })).toBe(true);
  p = ed.store.get().project;
  expect(tracksOf(p, 'music').flatMap((t: any) => t.items).filter((i: any) => i.start === 9).length).toBe(1);
});

test('the transport button ends an audition instead of playing the project', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(2);
  ed.audition({ kind: 'music', media: 'm' });
  ed.togglePlay();
  expect([ed.store.get().audition, ed.store.get().playing, ed.store.get().playhead]).toEqual([null, false, 2]);
});

test('during an audition, the library button, a seek or a play act on the real project and the real playhead', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);
  ed.setView({ scroll: 8 });                // 8–18 s in view
  ed.seek(17.6);
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onTime(17.6); bridge.onTime(18.2); // the audition runs past the view: the page turned
  expect(ed.store.get().scroll).toBe(11);
  expect(ed.addMaterial({ kind: 'clip', source: 's', from: 1, len: 2 })).toBe(true);
  const p: any = ed.store.get().project;
  expect(p.tracks.filter((t: any) => t.kind === 'video').flatMap((t: any) => t.items).filter((i: any) => i.in === 1 && i.end - i.start === 2).map((i: any) => i.start)).toEqual([17.6]);
  expect([ed.store.get().audition, ed.store.get().scroll]).toEqual([null, 8]);   // the view came back too
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  ed.seek(12);                              // a click on the ruler or a double-click on the timeline
  ed.play();
  expect([ed.store.get().audition, ed.store.get().playing, bridge.calls.at(-1)]).toEqual([null, true, ['play', 12]]);
  expect(ed.store.get().project!.tracks.some((t) => t.muted)).toBe(false);
});

test('reports of the old position after "play the result" neither move the view nor the playhead', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 10 s in view
  ed.setView({ scroll: 3 });                // c2 (4–8 s) in view
  ed.auditionItem('c2');
  bridge.onTime(4); bridge.onTime(5);       // the audition plays the raw source where the item is
  ed.playResult();
  bridge.onTime(5); bridge.onTime(5);       // the player redraws the audition position while pausing and patching
  expect([ed.store.get().scroll, ed.store.get().playhead]).toEqual([3, 4]);
  bridge.onTime(4.02);
  expect([ed.store.get().scroll, ed.store.get().playhead, ed.store.get().playing]).toEqual([3, 4.02, true]);
});

test('a very short audition plays to its end', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(0.2);
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 0.12 });
  bridge.onTime(0.2); bridge.onTime(0.2);   // the player redraws while pausing and patching
  expect(ed.store.get().audition).not.toBe(null);
  bridge.onTime(0.33);
  expect(ed.store.get().audition).toBe(null);
});

test('during an audition every track looks muted, but M and S toggle the real track', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  expect(ed.toggleTrack('mu', 'muted')).toBe(true);
  const mu: any = ed.store.get().project!.tracks.find((t) => t.id === 'mu');
  expect([ed.store.get().audition, mu.muted]).toEqual([null, true]);
  expect(ed.toggleTrack('mu', 'solo')).toBe(true);
  expect((ed.store.get().project!.tracks.find((t) => t.id === 'mu') as any).solo).toBe(true);
});

test('a preview error raised by the audition does not outlive it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onError('v9: Video not available');
  expect(ed.store.get().playerError).not.toBe('');
  ed.endAudition();
  expect(ed.store.get().playerError).toBe('');
});

test('F (the large preview) and other view keys do not end an audition; adding after a long audition keeps the project length', async () => {
  const { api, bridge, saved } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(2);
  ed.audition({ kind: 'clip', source: 's', from: 0, len: 26 });          // longer than the 20 s project
  ed.run('maxPreview');
  expect(ed.store.get().audition).not.toBe(null);
  expect(ed.addAuditioned()).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect([ed.store.get().project!.meta.duration, (saved.at(-1) as any).meta.duration]).toEqual([20, 20]);
});
