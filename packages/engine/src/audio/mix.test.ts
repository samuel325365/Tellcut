import { buildMix, envelope, envelopeAt } from './mix.ts';

function fakeCtx() {
  const log: string[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime: (v: number, t: number) => log.push(`${name}.set(${+v.toFixed(4)},${+t.toFixed(4)})`),
    linearRampToValueAtTime: (v: number, t: number) => log.push(`${name}.ramp(${+v.toFixed(4)},${+t.toFixed(4)})`),
    exponentialRampToValueAtTime: () => {},
  });
  let n = 0;
  const node = (kind: string) => {
    const id = `${kind}${n++}`;
    return { id, gain: param(`${id}.gain`), playbackRate: param(`${id}.rate`), threshold: param('th'), ratio: param('ra'), attack: param('at'), release: param('re'),
      buffer: null as any, connect(o: any) { return o; },
      start: (t: number, off: number) => log.push(`${id}.start(${+t.toFixed(4)},${+off.toFixed(4)})`),
      stop: (t: number) => log.push(`${id}.stop(${+t.toFixed(4)})`) };
  };
  const ctx: any = {
    sampleRate: 48000, destination: {},
    createGain: () => node('g'), createDynamicsCompressor: () => node('comp'), createConvolver: () => node('conv'),
    createBufferSource: () => node('src'),
    createBuffer: (ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, log };
}

const mix = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.008, release: 0.25 }, reverb: { seconds: 0.01, send: 0.4 } };

test('segments follow the original seg() automation exactly (from = 0)', () => {
  const { ctx, log } = fakeCtx();
  const plan: any = { tracks: [{ id: 'orig', gain: 1 }], sfx: [], buffers: {},
    segs: [{ buffer: 'b', track: 'orig', item: 'x', a: 2, b: 6, off: 0.5, gain: 0.7, fadeIn: 0.12, fadeOut: 0.35, rate: 1.5 }] };
  buildMix(ctx, plan, new Map([['b', {} as any]]), () => undefined, mix, 0, 0);
  const src = log.filter((l) => /^src|^g\d+\.gain/.test(l)).filter((l) => !l.includes('.rate'));
  expect(src.slice(-7)).toEqual([
    expect.stringMatching(/\.gain\.set\(0,0\)$/),
    expect.stringMatching(/\.gain\.set\(0,2\)$/),
    expect.stringMatching(/\.gain\.ramp\(0\.7,2\.12\)$/),
    expect.stringMatching(/\.gain\.set\(0\.7,5\.65\)$/),
    expect.stringMatching(/\.gain\.ramp\(0,6\)$/),
    expect.stringMatching(/\.start\(2,0\.5\)$/),
    expect.stringMatching(/\.stop\(6\.05\)$/),
  ]);
});

test('track envelope starts at its first value then ramps', () => {
  const { ctx, log } = fakeCtx();
  const plan: any = { tracks: [{ id: 'mus', gain: 1, envelope: [[1, 1], [1.3, 0.42]] }], segs: [], sfx: [], buffers: {} };
  buildMix(ctx, plan, new Map(), () => undefined, mix, 0, 0);
  expect(log.filter((l) => l.includes('.gain.') && /set\(1,0\)|ramp/.test(l))).toEqual([
    expect.stringMatching(/set\(1,0\)$/), expect.stringMatching(/ramp\(1,1\)$/), expect.stringMatching(/ramp\(0\.42,1\.3\)$/),
  ]);
});

test('sfx before the restart point are skipped unless within lookback', () => {
  const { ctx } = fakeCtx();
  const calls: number[] = [];
  const type: any = { lookback: 2, synth: (_c: any, _b: any, at: number) => calls.push(at) };
  const plan: any = { tracks: [{ id: 'fx', gain: 1 }], segs: [], buffers: {},
    sfx: [{ type: 'r', t: 9, params: {}, gain: 1, track: 'fx' }, { type: 'r', t: 4, params: {}, gain: 1, track: 'fx' }] };
  buildMix(ctx, plan, new Map(), () => type, mix, 10, 100);
  expect(calls).toEqual([99]);
});

// a fresh editor tab: the context was suspended until now, so currentTime (and base) is about 0 while from is not
test('a preview started inside a fade-in begins at the level the fade has reached there; no time is scheduled before 0', () => {
  const { ctx, log } = fakeCtx();
  const plan: any = { tracks: [{ id: 'mus', gain: 1 }], sfx: [], buffers: {},
    segs: [{ buffer: 'b', track: 'mus', item: 'x', a: 0, b: 6, off: 0, gain: 0.8, fadeIn: 1, fadeOut: 0, rate: 1 }] };
  buildMix(ctx, plan, new Map([['b', {} as any]]), () => undefined, mix, 0.5, 0.05);
  // it used to set the gain at the fade's start, 0.45 s before 0: Chrome throws a RangeError and the preview did not play
  expect(log.filter((l) => /^g\d+\.gain/.test(l)).slice(1, 3)).toEqual([expect.stringMatching(/\.set\(0\.4,0\.05\)$/), expect.stringMatching(/\.ramp\(0\.8,0\.55\)$/)]);
  expect(log.filter((l) => /,-/.test(l) || /\(-/.test(l))).toEqual([]);
});

test('a sound still within its lookback is never scheduled before 0', () => {
  const { ctx } = fakeCtx();
  const calls: number[] = [];
  const type: any = { lookback: 4, synth: (_c: any, _b: any, at: number) => calls.push(at) };
  const plan: any = { tracks: [{ id: 'fx', gain: 1 }], segs: [], buffers: {}, sfx: [{ type: 'whoosh', t: 2, params: {}, gain: 1, track: 'fx' }] };
  buildMix(ctx, plan, new Map(), () => type, mix, 3, 0.05);
  expect(calls).toEqual([0]);
});

test('sfx params fall back to the type defaults', () => {
  const { ctx } = fakeCtx();
  let got: any;
  const type: any = { params: [{ key: 'dur', label: 'd', type: 'number', default: 2 }], synth: (_c: any, _b: any, _at: number, p: any) => (got = p) };
  const plan: any = { tracks: [{ id: 'fx', gain: 1 }], segs: [], buffers: {}, sfx: [{ type: 'r', t: 1, params: {}, gain: 1, track: 'fx' }] };
  buildMix(ctx, plan, new Map(), () => type, mix, 0, 0);
  expect(got).toEqual({ dur: 2 });
});

const recorder = () => {
  const calls: string[] = [];
  return { calls, param: { setValueAtTime: (v: number, t: number) => calls.push(`set(${+v.toFixed(4)},${+t.toFixed(4)})`), linearRampToValueAtTime: (v: number, t: number) => calls.push(`ramp(${+v.toFixed(4)},${+t.toFixed(4)})`) } as any };
};
const censorEnv: Array<[number, number]> = [[0.992, 1], [1, 0], [3, 0], [3.008, 1]];

test('an envelope value at any time: flat before the first point and after the last, linear between', () => {
  expect([envelopeAt(censorEnv, 0), envelopeAt(censorEnv, 0.996), envelopeAt(censorEnv, 2), envelopeAt(censorEnv, 9)]).toEqual([1, 0.5, 0, 1]);
});

test('a preview started inside a censor stays silent until the censor ends', () => {
  const { calls, param } = recorder();
  envelope(param, censorEnv, (t) => 10 + (t - 2), 2);          // restart at timeline 2 s = context 10 s
  expect(calls).toEqual(['set(0,10)', 'ramp(0,11)', 'ramp(1,11.008)']);
});

test('an export (from 0) schedules the envelope as before', () => {
  const { calls, param } = recorder();
  envelope(param, censorEnv, (t) => t, 0);
  expect(calls).toEqual(['set(1,0)', 'ramp(1,0.992)', 'ramp(0,1)', 'ramp(0,3)', 'ramp(1,3.008)']);
});

test('a preview started exactly on a step (two points at one time) takes the value after the step, like the export', () => {
  const step: Array<[number, number]> = [[0, 1], [5, 1], [5, 0], [6, 0], [6, 1]];
  expect([envelopeAt(step, 5), envelopeAt(step, 6), envelopeAt(step, 5.5)]).toEqual([0, 1, 0]);
  const a = recorder(); envelope(a.param, step, (t) => t, 5);
  expect(a.calls).toEqual(['set(0,5)', 'ramp(0,6)', 'ramp(1,6)']);
  const b = recorder(); envelope(b.param, step, (t) => t, 6);
  expect(b.calls).toEqual(['set(1,6)']);
});

test('a preview started inside a fade-out begins at the level the fade has reached there, not at full level', () => {
  const { ctx, log } = fakeCtx();
  const plan: any = { tracks: [{ id: 'mus', gain: 1 }], sfx: [], buffers: {},
    segs: [{ buffer: 'b', track: 'mus', item: 'x', a: 0, b: 6, off: 0, gain: 0.8, fadeIn: 0, fadeOut: 2, rate: 1 }] };
  buildMix(ctx, plan, new Map([['b', {} as any]]), () => undefined, mix, 5, 0);
  // the last level set before the ramp down is what plays from the start: half way through the fade, half the gain
  const g = log.filter((l) => /^g\d+\.gain/.test(l));
  expect(g.slice(-2)).toEqual([expect.stringMatching(/\.set\(0\.4,0\)$/), expect.stringMatching(/\.ramp\(0,1\)$/)]);
});
