import { parseProject, resolveTimes, type VideoItem } from '@tellcut/engine';
import type { Burned } from '@tellcut/media-node';
import { burnedChecks, burnedRectAt } from './burned.ts';

const onlyWarn = (...a: Parameters<typeof burnedChecks>) => burnedChecks(...a).filter((f) => f.level !== 'note');   // the note about a caption merely showing is tested below
const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };
const crop = (zoom = 1, y = 0.5) => ({ from: { x: 0.5, y, zoom }, to: { x: 0.5, y, zoom } });
const proj = (o: { frame?: number[]; zoom?: number; y?: number; text?: string } = {}) => parseProject({ version: 1,
  meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 10, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 100, width: 1920, height: 1080, kind: 'video' } }, media: {}, grids: [],
  tracks: [
    { id: 'v1', kind: 'video', items: [{ id: 'c1', source: 'v', in: 10, speed: 1, start: 0, end: 10, frame: o.frame ?? [0, 0, 1, 1], crop: crop(o.zoom, o.y) }] },
    { id: 'text', kind: 'overlay', items: [{ id: 'cap', type: 'common.caption', start: 0, end: 10, params: { text: o.text ?? '普通字幕' } }] },
  ] });
const burned: Burned = { version: 1, step: 1, frames: 100, caption: { share: 0.5, rect: [0.08, 0.86, 0.84, 0.12], spans: [[12, 20]] } };
const video = (p: ReturnType<typeof proj>) => p.tracks[0].items[0] as VideoItem;
const at = (p: ReturnType<typeof proj>, t: number) => { const tm = resolveTimes(p).get('c1')!; return burnedRectAt(p, video(p), tm.start, tm.end, burned, t); };

test('the caption row lands where the cover-fit puts it, and only while the source shows a caption', () => {
  const p = proj();
  expect(at(p, 1)).toBeNull();                                      // source time 11: before the span
  const r = at(p, 3)!;                                              // source time 13: inside it
  expect(r.h).toBeGreaterThan(0);
  expect(r.y + r.h).toBeLessThanOrEqual(1920 + 1e-6);
  expect(at(p, 9.99)).not.toBeNull();                              // source time 19.99: still inside
  expect(at(p, 10)).toBeNull();                                     // source time 20: the span has ended
});

test('zooming in and pushing the focus up cuts the caption row off the picture', () => {
  const tight = proj({ zoom: 1.6, y: 0.2 });
  expect(at(tight, 3)).toBeNull();
  expect(at(proj({ zoom: 1.0, y: 0.5 }), 3)).not.toBeNull();
});

const boxAt = (y: number, h: number, id = 'cap') => ({ id, rects: [{ x: 200, y, w: 600, h }] });
test('our words on the footage\'s caption are a warning; words elsewhere are not', () => {
  const p = proj();
  const zone = at(p, 3)!;
  const on = onlyWarn(p, { v: burned }, [{ t: 3, boxes: [boxAt(zone.y, zone.h)] }]);
  expect(on.map((f) => f.level + ':' + f.ids![0])).toEqual(['warn:cap']);
  expect(on[0].msg).toContain('疊在原片自己燒進畫面的字幕上');
  expect(onlyWarn(p, { v: burned }, [{ t: 3, boxes: [boxAt(100, 80)] }])).toEqual([]);
  expect(onlyWarn(p, { v: burned }, [{ t: 1, boxes: [boxAt(zone.y, zone.h)] }])).toEqual([]);       // no caption in the footage at that moment
  expect(onlyWarn(p, { v: { version: 1, step: 1, frames: 5, caption: null } }, [{ t: 3, boxes: [boxAt(zone.y, zone.h)] }])).toEqual([]);
  expect(onlyWarn(p, {}, [{ t: 3, boxes: [boxAt(zone.y, zone.h)] }])).toEqual([]);
});

test('a bleeped word while the footage shows its own caption may leak', () => {
  const p = proj({ text: '這家 {新珍香} 好吃' });
  const f = onlyWarn(p, { v: burned }, [{ t: 3, boxes: [boxAt(100, 80)] }]);   // even far from the caption row: it is written out somewhere
  expect(f.map((x) => x.msg.includes('消音可能洩底'))).toEqual([true]);
  expect(onlyWarn(proj({ text: '沒有打碼' }), { v: burned }, [{ t: 3, boxes: [boxAt(100, 80)] }])).toEqual([]);
});

test('the footage caption showing in the film is a note even when none of our words touch it', () => {
  const p = proj();
  const f = burnedChecks(p, { v: burned }, [{ t: 3, boxes: [boxAt(100, 80)] }, { t: 5, boxes: [] }]);
  expect(f.map((x) => x.level)).toEqual(['note']);
  expect(f[0].msg).toContain('取樣的 2 個時間點');
  expect(burnedChecks(p, { v: burned }, [{ t: 1, boxes: [] }])).toEqual([]);                      // not on screen at the sampled moment
  expect(burnedChecks(proj({ zoom: 1.6, y: 0.2 }), { v: burned }, [{ t: 3, boxes: [] }])).toEqual([]);   // cropped out of the frame
});
