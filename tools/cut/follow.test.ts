import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseProject, resolveTimes } from '@tellcut/engine';
import { fakeFaces, makePhoto, run, type FaceInfo } from '@tellcut/media-node';
import { Cut } from './cut.ts';
import { movingTimes, onFilm, pickFace, smooth, spotAt, stickerKeys, trackFace } from './follow.ts';
import { resolveAutoFocus } from './focus.ts';
import type { Inventory } from './inventory.ts';

const face = (x: number, w = 0.1): FaceInfo => ({ box: [x - w / 2, 0.3, w, w * 1.6], mouth: [x, 0.4], mouthW: w * 0.4 });

test('who picks the person; the track then keeps to that person and holds through a gap, which it reports', () => {
  const a = face(0.3), b = face(0.7, 0.15);
  expect(pickFace([a, b], 'largest')).toBe(b);
  expect(pickFace([a, b], 'left')).toBe(a);
  const samples = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6].map((t, i) => ({ t, faces: i >= 2 && i <= 7 ? [] : [face(0.3 + i * 0.005), face(0.7)] }));
  const { track, lost } = trackFace(samples, 'left');
  expect(track.every((x) => x.face && x.face.mouth[0] < 0.5)).toBe(true);   // never jumps to the right-hand person
  expect(track[5].face!.mouth[0]).toBeCloseTo(0.305, 3);                       // held at its last place
  expect(lost).toEqual([[0.4, 1.6]]);
});

test('a face gone for a while that comes back alone somewhere else is picked up again; a brief miss is not enough', () => {
  const samples = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2].map((t) => ({ t, faces: t < 0.3 ? [face(0.3)] : t < 0.9 ? [] : [face(0.6)] }));
  const { track, lost } = trackFace(samples, 'largest');
  expect(track.map((x) => x.face!.mouth[0])).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.6, 0.6]);
  expect(lost).toEqual([]);                                                        // 0.4–1.0 is not over a second
  const brief = trackFace([0, 0.2, 0.4].map((t) => ({ t, faces: t === 0.2 ? [] : t === 0 ? [face(0.3)] : [face(0.6)] })), 'largest');
  expect(brief.track.map((x) => x.face!.mouth[0])).toEqual([0.3, 0.3, 0.3]);
});

test('a face is mapped through the clip crop onto the film; the path is smoothed; keys move the anchor onto it', () => {
  // a 1920×1080 source filling a 1080×1920 film, cropped to its middle: the source's centre is the film's centre
  const clip: any = { id: 'c', source: 's', in: 0, speed: 1, start: 0, end: 4, frame: [0, 0, 1, 1], crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, interp: 'none' };
  const spot = onFilm(face(0.5), 'mouth', clip, { start: 0, end: 4 }, 1, 1080, 1920, { width: 1920, height: 1080 });
  expect([spot.x, spot.y]).toEqual([0.5, 0.4]);
  expect(spot.w).toBeCloseTo((0.04 * 3413.33) / 1080, 2);                       // the source is 3413 px wide on this film
  const sm = smooth([{ t: 0, x: 0, y: 0, w: 1 }, { t: 0.2, x: 0.3, y: 0, w: 1 }, { t: 0.4, x: 0, y: 0, w: 1 }]);
  expect(sm[1].x).toBeCloseTo(0.1, 6);
  expect(stickerKeys([{ t: 1.2, x: 0.6, y: 0.4, w: 0.1 }], 1, { x: 0.5, y: 0.55, width: 0.26 }, 2.4)).toEqual([{ t: 0.2, x: 0.1, y: -0.15, scale: 0.9231 }]);
});

test('a face is followed through a transition that grows or moves the clip: zoom round the centre, push and whip with the frame', () => {
  // a 16:9 source filling a 16:9 film; a mouth three quarters of the way across
  const keep = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  const clip = (transitionIn?: any): any => ({ id: 'c', source: 's', in: 0, speed: 1, start: 2, end: 5, frame: [0, 0, 1, 1], crop: keep, ...(transitionIn ? { transitionIn } : {}) });
  const at = (c: any, t: number) => onFilm(face(0.75), 'mouth', c, { start: 2, end: 5 }, t, 1920, 1080, { width: 1920, height: 1080 });
  const on = (c: any, t: number, link?: any) => onFilm(face(0.75), 'mouth', c, { start: 2, end: 5 }, t, 1920, 1080, { width: 1920, height: 1080 }, link);
  const from = { from: [0, 0, 1, 1] };
  expect(at(clip(), 2).x).toBeCloseTo(0.75, 6);
  // zoom: B starts 1.8× round the centre and is 1.2× halfway (1 + 0.8 (1 − p)²), its width with it
  const zoom = clip({ type: 'zoom', dur: 1 });
  expect(on(zoom, 2, from).x).toBeCloseTo(0.5 + 0.25 * 1.8, 6);
  expect(on(zoom, 2.5, from).x).toBeCloseTo(0.5 + 0.25 * 1.2, 6);
  expect(on(zoom, 2.5, from).w / at(clip(), 2.5).w).toBeCloseTo(1.2, 6);
  expect(on(zoom, 3, from).x).toBeCloseTo(0.75, 6);
  // push from the left, halfway: B is half a frame to the left of its place...
  expect(on(clip({ type: 'push', dur: 1, dir: 'l' }), 2.5, from).x).toBeCloseTo(0.25, 6);
  // ...and the clip it pushes out (A, through its link) half a frame to the right; A grown by a zoom coming after it likewise
  const out = (type: string) => ({ out: { type, dir: 'l', at: 2, dur: 1, frame: [0, 0, 1, 1], shaped: false } });
  expect(on(clip(), 4.5, out('push')).x).toBeCloseTo(1.25, 6);
  expect(on(clip(), 4.5, out('whip')).x).toBeGreaterThan(1.2);
  expect(on(clip(), 4.5, out('zoom')).x).toBeCloseTo(0.5 + 0.25 * (1 + 1.4 * 0.5 ** 1.2), 6);
  // a dissolve moves nothing
  expect(on(clip(), 4.5, out('dissolve')).x).toBeCloseTo(0.75, 6);
});

test('a key a frame where a transition moves or grows the clip, none where it does not', () => {
  const keep = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  const clip = (o: any = {}): any => ({ id: 'c', source: 's', in: 0, speed: 1, start: 2, end: 5, frame: [0, 0, 1, 1], crop: keep, ...o });
  const ct = { start: 2, end: 5 }, from: any = { from: [0, 0, 1, 1] };
  const zoom = movingTimes(clip({ transitionIn: { type: 'zoom', dur: 0.2 } }), ct, from, 0, 10, 30);
  expect(zoom).toEqual([2, 2.033333, 2.066667, 2.1, 2.133333, 2.166667, 2.2]);
  expect(movingTimes(clip({ transitionIn: { type: 'zoom', dur: 0.2 } }), ct, from, 2.1, 10, 30)[0]).toBe(2.1);   // from the sticker's start
  expect(movingTimes(clip({ transitionIn: { type: 'dissolve', dur: 0.2 } }), ct, from, 0, 10, 30)).toEqual([]);
  // a zoom drawn as a dissolve (this clip not the whole picture) moves nothing
  expect(movingTimes(clip({ frame: [0, 0, 0.5, 1], transitionIn: { type: 'zoom', dur: 0.2 } }), ct, from, 0, 10, 30)).toEqual([]);
  // the next clip's push moves this one out; its slide does not
  const out = (type: string) => ({ out: { type, at: 2.9, dur: 0.1, frame: [0, 0, 1, 1], shaped: false } });
  expect(movingTimes(clip(), ct, out('push') as any, 0, 10, 30)).toEqual([4.9, 4.933333, 4.966667, 5]);
  expect(movingTimes(clip(), ct, out('slide') as any, 0, 10, 30)).toEqual([]);
  expect(spotAt([{ t: 0, x: 0, y: 1, w: 1 }, { t: 1, x: 1, y: 1, w: 3 }], 0.25)).toEqual({ t: 0.25, x: 0.25, y: 1, w: 1.5 });
  expect(spotAt([{ t: 0, x: 0, y: 1, w: 1 }], 2)).toEqual({ t: 2, x: 0, y: 1, w: 1 });
});

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
async function portraitCut() {
  const dir = mkdtempSync(join(tmpdir(), 'follow-'));
  await run(['-f', 'lavfi', '-i', 'color=gray:s=320x180:d=6:r=10', join(dir, 'v.mp4')]);
  const p = parseProject({ version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 10, plugins: [], mix: MIX },
    sources: { v: { path: 'v.mp4', duration: 6, width: 1920, height: 1080, kind: 'video', audio: false } }, media: {}, grids: [], tracks: [] });
  const inv: Inventory = { id: 't', dir, project: p, chapters: [], photoSheets: [], overview: [], music: [],
    sources: [{ id: 'v', kind: 'video', duration: 6, width: 1920, height: 1080, orientation: 'landscape', audio: false, speech: '', sheets: [], segments: [[0, 6]], transcript: null }] };
  const c = new Cut(structuredClone(p), inv, dir);
  // a person whose mouth drifts right as the clip plays (the frame files are named by their source time)
  c.facesProvider = fakeFaces((img) => [face(0.3 + Number(basename(img, '.jpg')) * 0.02)]);
  return c;
}

test('a sticker that follows the mouth gets a path; a landscape clip in a portrait film is focused on the face', async () => {
  const c = await portraitCut();
  const clip = c.clip('v', { from: 1, len: 4 });
  const st = c.effect('common.censor', { at: 1, len: 1, follow: 'mouth', clip });
  const p = await c.save();
  const v = p.tracks.find((t) => t.id === 'v1')!.items[0] as any;
  expect(v.crop.from.x).toBeCloseTo(0.3 + 3 * 0.02, 2);                         // the face at the middle of the clip (source 3 s)
  const s = p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!;
  expect(s.transform.keys.length).toBe(6);                                       // 1 s every 0.2 s
  expect(s.transform.keys.at(-1).x).toBeGreaterThan(s.transform.keys[0].x);      // moves right with the mouth
  expect(resolveTimes(p).get(st)!.start).toBe(1);
  expect(c.notes.some((n) => n.includes('自動對焦到人臉'))).toBe(true);
  expect(c.notes.some((n) => n.includes('跟著 v 的嘴移動'))).toBe(true);
}, 60000);

test('a sticker on a clip that zooms in stays on the mouth: grown with the clip, a key a frame while the zoom runs', async () => {
  const c = await portraitCut();
  c.facesProvider = fakeFaces(() => [face(0.3)]);
  const keep = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  c.clip('v', { from: 0, len: 2, crop: keep });
  const b = c.clip('v', { from: 3, len: 2, crop: keep, transition: { type: 'zoom', dur: 0.6 } });   // film 1.4–3.4
  const st = c.effect('common.censor', { at: 1.4, len: 1, follow: 'mouth', clip: b });
  const p = await c.save();
  const keys = p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!.transform.keys as Array<{ t: number; x: number; scale: number }>;
  // every 0.2 s over the second (6), and every frame of the zoom (1.4–2.0: 19), 4 of them the same times
  expect(keys.length).toBe(21);
  const key = (t: number) => keys.find((k) => Math.abs(k.t - t) < 1e-3)!;
  // the mouth 0.3 across a 1920 × 1080 source covering the 1080 × 1920 film: 3413 px wide, 1167 px off the left, so the mouth
  // is 143 px in, 683 px left of the centre; grown 1.8× at the start, 1 + 0.8 (5/6)² a sixth of the way and 1.2× halfway
  const x = (k: number) => (540 - 682.667 * k) / 1080;
  expect(key(0.1).x - key(0.8).x).toBeCloseTo(x(1 + 0.8 * (5 / 6) ** 2) - x(1), 3);
  expect(key(0.3).x - key(0.8).x).toBeCloseTo(x(1.2) - x(1), 3);
  expect(key(0).scale / key(0.8).scale).toBeCloseTo(1.8, 2);
  // at the start the mouth is off the film's left edge, farther than a move can take the sticker: a frame from its anchor
  expect(key(0).x).toBe(-1);
}, 60000);

test('a face cover (common.emoji mode cover) following a face is made bigger than a sticker on it, and raised to the hairline', async () => {
  const c = await portraitCut();
  const clip = c.clip('v', { from: 1, len: 2, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const sticker = c.effect('common.emoji', { at: 0, len: 1, char: '🌸', follow: 'face', clip });
  const cover = c.effect('common.emoji', { at: 0, len: 1, mode: 'cover', char: '🌸', follow: 'face', clip });
  const p = await c.save(), keys = (id: string) => (p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id)!.transform.keys as Array<{ x: number; y: number; scale: number }>);
  const [s, k] = [keys(sticker)[0], keys(cover)[0]];
  expect(k.scale / s.scale).toBeCloseTo(1.9 / 1.1, 2);
  expect(k.x).toBe(s.x);
  // raised by a tenth of its width: 1.9 face widths (0.1 of the source, 3413 px of it on this film) as a share of the film's height
  expect(s.y - k.y).toBeCloseTo(0.1 * 1.9 * ((0.1 * 3413.33) / 1080) * (1080 / 1920), 3);
  expect(stickerKeys([{ t: 1, x: 0.5, y: 0.5, w: 0.1 }], 1, { x: 0.5, y: 0.5, width: 0.2 }, 2, 0.1, 0.5)).toEqual([{ t: 0, x: 0, y: -0.01, scale: 1 }]);
}, 60000);

test("a sticker up to the source's last frame still gets its path; one longer than its clip says where it stops following", async () => {
  const c = await portraitCut();
  const clip = c.clip('v', { from: 4, len: 2, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });   // source 4–6, its end
  const st = c.effect('common.censor', { at: 1, len: 1.5, follow: 'mouth', clip });
  const p = await c.save();
  expect(p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!.transform.keys.length).toBe(6);   // film 1–2, source 5–6
  expect(c.notes.some((n) => n.includes(`比片段 ${clip} 長，2 秒之後停在最後的位置`))).toBe(true);
  expect(c.notes.some((n) => n.includes('偵測失敗'))).toBe(false);
}, 60000);

test('no face anywhere: the sticker stays put, and the note says so', async () => {
  const c = await portraitCut();
  c.facesProvider = fakeFaces(() => []);
  const clip = c.clip('v', { from: 0, len: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const st = c.effect('common.censor', { at: 0.5, len: 1, follow: 'mouth', clip });
  const p = await c.save();
  expect(p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!.transform).toBeUndefined();
  expect(c.notes).toEqual([`${st}：v 這段找不到臉，貼圖留在原本的位置`]);
}, 60000);

test('a portrait clip in a landscape film is focused up or down onto the face, not sideways', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'follow-'));
  await run(['-f', 'lavfi', '-i', 'color=gray:s=180x320:d=6:r=10', join(dir, 'v.mp4')]);
  const p = parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 10, plugins: [], mix: MIX },
    sources: { v: { path: 'v.mp4', duration: 6, width: 1080, height: 1920, kind: 'video', audio: false } }, media: {}, grids: [], tracks: [] });
  const inv: Inventory = { id: 't', dir, project: p, chapters: [], photoSheets: [], overview: [], music: [],
    sources: [{ id: 'v', kind: 'video', duration: 6, width: 1080, height: 1920, orientation: 'portrait', audio: false, speech: '', sheets: [], segments: [[0, 6]], transcript: null }] };
  const c = new Cut(structuredClone(p), inv, dir);
  // a face low in the picture, drifting down as the clip plays; its centre is 0.08 below the box top
  c.facesProvider = fakeFaces((img) => [{ box: [0.45, 0.6 + Number(basename(img, '.jpg')) * 0.02, 0.1, 0.16], mouth: [0.5, 0.75], mouthW: 0.04 }]);
  c.clip('v', { from: 1, len: 4 });
  const v = (await c.save()).tracks.find((t) => t.id === 'v1')!.items[0] as any;
  expect(v.crop.from.y).toBeCloseTo(0.6 + 3 * 0.02 + 0.08, 2);
  expect(v.crop.from.x).toBe(0.5);
  expect(c.notes.some((n) => n.includes('自動對焦到人臉（y='))).toBe(true);
}, 60000);

/** a 16:9 film of a 16:9 source with a burned caption row from 0.86 down */
async function burnedCut(faces: (img: string) => FaceInfo[]) {
  const dir = mkdtempSync(join(tmpdir(), 'follow-'));
  await run(['-f', 'lavfi', '-i', 'color=gray:s=320x180:d=6:r=10', join(dir, 'v.mp4')]);
  const p = parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 10, plugins: [], mix: MIX },
    sources: { v: { path: 'v.mp4', duration: 6, width: 1920, height: 1080, kind: 'video', audio: false } }, media: {}, grids: [], tracks: [] });
  const inv: Inventory = { id: 't', dir, project: p, chapters: [], photoSheets: [], overview: [], music: [],
    sources: [{ id: 'v', kind: 'video', duration: 6, width: 1920, height: 1080, orientation: 'landscape', audio: false, speech: '', sheets: [], segments: [[0, 6]], transcript: null,
      burned: { version: 1, step: 1, frames: 6, caption: { share: 1, rect: [0.08, 0.86, 0.84, 0.1], spans: [[0, 6]] } } }] };
  const c = new Cut(structuredClone(p), inv, dir);
  c.facesProvider = fakeFaces(faces);
  return c;
}

test('avoidBurned keeps the face in frame: the crop that clears the caption looks at it instead of the middle', async () => {
  const c = await burnedCut(() => [{ box: [0.03, 0.55, 0.1, 0.2], mouth: [0.08, 0.7], mouthW: 0.03 }]);   // low on the left
  const id = c.clip('v', { from: 1, len: 4, avoidBurned: true });
  const early = (c.p.tracks.find((t) => t.id === 'v1')!.items[0] as any).crop.from;
  expect([early.x, early.zoom > 1]).toEqual([0.5, true]);                                       // clip() alone zooms about the middle
  const v = (await c.save()).tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as any;
  expect(v.crop.from.zoom).toBe(early.zoom);
  expect(v.crop.from.x).toBeLessThan(0.2);
  expect(c.notes.some((n) => n.includes('裁掉燒進去的字幕時保住人臉'))).toBe(true);
}, 60000);

test('avoidBurned gives up on a clip whose face runs into the rows it would crop, and says so', async () => {
  const c = await burnedCut(() => [{ box: [0.4, 0.6, 0.15, 0.255], mouth: [0.47, 0.8], mouthW: 0.04 }]);
  const id = c.clip('v', { from: 1, len: 4, avoidBurned: true });
  const cap = c.caption('疊在原片字幕上', { at: 1, len: 1 });
  const p = await c.save(), v = p.tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as any;
  expect(v.crop).toMatchObject({ from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } });
  // so our caption on the footage's row goes to the top, and one note for the source says both
  expect((p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === cap)).params.position).toBe('top');
  expect(c.notes.filter((n) => n.includes('會切到畫面裡的人臉，照原本的裁切'))).toEqual([`avoidBurned：v 有 1 段裁掉燒進去的字幕會切到畫面裡的人臉，照原本的裁切：${id}（素材 0:01.0–0:05.0）；疊在原片字幕上的 1 張字幕自動移到畫面上方`]);
}, 60000);

test('a landscape clip in a portrait film that avoidBurned zooms is looked at where the face is, once', async () => {
  const c = await portraitCut();
  c.facesProvider = fakeFaces(() => [face(0.3)]);
  c.inv.sources[0].burned = { version: 1, step: 1, frames: 6, caption: { share: 1, rect: [0.08, 0.86, 0.84, 0.1], spans: [[0, 6]] } };
  const id = c.clip('v', { from: 1, len: 4, avoidBurned: true });
  const v = (await c.save()).tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as any;
  expect([v.crop.from.x, v.crop.from.zoom > 1, v.crop.from.y < 0.5]).toEqual([0.3, true, true]);
  expect(c.notes.some((n) => n.includes('自動對焦到人臉'))).toBe(false);                   // taken over, not done twice
  expect(c.notes.some((n) => n.includes('裁掉燒進去的字幕時保住人臉（x=0.3'))).toBe(true);
}, 60000);

test('on a 16:9 film a sticker that follows the mouth is scaled from its size on the short side', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'follow-'));
  await run(['-f', 'lavfi', '-i', 'color=gray:s=320x180:d=6:r=10', join(dir, 'v.mp4')]);
  const p = parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 10, plugins: [], mix: MIX },
    sources: { v: { path: 'v.mp4', duration: 6, width: 1920, height: 1080, kind: 'video', audio: false } }, media: {}, grids: [], tracks: [] });
  const inv: Inventory = { id: 't', dir, project: p, chapters: [], photoSheets: [], overview: [], music: [],
    sources: [{ id: 'v', kind: 'video', duration: 6, width: 1920, height: 1080, orientation: 'landscape', audio: false, speech: '', sheets: [], segments: [[0, 6]], transcript: null }] };
  const c = new Cut(structuredClone(p), inv, dir);
  c.facesProvider = fakeFaces(() => [face(0.5)]);                               // a mouth 0.04 of the picture wide
  const clip = c.clip('v', { from: 1, len: 4 });
  const st = c.effect('common.censor', { at: 1, len: 1, follow: 'mouth', clip });
  const s = (await c.save()).tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!;
  // 2.4 × the mouth's width over the sticker's: 26 % of the short side is 0.26 × 1080 / 1920 of the width
  expect(s.transform.keys[0].scale).toBeCloseTo((2.4 * 0.04) / ((0.26 * 1080) / 1920), 2);
}, 60000);

test('a clip tightened into pieces is focused once: every piece gets the same framing', async () => {
  const c = await portraitCut();
  (c.inv.sources[0] as any).transcript = { language: 'zh', segments: [{ start: 0.5, end: 1.5, text: '你好' }, { start: 3.5, end: 4.5, text: '再見' }] };
  const pieces = c.tighten(c.clip('v', { from: 0, len: 6 }));
  expect(pieces.length).toBe(2);
  const p = await c.save();
  const xs = (p.tracks.find((t) => t.id === 'v1')!.items as any[]).map((i) => [i.crop.from.x, i.crop.to.x]);
  expect(new Set(xs.flat()).size).toBe(1);
  expect(xs[0][0]).not.toBe(0.5);
});

test('a sticker on a frozen clip follows the held face: past freezeAt the picture shows the frame at the freeze point', async () => {
  const c = await portraitCut();
  const clip = c.clip('v', { from: 1, len: 4, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  (c.p.tracks.find((t) => t.id === 'v1')!.items[0] as any).freezeAt = 0.5;   // holds source 1.5 s from film 0.5 s
  const st = c.effect('common.censor', { at: 1, len: 1, follow: 'mouth', clip });
  const p = await c.save();
  const keys = p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!.transform.keys as Array<{ x: number }>;
  expect(keys.length).toBeGreaterThan(1);
  expect(new Set(keys.map((k) => k.x)).size).toBe(1);   // the held mouth does not drift
}, 60000);

// health scan 10 (TT9): guards the face passes had none of
test("avoidBurned's face-keeping crop goes to every piece a tighten made of the clip", async () => {
  const c = await burnedCut(() => [{ box: [0.03, 0.55, 0.1, 0.2], mouth: [0.08, 0.7], mouthW: 0.03 }]);   // low on the left
  (c.inv.sources[0] as any).transcript = { language: 'zh', segments: [{ start: 1.2, end: 2.5, text: '你好' }, { start: 4, end: 5, text: '再見' }] };
  const pieces = c.tighten(c.clip('v', { from: 1, len: 4, avoidBurned: true }));
  expect(pieces.length).toBe(2);
  const v1 = (await c.save()).tracks.find((t) => t.id === 'v1')!.items as any[];
  for (const id of pieces) expect(v1.find((i) => i.id === id).crop.from.x).toBeLessThan(0.2);
}, 60000);

test('a sticker given clip: follows that clip, not the one playing when it starts', async () => {
  const c = await portraitCut();
  const keep = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  const a = c.clip('v', { from: 0, len: 2, crop: keep });
  const b = c.clip('v', { from: 4, len: 2, crop: keep });                     // film 2–4, source 4–6
  const st = c.effect('common.censor', { at: 1.5, len: 2, follow: 'mouth', clip: b });
  const p = await c.save();
  // b's part of the sticker, film 2–3.4 every 0.2 s; a would have given 1.5–2 and "longer than a"
  expect(p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === st)!.transform.keys.length).toBe(8);
  expect(c.notes.some((n) => n.includes(`跟著 v 的嘴移動`))).toBe(true);
  expect(c.notes.some((n) => n.includes(`比片段 ${a} 長`))).toBe(false);
}, 60000);

test('the face focus leaves a crop the script set after clip() alone, and never focuses a photo', async () => {
  const c = await portraitCut();
  const id = c.clip('v', { from: 1, len: 4 });
  (c.p.tracks.find((t) => t.id === 'v1')!.items[0] as any).crop = { from: { x: 0.7, y: 0.5, zoom: 1 }, to: { x: 0.7, y: 0.5, zoom: 1 } };
  const v = (await c.save()).tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as any;
  expect([v.crop.from.x, v.crop.to.x]).toEqual([0.7, 0.7]);
  expect(c.notes.some((n) => n.includes('自動對焦到人臉'))).toBe(false);
  // a landscape photo in the portrait film, handed to the focus pass: a still is framed by its own crop (photo()'s focus)
  const d = await portraitCut();
  await makePhoto(join(d.dir, 'ph.jpg'), { w: 320, h: 180 });
  d.p.sources.ph = { path: 'ph.jpg', duration: 3600, width: 1920, height: 1080, kind: 'image' } as any;
  const ph = d.photo('ph', { len: 2 });
  await resolveAutoFocus({ p: d.p, dir: d.dir, provider: d.facesProvider, notes: d.notes }, [[ph]]);
  expect((d.p.tracks.find((t) => t.id === 'v1')!.items[0] as any).crop.from.x).toBe(0.5);
  expect(d.notes).toEqual([]);
}, 60000);
