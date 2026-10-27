// Group F (2026-10-24): common.magazine, common.wipe mode curl and common.route look page — their layouts, timings and geometry.
import { defaultSafe, withDefaults, type ItemType } from '@tellcut/engine';
import { cellCrop, magazine, magazineLayout, magazineWindow, mastEm, parseItems, parseTags } from './magazine.ts';
import { clipPoly, curlAt, curlWindow, wipe } from './wipe.ts';
import { route } from './route.ts';
import { paper } from './paper.ts';
import { arrivals, camView, DOODLE_NAMES, doodlePts, legLabel, legPath, legTimes, MAP_H, MAP_W, pagePlaces, parseCams } from './routepage.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default;
const P = (o: Record<string, unknown> = {}) => withDefaults(magazine.params, o) as Parameters<typeof magazineLayout>[0];
const inside = (r: number[], W: number, H: number) => r[0] >= -1e-6 && r[1] >= -1e-6 && r[0] + r[2] <= W + 1e-6 && r[1] + r[3] <= H + 1e-6;
const overlap = (a: number[], b: number[]) => Math.min(a[0] + a[2], b[0] + b[2]) > Math.max(a[0], b[0]) + 1e-6 && Math.min(a[1] + a[3], b[1] + b[3]) > Math.max(a[1], b[1]) + 1e-6;

test('magazine: every layout keeps its window and cells inside the frame and apart, on tall, square and wide frames', () => {
  for (const [W, H] of [[1080, 1920], [1080, 1080], [1920, 1080]]) for (const layout of ['feature', 'cover', 'list', 'back']) {
    const L = magazineLayout(P({ layout }), W, H, defaultSafe(W, H));
    expect(inside(L.win, W, H)).toBe(true);
    for (const c of L.cells) { expect(inside(c, W, H)).toBe(true); expect(overlap(c, L.win)).toBe(false); }
    for (let i = 0; i < L.cells.length; i++) for (let j = i + 1; j < L.cells.length; j++) expect(overlap(L.cells[i], L.cells[j])).toBe(false);
    expect(L.tx).toBeGreaterThanOrEqual(0.05 * W);
    expect(L.ty).toBeGreaterThanOrEqual(0.05 * H);
    expect(L.fy).toBeLessThanOrEqual(0.95 * H);
  }
});

test('magazine: tall pages stack the cells under the window, wide ones put them beside it; cover takes two cells, list none', () => {
  const tall = magazineLayout(P(), 1080, 1920), wide = magazineLayout(P(), 1920, 1080);
  expect(tall.cells).toHaveLength(3);
  expect(tall.cells[0][1]).toBeGreaterThan(tall.win[1] + tall.win[3]);
  expect(wide.cells[0][0]).toBeGreaterThan(wide.win[0] + wide.win[2]);
  expect(magazineLayout(P({ layout: 'cover' }), 1080, 1920).cells).toHaveLength(2);
  expect(magazineLayout(P({ layout: 'list' }), 1080, 1920).cells).toHaveLength(0);
  expect(magazineLayout(P({ layout: 'back' }), 1080, 1920).win).toEqual([0, 0, 1080, 1920]);
  expect(magazineLayout(P({ cells: '-' }), 1080, 1920).cells).toHaveLength(1);
  expect(magazineLayout(P({ cells: '' }), 1080, 1920).win[3]).toBeGreaterThan(tall.win[3]);
  // the cover's window bleeds to both edges on a tall frame; aspect fixes the shape
  const cv = magazineLayout(P({ layout: 'cover' }), 1080, 1920);
  expect([cv.win[0], cv.win[2]]).toEqual([0, 1080]);
  const a = magazineLayout(P({ aspect: 16 / 9 }), 1080, 1920).win;
  expect(a[2] / a[3]).toBeCloseTo(16 / 9, 3);
});

test('magazine: the window as the clip frame (fractions), a given win wins', () => {
  const f = magazineWindow({}, 1080, 1920), L = magazineLayout(P(), 1080, 1920);
  expect(f[0]).toBeCloseTo(L.win[0] / 1080, 4);
  expect(f[3]).toBeCloseTo(L.win[3] / 1920, 4);
  expect(magazineWindow({ win: '0.1,0.2,0.8,0.4' })).toEqual([0.1, 0.2, 0.8, 0.4]);
  expect(magazineWindow({ layout: 'back' }, 1920, 1080)).toEqual([0, 0, 1, 1]);
});

test('magazine: tags, list rows, the cells drift and the masthead width', () => {
  expect(parseTags('1.2-3|0|HIDDEN GEM|隱藏版的寶石\nx|1|A|B\n2|1||字')).toEqual([{ at: 1.2, until: 3, cell: 0, en: 'HIDDEN GEM', zh: '隱藏版的寶石' }, { at: 2, until: undefined, cell: 1, en: '', zh: '字' }]);
  expect(parseItems('0.5|第一站|市場\n1|第二站\n|')).toEqual([{ at: 0.5, title: '第一站', note: '市場' }, { at: 1, title: '第二站', note: '' }]);
  const s = { source: 'a', t: 0, crop: { x: 0.5, y: 0.5, zoom: 1 } };
  expect(cellCrop(s, 0, 0, 0.012).zoom).toBe(1);
  expect(cellCrop(s, 0, 5, 0.012).zoom).toBeCloseTo(1.06);
  expect(cellCrop(s, 0, 100, 0.012).zoom).toBeCloseTo(1.12);      // 12 % at most
  expect(cellCrop(s, 1, 5, 0.012).zoom).toBeCloseTo(1.06);        // every other cell pulls out from 1.12
  expect(mastEm('LAZY')).toBeGreaterThan(mastEm('lazy'));
  expect(def(magazine, 'layout')).toBe('feature');
});

test('magazine is an overlay: the page lies over the clip, so the headline, the banner and the back cover drawn over the window show', () => {
  expect(magazine.kind).toBe('overlay');
});

test('magazine asks for the stills of its cells (exports prepare them)', () => {
  const m = magazine.media!({ params: { cells: 'a|1.5|0.4,0.5,2\n-\nb|3' } } as never, undefined as never);
  expect(m.stills).toEqual([{ source: 'a', t: 1.5, w: 1080 }, { source: 'b', t: 3, w: 1080 }]);
});

test('wipe curl: the old page lies flat at 0 and is gone at 1; flat + lifted always make the page; the fold is its own mirror', () => {
  const W = 1080, H = 1920, area = (pts: Array<[number, number]>) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const c0 = curlAt(0, 14, W, H), c1 = curlAt(1, 14, W, H);
  expect(area(c0.flat)).toBeCloseTo(W * H, 0);
  expect(area(c0.flap)).toBeLessThan(1);
  expect(area(c1.flat)).toBeLessThan(1);
  for (const u of [0.2, 0.5, 0.8]) for (const angle of [0, 14, 45, -68, 90]) {
    const c = curlAt(u, angle, W, H), lifted = clipPoly([[0, 0], [W, 0], [W, H], [0, H]], c.dx, c.dy, c.fold);
    expect(area(c.flat) + area(lifted)).toBeCloseTo(W * H, -1);
    expect(area(c.flap)).toBeCloseTo(area(lifted), -1);            // a mirror keeps the area
    const [a, b, cc, d, e, f] = c.matrix, x = c.fold * c.dx, y = c.fold * c.dy;
    expect(a * x + cc * y + e).toBeCloseTo(x, 6);
    expect(b * x + d * y + f).toBeCloseTo(y, 6);
  }
  // angle 0 lifts the right edge first
  const r = curlAt(0.3, 0, W, H);
  expect(Math.max(...r.flat.map((p) => p[0]))).toBeLessThan(W);
  expect(Math.min(...r.flat.map((p) => p[0]))).toBe(0);
});

test('wipe curl: the still sits in win, in a hosted magazine page\'s window, or over the whole frame; defaults stay band', () => {
  expect(curlWindow({ win: '0.1,0.1,0.5,0.5', art: '', artParams: {} }, 1000, 2000)).toEqual([100, 200, 500, 1000]);
  expect(curlWindow({ win: '', art: '', artParams: {} }, 1080, 1920)).toEqual([0, 0, 1080, 1920]);
  const safe = defaultSafe(1080, 1920);
  expect(curlWindow({ win: '', art: 'common.magazine', artParams: { layout: 'list' } }, 1080, 1920, safe)).toEqual(magazineLayout(P({ layout: 'list' }), 1080, 1920, safe).win);
  expect(def(wipe, 'mode')).toBe('band');
  const types = (t: string) => ({ 'common.magazine': magazine } as Record<string, ItemType>)[t];
  const m = wipe.media!({ params: { mode: 'curl', source: 's', t: 4, art: 'common.magazine', artParams: { cells: 'c|2' } } } as never, undefined as never, types);
  expect(m.stills).toEqual([{ source: 's', t: 4, w: 1080 }, { source: 'c', t: 2, w: 1080 }]);
  expect(wipe.media!({ params: { source: 's' } } as never, undefined as never).stills).toEqual([]);
});

test('wipe curl: media() hands on what any hosted block needs, through the registry (as common.card does)', () => {
  const fx = { type: 'fx.page', label: 'fx', kind: 'overlay', params: [{ key: 'at', label: 'at', type: 'number', default: 7 }], build() {}, draw() {},
    media: (item: { params: { at: number } }) => ({ videos: [{ source: 'v', in: item.params.at, out: item.params.at + 1, speed: 1, interp: 'none' }], stills: [{ source: 'p', t: 1 }] }) } as unknown as ItemType;
  const reg: Record<string, ItemType> = { 'fx.page': fx, 'common.wipe': wipe as ItemType }, types = (t: string) => reg[t];
  const item = (o: Record<string, unknown>) => ({ params: withDefaults(wipe.params, { mode: 'curl', ...o }) }) as never;
  const m = wipe.media!(item({ source: 's', t: 4, art: 'fx.page' }), undefined as never, types);
  expect(m.videos).toEqual([{ source: 'v', in: 7, out: 8, speed: 1, interp: 'none' }]);   // the hosted block's own default param
  expect(m.stills).toEqual([{ source: 's', t: 4, w: 1080 }, { source: 'p', t: 1 }]);
  expect(wipe.media!(item({ art: 'fx.page', artParams: { at: 2 } }), undefined as never, types).videos[0].in).toBe(2);
  expect(wipe.media!(item({ art: 'fx.page' }), undefined as never)).toEqual({ videos: [], stills: [] });          // no registry
  expect(wipe.media!(item({ art: 'common.wipe' }), undefined as never, types)).toEqual({ videos: [], stills: [] });  // never itself
  expect(wipe.media!(item({ mode: 'band', source: 's', art: 'fx.page' }), undefined as never, types)).toEqual({ videos: [], stills: [] });
});

test('route page: the default look stays the card; places loop on the map, legs start and end off the circles', () => {
  expect(def(route, 'look')).toBe('card');
  expect(def(paper, 'look')).toBe('desk');
  for (const n of [2, 3, 5, 7, 10]) {
    const P0 = pagePlaces(n);
    expect(P0).toHaveLength(n);
    for (const [x, y] of P0) { expect(x).toBeGreaterThan(100); expect(x).toBeLessThan(MAP_W - 100); expect(y).toBeGreaterThan(60); expect(y).toBeLessThan(MAP_H - 60); }
    for (let i = 0; i < n - 1; i++) {
      const L = legPath(P0, i), a = P0[i], b = P0[i + 1];
      expect(Math.hypot(L[0][0] - a[0], L[0][1] - a[1])).toBeCloseTo(30, 0);
      expect(Math.hypot(L[L.length - 1][0] - b[0], L[L.length - 1][1] - b[1])).toBeCloseTo(30, 0);
      const [lx, ly] = legLabel(P0, i, 80);
      expect(Math.min(...P0.map(([x, y]) => Math.hypot(x - lx, y - ly)))).toBeGreaterThan(40);
    }
  }
  expect(pagePlaces(3, '0.1,0.2|0.5,0.5|0.9,0.8')).toEqual([[108, 124], [540, 310], [972, 496]]);
  expect(legPath(pagePlaces(5), 4).length).toBeGreaterThan(10);   // the way back to the start
});

test('route page: arrivals spread from `from` to `to` (or as given), each leg drawn up to its arrival; camera modes', () => {
  const a = arrivals(4, 1, 3);
  expect(a[0]).toBeCloseTo(0.6);
  expect(a[4]).toBeCloseTo(2.95);
  expect(arrivals(3, 1, 3, '1.5, 2, x')).toEqual([0.6, 1.5, 2, 3 - 0.05]);
  const [t0, t1] = legTimes(a, 2);
  expect(t0).toBeGreaterThan(a[1]);
  expect(t1).toBe(a[2]);
  expect(parseCams('0|walk, 1.5|stop\n2|bogus')).toEqual([{ t: 0, mode: 'walk' }, { t: 1.5, mode: 'stop' }, { t: 2, mode: 'full' }]);
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const safe = defaultSafe(W, H);
    for (const m of ['full', 'walk', 'stop', 'end'] as const) {
      const v = camView(m, W, H, safe, [540, 310]);
      expect(v.x).toBeGreaterThanOrEqual(0); expect(v.x + MAP_W * v.s).toBeLessThanOrEqual(W + 1e-6);
      expect(v.y).toBeGreaterThanOrEqual(0); expect(v.y + MAP_H * v.s).toBeLessThanOrEqual(H + 1e-6);
    }
    expect(camView('stop', W, H, safe, [0, 0]).s).toBeLessThan(camView('full', W, H, safe, [0, 0]).s * 0.5);
    const near = camView('near', W, H, safe, [300, 200]);
    expect(near.x + 300 * near.s).toBeCloseTo(W / 2);
  }
  // tall walk leaves the lower part of the frame for the footage
  const w = camView('walk', 1080, 1920, defaultSafe(1080, 1920), [0, 0]);
  expect(w.y + MAP_H * w.s).toBeLessThan(1920 * 0.5);
});

test('route page doodles: every name draws strokes in its box; unknown names fall back to a star', () => {
  for (const n of DOODLE_NAMES) {
    const d = doodlePts(n, 100, 100, 100);
    expect(d.length).toBeGreaterThan(0);
    for (const l of d) for (const [x, y] of l) { expect(Math.abs(x - 100)).toBeLessThanOrEqual(60); expect(Math.abs(y - 100)).toBeLessThanOrEqual(60); }
  }
  expect(doodlePts('nope', 0, 0, 100)).toEqual(doodlePts('star', 0, 0, 100));
});
