// @vitest-environment jsdom
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { makeKit } from './kit.ts';
import { edgeColour } from './marks.ts';
import { dogSvg } from '../dachshund.ts';

const kit = () => makeKit(THREE, { RoundedBoxGeometry, SVGLoader } as any, { makeRenderer: () => null });
const TELLCUT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2f8cff"/><path d="M12 9 L24 16 L12 23 Z" fill="#f6f7f9"/></svg>';
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
// a font whose every Latin letter is a box half an em wide and 0.7 em high
const FONT = { has: (c: string) => /^[A-Za-z0-9]$/.test(c), advance: (_c: string, em: number) => em * 0.55,
  shapes: (_c: string, em: number) => [new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(em * 0.5, 0), new THREE.Vector2(em * 0.5, em * 0.7), new THREE.Vector2(0, em * 0.7)])] };
const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };

/** alpha of every other pixel of a read picture (the rest 255); grey 128 everywhere */
let alpha = 255;
beforeEach(() => {
  alpha = 255;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, clearRect() {}, drawImage() {}, fillText() {}, set fillStyle(_v: unknown) {}, set font(_v: unknown) {}, set textAlign(_v: unknown) {}, set textBaseline(_v: unknown) {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? (i % 8 === 3 ? alpha : 255) : 128)) }) } as any;
  });
  (HTMLImageElement.prototype as any).decode = async () => {};   // jsdom has none
});
afterEach(() => vi.restoreAllMocks());

const image = (w = 200, h = 100) => { const img = document.createElement('img'); Object.defineProperty(img, 'naturalWidth', { value: w }); Object.defineProperty(img, 'naturalHeight', { value: h }); return img; };

test('svgMark: an SVG of filled shapes becomes extruded meshes in its own colours, h tall and centred', () => {
  const m = kit().svgMark(TELLCUT_SVG)!, ms = meshes(m.group);
  expect(m.kind).toBe('extrude');
  expect(ms.every((x) => x.geometry.type === 'ExtrudeGeometry')).toBe(true);
  expect(ms.map((x) => `#${(x.material as THREE.MeshPhysicalMaterial).color.getHexString()}`).sort()).toEqual(['#2f8cff', '#f6f7f9']);
  const b = new THREE.Box3().setFromObject(m.group), size = b.getSize(new THREE.Vector3());
  expect(size.y).toBeCloseTo(1.3, 1);
  expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.05);
  expect(m.w).toBeCloseTo(1.3, 5);
  expect(kit().svgMark(TELLCUT_SVG, { h: 2 })!.h).toBe(2);
});

test('svgMark: every path of a many-path SVG gets the same depth (no staircase)', () => {
  const many = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">' + Array.from({ length: 10 }, (_, i) => `<rect x="${i * 20}" y="0" width="16" height="20" fill="#${i % 2 ? '2f8cff' : '1a1a1a'}"/>`).join('') + '</svg>';
  const depths = meshes(kit().svgMark(many)!.group).map((m) => { m.geometry.computeBoundingBox(); return Math.abs(m.geometry.boundingBox!.max.z - m.geometry.boundingBox!.min.z) * Math.abs(m.parent!.scale.z); });
  expect(depths.length).toBe(10);
  expect(Math.max(...depths) - Math.min(...depths)).toBeLessThan(0.02);
});

test('svgMark: null for text, a picture inside, stroke-only shapes or a mix of filled and stroke-only ones', () => {
  for (const svg of [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text x="0" y="30" fill="#123456">ACME</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,AAAA" width="10" height="10"/><rect width="10" height="10" fill="#f00"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><path d="M4 4 L20 4 L20 20 Z"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="10" height="10" fill="#f00"/><circle cx="16" cy="16" r="6" fill="none" stroke="#000"/></svg>',
  ]) expect(kit().svgMark(svg), svg).toBeNull();
});

test('pictureMark: a see-through picture becomes 12 cut-out layers; an opaque one a rounded slab with the picture on its face', () => {
  alpha = 0;   // half the pixels see-through
  const t = kit().pictureMark(image());
  expect([t.kind, t.w, t.h]).toEqual(['layers', 2.6, 1.3]);
  expect(meshes(t.group).length).toBe(12);
  expect(meshes(t.group).every((x) => x.geometry.type === 'PlaneGeometry' && (x.material as THREE.Material).alphaTest === 0.5)).toBe(true);
  alpha = 255;
  const o = kit().pictureMark(image()), ms = meshes(o.group);
  expect([o.kind, ms.length, ms[0].geometry.type]).toEqual(['slab', 1, 'RoundedBoxGeometry']);
  expect(((ms[0].material as THREE.Material[])[4] as THREE.MeshStandardMaterial).map).not.toBeNull();
  // cutout forces the layers
  expect(kit().pictureMark(image(), { cutout: true }).kind).toBe('layers');
});

test("pictureMark: an opaque slab's sides take the picture's edge colour; `side` when the picture cannot be read", () => {
  const sides = (m: { group: THREE.Group }) => `#${((meshes(m.group)[0].material as THREE.Material[])[0] as THREE.MeshPhysicalMaterial).color.getHexString()}`;
  expect(sides(kit().pictureMark(image(), { cutout: false }))).toBe('#808080');
  (HTMLCanvasElement.prototype.getContext as any).mockImplementation(() => ({ drawImage() {}, getImageData: () => { throw new DOMException('tainted', 'SecurityError'); } }));
  expect(sides(kit().pictureMark(image(), { cutout: false, side: '#c8752a' }))).toBe('#c8752a');
});

test('edgeColour averages the outer ring only', () => {
  const N = 32;
  (HTMLCanvasElement.prototype.getContext as any).mockImplementation(() => ({ drawImage() {}, getImageData: () => ({ data: Uint8ClampedArray.from({ length: N * N * 4 }, (_, i) => {
    const p = i >> 2, x = p % N, y = Math.floor(p / N), ring = x === 0 || y === 0 || x === N - 1 || y === N - 1;
    return i % 4 === 3 ? 255 : i % 4 === 0 ? (ring ? 200 : 0) : ring ? 16 : 255;
  }) }) }));
  expect(edgeColour(document.createElement('img'))).toBe('#c81010');
});

test('loadMark: an extrudable SVG is extruded, unless plate; a file that cannot be read is null', async () => {
  expect((await kit().loadMark(dataUrl(TELLCUT_SVG)))!.kind).toBe('extrude');
  alpha = 0;
  expect((await kit().loadMark(dataUrl(TELLCUT_SVG), { plate: true }))!.kind).toBe('layers');
  const proto = HTMLImageElement.prototype as any;
  proto.decode = async () => { throw new Error('broken'); };
  expect(await kit().loadMark('http://h/media/brand/logo.png')).toBeNull();
});

test('word3d: Latin letters extruded, other characters cut slabs, left to right with a space kept', () => {
  const w = kit().word3d('Tellcut 剪輯', { glyphs: FONT, colorAt: (k) => (k >= 4 ? '#2f8cff' : '#e9ecf1') });
  expect(w.letters.map((l) => (meshes(l.g)[0].geometry.type === 'ExtrudeGeometry' ? 'x' : 'p')).join('')).toBe('xxxxxxxpp');
  expect(meshes(w.letters[7].g).length).toBe(6);
  const xs = w.letters.map((l) => l.g.position.x);
  expect(xs.every((x, i) => !i || x > xs[i - 1])).toBe(true);
  expect(xs[7] - xs[6]).toBeGreaterThan(xs[6] - xs[5]);
  expect(w.w).toBeCloseTo(w.letters.at(-1)!.x + w.letters.at(-1)!.w, 6);
  expect((meshes(w.letters[0].g)[0].material as THREE.MeshPhysicalMaterial).color.getHexString()).toBe('e9ecf1');
  expect((meshes(w.letters[4].g)[0].material as THREE.MeshPhysicalMaterial).color.getHexString()).toBe('2f8cff');
  // no font: every character a slab
  expect(kit().word3d('AB').letters.every((l) => meshes(l.g).length === 6)).toBe(true);
});

test('word3d: a letter is see-through only while it fades; hidden at 0', () => {
  const w = kit().word3d('AB', { glyphs: FONT }), l = w.letters[0], mat = meshes(l.g)[0].material as THREE.Material;
  l.setOpacity(0.5);
  expect([mat.opacity, mat.transparent, l.g.visible]).toEqual([0.5, true, true]);
  l.setOpacity(1);
  expect(mat.transparent).toBe(false);
  l.setOpacity(0);
  expect(l.g.visible).toBe(false);
});

test('dispose frees the geometries', () => {
  const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  kit().svgMark(TELLCUT_SVG)!.dispose();
  kit().word3d('A', { glyphs: FONT }).dispose();
  expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
});

// a CJK font whose every Han character is a 0.9 em box, 1 em wide
const CJK = { has: (c: string) => /\p{Script=Han}/u.test(c), advance: (_c: string, em: number) => em,
  shapes: (_c: string, em: number) => [new THREE.Shape([new THREE.Vector2(0, -0.1 * em), new THREE.Vector2(em * 0.9, -0.1 * em), new THREE.Vector2(em * 0.9, em * 0.8), new THREE.Vector2(0, em * 0.8)])] };

test('word3d: with a CJK font, Chinese characters are extruded like Latin letters', () => {
  const w = kit().word3d('剪輯', { cjk: CJK, color: '#ff0000' });
  for (const l of w.letters) {
    expect(meshes(l.g)).toHaveLength(1);
    expect(meshes(l.g)[0].geometry.type).toBe('ExtrudeGeometry');
    expect((meshes(l.g)[0].material as THREE.MeshPhysicalMaterial).color.getHexString()).toBe('ff0000');
  }
  expect(w.letters[1].x).toBeCloseTo(w.letters[0].x + 1.2 + (-0.012), 5);   // em 1.2 default, advance = em, track default
});

test('a character the CJK font lacks falls back to a cut slab', () => {
  const w = kit().word3d('剪「あ」', { cjk: CJK });
  expect(w.letters.map((l) => meshes(l.g).length)).toEqual([1, 6, 6, 6]);
});

test('mixed Latin and CJK share one baseline, left to right', () => {
  const w = kit().word3d('AB 剪', { glyphs: FONT, cjk: CJK });
  const xs = w.letters.map((l) => l.x);
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  for (const l of w.letters) expect(l.g.position.y).toBe(0);
});

test('svgMark: the Tellcut dachshund extrudes with its ten sprocket holes as holes in the body', () => {
  const ms = meshes(kit().svgMark(dogSvg({ look: 'light', holes: 'cut' }))!.group);
  const holes = ms.flatMap((x) => ((x.geometry as THREE.ExtrudeGeometry).parameters.shapes as THREE.Shape[] | THREE.Shape))
    .flatMap((s) => (Array.isArray(s) ? s : [s])).map((s) => s.holes.length);
  expect(Math.max(...holes)).toBe(10);
});
