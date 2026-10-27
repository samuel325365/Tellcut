import { CommandError } from './core.ts';
import { overlapPairs, relink, setCrossfade } from './overlap.ts';
import { trimEnd } from './trim.ts';
import { fixture, item, run } from './test-fixture.ts';

/** c2 starts 0.5 s inside c1 (0–4) and has a 0.5 s dissolve: linked */
const dissolving = () => { const p = fixture(); item(p, 'c2').start = 3.5; return p; };
/** m2 starts 2 s inside m1 (0–10, fade-out 1 s): not linked */
const twoSongs = () => {
  const p: any = fixture();
  p.tracks.find((t: any) => t.id === 'mu').items.push({ id: 'm2', media: 'm', in: 0, start: 8, end: 14, gain: 0, fadeIn: 2, fadeOut: 0 });
  return p;
};
const after = (p: any, edit: (d: any) => void) => { const d = structuredClone(p); edit(d); relink(p, d); return d; };

test('overlapPairs: the earlier item reaching furthest, the overlap, the link and which one is drawn on top', () => {
  expect(overlapPairs(dissolving()).get('c2')).toEqual({ track: 'v', kind: 'video', a: 'c1', b: 'c2', ov: 0.5, linked: true, top: 'b' });
  expect(overlapPairs(fixture()).has('c2')).toBe(false);          // c2 starts where c1 ends
  const p = dissolving(); item(p, 'c2').transitionIn.dur = 0.3;
  expect(overlapPairs(p).get('c2')!.linked).toBe(false);
  const s = twoSongs();
  expect(overlapPairs(s).get('m2')).toMatchObject({ a: 'm1', ov: 2, linked: false, top: 'b' });
  s.tracks.find((t: any) => t.id === 'mu').items.reverse();      // m1 last in the list: drawn over m2
  expect(overlapPairs(s).get('m2')!.top).toBe('a');
});

test('relink: a linked dissolve follows the overlap when either clip moves or is trimmed', () => {
  const p = dissolving();
  expect(item(after(p, (d) => { item(d, 'c2').start = 3.25; item(d, 'c2').end = 7.75; }), 'c2').transitionIn.dur).toBe(0.75);
  expect(item(after(p, (d) => { item(d, 'c1').end = 4.2; }), 'c2').transitionIn.dur).toBe(0.7);
});

test('relink leaves alone: an unlinked transition, a length just set by the user, and a pair whose overlap is gone', () => {
  const p = dissolving();
  const q = structuredClone(p); item(q, 'c2').transitionIn.dur = 0.3;
  expect(item(after(q, (d) => { item(d, 'c1').end = 4.2; }), 'c2').transitionIn.dur).toBe(0.3);
  expect(item(after(p, (d) => { item(d, 'c2').transitionIn.dur = 0.8; }), 'c2').transitionIn.dur).toBe(0.8);
  expect(item(after(p, (d) => { item(d, 'c2').start = 4.1; }), 'c2').transitionIn.dur).toBe(0.5);
  // a chain of dissolves (Wedding): only the pair whose overlap changed follows
  const still = { x: 0.5, y: 0.5, zoom: 1 };
  const chain: any = dissolving();
  chain.tracks[1].items.push({ id: 'c3', source: 's', in: 0, speed: 1, start: 7.5, end: 9, crop: { from: still, to: still }, transitionIn: { type: 'dissolve', dur: 0.5 } });
  const moved = after(chain, (d) => { item(d, 'c1').end = 4.2; });
  expect([item(moved, 'c2').transitionIn.dur, item(moved, 'c3').transitionIn.dur]).toEqual([0.7, 0.5]);
});

test('setCrossfade fades the earlier song out and the later one in over the overlap; off sets both to 0', () => {
  const on = run(twoSongs(), setCrossfade, { id: 'm2', on: true });
  expect([item(on, 'm1').fadeOut, item(on, 'm2').fadeIn, overlapPairs(on).get('m2')!.linked]).toEqual([2, 2, true]);
  const off = run(on, setCrossfade, { id: 'm2', on: false });
  expect([item(off, 'm1').fadeOut, item(off, 'm2').fadeIn]).toEqual([0, 0]);
  expect(() => run(fixture(), setCrossfade, { id: 'm1', on: true })).toThrow(CommandError);   // nothing before it
  expect(() => run(dissolving(), setCrossfade, { id: 'c2', on: true })).toThrow(/music and audio/);
});

test('relink: a linked crossfade follows the overlap; the clip\'s other fade gives way when the clip is too short', () => {
  const p = run(twoSongs(), setCrossfade, { id: 'm2', on: true });
  const moved = after(p, (d) => { item(d, 'm2').start = 7; item(d, 'm2').end = 13; });
  expect([item(moved, 'm1').fadeOut, item(moved, 'm2').fadeIn]).toEqual([3, 3]);
  const q = structuredClone(p); item(q, 'm1').fadeIn = 7.5;      // 7.5 + 2 still fits in 10 s
  const deeper = after(q, (d) => { item(d, 'm2').start = 6; item(d, 'm2').end = 12; });
  expect([item(deeper, 'm1').fadeIn, item(deeper, 'm1').fadeOut, item(deeper, 'm2').fadeIn]).toEqual([6, 4, 4]);
});

test('relink: trimming a crossfaded clip (its fades shrink in proportion) keeps the crossfade on the overlap; a fade drag still unlinks', () => {
  const p = run(twoSongs(), setCrossfade, { id: 'm2', on: true }); item(p, 'm2').fadeOut = 3;   // m1 out 2, m2 in 2 (linked), m2 out 3
  const d = structuredClone(p); trimEnd(d, { id: 'm2', dt: -2 }); relink(p, d);                 // m2 8–12: fitFades alone gives in 1.6 / out 2.4
  expect([item(d, 'm1').fadeOut, item(d, 'm2').fadeIn, item(d, 'm2').fadeOut, overlapPairs(d).get('m2')!.linked]).toEqual([2, 2, 2, true]);
  expect(item(after(p, (x) => { item(x, 'm2').fadeIn = 1; }), 'm2').fadeIn).toBe(1);
});

test('relink never shrinks a followed transition below one frame', () => {
  const p = dissolving();
  expect(item(after(p, (d) => { item(d, 'c1').end = 3.51; }), 'c2').transitionIn.dur).toBe(0.04);   // 0.01 s overlap, 25 fps
});
