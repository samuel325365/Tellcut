// The Cut API: framing the picture (panels and backdrops, frames, bands, virtual cameras, burned captions, background blocks, polaroid).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject, resolveTimes } from '@tellcut/engine';
import { checkFrame, Cut } from './cut.ts';
import { base, inv, fresh, items } from './cut-test-kit.ts';

test('a photo given to clip() keeps the crop it was asked for (a recipe shot with a focus)', () => {
  const c = fresh(), crop = { from: { x: 0.3, y: 0.4, zoom: 1 }, to: { x: 0.3, y: 0.4, zoom: 1.05 } };
  const id = c.clip('ph', { len: 2, crop });
  expect(items(c, 'v1').find((i) => i.id === id).crop).toEqual(crop);
});

test('panel puts clips in a rounded frame and save adds the backdrop under and the border over the picture', async () => {
  const c = fresh();
  c.panel({ frame: [0.05, 0.2, 0.9, 0.5], radius: 20 });
  const a = c.clip('v', { from: 0, len: 2 });
  const b = c.photo('ph', { len: 2 });
  expect(items(c, 'v1').map((i) => [i.id, i.frame, i.radius])).toEqual([[a, [0.05, 0.2, 0.9, 0.5], 20], [b, [0.05, 0.2, 0.9, 0.5], 20]]);
  const p = await c.save();
  const ids = p.tracks.map((t) => t.id);
  expect(ids[0]).toBe('bg');
  expect(ids[ids.indexOf('v1') + 1]).toBe('panel');
  expect((p.tracks[0].items[0] as any)).toMatchObject({ type: 'common.backdrop', start: 0, end: 4 });
  expect((p.tracks.find((t) => t.id === 'panel')!.items[0] as any).params).toMatchObject({ x: 0.05, y: 0.2, w: 0.9, h: 0.5, radius: 20 });
});

test('panel can leave the backdrop or the border out, and without panel nothing changes', async () => {
  const c = fresh();
  c.panel({ backdrop: false, border: { shadow: 0 } });
  c.clip('v', { from: 0, len: 2 });
  const p = await c.save();
  expect(p.tracks.map((t) => t.id)).not.toContain('bg');
  expect((p.tracks.find((t) => t.id === 'panel')!.items[0] as any).params.shadow).toBe(0);
  const plain = fresh();
  plain.clip('v', { from: 0, len: 2 });
  expect(items(plain, 'v1')[0].frame).toEqual([0, 0, 1, 1]);        // the full frame, as ever
  expect((await plain.save()).tracks.map((t) => t.id)).toEqual(['v1', 'text', 'music', 'orig']);
});

test('avoidBurned crops a clip so the footage\'s own caption stays out of the frame, while that stretch has one or is close to one', () => {
  const c = fresh();
  c.inv.sources[0].burned = { version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.86, 0.84, 0.12], spans: [[1, 3]] } };
  const a = c.clip('v', { from: 1.5, len: 1, avoidBurned: true });        // source 1.5–2.5 s: inside the caption span
  const near = c.clip('v', { from: 4.5, len: 1, avoidBurned: true });     // 1.5 s after it: likely a line the 1-a-second detection missed
  const b = c.clip('v', { from: 7, len: 2, avoidBurned: true });          // source 7–9 s: 4 s away, no caption then
  const d = c.clip('v', { from: 1.5, len: 1 });                            // not asked: untouched
  const crop = (id: string) => items(c, 'v1').find((i) => i.id === id).crop;
  expect(crop(a).from.zoom).toBeGreaterThan(1.1);
  expect(crop(a).to.zoom).toBeGreaterThan(1.1);
  expect(crop(near).from.zoom).toBeGreaterThan(1.1);
  expect(crop(b).from.zoom).toBe(1);
  expect(crop(d).from.zoom).toBe(1);
});

test('a background block given to c.effect goes under the video, not on the text track', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 4 });
  const id = c.effect('common.ambient', { at: 0, len: 4, stops: '0:0, 2:1' });
  const ids = c.p.tracks.map((t) => t.id);
  expect(ids.indexOf('bgfx')).toBeLessThan(ids.indexOf('v1'));
  expect(items(c, 'bgfx').map((i) => i.id)).toEqual([id]);
  expect(items(c, 'text').some((i) => i.id === id)).toBe(false);
});

test("layer: 'under' puts a project's own fx under the video too; its kind alone does not", () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 4 });
  const paper = c.effect('fx.paper', { at: 0, len: 4, layer: 'under' });
  const card = c.effect('fx.card', { at: 0, len: 2 });
  expect(items(c, 'bgfx').map((i) => i.id)).toEqual([paper]);
  expect(items(c, 'text').map((i) => i.id)).toEqual([card]);
  expect(() => c.effect('fx.paper', { at: 0, len: 1, layer: 'under', follow: 'face' })).toThrow(/背景.*follow/);
  expect(() => c.effect('common.ambient', { at: 0, len: 1, layer: 'top' })).toThrow("不能給 layer: 'top'");
  expect(() => c.effect('fx.paper', { at: 0, len: 1, layer: 'bottom' as 'under' })).toThrow("layer 只能是 'top' 或 'under'");
});

test('the default panel frame fits the film shape: a 16:9 picture in a 16:9 film, the tall layout in a 9:16 one', () => {
  const wide = fresh();                                                          // base() is 1920×1080
  wide.panel();
  const a = wide.clip('v', { from: 0, len: 2 });
  const f = items(wide, 'v1').find((i) => i.id === a).frame as number[];
  expect(f).toEqual([0.1, 0.06, 0.8, 0.8]);
  expect((f[2] * 1920) / (f[3] * 1080)).toBeCloseTo(16 / 9, 2);
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base();
  p.meta.width = 1080; p.meta.height = 1920;
  const tall = new Cut(p, inv(dir), dir);
  tall.panel();
  const b = tall.clip('v', { from: 0, len: 2 });
  expect(items(tall, 'v1').find((i) => i.id === b).frame).toEqual([0.04, 0.18, 0.92, 0.56]);
});

test('a background block given a transform or asked to follow a face says it cannot (it fills the frame under the video)', () => {
  const c = fresh();
  expect(() => c.effect('common.ambient', { at: 0, len: 2, transform: { x: 0.1, y: 0, scale: 1 } })).toThrow(/背景.*transform/);
  expect(() => c.effect('common.ambient', { at: 0, len: 2, follow: 'mouth' })).toThrow(/背景.*follow/);
  expect(() => c.effect('common.ambient', { at: 0, len: 2 })).not.toThrow();
});

test("panel backdrop 'blur': under each clip its own picture fills the frame, blurred and dimmed, riding on the clip", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base();
  p.meta.width = 1080; p.meta.height = 1920;                                       // a landscape source in a portrait film
  const c = new Cut(p, inv(dir), dir);
  c.panel({ backdrop: 'blur' });
  c.effect('common.ambient', { at: 0, len: 5 });                                  // a full-screen background of the film's own
  const a = c.clip('v', { from: 1, len: 2 }), b = c.clip('v', { from: 5, len: 3 });
  const s = await c.save();
  const under = s.tracks.find((t) => t.id === 'bgv')!, at = (id: string) => s.tracks.findIndex((t) => t.id === id);
  // over every background, under the clips
  expect([under.kind, at('bgfx') < at('bgv'), at('bgv') < at('v1')]).toEqual(['video', true, true]);
  const items = under.items as any[];
  expect(items.map((i) => [i.parent, i.source, i.in, i.start, i.end, i.frame])).toEqual([[a, 'v', 1, 0, 2, [0, 0, 1, 1]], [b, 'v', 5, 0, 3, [0, 0, 1, 1]]]);
  expect(items[0].defocus.px).toBeGreaterThan(20);
  expect(items[0].opacity).toBeLessThan(1);
  expect(s.tracks.flatMap((t) => t.items as any[]).some((i) => i.type === 'common.backdrop')).toBe(false);
  expect(resolveTimes(s).get(items[1].id)!.start).toBe(2);
});

test('polaroid freezes the moment playing at `at`: its source and source second, a shutter, both riding on the clip', () => {
  const c = fresh();
  c.clip('v', { from: 1, len: 3 });
  const b = c.clip('v', { from: 5, len: 4, speed: 2 });                           // film 3–5, source 5–9
  const id = c.polaroid({ at: 4, caption: '最棒的一刻', len: 2 });
  const it = items(c, 'text').find((x) => x.id === id);
  expect([it.type, it.parent, it.params.source, it.params.t, it.params.caption]).toEqual(['common.polaroid', b, 'v', 7, '最棒的一刻']);
  const shutter = items(c, 'sfx').find((x) => x.type === 'common.shutter');
  expect([shutter.parent, shutter.start]).toEqual([b, 1]);
  expect(() => c.polaroid({ at: 30 })).toThrow('沒有片段');
});

test('clip and photo take a frame of their own (a window of a postcard or a TV), even inside a panel layout', () => {
  const c = fresh();
  c.panel();
  const a = c.clip('v', { from: 0, len: 2, frame: [0.1, 0.2, 0.5, 0.3] });
  const b = c.photo('ph', { len: 1, frame: [0, 0, 0.5, 0.5] });
  const d = c.clip('v', { from: 3, len: 1 });
  const v1 = items(c, 'v1');
  expect(v1.find((i) => i.id === a).frame).toEqual([0.1, 0.2, 0.5, 0.3]);
  expect(v1.find((i) => i.id === a).radius).toBeUndefined();
  expect(v1.find((i) => i.id === b).frame).toEqual([0, 0, 0.5, 0.5]);
  expect(v1.find((i) => i.id === d).frame).not.toEqual([0.1, 0.2, 0.5, 0.3]);   // the panel's frame again
});

test('bands: a landscape shot as three cinemascope bands stacked in a tall film, one a beat, ending together, without sound', () => {
  const c = fresh();
  c.p.meta.width = 1080; c.p.meta.height = 1920;
  c.clip('v', { from: 0, len: 1 });
  const crop = { from: { x: 0.5, y: 0.4, zoom: 2 }, to: { x: 0.5, y: 0.4, zoom: 2.1 } };
  const ids = c.bands('v', { len: 2, from: [0.5, 3.2, 9.5], crops: [crop, crop, crop] });
  expect(ids).toHaveLength(3);
  expect(c.time).toBe(3);
  const at = (id: string) => c.p.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ ...i, track: t.id }))).find((i) => i.id === id);
  const [a, b, d] = ids.map(at);
  expect([a.track, b.track, d.track]).toEqual(['v1', 'v2', 'v3']);
  expect([a.start, b.start, d.start]).toEqual([1, 1.5, 2]);
  expect([a.end, b.end, d.end]).toEqual([3, 3, 3]);
  // 1080 × 400 bands, 20 px apart, centred
  expect(a.frame[3] * 1920).toBeCloseTo(400, 0);
  expect(b.frame[1] - (a.frame[1] + a.frame[3])).toBeCloseTo(20 / 1920, 6);
  expect(a.frame[1] + (d.frame[1] + d.frame[3])).toBeCloseTo(1, 4);
  expect(d.in).toBe(9);   // pulled back so the band does not run past the end of the 10 s source
  expect(items(c, 'orig').some((i) => i.parent === a.id)).toBe(false);
  expect(['v2', 'v3'].map((id) => c.p.tracks.find((x) => x.id === id)!.name)).toEqual(['Layer 2', 'Layer 3']);
  // the tracks sit right above the main track, in order
  expect(c.p.tracks.map((t) => t.id).slice(0, 3)).toEqual(['v1', 'v2', 'v3']);
  expect(parseProject(c.p)).toBeTruthy();
});

test('view: one camera cut into virtual ones — the crop centred where asked, refused when it shows a watermark or the burned captions', () => {
  const c = fresh();
  c.p.meta.width = 1080; c.p.meta.height = 1920;
  const frame: [number, number, number, number] = [0, 0.104, 1, 0.396];
  const crop = c.view('v', { at: [0.7, 0.4], zoom: 1.5, frame });
  expect(crop.zoom).toBe(1.5);
  const id = c.clip('v', { from: 0, len: 2, crop: { from: crop, to: c.view('v', { at: [0.7, 0.4], zoom: 1.55, frame }) }, frame });
  expect(items(c, 'v1').find((i) => i.id === id).crop.from).toEqual(crop);
  expect(() => c.view('v', { at: [0.1, 0.1], zoom: 2, frame, keepOut: [[0, 0, 0.3, 0.108]], what: '浮水印' })).toThrow(/禁區/);
  // the inventory found a burned caption row at 86–95 %: a view down there is refused unless burned: false
  (c.inv.sources[0] as any).burned = { version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.86, 0.84, 0.09], spans: [[0, 5]] } };
  expect(() => c.view('v', { at: [0.5, 0.8], zoom: 1.6, frame })).toThrow(/燒進去的字幕/);
  expect(() => c.view('v', { at: [0.5, 0.8], zoom: 1.6, frame, burned: false })).not.toThrow();
  expect(() => c.view('v', { at: [0.5, 0.4], zoom: 1.6, frame })).not.toThrow();
});

test('a frame is fractions of the screen: pixels, an empty or an off-screen frame throw; some bleed is fine', () => {
  expect(() => checkFrame([80, 300, 920, 1100], 'c.panel')).toThrow(/c\.panel 的 frame \[80, 300, 920, 1100\] 看起來是像素/);
  expect(() => checkFrame([0.1, 0.1, 0, 0.5], 'c.clip')).toThrow(/寬、高要大於 0/);
  expect(() => checkFrame([1.1, 0.1, 0.3, 0.3], 'c.clip')).toThrow(/整個在畫面外/);
  expect(() => checkFrame([-0.02, 0.1, 1.04, 0.6], 'c.clip')).not.toThrow();
  expect(() => checkFrame(undefined, 'c.clip')).not.toThrow();
});
