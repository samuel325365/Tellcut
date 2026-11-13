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

// a clip in a window (frame 0.1, 0.25, 0.8 × 0.5 of 1080 × 1920 = x 108, y 480, 864 × 960): the 1920 × 1080 source covers it
// at 1706.7 × 960 with its left edge at −421.3, so the caption row [0.08, 0.86, 0.84, 0.12] runs from x −176.8 to 1256.8, is cut
// to the window's 108…972, and sits at y 480 + 0.86 × 960 = 1305.6, 0.12 × 960 = 115.2 tall
const windowed = () => proj({ frame: [0.1, 0.25, 0.8, 0.5] });
test('the caption row of a clip in a window lands at its exact place on the picture, cut to the window', () => {
  const r = at(windowed(), 3)!;
  expect(r.x).toBeCloseTo(108, 6);
  expect(r.y).toBeCloseTo(1305.6, 6);
  expect(r.w).toBeCloseTo(864, 6);
  expect(r.h).toBeCloseTo(115.2, 6);
});

test('our words count as on the footage caption from a quarter of their box: 20 % is not, 30 % is; the clip\'s own box is never ours', () => {
  const p = windowed();
  // a 100 px tall box reaching 20 px / 30 px into the row's top (y 1305.6)
  expect(onlyWarn(p, { v: burned }, [{ t: 3, boxes: [boxAt(1305.6 - 80, 100)] }])).toEqual([]);
  expect(onlyWarn(p, { v: burned }, [{ t: 3, boxes: [boxAt(1305.6 - 70, 100)] }]).map((f) => f.ids)).toEqual([['cap']]);
  // the player measures the video item too (its id is the clip's): the footage's caption on itself is the note, not a warning
  expect(onlyWarn(p, { v: burned }, [{ t: 3, boxes: [boxAt(1305.6, 115.2, 'c1')] }])).toEqual([]);
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

test('a frozen clip shows the caption of its held frame, not of the source past it', () => {
  const frozen = (at: number) => { const p = proj(); (p.tracks[0].items[0] as any).freezeAt = at; return p; };
  // held at source 11 (no caption): source 13 is never on screen
  expect(at(frozen(1), 3)).toBeNull();
  // held at source 13 (inside the span 12–20): the caption stays up past source 20's film time
  expect(at(frozen(3), 9.99)).not.toBeNull();
  expect(at(frozen(3), 10 - 1e-3)).not.toBeNull();
});

test('a clip on a hidden video track shows no caption', () => {
  const p = proj();
  p.tracks[0].muted = true;
  expect(burnedChecks(p, { v: burned }, [{ t: 3, boxes: [boxAt(at(proj(), 3)!.y, at(proj(), 3)!.h)] }])).toEqual([]);
});
