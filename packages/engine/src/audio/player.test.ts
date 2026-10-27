import { AudioEngine } from './player.ts';

function liveCtx() {
  const made: any[] = [];
  const decoded: number[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (kind: string) => {
    const n: any = { kind, connections: [] as any[], disconnected: false, gain: param(), playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), buffer: null,
      connect(o: any) { n.connections.push(o); return o; }, disconnect() { n.disconnected = true; }, start() {}, stop() {} };
    made.push(n);
    return n;
  };
  const ctx: any = {
    sampleRate: 48000, currentTime: 0, destination: { kind: 'destination' },
    createAnalyser: () => { const n = node('analyser'); n.fftSize = 2048; n.getFloatTimeDomainData = (a: Float32Array) => { a.fill(0); a[10] = -0.5; }; return n; },
    createGain: () => node('gain'), createDynamicsCompressor: () => node('comp'), createConvolver: () => node('conv'), createBufferSource: () => node('src'),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    close: async () => { ctx.closed = true; },
    decodeAudioData: async (ab: ArrayBuffer) => { decoded.push(ab.byteLength); return {}; }, resume: async () => {}, suspend: async () => {},
  };
  return { ctx, made, decoded };
}
const mix = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.01, send: 0.3 } };

test('each play() routes through its own output that stop() disconnects (no ghost sfx after a seek)', async () => {
  const { ctx, made } = liveCtx();
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: {} }, () => undefined, mix, 10, () => ctx);
  await eng.play(0);
  const out1 = made.find((n) => n.connections.includes(ctx.destination));
  expect(out1.kind).toBe('gain');
  expect(made.filter((n) => n.kind === 'comp')[0].connections).toContain(out1);
  eng.stop();
  expect(out1.disconnected).toBe(true);
  await eng.play(5);
  const outs = made.filter((n) => n.connections.includes(ctx.destination));
  expect(outs.length).toBe(2);
  expect(outs[1].disconnected).toBe(false);
});

test("a new plan's buffers are decoded before the next play()", async () => {
  const { ctx } = liveCtx();
  const decoded: number[] = [];
  ctx.decodeAudioData = async (ab: ArrayBuffer) => { decoded.push(ab.byteLength); return {}; };
  const fetchFn: any = async (url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(url === 'a.wav' ? 1 : 2) });
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { a: 'a.wav' } }, () => undefined, mix, 10, () => ctx);
  await eng.load(fetchFn);
  await eng.play(0);
  eng.setPlan({ tracks: [], segs: [], sfx: [], buffers: { a: 'a.wav', b: 'b.wav' } });
  await eng.load(fetchFn);
  await eng.play(0);
  expect(decoded).toEqual([1, 2]);
});

test('load can skip buffers that fail (preview with offline media) and report each once', async () => {
  const { ctx } = liveCtx();
  const failed: string[] = [];
  const fetchFn: any = async (url: string) => (url === 'gone.mp3' ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  const plan = { tracks: [], segs: [], sfx: [], buffers: { a: 'a.wav', g: 'gone.mp3' } };
  const eng = new AudioEngine(plan, () => undefined, mix, 10, () => ctx);
  await eng.load(fetchFn, (url, e) => failed.push(`${url}: ${e.message}`));
  await eng.load(fetchFn, (url, e) => failed.push(`${url}: ${e.message}`));
  expect(failed).toEqual(['gone.mp3: 404 gone.mp3']);
  await eng.play(0);
  await expect(new AudioEngine(plan, () => undefined, mix, 10, () => ctx).load(fetchFn)).rejects.toThrow('404 gone.mp3');
});

test('buffers the current plan no longer uses are dropped (fetched again only if needed later)', async () => {
  const { ctx } = liveCtx();
  const urls: string[] = [];
  const fetchFn: any = async (u: string) => { urls.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; };
  const plan = (buffers: Record<string, string>) => ({ tracks: [], segs: [], sfx: [], buffers });
  const eng = new AudioEngine(plan({ a: 'a.wav' }), () => undefined, mix, 10, () => ctx);
  await eng.load(fetchFn);
  eng.setPlan(plan({ b: 'b.wav' })); await eng.load(fetchFn);
  eng.setPlan(plan({ a: 'a.wav' })); await eng.load(fetchFn);
  expect(urls).toEqual(['a.wav', 'b.wav', 'a.wav']);
});

test('level() reports the output peak in dBFS, -120 when stopped', async () => {
  const { ctx } = liveCtx();
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: {} }, () => undefined, mix, 10, () => ctx);
  expect(eng.level()).toBe(-120);
  await eng.play(0);
  expect(eng.level()).toBeCloseTo(-6.02, 2);
  eng.stop();
  expect(eng.level()).toBe(-120);
});

test('prepare() decodes every loaded buffer once, ahead of play()', async () => {
  const { ctx, decoded } = liveCtx();
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { a: 'u1', b: 'u2' } }, () => undefined, mix, 10, () => ctx);
  await eng.load(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as any);
  await Promise.all([eng.prepare(), eng.prepare()]);
  expect(decoded.length).toBe(2);
  await eng.play(0);
  expect(decoded.length).toBe(2);
});

test('a buffer that cannot be decoded is reported once and left out; the others still play', async () => {
  const { ctx } = liveCtx();
  const decoded: number[] = [], errors: string[] = [];
  ctx.decodeAudioData = async (ab: ArrayBuffer) => { if (ab.byteLength === 3) throw new Error('unsupported'); decoded.push(ab.byteLength); return {}; };
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { ok: 'ok.wav', bad: 'bad.m4a' } }, () => undefined, mix, 10, () => ctx);
  eng.onDecodeError = (k, e) => errors.push(`${k}: ${e.message}`);
  const fetched: string[] = [];
  const fetchFn = (async (u: string) => { fetched.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(u === 'bad.m4a' ? 3 : 8) }; }) as any;
  await eng.load(fetchFn, () => {});
  await eng.play(0);
  await eng.play(1);                                   // not decoded (and reported) again
  await eng.load(fetchFn, () => {});                   // the next edit's load: not fetched again either
  expect(decoded).toEqual([8]);
  expect(errors).toEqual(['bad: unsupported']);
  expect(fetched).toEqual(['ok.wav', 'bad.m4a']);
});

test('dispose() closes the live audio context', async () => {
  const { ctx } = liveCtx();
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: {} }, () => undefined, mix, 10, () => ctx);
  await eng.prepare();
  eng.dispose();
  expect(ctx.closed).toBe(true);
});

test('a file that failed is tried again a while later (put back on the disk), still reported only once', async () => {
  vi.useFakeTimers();
  try {
    const { ctx } = liveCtx();
    let back = false, fetched = 0;
    const failed: string[] = [];
    const fetchFn: any = async (url: string) => { fetched++; return url === 'm.mp3' && !back ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; };
    const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { m: 'm.mp3' } }, () => undefined, mix, 10, () => ctx);
    const load = () => eng.load(fetchFn, (url) => failed.push(url));
    await load();
    await load();
    expect(fetched).toBe(1);                                        // right after: not fetched again on every edit
    vi.advanceTimersByTime(11000);
    await load();                                                   // still gone: tried, not reported again
    expect([fetched, failed]).toEqual([2, ['m.mp3']]);
    back = true;
    vi.advanceTimersByTime(11000);
    await load();
    expect(fetched).toBe(3);
    await eng.prepare();
    expect(eng.loaded()).toEqual(['m']);
  } finally { vi.useRealTimers(); }
});

test('a file that fetches but cannot be decoded is tried again later without being reported again', async () => {
  vi.useFakeTimers();
  try {
    const { ctx } = liveCtx();
    ctx.decodeAudioData = async () => { throw new Error('bad data'); };
    const errors: string[] = [];
    const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: { m: 'm.mp3' } }, () => undefined, mix, 10, () => ctx);
    eng.onDecodeError = (k) => errors.push(k);
    const fetchFn: any = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
    await eng.load(fetchFn, () => errors.push('fetch'));
    await eng.prepare();
    vi.advanceTimersByTime(11000);
    await eng.load(fetchFn, () => errors.push('fetch'));
    await eng.prepare();
    expect(errors).toEqual(['m']);
  } finally { vi.useRealTimers(); }
});

test('overlapping play() calls leave one live output; a stop() during a starting play() silences it', async () => {
  const { ctx, made } = liveCtx();
  const eng = new AudioEngine({ tracks: [], segs: [], sfx: [], buffers: {} }, () => undefined, mix, 10, () => ctx);
  const live = () => made.filter((n) => n.connections.includes(ctx.destination) && !n.disconnected);
  await Promise.all([eng.play(0), eng.play(3)]);
  expect(live().length).toBe(1);
  eng.stop();
  const p = eng.play(5); eng.stop(); await p;
  expect(live().length).toBe(0);
});
