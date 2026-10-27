// @vitest-environment jsdom
// 3D letters from a TTF (spec 2026-10-25-brand-preset §6.2-1): Google's Inter 700 keeps overlapping contours from the variable
// font, which three reads wrongly (M's notch filled); Clipper unions them by the nonzero rule first. The first tests use a small
// font made here (a fresh clone has no Inter-700.ttf: npm run fonts downloads it); the Inter ones run where it is.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import opentype from 'opentype.js';
import { glyphsFrom } from './glyphs.ts';

// jsdom's import.meta.url is not a file URL: from the repo root, where vitest runs
const TTF = join(process.cwd(), 'apps/player/public/fonts/files/Inter-700.ttf');
const load = () => { const b = readFileSync(TTF); return glyphsFrom(opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), THREE, ClipperLib); };

/** inside the letter: inside one of its shapes and none of that shape's holes */
const inside = (shapes: THREE.Shape[], x: number, y: number) => shapes.some((s) => inPoly(s.getPoints(), x, y) && !s.holes.some((h) => inPoly(h.getPoints(), x, y)));
function inPoly(pts: THREE.Vector2[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i].y > y) !== (pts[j].y > y) && x < ((pts[j].x - pts[i].x) * (y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
  return c;
}
const boxOf = (shapes: THREE.Shape[]) => { const b = new THREE.Box2(); for (const s of shapes) for (const p of s.getPoints()) b.expandByPoint(p); return b; };

/** what three fills: the triangles of each shape's cap */
function triangles(shapes: THREE.Shape[]) {
  return shapes.flatMap((s) => {
    const outer = s.getPoints(), holes = s.holes.map((h) => h.getPoints()), all = [...outer, ...holes.flat()];
    return THREE.ShapeUtils.triangulateShape(outer, holes).map(([i, j, k]) => [all[i], all[j], all[k]]);
  });
}
const triArea = (t: THREE.Vector2[]) => Math.abs(THREE.ShapeUtils.area(t));
const inTri = (t: THREE.Vector2[], x: number, y: number) => inPoly(t, x, y);

/** a polygon as a closed contour, in font units (y up) */
function poly(p: opentype.Path, pts: Array<[number, number]>) {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.close();
}
const square = (p: opentype.Path, a: number, b: number, cw: boolean) => poly(p, cw ? [[a, a], [a, b], [b, b], [b, a]] : [[a, a], [b, a], [b, b], [a, b]]);
/** A font of four glyphs, 1000 units to the em, written out and read back as a real font file would be:
 *  X — one contour that crosses itself (a bowtie: two triangles meeting in the middle, open above and below the crossing);
 *  H — two bars and a crossbar overlapping each other, all turning the same way (a variable font's leftovers);
 *  O — a square with a square hole; ® — a ring with a smaller square inside it that has its own hole (an outline in an outline) */
function tinyFont() {
  const glyph = (name: string, ch: string, draw: (p: opentype.Path) => void) => { const path = new opentype.Path(); draw(path); return new opentype.Glyph({ name, unicode: ch.codePointAt(0), advanceWidth: 1000, path }); };
  const font = new opentype.Font({ familyName: 'Tiny', styleName: 'Bold', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [
    new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() }),
    glyph('X', 'X', (p) => poly(p, [[0, 0], [1000, 700], [1000, 0], [0, 700]])),
    glyph('H', 'H', (p) => { poly(p, [[0, 0], [0, 700], [250, 700], [250, 0]]); poly(p, [[750, 0], [750, 700], [1000, 700], [1000, 0]]); poly(p, [[100, 300], [100, 420], [900, 420], [900, 300]]); }),
    glyph('O', 'O', (p) => { square(p, 0, 700, true); square(p, 200, 500, false); }),
    glyph('registered', '®', (p) => { square(p, 0, 1000, true); square(p, 100, 900, false); square(p, 250, 750, true); square(p, 400, 600, false); }),
  ] });
  return glyphsFrom(opentype.parse(font.toArrayBuffer()), THREE, ClipperLib);
}
/** what the shapes cover: outlines minus their holes */
const areaOf = (shapes: THREE.Shape[]) => shapes.reduce((a, s) => a + Math.abs(THREE.ShapeUtils.area(s.getPoints())) - s.holes.reduce((b, h) => b + Math.abs(THREE.ShapeUtils.area(h.getPoints())), 0), 0);

test('a contour that crosses itself fills only its two triangles, and three fills no more than that', () => {
  const x = tinyFont().shapes('X', 1), tris = triangles(x);
  expect(x.length).toBe(2);
  expect(inside(x, 0.5, 0.65)).toBe(false);   // above the crossing
  expect(inside(x, 0.5, 0.05)).toBe(false);   // below it
  expect(inside(x, 0.1, 0.35)).toBe(true);
  expect(inside(x, 0.9, 0.35)).toBe(true);
  expect(areaOf(x)).toBeCloseTo(0.35, 3);
  expect(tris.reduce((a, t) => a + triArea(t), 0)).toBeCloseTo(0.35, 3);
  expect(tris.some((t) => inTri(t, 0.5, 0.65))).toBe(false);
});

test('overlapping contours become one outline (their overlap counted once)', () => {
  const hh = tinyFont().shapes('H', 1);
  expect(hh.length).toBe(1);
  expect(hh[0].holes.length).toBe(0);
  expect(areaOf(hh)).toBeCloseTo(2 * 0.25 * 0.7 + 0.5 * 0.12, 3);
});

test('a hole stays a hole; in an outline inside an outline (®) each hole goes to the smallest outline around it', () => {
  const g = tinyFont(), o = g.shapes('O', 1);
  expect(inside(o, 0.35, 0.35)).toBe(false);
  expect(inside(o, 0.1, 0.35)).toBe(true);
  const r = g.shapes('®', 1);
  expect(r.map((s) => s.holes.length)).toEqual([1, 1]);
  expect(inside(r, 0.05, 0.5)).toBe(true);    // the ring
  expect(inside(r, 0.175, 0.5)).toBe(false);  // between the ring and the inner square
  expect(inside(r, 0.3, 0.5)).toBe(true);     // the inner square
  expect(inside(r, 0.5, 0.5)).toBe(false);    // its hole
  expect(areaOf(r)).toBeCloseTo(1 - 0.64 + 0.25 - 0.04, 3);
  expect(triangles(r).reduce((a, t) => a + triArea(t), 0)).toBeCloseTo(1 - 0.64 + 0.25 - 0.04, 3);
});

test('a made font: letters stand on the baseline and advance by their width; unknown characters have no glyph', () => {
  const g = tinyFont(), box = boxOf(g.shapes('O', 1.2));
  expect(box.min.y).toBeCloseTo(0, 3);
  expect(box.max.y).toBeCloseTo(0.84, 3);
  expect(g.advance('O', 1.2)).toBeCloseTo(1.2, 3);
  expect(g.has('O')).toBe(true);
  expect(g.has('剪')).toBe(false);
  expect(g.shapes('剪', 1)).toEqual([]);
});

test.skipIf(!existsSync(TTF))("A keeps its counter open over a solid crossbar, M's notch stays open", () => {
  const g = load(), a = g.shapes('A', 1.2), ab = boxOf(a), ax = (ab.min.x + ab.max.x) / 2, cap = ab.max.y;
  expect(inside(a, ax, cap * 0.55)).toBe(false);    // the counter
  expect(inside(a, ax, cap * 0.3)).toBe(true);      // the crossbar
  expect(inside(a, ax, cap * 0.95)).toBe(true);     // the apex
  const m = g.shapes('M', 1.2), mb = boxOf(m), mx = (mb.min.x + mb.max.x) / 2;
  expect(inside(m, mx, mb.max.y * 0.92)).toBe(false);   // the V between the legs
  expect(inside(m, mb.min.x + 0.03, mb.max.y * 0.5)).toBe(true);   // a leg
});

test.skipIf(!existsSync(TTF))('letters stand on the baseline (y up) and advance by their width; unknown characters have no glyph', () => {
  const g = load(), t = g.shapes('T', 1.2), box = new THREE.Box2();
  for (const s of t) for (const p of s.getPoints()) box.expandByPoint(p);
  expect(box.min.y).toBeGreaterThan(-0.01);
  expect(box.max.y).toBeGreaterThan(0.8);   // cap height about 0.73 em
  expect(g.advance('T', 1.2)).toBeGreaterThan(0.5);
  expect(g.has('T')).toBe(true);
  expect(g.has('剪')).toBe(false);
});


test.skipIf(!existsSync(TTF))("M's contour crosses itself under the notch: what three fills is the letter, not more", () => {
  const m = load().shapes('M', 1.2), tris = triangles(m), mb = boxOf(m), mx = (mb.min.x + mb.max.x) / 2;
  const filled = tris.reduce((a, t) => a + triArea(t), 0);
  const real = m.reduce((a, s) => a + Math.abs(THREE.ShapeUtils.area(s.getPoints())) - s.holes.reduce((b, h) => b + Math.abs(THREE.ShapeUtils.area(h.getPoints())), 0), 0);
  expect(filled / real).toBeCloseTo(1, 2);
  expect(tris.some((t) => inTri(t, mx, mb.max.y * 0.92))).toBe(false);
});
