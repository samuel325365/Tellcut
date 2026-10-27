// @vitest-environment jsdom
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeKit } from './kit.ts';

const kit = () => makeKit(THREE, { RoundedBoxGeometry, Reflector } as any, { makeRenderer: () => null });
afterEach(() => vi.restoreAllMocks());

test('videoSlab: a rounded slab with the picture a hair in front of its face; slabs of one size share the geometry', () => {
  const k = kit(), tex = new THREE.Texture();
  const a = k.videoSlab({ w: 1.6, h: 0.9, map: tex }), b = k.videoSlab({ w: 1.6, h: 0.9, geometry: a.geometry });
  expect(a.group.children).toEqual([a.slab, a.face]);
  expect(a.face.position.z).toBeCloseTo(0.045 / 2 + 0.001, 10);
  expect([a.face.geometry.parameters.width, a.face.geometry.parameters.height]).toEqual([1.6, 0.9]);
  expect(b.slab.geometry).toBe(a.slab.geometry);
  // no picture: a dark empty face; a picture keeps its own colours (no tone mapping, as footage)
  expect(b.face.material.color.getHex()).toBe(0x2a2f38);
  expect([a.face.material.color.getHex(), a.face.material.toneMapped]).toEqual([0xffffff, false]);
  // only the slab that made the geometry frees it
  const freed = vi.spyOn(a.geometry, 'dispose');
  b.dispose(); expect(freed).not.toHaveBeenCalled();
  a.dispose(); expect(freed).toHaveBeenCalledTimes(1);
});

test('videoSlab: cover crops the picture as the stage crops a clip; setOpacity fades and hides', () => {
  const k = kit(), s = k.videoSlab({ w: 1.6, h: 0.9, map: new THREE.Texture(), transparent: true });
  s.cover(1080, 1920);
  const uv = k.coverUv(1080, 1920, 1.6, 0.9, { x: 0.5, y: 0.5, zoom: 1 }), map = s.face.material.map!;
  expect([map.repeat.x, map.repeat.y, map.offset.x, map.offset.y]).toEqual([...uv.repeat, ...uv.offset]);
  s.setOpacity(0.4);
  expect([s.face.material.opacity, s.slab.material.opacity, s.group.visible]).toEqual([0.4, 0.4, true]);
  s.setOpacity(0);
  expect(s.group.visible).toBe(false);
});

test('glassBar: a pill body with a canvas face the size of the bar; paint draws the glass, then the content, and uploads', () => {
  const calls: string[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    clearRect: () => calls.push('clear'), save() {}, restore() {}, beginPath() {}, roundRect() {}, fill: () => calls.push('glass'), stroke() {},
    createLinearGradient: () => ({ addColorStop() {} }), fillText: (s: string) => calls.push(s), set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set lineWidth(_v: unknown) {},
  }) as any);
  const bar = kit().glassBar({ w: 4, h: 0.5 });
  expect([bar.canvas.width, bar.canvas.height]).toEqual([2048, 256]);
  // the face's uv is the shape's own x, y: scaled and moved onto the canvas
  expect([bar.texture.repeat.x, bar.texture.repeat.y, bar.texture.offset.x, bar.texture.offset.y]).toEqual([0.25, 2, 0.5, 0.5]);
  const v = bar.texture.version;
  calls.length = 0;
  bar.paint((g) => g.fillText('make a film', 0, 0));
  expect(calls).toEqual(['clear', 'glass', 'make a film']);
  expect(bar.texture.version).toBeGreaterThan(v);
  bar.setOpacity(0);
  expect(bar.group.visible).toBe(false);
  // a long bar keeps its canvas within 4096 px
  expect(kit().glassBar({ w: 20, h: 1 }).canvas.width).toBeLessThanOrEqual(4096);
});

test('dust: the same motes for the same seed, a drift that depends on the time alone', () => {
  const k = kit(), a = k.dust(), b = k.dust(), c = k.dust({ seed: 8, count: 10 });
  const pos = (d: typeof a) => Array.from(d.points.geometry.getAttribute('position').array as Float32Array);
  expect(pos(a)).toEqual(pos(b));
  expect(pos(c).length).toBe(30);
  a.pose(3); b.pose(1); b.pose(3);
  expect([a.points.rotation.y, a.points.position.y]).toEqual([b.points.rotation.y, b.points.position.y]);
  expect(a.points.material.opacity).toBe(0.35);
});

test('floor: a mirror and a veil of the background just above it, in one group', () => {
  const f = kit().floor({ y: -1.5, bg: '#0d0f14', frame: [1920, 1080] });
  expect(f.group.children).toEqual([f.mirror, f.veil]);
  expect(f.mirror.position.y).toBe(-1.5);
  expect(f.veil.position.y).toBeGreaterThan(f.mirror.position.y);
  expect([f.veil.material.color.getHexString(), f.veil.material.opacity]).toEqual(['0d0f14', 0.55]);
  expect(f.mirror.getRenderTarget().width).toBe(960);
});
