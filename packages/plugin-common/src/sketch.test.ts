// The hand-drawn kit (sketch.ts) and the looks built on it: every pen draws the same thing for the same t, boil changes the wobble
// only when asked and only on its beat, the shapes the old helpers drew keep their points, and the new modes leave the defaults alone.
import { boiled, penPath } from './inkline.ts';
import { handCircle, handLoopPts, heart, heartPts, tick, tickPts } from './hand.ts';
import {
  ballpointStroke, crayonStroke, cutPath, hatchFill, inkStroke, markerStroke, pathLen, pencilStroke, rectSides, rrectPts, scribbleFill, starPts, wavePts,
  type PenStyle, type Pt,
} from './sketch.ts';
import { doodleMarks, pen, PEN_KINDS } from './pen.ts';
import { panel, tapeCorners } from './panel.ts';
import { paper } from './paper.ts';
import { caption } from './caption.ts';
import { handwrite, redMarks } from './handwrite.ts';

/** a canvas context that records every call and property set, so two drawings can be compared */
function recorder() {
  const log: string[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, strokeStyle: '#000', fillStyle: '#000' };
  const g = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...a: unknown[]) => { log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(4) : String(x))).join(',')})`); return undefined; };
    },
    set(t, k: string, v) { t[k] = v; log.push(`${k}=${typeof v === 'number' ? v.toFixed(4) : String(v)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, log };
}
const draw = (f: (g: CanvasRenderingContext2D) => void) => { const r = recorder(); f(r.g); return r.log.join('\n'); };

const line: Pt[] = [[10, 10], [120, 40], [220, 15], [300, 90]];
const loop = rrectPts(20, 20, 300, 200, 30);

test('boiled: off keeps the seed; on, a new seed every 1/boil s, the same for any t inside one beat', () => {
  expect(boiled(5, 3.7, 0)).toBe(5);
  expect(boiled(5, 0.01, 8)).toBe(boiled(5, 0.12, 8));
  expect(boiled(5, 0.12, 8)).not.toBe(boiled(5, 0.13, 8));
  expect(boiled(5, 0.125, 8)).toBe(boiled(5, 0.249, 8));
});

const pens: Array<[string, (g: CanvasRenderingContext2D, t: number, boil: number) => void]> = [
  ['crayon', (g, t, boil) => crayonStroke(g, line, { w: 12, color: '#c00', seed: 3, t, boil, prog: 0.7 })],
  ['pencil', (g, t, boil) => pencilStroke(g, line, { w: 4, color: '#333', seed: 3, t, boil })],
  ['ballpoint', (g, t, boil) => ballpointStroke(g, line, { w: 5, color: '#00c', seed: 3, t, boil, overshoot: true })],
  ['marker', (g, t, boil) => markerStroke(g, line, { w: 10, color: '#fff', seed: 3, t, boil })],
  ['hatch', (g, t, boil) => hatchFill(g, loop, '#fc0', { seed: 3, t, boil, prog: 0.6 })],
  ['scribble', (g, t, boil) => scribbleFill(g, loop, '#fc0', { seed: 3, t, boil })],
];

test.each(pens)('%s: the same t draws the same; boil changes it on its beat and never when off', (_, f) => {
  expect(draw((g) => f(g, 0.4, 8))).toBe(draw((g) => f(g, 0.4, 8)));
  expect(draw((g) => f(g, 0.4, 8))).toBe(draw((g) => f(g, 0.45, 8)));
  expect(draw((g) => f(g, 0.4, 8))).not.toBe(draw((g) => f(g, 0.6, 8)));
  expect(draw((g) => f(g, 0.4, 0))).toBe(draw((g) => f(g, 2.6, 0)));
});

test('penPath: without boil it draws exactly as before; with it, a new wobble on the beat', () => {
  const plain = draw((g) => penPath(g, line, 6, '#000', 9, 0.8));
  expect(draw((g) => penPath(g, line, 6, '#000', 9, 0.8, {}))).toBe(plain);
  expect(draw((g) => penPath(g, line, 6, '#000', 9, 0.8, { boil: 8, t: 0.05 }))).toBe(plain);
  expect(draw((g) => penPath(g, line, 6, '#000', 9, 0.8, { boil: 8, t: 0.3 }))).not.toBe(plain);
});

test('the old helpers keep their points: tick, heart, handCircle', () => {
  const t = tickPts(0, 0, 36);
  [[4, 16], [16, 30], [42, -10]].forEach(([x, y], i) => { expect(t[i][0]).toBeCloseTo(x, 9); expect(t[i][1]).toBeCloseTo(y, 9); });
  const ticked = draw((g) => tick(g, 0, 0, 36, 1, 1));
  expect(ticked).toContain('moveTo(4.0000,16.0000)');
  expect(ticked).toContain('lineTo(42.0000,-10.0000)');
  const hp = heartPts(100, 100, 2, 80), hd = draw((g) => heart(g, 100, 100, 2, 1));
  expect(hd).toContain(`lineTo(${hp[40][0].toFixed(4)},${hp[40][1].toFixed(4)})`);
  const lp = handLoopPts(50, 50, 40, 40 * 0.96, 1, 7);
  expect(draw((g) => handCircle(g, 50, 50, 40, 1, 7))).toContain(`lineTo(${lp[30][0].toFixed(4)},${lp[30][1].toFixed(4)})`);
  expect(draw((g) => handCircle(g, 50, 50, 40, 1, 7, -1.9, { boil: 8, t: 0 }))).toBe(draw((g) => handCircle(g, 50, 50, 40, 1, 7)));
});

test('paths: cut to a fraction of their length; rectangle sides overrun their corners; shapes close', () => {
  expect(pathLen(cutPath(line, 0.4))).toBeCloseTo(pathLen(line) * 0.4, 6);
  expect(cutPath(line, 0)).toEqual([]);
  expect(rectSides(0, 0, 100, 50, 10)[0]).toEqual([[-10, 0], [110, 0]]);
  const st = starPts(0, 0, 10);
  expect(st[0][0]).toBeCloseTo(st[10][0], 9);
  const wv = wavePts(0, 0, 100, 0, 5, 2);
  expect(wv[0]).toEqual([0, 0]);
  expect(wv[wv.length - 1][0]).toBeCloseTo(100, 9);
});

test('pencil: graphite in short pieces, each a little lighter or darker and thinner or wider, none far off the line; prog stops it', () => {
  const log = draw((g) => pencilStroke(g, line, { w: 5, color: '#33302c', seed: 4 })).split('\n');
  const alphas = new Set(log.filter((l) => l.startsWith('globalAlpha=')));
  const widths = new Set(log.filter((l) => l.startsWith('lineWidth=')));
  expect(alphas.size).toBeGreaterThan(40);
  expect(widths.size).toBeGreaterThan(20);
  expect(log.filter((l) => l.startsWith('stroke(')).length).toBeGreaterThan(100);   // three passes of ~3 px pieces
  const xs = log.filter((l) => /^(moveTo|lineTo)\(/.test(l)).map((l) => l.slice(l.indexOf('(') + 1, -1).split(',').map(Number));
  expect(Math.max(...xs.map(([x]) => x))).toBeLessThan(310);
  expect(Math.min(...xs.map(([, y]) => y))).toBeGreaterThan(0);
  const half = draw((g) => pencilStroke(g, line, { w: 5, color: '#33302c', seed: 4, prog: 0.5 })).split('\n').filter((l) => l.startsWith('stroke(')).length;
  expect(half).toBeLessThan(log.filter((l) => l.startsWith('stroke(')).length * 0.6);
});

test('inkStroke: a tip only while the line is being drawn, in every pen', () => {
  for (const style of ['smooth', 'ballpoint', 'marker', 'crayon', 'pencil'] as PenStyle[]) {
    expect(draw((g) => inkStroke(g, line, style, { w: 6, color: '#000', prog: 0.5, tip: true }))).toContain('arc(');
    expect(draw((g) => inkStroke(g, line, style, { w: 6, color: '#000', prog: 1, tip: true }))).not.toContain('arc(');
  }
});

test('pen doodles: every kind gives lines inside its box, the same for the same moment', () => {
  for (const kind of PEN_KINDS) {
    const m = doodleMarks(kind, 400, 300, 1.2, 1);
    expect(m.length).toBeGreaterThan(0);
    for (const mk of m) for (const [x, y] of mk.pts) { expect(Math.abs(x)).toBeLessThan(300); expect(Math.abs(y)).toBeLessThan(260); }
    expect(doodleMarks(kind, 400, 300, 1.2, 1)).toEqual(m);
  }
  // animated ones move with the time
  for (const kind of ['steam', 'clock', 'snow'] as const) expect(doodleMarks(kind, 400, 300, 1.2, 1)).not.toEqual(doodleMarks(kind, 400, 300, 1.9, 1));
});

test('handwrite red pen: the words found in the line, in order, never overlapping', () => {
  expect(redMarks('從中壢車站走路三分鐘', '三分鐘')).toEqual([[7, 10]]);
  expect(redMarks('好吃好吃又好吃', '好吃, 又')).toEqual([[0, 2], [2, 4], [4, 5], [5, 7]]);
  expect(redMarks('沒有', '')).toEqual([]);
  expect(tapeCorners('tl, br,xx')).toEqual(['tl', 'br']);
});

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)?.default;
test('the new modes leave every default as it was, and draw on inside the 3 s gallery preview', () => {
  expect(def(pen, 'style')).toBe('smooth');
  expect(def(pen, 'kind')).toBe('circle');
  expect(def(panel, 'look')).toBe('panel');
  expect(def(paper, 'look')).toBe('desk');
  expect(def(caption, 'style')).toBe('outline');
  expect(def(handwrite, 'red')).toBe('');
  expect(def(pen, 'drawDur') as number).toBeLessThan(1);
  expect(def(panel, 'drawIn') as number).toBeLessThan(1);
});
