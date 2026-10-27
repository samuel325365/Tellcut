// @vitest-environment jsdom
import { AudioEngine, MediaPool, Stage } from '@tellcut/engine';
import { PreviewSession } from './session.ts';

const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.01, send: 0.3 } };
const project = { version: 1, meta: { name: 't', width: 320, height: 180, fps: 30, duration: 10, plugins: [], mix: MIX }, sources: {}, media: {}, grids: [], tracks: [] };

/** A WebAudio stand-in: every node connects and schedules without doing anything; resume() can be held open. */
function fakeCtx(resumeGate?: Promise<void>) {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => {
    const n: any = { gain: param(), playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), buffer: null,
      connect: (o: any) => o, disconnect() {}, start() {}, stop() {} };
    return n;
  };
  return {
    sampleRate: 48000, currentTime: 0, destination: {},
    createAnalyser: () => ({ ...node(), fftSize: 2048, getFloatTimeDomainData: (a: Float32Array) => a.fill(0.25) }),
    createGain: node, createDynamicsCompressor: node, createConvolver: node, createBufferSource: node,
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    close: async () => {},
    decodeAudioData: async () => ({}), resume: async () => { await resumeGate; }, suspend: async () => {},
  } as any;
}

function setup(resumeGate?: Promise<void>) {
  const frames: Array<() => void> = [], times: number[] = [], levels: number[] = [];
  const s = new PreviewSession({
    stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime: (t) => times.push(t), onEnded() {}, onError() {}, onLevel: (db: number) => levels.push(db),
    raf: (f) => { frames.push(f); }, makeAudioContext: () => fakeCtx(resumeGate),
  });
  const tick = () => { for (const f of frames.splice(0)) f(); };
  return { s, times, tick, levels };
}

test('repeated play() calls (scrubbing while playing) keep a single animation loop', async () => {
  const { s, times, tick } = setup();
  await s.load(project);
  await s.play(0); await s.play(1); await s.play(2);
  times.length = 0;
  tick();
  expect(times.length).toBe(1);
  tick();
  expect(times.length).toBe(2);
});

test('a pause that arrives while play() is still starting wins', async () => {
  let open!: () => void;
  const { s, times, tick } = setup(new Promise<void>((r) => (open = r)));
  await s.load(project);
  const started = s.play(0);
  s.pause();
  open();
  await started;
  times.length = 0;
  tick();
  expect(times).toEqual([]);
});

test('offline music still lets the preview load; the missing file is reported (spec §8)', async () => {
  const errors: string[] = [];
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));
  try {
    const s = new PreviewSession({
      stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
      onTime() {}, onEnded() {}, onError: (_id, m) => errors.push(m), raf() {}, makeAudioContext: () => fakeCtx(),
    });
    const withMusic = { ...project, media: { m: { path: 'media/x.mp3' } }, tracks: [{ id: 'mu', kind: 'music', items: [{ id: 'm1', media: 'm', in: 0, start: 0, end: 5, gain: 0, fadeIn: 0, fadeOut: 0 }] }] };
    expect(await s.load(withMusic)).toBe(10);
    expect(errors).toEqual(['Audio not available (404 http://h/media/x.mp3): http://h/media/x.mp3']);
  } finally { vi.unstubAllGlobals(); }
});

test('while playing the session reports the master level every few frames; pausing reports silence', async () => {
  const { s, tick, levels } = setup();
  await s.load(project);
  await s.play(0);
  for (let i = 0; i < 12; i++) tick();
  expect(levels.length).toBe(2);
  expect(levels[0]).toBeCloseTo(-12.04, 2);
  s.pause();
  expect(levels.at(-1)).toBe(-120);
});

test('leaving crop mode redraws the stage (edits made while cropping were not drawn)', async () => {
  const { s, times } = setup();
  await s.load(project);
  times.length = 0;
  s.cropMode(null);
  await new Promise((r) => setTimeout(r, 0));
  expect(times.length).toBe(1);
});

test('loading a project starts decoding its audio, so the first play does not wait for it', async () => {
  const spy = vi.spyOn(AudioEngine.prototype, 'prepare');
  const { s } = setup();
  await s.load(project);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

test('the session tells the preview tools after drawing, and is busy while playing', async () => {
  let drawn = 0;
  const { s } = setup();
  (s as any).d.onDrawn = () => drawn++;
  await s.load(project);
  expect(drawn).toBeGreaterThan(0);
  expect([s.busy, s.current?.meta.name]).toEqual([false, 't']);
  await s.play(0);
  expect(s.busy).toBe(true);
  s.pause();
  expect(s.busy).toBe(false);
});

test('loading another project releases the previous audio engine', async () => {
  const spy = vi.spyOn(AudioEngine.prototype, 'dispose');
  const { s } = setup();
  await s.load(project);
  await s.load(project);
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});

test('pausing playback lets the preview tools redraw (the selection box comes back)', async () => {
  let drawn = 0;
  const { s } = setup();
  await s.load(project);
  await s.play(0);
  (s as any).d.onDrawn = () => drawn++;
  s.pause();
  await new Promise((r) => setTimeout(r, 0));   // the paused frame is redrawn (and the videos synced) asynchronously
  expect(drawn).toBe(1);
});

test('a play that fails to start does not leave the session busy', async () => {
  const frames: Array<() => void> = [];
  const ctx = { ...fakeCtx(), resume: async () => { throw new Error('audio device lost'); } };
  const s = new PreviewSession({ stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime() {}, onEnded() {}, onError() {}, raf: (f) => { frames.push(f); }, makeAudioContext: () => ctx as any });
  await s.load(project);
  await expect(s.play(0)).rejects.toThrow('audio device lost');
  expect(s.busy).toBe(false);
});

test('playback time advances evenly per frame even though the audio clock moves in quanta', async () => {
  let wall = 0;
  const q = 128 / 48000, ctx: any = { ...fakeCtx() };
  Object.defineProperty(ctx, 'currentTime', { get: () => Math.floor((wall + ((Math.round(wall * 60) * 7919) % 13) / 1000) / q) * q });
  const frames: Array<() => void> = [], times: number[] = [];
  const s = new PreviewSession({ stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime: (t) => times.push(t), onEnded() {}, onError() {}, raf: (f) => { frames.push(f); }, makeAudioContext: () => ctx, wallClock: () => wall });
  await s.load(project);
  await s.play(0);
  times.length = 0;
  for (let i = 1; i <= 120; i++) { wall = i / 60; for (const f of frames.splice(0)) f(); }
  const steps = times.slice(60).map((t, i) => (t - times[59 + i]) * 1000);
  expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(2);
});

test('pausing stops the preview videos too (they are synced paused at the pause time)', async () => {
  const { s } = setup();
  await s.load(project);
  await s.play(0);
  const spy = vi.spyOn(MediaPool.prototype, 'sync');
  s.pause();
  expect(spy).toHaveBeenCalled();
  expect((s as any).pool.playing).toBe(false);
  spy.mockRestore();
});
test('an edit of the project length or sound keeps the audio engine (no new AudioContext, no re-decoding)', async () => {
  const dispose = vi.spyOn(AudioEngine.prototype, 'dispose'), setPlan = vi.spyOn(AudioEngine.prototype, 'setPlan');
  try {
    const { s } = setup();
    await s.load(project);
    const mix = { ...project.meta.mix, master: 0.5 };
    await s.patch({ ...project, meta: { ...project.meta, duration: project.meta.duration + 2, mix } });
    expect(dispose).not.toHaveBeenCalled();
    expect(setPlan).toHaveBeenLastCalledWith(expect.anything(), mix, project.meta.duration + 2);
  } finally { dispose.mockRestore(); setPlan.mockRestore(); }
});

test('a settings change while play() is starting still starts playback', async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const errors: string[] = [];
  const s = new PreviewSession({ stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime() {}, onEnded() {}, onError: (_id, m) => errors.push(m), raf() {}, makeAudioContext: () => fakeCtx(gate) });
  await s.load(project);
  const started = s.play(0);
  await new Promise((r) => setTimeout(r, 0));                               // play() waits for the audio device
  await s.patch({ ...project, meta: { ...project.meta, fps: 25 } });      // project settings: a new audio engine
  open();
  await started;
  expect([s.busy, errors]).toEqual([true, []]);
});

test('the first frames after play() never report a time before the start (the audio starts 50 ms ahead)', async () => {
  const { s, times, tick } = setup();
  await s.load(project);
  await s.play(2);
  times.length = 0;
  tick(); tick();
  expect(Math.min(...times)).toBeGreaterThanOrEqual(2);
});

test('loading a project waits for plugin items to load their assets before drawing', async () => {
  let open!: () => void;
  const spy = vi.spyOn(Stage.prototype, 'ready').mockReturnValue(new Promise<void>((r) => (open = r)));
  try {
    const { s } = setup();
    let loaded = false;
    const l = s.load(project).then(() => (loaded = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(loaded).toBe(false);
    open();
    await l;
    expect(loaded).toBe(true);
  } finally { spy.mockRestore(); }
});

// three.js only for projects that use it (spec 2026-10-25-brand-preset §6.1)
import { corePlugin, type ItemType, type Plugin } from '@tellcut/engine';
const KIT = { kit: true };
let built: unknown[], late: number[];
const cube: ItemType = { type: 'fx.cube', label: 'cube', kind: 'overlay', three: true, params: [],
  build: (c) => { built.push(c.three); return {}; }, draw() {}, late: (c) => { late.push(c.t); } };
const extra: Plugin[] = [corePlugin, { id: 'fx', items: [cube] }];
const with3d = { ...project, tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'fx.cube', start: 0, end: 10, params: {} }] }] };
function setup3d() {
  const loadThree = vi.fn(async () => KIT), frames: Array<() => void> = [];
  const s = new PreviewSession({ stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime() {}, onEnded() {}, onError() {}, raf: (f) => { frames.push(f); }, makeAudioContext: () => fakeCtx(), loadThree, plugins: extra });
  return { s, loadThree, tick: () => { for (const f of frames.splice(0)) f(); } };
}
beforeEach(() => { built = []; late = []; });

test('crop mode asked for while a 3D project is still loading three waits for the new stage instead of throwing', async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r)), errors: string[] = [];
  const resolver: any = { video: () => ({ url: 'http://h/a.jpg', time: 0 }), rate: () => 1, still: () => '', image: () => 'http://h/a.jpg' };
  const host = document.createElement('div'), stageEl = document.createElement('div');
  host.appendChild(stageEl);
  const s = new PreviewSession({ stageEl, resolver, projectUrl: 'http://h/p.json',
    onTime() {}, onEnded() {}, onError: (_id, m) => errors.push(m), raf: () => {}, makeAudioContext: () => fakeCtx(), loadThree: async () => { await gate; return KIT; }, plugins: extra });
  const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  const p = { ...with3d, sources: { s: { kind: 'image', path: 'a.jpg', duration: 20, width: 320, height: 180 } },
    tracks: [{ id: 'v', kind: 'video', items: [{ id: 'v1', source: 's', in: 0, speed: 1, start: 0, end: 4, frame: [0, 0, 1, 1], crop, interp: 'none' }] }, ...with3d.tracks] };
  const loading = s.load(p);
  await new Promise((r) => setTimeout(r, 0));
  expect(() => s.cropMode({ itemId: 'v1', which: 'from' })).not.toThrow();
  open();
  await loading;
  expect(errors).toEqual([]);
  expect(stageEl.style.visibility).toBe('hidden');   // the crop view is up, over the new stage
});

test('a project with no 3D item never loads three', async () => {
  const { s, loadThree } = setup3d();
  await s.load(project);
  expect(loadThree).not.toHaveBeenCalled();
});

test('a project with a 3D item loads three before building it, and its build sees ctx.three', async () => {
  const { s, loadThree } = setup3d();
  await s.load(with3d);
  expect(loadThree).toHaveBeenCalledTimes(1);
  expect(built).toEqual([KIT]);
});

test('patch that adds the first 3D item loads three', async () => {
  const { s, loadThree } = setup3d();
  await s.load(project);
  await s.patch(with3d);
  expect(loadThree).toHaveBeenCalledTimes(1);
  expect(built.at(-1)).toBe(KIT);
  await expect(s.patch(project)).resolves.toBeUndefined();
});

test('three.js that fails to load does not fail the preview: it goes on flat, says so, and tries again on the next load', async () => {
  const errors: string[] = [];
  const loadThree = vi.fn(async () => { throw new Error('chunk offline'); });
  const s = new PreviewSession({ stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime() {}, onEnded() {}, onError: (_id, m) => { errors.push(m); }, raf: () => {}, makeAudioContext: () => fakeCtx(), loadThree, plugins: extra });
  await expect(s.load(with3d)).resolves.toBe(10);
  expect(built).toEqual([undefined]);                     // built without ctx.three
  expect(errors.some((m) => m.includes('chunk offline'))).toBe(true);
  await s.patch(with3d);                                   // an edit does not reload the whole stage to try again
  expect(loadThree).toHaveBeenCalledTimes(1);
  loadThree.mockResolvedValueOnce(KIT as never);
  await s.load(with3d);
  expect(built.at(-1)).toBe(KIT);
});

test('show and the play loop run the late pass after the media sync', async () => {
  const { s, tick } = setup3d();
  await s.load(with3d);
  late.length = 0;
  await s.seek(2);
  expect(late[0]).toBe(2);   // (and again once the videos land: see the test below)
  await s.play(3);
  tick(); tick();
  expect(late.length).toBeGreaterThanOrEqual(3);
});

test('a paused 3D frame is drawn again once the preview videos have landed on the time', async () => {
  const settled = vi.spyOn(MediaPool.prototype, 'settled').mockResolvedValue(undefined);
  try {
    const { s } = setup3d();
    await s.load(with3d);
    late.length = 0;
    await s.seek(2);
    expect(settled).toHaveBeenCalled();
    expect(late).toEqual([2, 2]);
    await s.load(project);   // no 3D: no waiting
    settled.mockClear();
    await s.seek(1);
    expect(settled).not.toHaveBeenCalled();
  } finally { settled.mockRestore(); }
});

test('loading another project lets the previous stage\'s items go (their GPU things)', async () => {
  const { s } = setup();
  await s.load(project);
  const first = (s as any).stage as Stage, spy = vi.spyOn(first, 'destroy');
  await s.load(project);
  expect((s as any).stage).not.toBe(first);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('loading another project lets the previous pool\'s video elements go', async () => {
  const spy = vi.spyOn(MediaPool.prototype, 'dispose');
  try {
    const { s } = setup();
    await s.load(project);
    const first = (s as any).pool as MediaPool;
    await s.load(project);
    expect([spy.mock.contexts, (s as any).pool !== first]).toEqual([[first], true]);
  } finally { spy.mockRestore(); }
});

test('playback reaching the end draws the last frame once', async () => {
  let wall = 0, drawn = 0, ended = 0;
  const ctx: any = { ...fakeCtx() };
  Object.defineProperty(ctx, 'currentTime', { get: () => wall });
  const frames: Array<() => void> = [];
  const s = new PreviewSession({ stageEl: document.createElement('div'), resolver: {} as any, projectUrl: 'http://h/p.json',
    onTime() {}, onEnded: () => ended++, onError() {}, raf: (f) => { frames.push(f); }, makeAudioContext: () => ctx, wallClock: () => wall,
    onDrawn: () => drawn++ });
  await s.load(project);
  await s.play(9.5);
  drawn = 0;
  for (let i = 1; i <= 120 && !ended; i++) { wall = i / 30; for (const f of frames.splice(0)) f(); }
  await new Promise((r) => setTimeout(r, 0));
  expect([ended, drawn, s.busy]).toEqual([1, 1, false]);
});
