// @vitest-environment jsdom
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { makeKit } from './three/kit.ts';
import { edgeColour, logo } from './logo.ts';

const TELLCUT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2f8cff"/><path d="M12 9 L24 16 L12 23 Z" fill="#f6f7f9"/></svg>';
const TEXT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text x="0" y="30" fill="#123456">ACME</text></svg>';
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
// a font whose every Latin letter is a box half an em wide and 0.7 em high
const FONT = { has: (c: string) => /^[A-Za-z0-9]$/.test(c), advance: (_c: string, em: number) => em * 0.55,
  shapes: (_c: string, em: number) => [new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(em * 0.5, 0), new THREE.Vector2(em * 0.5, em * 0.7), new THREE.Vector2(0, em * 0.7)])] };

let drawn: Array<{ src: unknown; args: number[] }>, texts: string[], alpha = 0;
beforeEach(() => {
  drawn = []; texts = []; alpha = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, clearRect() {}, fillRect() {}, save() {}, restore() {}, set filter(_v: unknown) {}, set globalAlpha(_v: unknown) {}, set font(_v: unknown) {},
      set fillStyle(_v: unknown) {}, set textAlign(_v: unknown) {}, set textBaseline(_v: unknown) {}, set letterSpacing(_v: unknown) {},
      createLinearGradient: () => ({ addColorStop() {} }), measureText: (s: string) => ({ width: s.length * 10 }),
      fillText: (s: string) => texts.push(s), drawImage: (src: unknown, ...args: number[]) => drawn.push({ src, args }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? (i % 8 === 3 ? alpha : 255) : 128)) }),
    } as any;
  });
  (document as any).fonts = { load: vi.fn(async () => []) };
  (HTMLImageElement.prototype as any).decode = async () => {};   // jsdom has none
});
afterEach(() => vi.restoreAllMocks());

function fakeKit(o: { noGl?: boolean } = {}) {
  const kit = makeKit(THREE, { RoundedBoxGeometry, RoomEnvironment, SVGLoader, opentype: {} as any, clipper: {} as any } as any, { makeRenderer: () => null });
  const renders: THREE.Scene[] = [];
  return { renders, kit: { ...kit, environment: () => null, loadFont: async () => FONT,
    render: (scene: THREE.Scene) => { if (o.noGl) return null; renders.push(scene); return document.createElement('canvas'); } } };
}
const media = (files: Record<string, string>): any => ({ begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'),
  video: () => document.createElement('video'), stillUrl: () => 'x.jpg', fileUrl: (p: string) => files[p] ?? `http://h/${p}` });
async function stage(params: Record<string, unknown>, o: { files?: Record<string, string>; noGl?: boolean; W?: number; H?: number; end?: number } = {}) {
  const k = fakeKit({ noGl: o.noGl });
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'common', items: [logo as ItemType] }]), media(o.files ?? {}), { three: k.kit, onError: (_id, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: o.W ?? 1920, height: o.H ?? 1080, fps: 30, duration: Math.max(10, o.end ?? 0), background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'l', type: 'common.logo', start: 0, end: o.end ?? 5, params }] }] } as any);
  await st.ready();
  return { st, k, at: (t: number) => { st.draw(t); st.late(t); return k.renders.at(-1)!; } };
}
const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };
const mark = (s: THREE.Scene) => s.getObjectByName('logo-mark')!;
const letters = (s: THREE.Scene) => s.children.filter((c) => c.name.startsWith('logo-letter-'));
const SVG = { 'media/brand/logo.svg': dataUrl(TELLCUT_SVG) };

test('an extrudable SVG becomes extruded meshes in its own colours, centred and 1.3 high', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg' }, { files: SVG });
  const s = at(3), m = mark(s), ms = meshes(m);
  expect(ms.every((x) => x.geometry.type === 'ExtrudeGeometry')).toBe(true);
  expect(ms.map((x) => `#${((x.material as THREE.MeshPhysicalMaterial).color.getHexString())}`).sort()).toEqual(['#2f8cff', '#f6f7f9']);
  const b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3());
  expect(size.y).toBeCloseTo(1.3, 1);
  expect(Math.abs((b.min.x + b.max.x) / 2 - m.position.x)).toBeLessThan(0.05);
});

test('an SVG that cannot be extruded is drawn as a plate', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg' }, { files: { 'media/brand/logo.svg': dataUrl(TEXT_SVG) } });
  const ms = meshes(mark(at(3)));
  expect(ms.some((x) => x.geometry.type === 'ExtrudeGeometry')).toBe(false);
  expect(ms.length).toBeGreaterThan(1);
});

test('a transparent PNG becomes 12 layered planes with alphaTest; an opaque one a rounded box with the picture on its face', async () => {
  alpha = 0;   // half the pixels see-through
  const t = meshes(mark((await stage({ logo: 'media/brand/logo.png' })).at(3)));
  expect(t.length).toBe(12);
  expect(t.every((x) => x.geometry.type === 'PlaneGeometry' && (x.material as THREE.Material).alphaTest === 0.5)).toBe(true);
  alpha = 255;
  const o = meshes(mark((await stage({ logo: 'media/brand/logo.jpg' })).at(3)));
  expect(o.length).toBe(1);
  expect(o[0].geometry.type).toBe('RoundedBoxGeometry');
  expect(((o[0].material as THREE.Material[])[4] as THREE.MeshStandardMaterial).map).not.toBeNull();
});

test('no logo: only the name, centred', async () => {
  const s = (await stage({ name: 'ACME' })).at(4);
  expect(s.getObjectByName('logo-mark')!.visible).toBe(false);
  const b = new THREE.Box3();
  for (const l of letters(s)) b.expandByObject(l);
  expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.05);
});

test('a mixed name extrudes the Latin letters and plates the rest', async () => {
  const s = (await stage({ name: 'Tellcut 剪輯' })).at(4), ls = letters(s);
  expect(ls.map((l) => (meshes(l)[0].geometry.type === 'ExtrudeGeometry' ? 'x' : 'p')).join('')).toBe('xxxxxxxpp');
  const xs = ls.map((l) => l.position.x);
  expect(xs.every((x, i) => !i || x > xs[i - 1])).toBe(true);
  expect(xs[7] - xs[6]).toBeGreaterThan(xs[6] - xs[5]);   // the space keeps a gap
});

test('the mark lands at hit, slides left for the name, and the letters rise one by one', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut', hit: 0.75 }, { files: SVG });
  const m0 = mark(at(0.75));
  expect(m0.scale.x).toBeCloseTo(1, 2);
  expect(m0.position.x).toBeCloseTo(0, 2);
  expect(mark(at(1.95)).position.x).toBeLessThan(-0.3);
  const s = at(0.75 + 1.0 + 3 * 0.055 + 0.8), l = letters(s)[3];
  expect((meshes(l)[0].material as THREE.Material).opacity).toBeCloseTo(1, 3);
  expect(letters(at(1.7)).every((x) => !x.visible)).toBe(true);
});

test('the same time draws the same pose (no clock, no randomness)', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut' }, { files: SVG });
  const pose = (s: THREE.Scene) => JSON.stringify([mark(s).matrixWorld.elements, letters(s).map((l) => l.position.toArray())]);
  const a = pose(at(2.2)); at(0.3); expect(pose(at(2.2))).toBe(a);
});

test('a name too wide for a tall frame still fits: the camera backs off', async () => {
  const { at, k } = await stage({ name: 'Tellcut Studio' }, { W: 1080, H: 1920 });
  at(4);
  const cam = (k.kit as any).lastCamera as THREE.PerspectiveCamera | undefined;
  const s = k.renders.at(-1)!, b = new THREE.Box3();
  for (const l of letters(s)) b.expandByObject(l);
  const c = s.getObjectByName('logo-camera') as THREE.PerspectiveCamera ?? cam!;
  const halfW = Math.tan((c.fov * Math.PI) / 360) * c.aspect * c.position.z;
  expect(Math.max(-b.min.x, b.max.x)).toBeLessThan(halfW);
});

test('without WebGL2 it draws the logo picture and the name flat', async () => {
  const { st } = await stage({ logo: 'media/brand/logo.png', name: 'ACME', tagline: 'Hello' }, { noGl: true });
  st.draw(4); st.late(4);
  expect(drawn.some((d) => d.src instanceof HTMLImageElement)).toBe(true);
  expect(texts).toEqual(expect.arrayContaining(['ACME', 'Hello']));
});

test('tagline and url come in after the name, as written', async () => {
  const { st } = await stage({ name: 'ACME', tagline: 'Bread every morning', url: 'acme.example/shop', hit: 0.75 });
  texts = []; st.draw(3.0);   // tagline from hit + 2.0 = 2.75, url from hit + 2.6 = 3.35
  expect(texts).toContain('Bread every morning');
  expect(texts).not.toContain('acme.example/shop');
  texts = []; st.draw(3.9);
  expect(texts).toContain('acme.example/shop');
});

test('a letter that is fully in is opaque (transparent letters sort their own faces wrongly)', async () => {
  const { at } = await stage({ name: 'ACME', hit: 0.75 });
  const mid = letters(at(0.35));
  expect(mid.some((l) => (meshes(l)[0].material as THREE.Material).transparent)).toBe(true);
  const done = letters(at(3));
  expect(done.every((l) => !(meshes(l)[0].material as THREE.Material).transparent)).toBe(true);
});


// review fixes (plan 3 final review)
const MANY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">' + Array.from({ length: 10 }, (_, i) => `<rect x="${i * 20}" y="0" width="16" height="20" fill="#${i % 2 ? '2f8cff' : '1a1a1a'}"/>`).join('') + '</svg>';
test('every path of a many-path SVG is extruded to the same depth (no staircase)', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg' }, { files: { 'media/brand/logo.svg': dataUrl(MANY) } });
  const depths = meshes(mark(at(3))).map((m) => { m.geometry.computeBoundingBox(); return Math.abs(m.geometry.boundingBox!.max.z - m.geometry.boundingBox!.min.z) * Math.abs(m.parent!.scale.z); });
  expect(depths.length).toBe(10);
  expect(Math.max(...depths) - Math.min(...depths)).toBeLessThan(0.02);
});

test('a stroked SVG (fill none on <svg>) or one mixing filled and stroke-only shapes becomes a plate', async () => {
  for (const svg of [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><path d="M4 4 L20 4 L20 20 Z"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="10" height="10" fill="#f00"/><circle cx="16" cy="16" r="6" fill="none" stroke="#000"/></svg>',
  ]) {
    const ms = meshes(mark((await stage({ logo: 'media/brand/logo.svg' }, { files: { 'media/brand/logo.svg': dataUrl(svg) } })).at(3)));
    expect(ms.some((m) => m.geometry.type === 'ExtrudeGeometry')).toBe(false);
  }
});

test('a logo file that cannot be read leaves the name, and nothing throws', async () => {
  const proto = HTMLImageElement.prototype as any, decode = proto.decode;
  proto.decode = async () => { throw new Error('broken'); };
  try {
    const { st } = await stage({ logo: 'media/brand/logo.png', name: 'ACME' }, { noGl: true });
    texts = [];
    expect(() => { st.draw(3); st.late(3); }).not.toThrow();
    expect(texts).toContain('ACME');
    expect(drawn.some((d) => d.src instanceof HTMLImageElement)).toBe(false);
  } finally { proto.decode = decode; }
});

test('dispose frees the 3D parts', async () => {
  const { st } = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut' }, { files: SVG });
  const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  st.load({ version: 1, meta: { width: 1920, height: 1080, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] } as any);
  expect(spy).toHaveBeenCalled();
});

test('drawn from the start (as an export does), the mark still comes in after the frames before its entrance', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut', hit: 1.5 }, { files: SVG });
  expect(mark(at(0.1)).visible).toBe(false);   // before hit - 0.75
  expect(mark(at(3)).visible).toBe(true);
});

test('the camera follows hit: a late hit makes the same slow push in, not a jump', async () => {
  const cam = (s: THREE.Scene) => s.getObjectByName('logo-camera')!.position.toArray();
  const early = await stage({ name: 'ACME', hit: 0.75 }), late = await stage({ name: 'ACME', hit: 7 }, { end: 12 });
  for (const dt of [-0.5, 0.2, 1, 2.5, 4]) {
    const a = cam(early.at(0.75 + dt)), b = cam(late.at(7 + dt));
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 6));
  }
  // frame to frame, the camera never moves more than a few hundredths
  let prev = cam(late.at(6)), worst = 0;
  for (let t = 6 + 1 / 30; t < 11.5; t += 1 / 30) { const c = cam(late.at(t)); worst = Math.max(worst, Math.abs(c[2] - prev[2])); prev = c; }
  expect(worst).toBeLessThan(0.06);
});

test('a Chinese tagline loads Noto Sans TC before the first frame (a canvas would draw it in a system font)', async () => {
  await stage({ name: 'ACME', tagline: '每天清晨四點揉麵', url: 'acme.example' });
  const loads = ((document as any).fonts.load as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
  expect(loads).toContain('300 40px "Noto Sans TC"');
  expect(loads).toContain('300 40px "Inter"');
  expect(loads).not.toContain('600 40px "Noto Sans TC"');   // the url is Latin
});

// review of brand plan 3 (spec §8.3): an opaque plate's sides are the picture's edge colour, the main colour only as a fallback
test("an opaque plate's sides take the picture's edge colour; the main colour when the picture cannot be read", async () => {
  alpha = 255;   // every pixel 128 grey, opaque
  const sides = async () => {
    const o = meshes(mark((await stage({ logo: 'media/brand/logo.jpg', color: '#2f8cff' })).at(3)))[0];
    return `#${((o.material as THREE.Material[])[0] as THREE.MeshPhysicalMaterial).color.getHexString()}`;
  };
  expect(await sides()).toBe('#808080');
  const get = HTMLCanvasElement.prototype.getContext as any, real = get.getMockImplementation();
  let reads = 0;
  get.mockImplementation(function (this: HTMLCanvasElement, ...a: unknown[]) {
    const g = real.apply(this, a);   // the first read tells see-through or not; the edge read is refused, as for a picture from another origin
    return { ...g, getImageData: (...b: number[]) => { if (reads++) throw new DOMException('tainted', 'SecurityError'); return g.getImageData(...b); } };
  });
  expect(await sides()).toBe('#2f8cff');
});

test('edgeColour averages the outer ring only', () => {
  const N = 32;
  (HTMLCanvasElement.prototype.getContext as any).mockImplementation(() => ({ drawImage() {}, getImageData: () => ({ data: Uint8ClampedArray.from({ length: N * N * 4 }, (_, i) => {
    const p = i >> 2, x = p % N, y = Math.floor(p / N), ring = x === 0 || y === 0 || x === N - 1 || y === N - 1;
    return i % 4 === 3 ? 255 : i % 4 === 0 ? (ring ? 200 : 0) : ring ? 16 : 255;
  }) }) }));
  expect(edgeColour(document.createElement('img'))).toBe('#c81010');
});

// promotion E2: entrance gather
const dots = (s: THREE.Scene) => s.getObjectByName('logo-gather') as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | undefined;
const dotsAt = (s: THREE.Scene) => { const d = dots(s)!, a = d.geometry.getAttribute('position').array as Float32Array; return Array.from(a.slice(0, d.geometry.drawRange.count * 3)); };

test('gather: dots spiral in from far out and settle on the mark at hit, where the solid mark comes in full size', async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut', hit: 1.6, entrance: 'gather' }, { files: SVG });
  // far out at the start, fading in
  let s = at(0.3);
  expect(dots(s)!.visible).toBe(true);
  expect(mark(s).visible).toBe(false);
  expect(Math.max(...dotsAt(s).map(Math.abs))).toBeGreaterThan(2);
  // at hit: every dot on the mark's face (1.3 high, as wide as the mark), the mark itself full size
  s = at(1.6);
  const p = dotsAt(s);
  for (let i = 0; i < p.length; i += 3) { expect(Math.abs(p[i])).toBeLessThanOrEqual(0.65 + 1e-6); expect(Math.abs(p[i + 1])).toBeLessThanOrEqual(0.65 + 1e-6); }
  expect(mark(s).visible).toBe(true);
  expect(mark(s).scale.x).toBeCloseTo(1, 6);
  expect(mark(at(1.6 - 0.2)).visible).toBe(false);
  // gone once the solid mark has taken over
  expect(dots(at(1.6 + 0.4))!.visible).toBe(false);
});

test('gather: after hit everything is as the default landing (slide, letters, camera)', async () => {
  const land = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut', hit: 1.2 }, { files: SVG });
  const gather = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut', hit: 1.2, entrance: 'gather' }, { files: SVG });
  const pose = (s: THREE.Scene) => JSON.stringify([mark(s).matrixWorld.elements.map((v) => +v.toFixed(6)), letters(s).map((l) => l.position.toArray()), s.getObjectByName('logo-camera')!.position.toArray()]);
  for (const t of [1.2, 1.6, 2.5, 4]) expect(pose(gather.at(t))).toBe(pose(land.at(t)));
  expect(dots(land.at(0.8))).toBeUndefined();
});

test("gather with the brand recipe's hit 0.75: the dots come in from the item's start and still land at hit", async () => {
  const { at } = await stage({ logo: 'media/brand/logo.svg', name: 'Tellcut', hit: 0.75, entrance: 'gather' }, { files: SVG });
  expect(dots(at(0))!.visible).toBe(false);   // opacity 0 on the first frame, then in
  expect(dots(at(0.1))!.visible).toBe(true);
  const p = dotsAt(at(0.75));
  expect(Math.max(...p.filter((_, i) => i % 3 !== 2).map(Math.abs))).toBeLessThanOrEqual(0.65 + 1e-6);
  expect(mark(at(0.75)).scale.x).toBeCloseTo(1, 6);
});

test('gather: the same time gives the same dots; a picture logo gives dots in its colours on its opaque pixels only; no logo, no dots', async () => {
  const a = await stage({ logo: 'media/brand/logo.svg', hit: 1.6, entrance: 'gather' }, { files: SVG });
  const one = JSON.stringify(dotsAt(a.at(1.1))); a.at(0.2);
  expect(JSON.stringify(dotsAt(a.at(1.1)))).toBe(one);
  alpha = 0;   // every other pixel see-through, the rest mid grey
  const s = (await stage({ logo: 'media/brand/logo.png', hit: 1, entrance: 'gather' })).at(1), d = dots(s)!;
  const col = d.geometry.getAttribute('color').array as Float32Array, grey = new THREE.Color().setRGB(128 / 255, 128 / 255, 128 / 255, THREE.SRGBColorSpace).r;
  expect(d.geometry.drawRange.count).toBeGreaterThan(500);
  expect(col[0]).toBeCloseTo(grey, 5);
  expect(dots((await stage({ name: 'ACME', entrance: 'gather' })).at(0.5))).toBeUndefined();
});
