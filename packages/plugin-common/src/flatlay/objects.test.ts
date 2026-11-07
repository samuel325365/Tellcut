import { parseSentences } from '../handwrite.ts';
import { faceSource, parseObjects, picAspect, sheetZ, writtenChars } from './objects.ts';

test('sheetZ: flat in the middle, curled at the corners', () => {
  expect(sheetZ(0, 0, 1.5, 1, 0.02)).toBe(0);
  for (const [x, y] of [[-0.75, -0.5], [0.75, -0.5], [-0.75, 0.5], [0.75, 0.5]]) expect(sheetZ(x, y, 1.5, 1, 0.02)).toBeCloseTo(0.02, 10);
  expect(sheetZ(0.75, 0, 1.5, 1, 0.02)).toBeLessThan(0.02);
  expect(sheetZ(0, 0.5, 1.5, 1, 0.02)).toBeLessThan(0.02);
});

test('simple params make one object', () => {
  const { objs, error } = parseObjects({ kind: 'polaroid', shot: 'a|12|0.5,0.5,1', caption: '那年夏天' }, 1080, 1920);
  expect(error).toBeNull();
  expect(objs).toHaveLength(1);
  expect(objs[0]).toMatchObject({ kind: 'polaroid', enter: 'drop', at: 0.2, caption: '那年夏天' });
  expect(objs[0].shot).toMatchObject({ source: 'a', from: 12 });
});

test('objects JSON lists every object in order', () => {
  const { objs } = parseObjects({ objects: '[{"kind":"postcard"},{"kind":"tv","at":1.5}]' }, 1080, 1920);
  expect(objs.map((o) => o.kind)).toEqual(['postcard', 'tv']);
  expect(objs[1].at).toBe(1.5);
});

test('parseObjects: an unknown kind is a postcard, a missing at is 0', () => {
  const { objs, error } = parseObjects({ objects: '[{"kind":"teapot"}]' }, 1080, 1920);
  expect(error).toBeNull();
  expect(objs[0]).toMatchObject({ kind: 'postcard', at: 0 });
});

test('parseObjects: broken JSON falls back to the simple object and says why', () => {
  const { objs, error } = parseObjects({ kind: 'card', objects: '[{' }, 1080, 1920);
  expect(objs).toHaveLength(1);
  expect(objs[0].kind).toBe('card');
  expect(error).toMatch(/JSON/);
});

test('16:9 lays the same objects out wider', () => {
  const p = { objects: '[{"kind":"postcard"},{"kind":"polaroid"},{"kind":"card"}]' };
  const span = (W: number, H: number) => {
    const o = parseObjects(p, W, H).objs, xs = o.map((x) => x.x), ys = o.map((x) => x.y);
    for (const x of o) {
      expect(Math.abs(x.x)).toBeLessThanOrEqual(1.6 * Math.max(1, W / H));
      expect(Math.abs(x.y)).toBeLessThanOrEqual(1.6 * Math.max(1, H / W));
    }
    return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
  };
  const tall = span(1080, 1920), wide = span(1920, 1080);
  expect(wide.x).toBeGreaterThan(tall.x);
  expect(wide.y).toBeLessThan(tall.y);
});

test('writtenChars writes one character at a time and goes back with t', () => {
  const lines = parseSentences('0.5-1.5|謝謝你');
  const mid = writtenChars(lines, 1.0)[0];
  expect(mid).toBeGreaterThanOrEqual(1);
  expect(mid).toBeLessThanOrEqual(2);
  expect(writtenChars(lines, 0.2)).toEqual([0]);
  expect(writtenChars(lines, 5)).toEqual([3]);
  expect(writtenChars(lines, 1.0)).toEqual(writtenChars(lines, 1.0));
});

test('placeholder face', () => {
  const project = { sources: { a: { width: 1920, height: 1080 } } } as any;
  const [none] = parseObjects({ kind: 'polaroid', shot: '' }, 1080, 1920).objs;
  const [typo] = parseObjects({ kind: 'polaroid', shot: 'b|0' }, 1080, 1920).objs;
  const [ok] = parseObjects({ kind: 'polaroid', shot: 'a|0' }, 1080, 1920).objs;
  const [still] = parseObjects({ kind: 'polaroid', shot: 'a|0|0.5,0.5,1|still' }, 1080, 1920).objs;
  expect(faceSource(none, project)).toBe('placeholder');
  expect(faceSource(typo, project)).toBe('placeholder');
  expect(faceSource(ok, project)).toBe('video');
  expect(faceSource(still, project)).toBe('still');
});

test('picAspect: a portrait postcard is taller than wide, a polaroid is square', () => {
  const [portrait] = parseObjects({ objects: '[{"kind":"postcard","portrait":true}]' }, 1080, 1920).objs;
  const [land] = parseObjects({ objects: '[{"kind":"postcard"}]' }, 1080, 1920).objs;
  const [pola] = parseObjects({ kind: 'polaroid' }, 1080, 1920).objs;
  expect(picAspect(portrait)).toBeLessThan(1);
  expect(picAspect(land)).toBeGreaterThan(1);
  expect(picAspect(pola)).toBeCloseTo(1, 6);
});
