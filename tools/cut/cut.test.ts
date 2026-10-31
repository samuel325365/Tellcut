// The Cut API (cut.ts): clips and photos on the main track, texts, effects and their tracks, theme, params, handles.
// Other topics are in cut-*.test.ts (speech, save, audio, framing, tighten, samples); their shared fixture in cut-test-kit.ts.
import { parseProject } from '@tellcut/engine';
import { fresh, items } from './cut-test-kit.ts';

test('clips and photos go one after another on the main track; a clip brings its own sound along', () => {
  const c = fresh();
  const a = c.clip('v', { from: 1, len: 2 });
  const b = c.photo('ph', { len: 3 });
  expect(items(c, 'v1').map((i) => [i.id, i.source, i.in, i.start, i.end])).toEqual([[a, 'v', 1, 0, 2], [b, 'ph', 0, 2, 5]]);
  expect(items(c, 'v1')[1].crop).toEqual({ from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } });
  expect(items(c, 'orig').map((i) => [i.source, i.in, i.start, i.end, i.parent])).toEqual([['v', 1, 0, 2, a]]);
  expect(c.time).toBe(5);
});

test('camera shake lands on the clip playing then, in its own seconds; across a cut both clips shake', () => {
  const c = fresh();
  const a = c.clip('v', { from: 0, len: 2 }), b = c.clip('v', { from: 2, len: 2 });
  c.shake(0.5);
  c.shake(1.8, { dur: 0.5, px: 30 });
  const clip = (id: string) => items(c, 'v1').find((i) => i.id === id);
  expect(clip(a).shake).toEqual([{ at: 0.5, dur: 0.4, px: 24, hz: 18 }, { at: 1.8, dur: 0.5, px: 30, hz: 18 }]);
  expect(clip(b).shake).toEqual([{ at: -0.2, dur: 0.5, px: 30, hz: 18 }]);
  expect(() => c.shake(10)).toThrow('沒有影片片段');
});

test('a dissolve overlaps the previous clip by its length (linked to the overlap)', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  c.clip('v', { from: 5, len: 2, transition: { type: 'dissolve', dur: 0.5 } });
  expect(items(c, 'v1').map((i) => [i.start, i.end])).toEqual([[0, 2], [1.5, 3.5]]);
});

test('texts go on the text track; speech becomes captions attached to the clip; the end card comes last', () => {
  const c = fresh();
  c.title('京都', { at: 0, len: 3 });
  const a = c.clip('v', { from: 0, len: 4 });
  const caps = c.speechCaptions(a);
  c.endCard(['感謝觀看', '小明']);
  const t = items(c, 'text');
  expect(t.map((i) => [i.type, i.start, i.end, i.parent ?? null])).toEqual([
    ['core.title', 0, 3, null], ['core.caption', 1, 2.5, a], ['core.endCard', 4, 9, null],
  ]);
  expect([caps.length, t[1].params.text, t[2].params.text]).toEqual([1, '大家好', '感謝觀看\n小明']);
});

test('fx registers a project-local module once; effect puts any item type on the text track', () => {
  const c = fresh();
  c.fx('fx/ring.js').fx('fx/ring.js');
  const id = c.effect('fx.ring', { at: 1, len: 2, color: '#fff' });
  expect(c.p.meta.fx).toEqual(['fx/ring.js']);
  expect(items(c, 'text').map((i) => [i.id, i.type, i.start, i.end, i.params])).toEqual([[id, 'fx.ring', 1, 3, { color: '#fff' }]]);
  expect(c.p.meta.fx).toEqual(['fx/ring.js']);
});

test('theme sets only the fields given, group by group', () => {
  const c = fresh();
  c.theme({ palette: { accent: '#0af' }, radius: 12 }).theme({ palette: { hl: '#ff0' }, safe: { bottom: 0.25 } });
  expect(c.p.meta.theme).toEqual({ palette: { accent: '#0af', hl: '#ff0' }, radius: 12, safe: { bottom: 0.25 } });
});

test('block params named like an option of c.effect / c.sfx (at, who, len) go in params: {…}, which wins over the loose keys', () => {
  const c = fresh();
  const pencil = c.effect('common.progress', { at: 1, len: 4, mode: 'pencil', dots: 3, params: { at: '0.5,1.5,2.5,3.5' } });
  const quote = c.effect('common.quote', { at: 2, len: 2, text: 'hi', params: { who: 'a coach', text: 'hello' } });
  const shing = c.sfx('common.shing', { at: 3, len: 2, params: { len: 1.5 } });
  const byId = (id: string) => c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id);
  expect([byId(pencil).start, byId(pencil).end, byId(pencil).params]).toEqual([1, 5, { mode: 'pencil', dots: 3, at: '0.5,1.5,2.5,3.5' }]);
  expect(byId(quote).params).toEqual({ text: 'hello', who: 'a coach' });
  expect([byId(shing).start, byId(shing).end, byId(shing).params]).toEqual([3, 5, { len: 1.5 }]);
  expect(() => c.effect('common.progress', { len: 1, params: 'at=1' as any })).toThrow(/params 要是物件/);
  // a script without params: {…} works as before
  expect(byId(c.effect('common.slam', { at: 0, len: 1, text: 'x' })).params).toEqual({ text: 'x' });
});

test('a gallery handle where a type id belongs is refused with the id it stands for', () => {
  const c = fresh();
  expect(() => c.effect('MRK-03', { at: 0, len: 1 })).toThrow(/MRK-03 是圖鑑代號.*c\.effect\('common\.stamp'/);
  expect(() => c.sfx('sfx-hit-2', { at: 0 })).toThrow(/c\.sfx\('common\.pop'/);
  expect(() => c.effect('ZZZ-09', { at: 0, len: 1 })).toThrow(/也沒有這個代號/);
});

test('effect takes a transform for the item, on the text track and on the top layer alike', () => {
  const c = fresh();
  const a = c.effect('common.caption', { at: 0, len: 1, text: 'x', transform: { x: 0, y: -0.1, scale: 1 } });
  const b = c.effect('common.film', { at: 0, len: 1, layer: 'top', transform: { x: 0.1, y: 0, scale: 1 } });
  expect(items(c, 'text').find((i) => i.id === a).transform).toMatchObject({ x: 0, y: -0.1, scale: 1 });
  expect(items(c, 'text').find((i) => i.id === a).params).toEqual({ text: 'x' });
  expect(items(c, 'top')[0]).toMatchObject({ id: b, transform: { x: 0.1, y: 0, scale: 1 } });
  expect(() => parseProject(c.p)).not.toThrow();
});

test('new projects get English track names', () => {
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  expect(c.p.tracks.map((t) => [t.id, t.name])).toEqual([['v1', 'Main'], ['text', 'Text'], ['music', 'Music'], ['orig', 'Source']]);
});
