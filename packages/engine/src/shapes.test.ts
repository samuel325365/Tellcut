import { flattenPath, fitText, isShaped, NamedShapeZ, SHAPE_PARAMS, SHAPE_TYPES, shapeArea, shapePath, shapeSafe, type NamedShape } from './shapes.ts';
import { VideoItemZ } from './schema.ts';
import { drawnTransition, shapeClip, videoState } from './geometry.ts';

/** every type with its defaults, and a few with their parameters at the ends of their ranges */
const SHAPES: NamedShape[] = [
  ...SHAPE_TYPES.filter((t) => t !== 'text').map((type) => ({ type }) as NamedShape),
  { type: 'star', points: 3, inner: 0.1, round: 1 }, { type: 'star', points: 24, inner: 0.95 }, { type: 'ngon', sides: 3, turn: -180, round: 1 }, { type: 'ngon', sides: 12 },
  { type: 'stamp', teeth: 4 }, { type: 'stamp', teeth: 60 }, ...(['top', 'left', 'right', 'top-right', 'bottom-right'] as const).map((tail) => ({ type: 'bubble', tail }) as NamedShape),
  { type: 'blob', seed: 99999, lobes: 9, wobble: 1 }, { type: 'blob', lobes: 3 }, { type: 'torn', rough: 1, sides: 'l' }, { type: 'torn', rough: 0, sides: 'rb' },
  { type: 'brush', rough: 0 }, { type: 'brush', seed: 7, rough: 1 }, { type: 'slats', count: 2, gap: 0.25, angle: 90 }, { type: 'slats', count: 12, gap: 0, angle: -45 }, { type: 'slats', angle: 30 },
];
const SIZES: Array<[number, number]> = [[1920, 1080], [1080, 1920], [500, 500], [300, 40]];
const nums = (d: string) => d.replace(/[MLCQZ]/g, ' ').trim().split(/\s+/).map(Number);

test('every shape\'s path is closed, made only of absolute M L C Q Z, and inside the frame (control points too)', () => {
  for (const s of SHAPES) for (const [w, h] of SIZES) for (const inset of [0, 12]) {
    const d = shapePath(s, w, h, 1.3, inset), what = `${JSON.stringify(s)} ${w}×${h} inset ${inset}`;
    expect(d, what).toMatch(/^M[\d. MLCQZ]+$/);
    // every subpath ends with Z
    for (const sub of d.split('M').slice(1)) expect(sub.endsWith('Z'), what).toBe(true);
    const v = nums(d);
    expect(v.length % 2, what).toBe(0);
    for (let i = 0; i < v.length; i += 2) {
      expect(v[i], what).toBeGreaterThanOrEqual(inset - 0.01); expect(v[i], what).toBeLessThanOrEqual(w - inset + 0.01);
      expect(v[i + 1], what).toBeGreaterThanOrEqual(inset - 0.01); expect(v[i + 1], what).toBeLessThanOrEqual(h - inset + 0.01);
    }
    // and it covers something
    expect(shapeArea(s, w, h, 1.3)!, what).toBeGreaterThan(0.015);
  }
});

test('a polygon is its corners in the frame\'s px, inside an inset too', () => {
  expect(shapePath([[0, 0], [1, 0], [0.5, 1]], 200, 100)).toBe('M0 0L200 0L100 100Z');
  expect(shapePath([[0, 0], [1, 0], [0.5, 1]], 200, 100, 0, 10)).toBe('M10 10L190 10L100 90Z');
  expect(shapePath({ type: 'text', text: 'HI' }, 200, 100)).toBe('');
});

test('seeded shapes: the same seed draws the same shape, another seed another one', () => {
  for (const type of ['blob', 'torn', 'brush'] as const) {
    const a = shapePath({ type, seed: 3 }, 800, 450), b = shapePath({ type, seed: 3 }, 800, 450), c = shapePath({ type, seed: 4 }, 800, 450);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  }
  // the default seed is 1: leaving it out is seed 1
  expect(shapePath({ type: 'torn' }, 800, 450)).toBe(shapePath({ type: 'torn', seed: 1 }, 800, 450));
});

test('a blob is a pure function of time: the same second twice is one shape; still unless it wobbles', () => {
  const still = { type: 'blob', seed: 5 } as const, moving = { type: 'blob', seed: 5, wobble: 0.6 } as const;
  expect(shapePath(moving, 640, 360, 2.25)).toBe(shapePath(moving, 640, 360, 2.25));
  expect(shapePath(moving, 640, 360, 2.25)).not.toBe(shapePath(moving, 640, 360, 3.5));
  expect(shapePath(still, 640, 360, 2.25)).toBe(shapePath(still, 640, 360, 0));
  // a moving blob changes slowly: a frame later it has hardly moved
  const near = flattenPath(shapePath(moving, 640, 360, 2.25))[0], next = flattenPath(shapePath(moving, 640, 360, 2.25 + 1 / 30))[0];
  expect(Math.max(...near.map((p, i) => Math.hypot(p[0] - next[i][0], p[1] - next[i][1])))).toBeLessThan(6);
});

test('shapes keep their own proportion where they have one: a circle in a wide frame is round, an ellipse fills it', () => {
  expect(shapeArea({ type: 'circle' }, 1920, 1080)).toBeCloseTo((Math.PI / 4) * (1080 / 1920), 2);
  expect(shapeArea({ type: 'circle' }, 1000, 1000)).toBeCloseTo(Math.PI / 4, 2);
  expect(shapeArea({ type: 'ellipse' }, 1920, 1080)).toBeCloseTo(Math.PI / 4, 2);
  // a hexagon with a corner up in a square: as wide as its flat sides allow, as tall as the square
  expect(shapeArea({ type: 'ngon', sides: 6 }, 1000, 1000)).toBeCloseTo(((3 * Math.sqrt(3)) / 2) * 0.25, 2);
  // a diamond fills half its square
  expect(shapeArea({ type: 'ngon', sides: 4 }, 1000, 1000)).toBeCloseTo(0.5, 3);
  expect(shapeArea({ type: 'ngon', sides: 4, turn: 45 }, 1000, 1000)).toBeCloseTo(1, 3);
  // slats: the frame less the gaps
  expect(shapeArea({ type: 'slats', count: 4, gap: 0.05 }, 1000, 1000)).toBeCloseTo(1 - 3 * 0.05, 3);
  // the arch is never wider than tall, so in a wide frame it is a window in the middle
  const arch = flattenPath(shapePath({ type: 'arch' }, 1920, 1080))[0], xs = arch.map((p) => p[0]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.85 * 1080, 0);
});

test('shapeSafe: the rectangle a shape certainly shows', () => {
  // a circle's inscribed square, in the middle of a wide frame
  const c = shapeSafe({ type: 'circle' }, 16 / 9)!;
  expect(c[2] * (16 / 9)).toBeCloseTo(Math.SQRT1_2, 2);
  expect(c[3]).toBeCloseTo(Math.SQRT1_2, 2);
  expect(c[0] + c[2] / 2).toBeCloseTo(0.5, 3);
  expect(shapeSafe({ type: 'ellipse' })![2]).toBeCloseTo(Math.SQRT1_2, 2);
  expect(shapeSafe({ type: 'text', text: 'ROMA' })).toBe(null);
  expect(shapeSafe([[0, 0], [1, 0], [1, 1], [0, 1]])).toEqual([0, 0, 1, 1]);
  for (const s of SHAPES) {
    const r = shapeSafe(s, 16 / 9)!;
    expect(r[2] * r[3], JSON.stringify(s)).toBeGreaterThan(0.005);
    expect(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 1.0001 && r[1] + r[3] <= 1.0001, JSON.stringify(s)).toBe(true);
  }
});

test('the schema: old polygons still read, named shapes are strict per type', () => {
  const clip = (shape: unknown) => VideoItemZ.safeParse({ id: 'a', start: 0, end: 1, source: 's', in: 0, speed: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, shape });
  expect(clip([[0, 0], [1, 0], [1, 0.9], [0, 1]]).success).toBe(true);
  expect(clip([[0, 0], [1, 1]]).success).toBe(false);
  for (const s of SHAPES) expect(clip(s).success, JSON.stringify(s)).toBe(true);
  expect(clip({ type: 'text', text: 'ROMA\nCITY', font: 'body', weight: 700, line: 0.9 }).success).toBe(true);
  for (const bad of [
    { type: 'circle', r: 1 },                       // a key the type does not have
    { type: 'star', points: 5, sides: 6 },          // another type's key
    { type: 'square' },                             // no such type
    { type: 'star', points: 2 }, { type: 'star', points: 4.5 }, { type: 'slats', gap: 0.5 },   // out of range, not whole
    { type: 'bubble', tail: 'up' }, { type: 'torn', sides: 'tt' }, { type: 'torn', sides: 'x' },
    { type: 'text' }, { type: 'text', text: '' }, { type: 'text', text: 'A\nB\nC' }, { type: 'text', text: 'A', font: 'serif' },
  ]) expect(clip(bad).success, JSON.stringify(bad)).toBe(false);
});

test('the parameter data: every default is in range and accepted by the schema', () => {
  for (const t of SHAPE_TYPES) {
    const full: Record<string, unknown> = { type: t };
    for (const p of SHAPE_PARAMS[t]) {
      if (p.required) { expect(p.default).toBeUndefined(); full[p.key] = 'AB'; continue; }
      if (p.kind === 'int' || p.kind === 'number') expect(p.default as number).toBeGreaterThanOrEqual(p.min!), expect(p.default as number).toBeLessThanOrEqual(p.max!);
      if (p.kind === 'enum') expect(p.options).toContain(p.default);
      expect(p.doc.length).toBeGreaterThan(10);
      full[p.key] = p.default;
    }
    expect(NamedShapeZ.safeParse(full).success, t).toBe(true);
  }
});

test('isShaped counts a polygon of three corners or more and every named shape', () => {
  expect(isShaped({})).toBe(false);
  expect(isShaped({ shape: [[0, 0], [1, 0]] as any })).toBe(false);
  expect(isShaped({ shape: [[0, 0], [1, 0], [1, 1]] })).toBe(true);
  expect(isShaped({ shape: { type: 'circle' } })).toBe(true);
  expect(isShaped({ shape: { type: 'text', text: 'A' } })).toBe(true);
});

test('fitText: the lines as large as fit, centred on their ink', () => {
  // a fake font: every letter 60 wide, capitals 70 above the baseline, nothing below
  const measure = (s: string) => ({ left: 0, right: 60 * s.length, ascent: 70, descent: 0 });
  const one = fitText({ type: 'text', text: 'ROMA' }, 1000, 500, measure);
  expect(one.size).toBeCloseTo(100 * (1000 / 240), 1);          // the width decides: 240 at size 100
  expect(one.rows).toEqual([{ text: 'ROMA', x: 0, y: 250 + (70 * 1000 / 240) / 2 }].map((r) => ({ ...r, y: Math.round(r.y * 100) / 100 })));
  const two = fitText({ type: 'text', text: 'AB\nCDEF', line: 1 }, 1000, 500, measure, 10);
  // ink from −70 to 100 (the second baseline): 170 high at size 100, 240 wide; the height decides in 480
  const k = 480 / 170;
  expect(two.size).toBeCloseTo(100 * k, 1);
  expect(two.rows[0].x).toBeCloseTo(500 - (k * 120) / 2, 1);
  expect(two.rows[1].x).toBeCloseTo(500 - (k * 240) / 2, 1);
  expect(two.rows[1].y - two.rows[0].y).toBeCloseTo(k * 100, 1);
  expect(two.rows[0].y - k * 70).toBeCloseTo(10, 1);
});

const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clipOf = (o: Record<string, unknown>) => VideoItemZ.parse({ id: 'c', start: 0, end: 4, source: 's', in: 0, speed: 1, crop, ...o });

test('videoState: a named shape is the frame\'s path() clip, the frame\'s own radius dropped; a reveal on it is a dissolve', () => {
  const it = clipOf({ shape: { type: 'circle' }, radius: 30, frame: [0.25, 0, 0.5, 1], transitionIn: { type: 'iris', dur: 1 } });
  const s = videoState(it, 0, 4, 0.5, 1920, 1080, {});
  expect(s.clipPath).toBe(`path('${shapePath({ type: 'circle' }, 960, 1080)}')`);
  expect(s.radius).toBe(0);
  expect(s.opacity).toBeCloseTo(0.5);                                     // iris drawn as a dissolve
  expect(drawnTransition('iris', it.frame as any, isShaped(it))).toBe('dissolve');
  // a polygon keeps its polygon() and the radius, as before
  const poly = videoState(clipOf({ shape: [[0, 0], [1, 0], [1, 1]], radius: 30 }), 0, 4, 2, 1920, 1080, {});
  expect([poly.clipPath, poly.radius]).toEqual(['polygon(0% 0%, 100% 0%, 100% 100%)', 30]);
  // a text shape is cut by the stage itself
  expect(videoState(clipOf({ shape: { type: 'text', text: 'A' } }), 0, 4, 2, 1920, 1080, {}).clipPath).toBe('');
  // the clip-path is the same string while the frame keeps its size (only a wobbling blob changes with time)
  expect(shapeClip({ shape: { type: 'blob' } }, 640, 360, 1)).toBe(shapeClip({ shape: { type: 'blob' } }, 640, 360, 2));
  expect(shapeClip({ shape: { type: 'blob', wobble: 1 } }, 640, 360, 1)).not.toBe(shapeClip({ shape: { type: 'blob', wobble: 1 } }, 640, 360, 2));
});

test('videoState: an outline insets the shape by half its width (a text shape by all of it), a shadow is scaled with the stage', () => {
  // 1080 × 1920: the short side is 1080, so sizes are as written
  const s = videoState(clipOf({ shape: { type: 'circle' }, outline: { width: 20 }, shadow: true }), 0, 4, 1, 1080, 1920, {});
  expect(s.outline).toEqual({ width: 20, color: '#ffffff', path: shapePath({ type: 'circle' }, 1080, 1920, 1, 10) });
  expect([s.inset, s.clipPath]).toEqual([10, `path('${shapePath({ type: 'circle' }, 1080, 1920, 1, 10)}')`]);
  expect(s.shadow).toEqual({ blur: 30, y: 12, opacity: 0.45 });
  // half the size on a 540 short side
  const small = videoState(clipOf({ outline: { width: 20, color: '#000' }, shadow: { blur: 10, opacity: 0.2 }, radius: 24 }), 0, 4, 1, 960, 540, {});
  expect([small.outline, small.shadow, small.radius, small.clipPath]).toEqual([{ width: 10, color: '#000', path: '' }, { blur: 5, y: 6, opacity: 0.2 }, 24, '']);
  // a polygon with an outline is a path() inset like the others; without one it stays polygon()
  const poly = videoState(clipOf({ shape: [[0, 0], [1, 0], [0, 1]], outline: { width: 20 } }), 0, 4, 1, 1080, 1080, {});
  expect(poly.clipPath).toBe("path('M10 10L1070 10L10 1070Z')");
  const text = videoState(clipOf({ shape: { type: 'text', text: 'A' }, outline: { width: 20 } }), 0, 4, 1, 1080, 1080, {});
  expect([text.inset, text.text, text.outline!.path]).toEqual([20, { type: 'text', text: 'A' }, '']);
  expect(videoState(clipOf({ shadow: false }), 0, 4, 1, 1080, 1080, {}).shadow).toBe(null);
  // both are strict
  for (const bad of [{ outline: { width: 0 } }, { outline: { size: 4 } }, { shadow: { x: 3 } }, { shadow: 'yes' }])
    expect(VideoItemZ.safeParse({ id: 'c', start: 0, end: 4, source: 's', in: 0, speed: 1, crop, ...bad }).success, JSON.stringify(bad)).toBe(false);
});
