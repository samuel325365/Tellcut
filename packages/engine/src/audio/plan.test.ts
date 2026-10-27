import { planAudio, dbToLin, linToDb, soundFiles } from './plan.ts';
import { resolveTimes } from '../time.ts';

const p = (o: any = {}): any => ({
  media: { bgm: { path: 'media/bgm.mp3' } },
  sources: { k4: { path: 'x.mp4', duration: 90 } },
  tracks: [
    { id: 'mus', kind: 'music', gain: 0, envelope: [[0, 0], [5, -6]], items: [
      { id: 'm', media: 'bgm', in: 0.5, start: 2.4, end: 61, gain: linToDb(0.78), fadeIn: 0, fadeOut: 0, envelope: [[1, 0], [2, -120]] }] },
    { id: 'orig', kind: 'audio', gain: 0, items: [
      { id: 'g', source: 'k4', in: 43.3, start: 14.8, end: 18.4, rate: 1, gain: -2, fadeIn: 0.35, fadeOut: 0.45 }] },
    { id: 'fx', kind: 'sfx', gain: 0, items: [{ id: 's', type: 'kyoto.tap', start: 1.95, end: 2, params: {}, gain: 0 }] },
    { id: 'v', kind: 'video', items: [] },
    ...(o.extra ?? []),
  ],
});
const resolver = { audio: (r: any) => ({ url: `http://h/${r.source}-${r.in.toFixed(2)}.wav`, offset: 0.25 }) };

test('dB helpers round-trip and floor at -120', () => {
  expect(dbToLin(linToDb(0.78))).toBeCloseTo(0.78, 12);
  expect(dbToLin(-120)).toBe(0);
  expect(linToDb(0)).toBe(-120);
});

test('music and audio items become segments with absolute envelopes', () => {
  const proj = p();
  const plan = planAudio(proj, resolveTimes(proj), resolver, 'http://h/tellcut/projects/k/project.json');
  const m = plan.segs.find((s) => s.item === 'm')!;
  expect(m).toMatchObject({ buffer: 'media:bgm', a: 2.4, b: 61, off: 0.5, rate: 1 });
  expect(m.gain).toBeCloseTo(0.78, 12);
  expect(m.envelope).toEqual([[3.4, 1], [4.4, 0]]);
  expect(plan.buffers['media:bgm']).toBe('http://h/tellcut/projects/k/media/bgm.mp3');
  const g = plan.segs.find((s) => s.item === 'g')!;
  expect(g).toMatchObject({ buffer: 'http://h/k4-43.30.wav', off: 0.25, a: 14.8, b: 18.4, fadeIn: 0.35, fadeOut: 0.45 });
  expect(plan.tracks.find((t) => t.id === 'mus')!.envelope).toEqual([[0, 1], [5, dbToLin(-6)]]);
  expect(plan.sfx).toEqual([{ type: 'kyoto.tap', t: 1.95, params: {}, gain: 1, track: 'fx' }]);
});

test('muted tracks are dropped; solo keeps only soloed tracks', () => {
  const muted = p(); muted.tracks[1].muted = true;
  expect(planAudio(muted, resolveTimes(muted), resolver, 'http://h/p.json').segs.map((s) => s.item)).toEqual(['m']);
  const solo = p(); solo.tracks[2].solo = true;
  const plan = planAudio(solo, resolveTimes(solo), resolver, 'http://h/p.json');
  expect(plan.segs).toEqual([]);
  expect(plan.sfx.length).toBe(1);
});

test('music URLs come from the resolver when it has one (api preview)', () => {
  const q = p(), plan = planAudio(q, resolveTimes(q), { ...resolver, music: (id: string) => `/api/projects/demo/media/music/${id}` }, 'http://h/api/projects/demo/files/project.json');
  expect(Object.values(plan.buffers)).toContain('/api/projects/demo/media/music/bgm');
  expect(Object.values(plan.buffers).some((u) => u.includes('media/bgm.mp3'))).toBe(false);
});

test('a sound file on a sound-effect track (core.file) plays as a segment on that track\'s bus, never as a synthesised effect', () => {
  const q = p({ extra: [{ id: 'fx2', kind: 'sfx', gain: -2, items: [{ id: 'f', type: 'core.file', start: 3, end: 3.8, params: { path: 'media/sfx/ding.wav' }, gain: -6 }, { id: 'e', type: 'core.file', start: 4, end: 5, params: {}, gain: 0 }] }] });
  const plan = planAudio(q, resolveTimes(q), resolver, 'http://h/tellcut/projects/k/project.json');
  const f = plan.segs.find((s) => s.item === 'f')!;
  expect(f).toMatchObject({ buffer: 'file:media/sfx/ding.wav', track: 'fx2', a: 3, b: 3.8, off: 0, rate: 1, fadeIn: 0, fadeOut: 0.005 });
  expect(f.gain).toBeCloseTo(dbToLin(-6), 12);
  expect(f.envelope).toBeUndefined();
  expect(plan.buffers['file:media/sfx/ding.wav']).toBe('http://h/tellcut/projects/k/media/sfx/ding.wav');
  expect(plan.sfx.map((s) => s.type)).toEqual(['kyoto.tap']);              // the file is not handed to the synthesiser; one without a path plays nothing
  expect(plan.segs.some((s) => s.item === 'e')).toBe(false);
  expect(plan.tracks.find((t) => t.id === 'fx2')).toEqual({ id: 'fx2', gain: dbToLin(-2), envelope: undefined });
  // through the editor's server: the project's files route
  const api = planAudio(q, resolveTimes(q), { ...resolver, file: (path: string) => `/api/projects/k/files/${path}` }, 'http://h/api/projects/k/files/project.json');
  expect(api.buffers['file:media/sfx/ding.wav']).toBe('/api/projects/k/files/media/sfx/ding.wav');
  expect(soundFiles(q)).toEqual(['media/sfx/ding.wav']);
});
