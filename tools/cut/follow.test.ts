import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseProject, resolveTimes } from '@tellcut/engine';
import { fakeFaces, run, type FaceInfo } from '@tellcut/media-node';
import { Cut } from './cut.ts';
import { onFilm, pickFace, smooth, stickerKeys, trackFace } from './follow.ts';
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
