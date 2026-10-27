import { parseProject, type Project } from '../schema.ts';
import { resolveTimes } from '../time.ts';
import { addItem, updateItem } from './edit.ts';
import { split } from './split.ts';
import { deleteItems, moveItems } from './arrange.ts';
import { rateStretch, trimEnd, trimStart } from './trim.ts';
import { item } from './test-fixture.ts';
import { attach, detach, magneticGaps, magneticWarnings, setMagnetic, settle } from './magnetic.ts';

const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clip = (id: string, start: number, end: number, inp: number, extra: object = {}) => ({ id, source: 's', in: inp, speed: 1, start, end, crop, ...extra });
function mag(over: (p: any) => void = () => {}): Project {
  const p: any = { version: 1, meta: { name: 'm', width: 320, height: 180, fps: 25, duration: 12, plugins: [], mix: MIX },
    sources: { s: { path: 's.mp4', duration: 60 } }, media: { song: { path: 'song.mp3', duration: 20 } }, grids: [],
    tracks: [
      { id: 'v', kind: 'video', magnetic: true, items: [clip('c1', 0, 4, 0), clip('c2', 4, 8, 10), clip('c3', 8, 12, 20)] },
      { id: 't', kind: 'overlay', items: [
        { id: 'cap', type: 'core.caption', start: 1, end: 2, parent: 'c2', params: { text: 'x' } },
        { id: 'free', type: 'core.caption', start: 0.5, end: 1, params: { text: 'y' } }] },
      { id: 'o', kind: 'audio', items: [{ id: 'o2', source: 's', in: 10, rate: 1, start: 0, end: 4, parent: 'c2', gain: 0, fadeIn: 0, fadeOut: 0 }] },
      { id: 'mu', kind: 'music', items: [{ id: 'm', media: 'song', in: 0, start: 0, end: 12, gain: 0, fadeIn: 0, fadeOut: 1, toEnd: true }] },
    ] };
  over(p);
  return parseProject(p);
}
/** one command followed by settle, as the editor and the proposal ops run it */
const go = <A>(p: Project, cmd: (d: Project, a: A) => unknown, a: A) => { const d = structuredClone(p); cmd(d, a); settle(p, d); return d; };
const at = (p: Project, id: string) => resolveTimes(p).get(id)!;

test('a shorter clip pulls the later clips back; the film and the music end earlier', () => {
  const p = go(mag(), trimEnd, { id: 'c1', dt: -1 });
  expect([at(p, 'c2').start, at(p, 'c3').start, at(p, 'c3').end, p.meta.duration, item(p, 'm').end]).toEqual([3, 7, 11, 11, 11]);
  expect(at(p, 'cap').start).toBe(4);   // still 1 s into c2
});

test("trimming a clip's head keeps it in place, pulls the rest back, and its captions stay on the picture", () => {
  const p = go(mag(), trimStart, { id: 'c2', dt: 1 });
  expect([item(p, 'c2').start, item(p, 'c2').end, item(p, 'c2').in, at(p, 'c3').start]).toEqual([4, 7, 11, 7]);
  expect([item(p, 'cap').start, item(p, 'o2').end, item(p, 'o2').in]).toEqual([0, 3, 11]);
  expect(item(p, 'cap').parent).toBe('c2');
});

test('deleting a clip closes the gap and takes what hangs on it', () => {
  const p = go(mag(), deleteItems, { ids: ['c2'] });
  expect(at(p, 'c3').start).toBe(4);
  expect(() => item(p, 'cap')).toThrow();
  expect(() => item(p, 'o2')).toThrow();
});

test('dragging a clip past the middle of its neighbour swaps their order; short of it nothing moves', () => {
  const p = go(mag(), moveItems, { ids: ['c1'], dt: 6.5 });
  expect([at(p, 'c2').start, at(p, 'c1').start, at(p, 'c3').start]).toEqual([0, 4, 8]);
  const q = go(mag(), moveItems, { ids: ['c1'], dt: 5 });
  expect([at(q, 'c1').start, at(q, 'c2').start]).toEqual([0, 4]);
});

test('a speed change pushes the later clips', () => {
  const p = go(mag(), rateStretch, { id: 'c1', edge: 'end', dt: 4 });
  expect(at(p, 'c2').start).toBe(8);
});

test('a linked dissolve keeps its overlap when the clips around it move; nothing starts before 0', () => {
  const base = mag((q) => { q.tracks[0].items[2] = clip('c3', 7.5, 11.5, 20, { transitionIn: { type: 'dissolve', dur: 0.5 } }); });
  const p = go(base, trimEnd, { id: 'c1', dt: -1 });
  expect([at(p, 'c3').start, item(p, 'c3').transitionIn.dur]).toEqual([6.5, 0.5]);
  const q = go(base, deleteItems, { ids: ['c1'] });
  expect([at(q, 'c2').start, at(q, 'c3').start]).toEqual([0, 3.5]);
});

test('an item placed or moved over a clip hangs on it; moved off every clip it hangs on nothing', () => {
  let p = go(mag(), addItem, { track: 't', item: { id: 'new', type: 'core.caption', start: 9, end: 10, params: { text: 'z' } } });
  expect([item(p, 'new').parent, item(p, 'new').start]).toEqual(['c3', 1]);
  p = go(p, moveItems, { ids: ['free'], dt: 5 });
  expect([item(p, 'free').parent, item(p, 'free').start]).toEqual(['c2', 1.5]);
  p = go(p, moveItems, { ids: ['free'], dt: 20 });
  expect([item(p, 'free').parent, at(p, 'free').start]).toEqual([undefined, 25.5]);
});

test('music that ends with the film stops where its file ends, and says so', () => {
  const p = go(mag(), rateStretch, { id: 'c3', edge: 'end', dt: 20 });
  expect([p.meta.duration, item(p, 'm').end]).toEqual([32, 20]);
  expect(magneticWarnings(p).join('\n')).toMatch(/音樂.*m/);
});

test('a caption left past the end of its clip after a trim stays, and is reported', () => {
  const p = go(mag(), trimEnd, { id: 'c2', dt: -3.5 });
  expect(item(p, 'cap').parent).toBe('c2');
  expect(magneticWarnings(p).join('\n')).toMatch(/cap/);
});

test('without a magnetic track settle changes nothing but the linked transitions', () => {
  const p = mag((q) => { delete q.tracks[0].magnetic; });
  const d = structuredClone(p); trimEnd(d, { id: 'c1', dt: -1 });
  const e = structuredClone(d); settle(p, e);
  expect(e).toEqual(d);
});

test('turning magnetic on closes the gaps, captions travel with their clips; one magnetic track at a time', () => {
  const p = mag((q) => { delete q.tracks[0].magnetic; q.tracks[0].items[1] = clip('c2', 6, 10, 10); q.tracks[0].items[2] = clip('c3', 10, 14, 20);
    q.tracks[1].items = [{ id: 'late', type: 'core.caption', start: 7, end: 8, params: { text: 'q' } }]; q.tracks[2].items = []; });
  expect(magneticGaps(p, 'v')).toEqual({ count: 1, shift: 2 });
  const d = structuredClone(p); setMagnetic(d, { id: 'v', on: true }); settle(p, d);
  expect([at(d, 'c2').start, item(d, 'late').parent, at(d, 'late').start]).toEqual([4, 'c2', 5]);
  const e = structuredClone(d); (e.tracks as any).push({ id: 'v9', kind: 'video', items: [] });
  setMagnetic(e, { id: 'v9', on: true });
  expect(e.tracks.filter((t: any) => t.magnetic).map((t) => t.id)).toEqual(['v9']);
});

test('attach and detach keep the item where it is in time', () => {
  let p = go(mag(), attach, { id: 'free', to: 'c1' });
  expect([item(p, 'free').parent, at(p, 'free').start]).toEqual(['c1', 0.5]);
  p = go(p, detach, { id: 'cap' });
  expect([item(p, 'cap').parent, at(p, 'cap').start]).toEqual([undefined, 5]);
});

test('an item cannot be attached to something that hangs on it (a loop of parents)', () => {
  const p = go(mag(), attach, { id: 'free', to: 'cap' });   // free hangs on cap, cap on c2
  expect(() => go(p, attach, { id: 'cap', to: 'free' })).toThrow('不能掛在掛在它身上的項目');
});

test('an end card after the last clip keeps the film that long and follows the end when a clip gets shorter', () => {
  const base = mag((q) => { q.tracks[1].items.push({ id: 'end', type: 'core.endCard', start: 12, end: 15, params: {} }); q.meta.duration = 15; });
  const p = go(base, trimEnd, { id: 'c1', dt: -1 });
  expect([at(p, 'end').start, at(p, 'end').end, p.meta.duration, item(p, 'm').end]).toEqual([11, 14, 14, 14]);
  const d = structuredClone(base); setMagnetic(d, { id: 'v', on: true }); settle(base, d);
  expect(d.meta.duration).toBe(15);
});

test('a short music clip (a voice line) hangs on the clip under it; music that ends with the film does not', () => {
  const base = mag((q) => { q.tracks[3].items.push({ id: 'voice', media: 'song', in: 0, start: 9, end: 10, gain: 0, fadeIn: 0, fadeOut: 0 }); });
  const d = structuredClone(base); setMagnetic(d, { id: 'v', on: true }); settle(base, d);
  expect([item(d, 'voice').parent, item(d, 'm').parent]).toEqual(['c3', undefined]);
  const p = go(d, trimEnd, { id: 'c1', dt: -1 });
  expect(at(p, 'voice').start).toBe(8);
});

test('a clip dragged to the front becomes the first; a drag past the middle of its neighbour swaps them', () => {
  const p = go(mag(), moveItems, { ids: ['c3'], dt: -10 });
  expect([at(p, 'c3').start, at(p, 'c1').start, at(p, 'c2').start]).toEqual([0, 4, 8]);
  const q = go(mag(), moveItems, { ids: ['c2'], dt: -2.5 });
  expect([at(q, 'c2').start, at(q, 'c1').start]).toEqual([0, 4]);
});

test('a clip added inside another goes to the nearest cut', () => {
  const p = go(mag(), addItem, { track: 'v', item: clip('n', 5, 7, 30) });
  expect([at(p, 'c1').start, at(p, 'n').start, at(p, 'c2').start]).toEqual([0, 4, 6]);
});

test('a hung clip moved onto the magnetic track leaves its parent and is packed like any clip', () => {
  const base = mag((q) => { q.tracks.push({ id: 'v2', kind: 'video', items: [clip('b', 1, 2, 40, { parent: 'c2' })] }); });
  const p = go(base, moveItems, { ids: ['b'], dt: 0, toTrack: 'v' });
  expect(item(p, 'b').parent).toBeUndefined();
  expect([at(p, 'c1').start, at(p, 'b').start, at(p, 'c2').start, at(p, 'c3').end]).toEqual([0, 4, 5, 13]);
  expect(() => go(mag(), attach, { id: 'c2', to: 'c1' })).toThrow();
});

test('ripple-deleting a hung caption does not pull anything else back', async () => {
  const { rippleDelete } = await import('./arrange.ts');
  const base = mag((q) => { q.tracks[1].items.push({ id: 'end', type: 'core.endCard', start: 12, end: 15, params: {} }); q.meta.duration = 15; });
  const p = go(base, rippleDelete, { ids: ['cap'] });
  expect([at(p, 'end').start, p.meta.duration]).toEqual([12, 15]);
});

test('deleting a clip between two dissolves keeps a dissolve into the next one (no black dip)', () => {
  const base = mag((q) => { q.tracks[0].items = [clip('c1', 0, 4, 0), clip('c2', 3.5, 7.5, 10, { transitionIn: { type: 'dissolve', dur: 0.5 } }),
    clip('c3', 7, 11, 20, { transitionIn: { type: 'dissolve', dur: 0.5 } })]; q.tracks[1].items = []; q.tracks[2].items = []; });
  const p = go(base, deleteItems, { ids: ['c2'] });
  expect([at(p, 'c3').start, item(p, 'c3').transitionIn.dur]).toEqual([3.5, 0.5]);
});

test('splitting music that follows the film leaves two halves one after the other, only the second following the film', () => {
  const p = go(mag(), split, { t: 5 });
  const music = p.tracks.find((t) => t.id === 'mu')!.items as any[];
  expect(music.map((m) => [m.start, m.end, m.in, !!m.toEnd])).toEqual([[0, 5, 0, false], [5, 12, 5, true]]);
  const q = go(p, trimEnd, { id: 'c3', dt: -2 });   // a shorter film: the second half still ends with it
  expect((q.tracks.find((t) => t.id === 'mu')!.items as any[]).map((m) => m.end)).toEqual([5, 10]);
});
