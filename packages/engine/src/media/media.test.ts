// @vitest-environment jsdom
import { videoKey, stillKey, audioKey, videoRefOf, audioRefOf } from './refs.ts';
import { apiResolver, cacheResolver, sourceResolver } from './resolvers.ts';
import { clampMediaTime, renderSeekTime } from './pool.ts';

const item: any = { id: 'c', source: 'w1', in: 9.5, speed: 0.55, start: 10, end: 12, interp: 'mci' };

test('keys are stable strings', () => {
  expect(videoKey(videoRefOf(item, 10, 12))).toBe('v|w1|9.5000|10.6000|0.55|mci');
  expect(stillKey({ source: 'k2', t: 11 })).toBe('s|k2|11.0000|0|0');
  expect(stillKey({ source: 'k2', t: 0.2, strip: { n: 12, dur: 4.4 } })).toBe('s|k2|0.2000|0|0|strip12x4.4000');
  expect(audioKey(audioRefOf({ id: 'a', source: 'k4', in: 43.25, rate: 1 } as any, 14.8, 18.4))).toBe('a|k4|43.2500|46.8500');
});

test('freezeAt shortens the needed source range', () => {
  const r = videoRefOf({ ...item, speed: 1, freezeAt: 0.5 }, 10, 12);
  expect(r.out).toBeCloseTo(9.5 + 0.6);
});

test('cache resolver maps to pre-retimed cuts (time = local)', () => {
  const ref = videoRefOf(item, 10, 12);
  const r = cacheResolver({ videos: { [videoKey(ref)]: 'cache/cuts/x.mp4' }, stills: {}, audio: {} }, 'http://h/tellcut/projects/w/project.json');
  expect(r.video(ref, 1.25)).toEqual({ url: 'http://h/tellcut/projects/w/cache/cuts/x.mp4', time: 1.25 });
  expect(r.rate(ref)).toBe(1);
});

test('source resolver plays the original file at speed', () => {
  const p: any = { sources: { k2: { path: '../../../sources/Kyoto/video2.mp4' } } };
  const r = sourceResolver(p, 'http://h/tellcut/projects/kyoto/project.json');
  const ref = { source: 'k2', in: 10, out: 12, speed: 0.5, interp: 'none' as const };
  expect(r.video(ref, 2)).toEqual({ url: 'http://h/sources/Kyoto/video2.mp4', time: 11 });
  expect(r.rate(ref)).toBe(0.5);
});

test('clamps media time to the last frame', () => {
  expect(clampMediaTime(9.99, 4, 30)).toBeCloseTo(4 - 1 / 30);
  expect(clampMediaTime(-1, 4, 30)).toBe(0);
  expect(clampMediaTime(2, NaN, 30)).toBe(2);
});

test('render seeks the middle of the media frame the film frame lands on, whatever the float noise', () => {
  // a clip at 0.4 s, film frame 42: 42/30 - 0.4 is 0.9999999999999999, and flooring that showed media frame 29 twice, never 30
  expect(renderSeekTime(42 / 30 - 0.4, 30)).toBeCloseTo(30.5 / 30, 9);
  // clips start on film frames, stored to 6 decimals (38/30 → 1.266667, a hair late): film frame s + k shows media frame k
  const r6 = (t: number) => Math.round(t * 1e6) / 1e6;
  for (const fps of [24, 25, 30, 60]) for (const s of [3, 12, 21, 38, 47, 76, 99]) {
    const shown = Array.from({ length: 300 }, (_, k) => Math.round(renderSeekTime((s + k) / fps - r6(s / fps), fps) * fps - 0.5));
    expect(shown).toEqual(Array.from({ length: 300 }, (_, k) => k));
  }
});

import { MediaPool } from './pool.ts';
const fixed = (url: string): any => ({ video: () => ({ url, time: 0 }), rate: () => 1, still: () => '', audio: () => ({ url: '', offset: 0 }) });
const ref0 = { source: 's', in: 0, out: 2, speed: 1, interp: 'none' as const };

test('two layers using the same clip in one frame get separate video elements', () => {
  const pool = new MediaPool(fixed('http://h/x.mp4'), { render: false, fps: 30 });
  const a = document.createElement('div'), b = document.createElement('div');
  pool.begin();
  const v1 = pool.video(ref0, a, 0), v2 = pool.video(ref0, b, 1);
  expect(v1).not.toBe(v2);
  expect(v1.parentNode).toBe(a);
  expect(v2.parentNode).toBe(b);
  pool.begin();
  expect(pool.video(ref0, a, 0)).toBe(v1);
});

test('render mode: a seek that never completes is retried once, then fails naming the clip', async () => {
  const pool = new MediaPool(fixed('http://h/x.mp4'), { render: true, fps: 30, seekTimeout: 20 });
  pool.begin();
  pool.video(ref0, document.createElement('div'), 0);
  await expect(pool.sync()).rejects.toThrow(/Seek timed out: http:\/\/h\/x\.mp4 at 0\.0167 s/);
});

test('render mode: a clip that fails to load rejects preload', async () => {
  const pool = new MediaPool(fixed('http://h/missing.mp4'), { render: true, fps: 30 });
  const p = pool.preload([ref0]);
  ((pool as any).videos.get(videoKey(ref0))[0] as HTMLVideoElement).dispatchEvent(new Event('error'));
  await expect(p).rejects.toThrow('Failed to load http://h/missing.mp4');
});

test("api resolver points at the server's proxy, still and audio endpoints", () => {
  const r = apiResolver('kyoto', 'http://127.0.0.1:5174');
  const ref = { source: 'k2', in: 10, out: 12, speed: 0.5, interp: 'none' as const };
  expect(r.video(ref, 2)).toEqual({ url: 'http://127.0.0.1:5174/api/projects/kyoto/media/proxy/k2', time: 11 });
  expect(r.rate(ref)).toBe(0.5);
  expect(r.still({ source: 'k2', t: 11, strip: { n: 12, dur: 4.4 } })).toBe('http://127.0.0.1:5174/api/projects/kyoto/media/still?source=k2&t=11&n=12&dur=4.4');
  expect(r.still({ source: 'k2', t: 3, w: 540, square: 200 })).toBe('http://127.0.0.1:5174/api/projects/kyoto/media/still?source=k2&t=3&w=540&square=200');
  // whole 5 s steps (plus the server's 2 s pad): the offset is where the clip's in sits in the padded segment
  expect(r.audio({ source: 'k4', in: 43.25, out: 46.85 })).toEqual({ url: 'http://127.0.0.1:5174/api/projects/kyoto/media/audio?source=k4&in=40&out=50', offset: 5.25 });
  expect(r.audio({ source: 'k4', in: 0.5, out: 2 }).offset).toBe(0.5);
  // trimming a little on every drag frame asks for the same segment (one ffmpeg cut, not one per frame)
  expect(new Set([46.85, 47.1, 48.6, 49.9].map((out) => r.audio({ source: 'k4', in: 43.25, out }).url)).size).toBe(1);
});

test('preload never hangs: preview gives up quietly after the timeout, render fails naming the url', async () => {
  const ref = { source: 'k2', in: 1, out: 2, speed: 1, interp: 'none' as const };
  const res = cacheResolver({ videos: { [videoKey(ref)]: 'cache/x.mp4' }, stills: {}, audio: {} }, 'http://h/p/project.json');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await new MediaPool(res, { render: false, fps: 30, preloadTimeout: 50 }).preload([ref]);   // jsdom videos never fire media events
  expect(warn.mock.calls[0][0]).toContain('http://h/p/cache/x.mp4');
  warn.mockRestore();
  await expect(new MediaPool(res, { render: true, fps: 30, preloadTimeout: 50 }).preload([ref])).rejects.toThrow('Timed out loading http://h/p/cache/x.mp4');
}, 5000);

test('preview reuses one video element per media url across trims; render keeps one per clip', () => {
  const resolver: any = { video: (ref: any, local: number) => ({ url: `http://h/proxy/${ref.source}`, time: ref.in + local }), rate: () => 1 };
  const a = { source: 'k2', in: 1, out: 3, speed: 1, interp: 'none' as const }, b = { ...a, in: 1.5, out: 3.5 };
  const parent = document.createElement('div');
  const preview = new MediaPool(resolver, { render: false, fps: 30 });
  preview.begin(); const v1 = preview.video(a, parent, 0);
  preview.begin(); expect(preview.video(b, parent, 0)).toBe(v1);
  preview.begin(); preview.video(a, parent, 0); expect(preview.video(b, parent, 0)).not.toBe(v1);   // both on screen: two elements
  const render = new MediaPool(resolver, { render: true, fps: 30 });
  render.begin(); const r1 = render.video(a, parent, 0);
  render.begin(); expect(render.video(b, parent, 0)).not.toBe(r1);
});

test('the api resolver serves music by media id', () => {
  expect(apiResolver('my proj', 'http://h').music!('song 1', '../x.mp3')).toBe('http://h/api/projects/my%20proj/media/music/song%201');
});
test('photos resolve to the server image, the prepared copy, or the file itself', () => {
  expect(apiResolver('trip', 'http://h').image!('ph')).toBe('http://h/api/projects/trip/media/image/ph');
  expect(cacheResolver({ videos: {}, stills: {}, audio: {}, images: { ph: 'cache/images/a.jpg' } }, 'http://h/p/x/project.json').image!('ph')).toBe('http://h/p/x/cache/images/a.jpg');
  expect(sourceResolver({ sources: { ph: { path: '../pics/a.jpg', duration: 3600, width: 9, height: 9, kind: 'image' } } } as any, 'http://h/p/x/project.json').image!('ph')).toBe('http://h/p/pics/a.jpg');
});

test('stabilize goes into the media ref and changes the key only when set', () => {
  const it: any = { id: 'a', source: 's', in: 1, speed: 1, start: 0, end: 2, frame: [0, 0, 1, 1], crop: {}, interp: 'none' };
  const plain = videoRefOf(it, 0, 2);
  expect(plain.stab).toBeUndefined();
  expect(videoKey(plain)).toBe('v|s|1.0000|3.0000|1|none');
  const st = videoRefOf({ ...it, stabilize: { smoothing: 20, zoom: 3 } }, 0, 2);
  expect(st.stab).toEqual({ smoothing: 20, zoom: 3 });
  expect(videoKey(st)).toBe('v|s|1.0000|3.0000|1|none|stab20z3');
});

test('plugins reach files inside the project folder through every resolver that knows it', () => {
  expect(cacheResolver({ videos: {}, stills: {}, audio: {} }, 'http://h/tellcut/projects/k/project.json').file!('media/poke/x/f000.png'))
    .toBe('http://h/tellcut/projects/k/media/poke/x/f000.png');
  expect(sourceResolver({ sources: {} } as any, 'http://h/tellcut/projects/k/project.json').file!('media/'))
    .toBe('http://h/tellcut/projects/k/media/');
  expect(apiResolver('k p', 'http://o').file!('media/a b/c.png')).toBe('http://o/api/projects/k%20p/files/media/a%20b/c.png');
});

test('preview: a clip held on its freeze frame stays paused while playing, instead of playing and being pulled back', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(true);
  try {
    const resolver: any = { video: (ref: any, local: number) => ({ url: `http://h/proxy/${ref.source}`, time: ref.in + local }), rate: () => 1 };
    const pool = new MediaPool(resolver, { render: false, fps: 30 });
    pool.playing = true;
    pool.begin(); pool.video(ref0, document.createElement('div'), 1, true);
    await pool.sync();
    expect(play).not.toHaveBeenCalled();
    pool.begin(); pool.video(ref0, document.createElement('div'), 1);
    await pool.sync();
    expect(play).toHaveBeenCalledTimes(1);
  } finally { vi.restoreAllMocks(); }
});

test('settled waits for a preview video still seeking, and gives up after the timeout', async () => {
  const resolver: any = { video: () => ({ url: 'http://h/a.mp4', time: 1 }), rate: () => 1 };
  const pool = new MediaPool(resolver, { render: false, fps: 30 });
  const v = pool.video({ source: 's', in: 0, out: 5, speed: 1, interp: 'none' }, document.createElement('div'), 1);
  let seeking = true;
  Object.defineProperty(v, 'seeking', { get: () => seeking });
  Object.defineProperty(v, 'readyState', { get: () => (seeking ? 1 : 4) });
  let done = false;
  const p = pool.settled(1000).then(() => (done = true));
  await new Promise((r) => setTimeout(r, 20));
  expect(done).toBe(false);
  seeking = false; v.dispatchEvent(new Event('seeked'));
  await p;
  expect(done).toBe(true);
  seeking = true;
  const t0 = Date.now();
  await pool.settled(50);
  expect(Date.now() - t0).toBeLessThan(500);
});

test('preview preload never reloads an element that is only seeking (a reload resets it to 0 s); an errored one is tried again', async () => {
  const resolver: any = { video: () => ({ url: 'http://h/a.mp4', time: 1 }), rate: () => 1 };
  const pool = new MediaPool(resolver, { render: false, fps: 30, preloadTimeout: 2000 });
  const ref = { source: 's', in: 0, out: 5, speed: 1, interp: 'none' as const };
  const v = pool.video(ref, document.createElement('div'), 1);
  let ready = 1, err: unknown = null;
  Object.defineProperty(v, 'readyState', { get: () => ready });
  Object.defineProperty(v, 'networkState', { get: () => (err ? 3 : 2) });   // NETWORK_LOADING, or NETWORK_NO_SOURCE once failed
  Object.defineProperty(v, 'error', { get: () => err });
  const load = vi.spyOn(v, 'load').mockImplementation(() => {});
  const t0 = Date.now();
  const p = pool.preload([ref]);
  ready = 4; v.dispatchEvent(new Event('seeked'));
  await p;
  expect([load.mock.calls.length, Date.now() - t0 < 1000]).toEqual([0, true]);
  ready = 0; err = { code: 4 };
  const q = pool.preload([ref]);
  expect(load).toHaveBeenCalledTimes(1);
  v.dispatchEvent(new Event('error'));
  await q;
  // settled() does not wait on a video that failed (its readyState stays 0)
  const t1 = Date.now();
  pool.begin(); pool.video(ref, document.createElement('div'), 1);
  await pool.settled(600);
  expect(Date.now() - t1).toBeLessThan(300);
});

test('preview: in a dissolve between two clips of the same file, the incoming clip keeps its element when the outgoing one ends', async () => {
  const resolver: any = { video: (ref: any, local: number) => ({ url: 'http://h/proxy/s', time: ref.in + local }), rate: () => 1 };
  const pool = new MediaPool(resolver, { render: false, fps: 30 });
  const A = document.createElement('div'), B = document.createElement('div');
  const a = { source: 's', in: 1, out: 5, speed: 1, interp: 'none' as const }, b = { ...a, in: 10, out: 14 };
  pool.begin(); const va = pool.video(a, A, 3.5); await pool.sync();
  pool.begin(); pool.video(a, A, 3.9); const vb = pool.video(b, B, 0.1); await pool.sync();
  expect(vb).not.toBe(va);
  pool.begin(); expect(pool.video(b, B, 0.6)).toBe(vb);   // was handed va (parked at A's time): a seek on every dissolve
  // a layer drawn first still leaves the element another layer showed last frame to it
  pool.begin(); expect(pool.video(b, B, 0.7)).toBe(vb); expect(pool.video(a, A, 4)).toBe(va);
});

test('dispose lets every video element go: paused, its source dropped and reset, out of the page', () => {
  const pool = new MediaPool(fixed('http://h/x.mp4'), { render: false, fps: 30 });
  const parent = document.createElement('div');
  pool.begin(); const v = pool.video(ref0, parent, 0);
  const pause = vi.spyOn(v, 'pause').mockImplementation(() => {}), load = vi.spyOn(v, 'load').mockImplementation(() => {});
  pool.dispose();
  expect([pause.mock.calls.length, v.hasAttribute('src'), load.mock.calls.length, v.parentNode]).toEqual([1, false, 1, null]);
  pool.begin(); expect(pool.video(ref0, parent, 0)).not.toBe(v);
});
