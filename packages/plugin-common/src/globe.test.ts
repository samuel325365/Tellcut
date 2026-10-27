// @vitest-environment jsdom
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { makeKit } from './three/kit.ts';
import { globe } from './globe.ts';
import { landDots } from './land-dots.ts';

let texts: string[], dots: number;
beforeEach(() => {
  texts = []; dots = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, clearRect() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
      arc: () => { dots++; }, createRadialGradient: () => ({ addColorStop() {} }), set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set font(_v: unknown) {},
      set textAlign(_v: unknown) {}, set globalAlpha(_v: unknown) {}, fillText: (s: string) => texts.push(s), drawImage() {}, measureText: (s: string) => ({ width: s.length * 8 }) } as any;
  });
  (document as any).fonts = { load: async () => [] };
});
afterEach(() => vi.restoreAllMocks());

function fakeKit(o: { noGl?: boolean } = {}) {
  const kit = makeKit(THREE, { RoundedBoxGeometry, RoomEnvironment, SVGLoader, opentype: {} as any, clipper: {} as any } as any, { makeRenderer: () => null });
  const renders: Array<{ scene: THREE.Scene; cam: THREE.PerspectiveCamera }> = [];
  return { renders, kit: { ...kit, environment: () => null,
    render: (scene: THREE.Scene, cam: THREE.Camera) => { if (o.noGl) return null; renders.push({ scene, cam: (cam as THREE.PerspectiveCamera).clone() }); return document.createElement('canvas'); } } };
}
const media = (): any => ({ begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p });
const PLACES = '台北|121.5|25.03\n舊金山|-122.42|37.77\n哥倫比亞|-74.3|4.6\n衣索比亞|38.7|9.1';
async function stage(params: Record<string, unknown>, o: { noGl?: boolean } = {}) {
  const k = fakeKit(o);
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'common', items: [globe as ItemType] }]), media(), { three: k.kit, onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: 1920, height: 1080, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'g', type: 'common.globe', start: 0, end: 3, params: { places: PLACES, ...params } }] }] } as any);
  await st.ready();
  return { st, k, at: (t: number) => { texts = []; st.draw(t); return k.renders.at(-1)!; } };
}
const facing = (scene: THREE.Scene, cam: THREE.Camera, p: THREE.Vector3) => p.clone().normalize().dot(cam.position.clone().sub(p).normalize()) > 0;

test('the land dots are on land: Taipei near a dot, the middle of the Pacific not', () => {
  const d = landDots();
  const near = (lon: number, lat: number, deg: number) => d.some(([x, y]) => Math.abs(x - lon) < deg && Math.abs(y - lat) < deg);
  expect(d.length).toBeGreaterThan(3000);
  expect(near(121, 24, 2)).toBe(true);
  expect(near(-150, 0, 3)).toBe(false);
  expect(landDots()).toBe(d);   // made once
});

test('turn keys put the given place facing the camera', async () => {
  const { at } = await stage({ turn: '0|121.5,25.03\n2|38.7,9.1' });
  for (const [t, name] of [[0, '台北'], [2.5, '衣索比亞']] as const) {
    const r = at(t), pin = r.scene.getObjectByName(`globe-pin-${name}`)!, p = pin.getWorldPosition(new THREE.Vector3());
    expect(p.clone().normalize().dot(new THREE.Vector3(0, 0, 1))).toBeGreaterThan(0.999);
  }
});

test('an arc whose far end is behind the globe waits until it turns into view', async () => {
  const { at } = await stage({ home: '台北', turn: '0|121.5,25.03', arcs: '0-2|台北>舊金山' });
  const r = at(2.5), arc = r.scene.getObjectByName('globe-arc-0')!;
  const drawn = arc.userData.drawn as THREE.Vector3[];
  expect(drawn.length).toBeGreaterThan(1);
  expect(drawn.length).toBeLessThan(81);
  expect(drawn.every((p) => facing(r.scene, r.cam, p))).toBe(true);
  // turned to face the Pacific between them, the whole arc is drawn
  const { at: at2 } = await stage({ home: '台北', turn: '0|180,35', arcs: '0-2|台北>舊金山' });   // over the Pacific between them
  expect((at2(2.5).scene.getObjectByName('globe-arc-0')!.userData.drawn as unknown[]).length).toBe(81);
});

test('labels are drawn only for places on the near side', async () => {
  const { at } = await stage({ turn: '0|121.5,25.03' });
  at(1);
  expect(texts).toContain('台北');
  expect(texts).not.toContain('哥倫比亞');
});

test('the home is drawn brighter than the other places', async () => {
  const r = (await stage({ home: '台北', turn: '0|121.5,25.03' })).at(1);
  const dot = (n: string) => (r.scene.getObjectByName(`globe-pin-${n}`)!.getObjectByName('dot') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.color;
  expect(dot('台北').getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(dot('衣索比亞').getHSL({ h: 0, s: 0, l: 0 }).l);
});

test('without WebGL2 it draws a flat dotted disc with the places', async () => {
  const { st } = await stage({ turn: '0|121.5,25.03' }, { noGl: true });
  dots = 0; texts = [];
  st.draw(1);
  expect(dots).toBeGreaterThan(500);
  expect(texts).toContain('台北');
});

test('an arc whose start has gone behind still shows the part on the near side', async () => {
  // facing Taipei, Ethiopia is past the rim: the end of the arc near Taipei is drawn, the start is not
  const r = (await stage({ home: '台北', turn: '0|121.5,25.03', arcs: '0-1|衣索比亞>台北' })).at(2.5), arc = r.scene.getObjectByName('globe-arc-0')!;
  const drawn = arc.userData.drawn as THREE.Vector3[];
  expect(drawn.length).toBeGreaterThan(10);
  expect(drawn.every((p) => facing(r.scene, r.cam, p))).toBe(true);
});

test('no drawn arc point lies outside the globe as seen (a lifted arc near the rim would stick out)', async () => {
  const r = (await stage({ home: '台北', turn: '0|121.5,25.03', arcs: '0-1|衣索比亞>台北\n0-1|哥倫比亞>台北' })).at(2.5);
  const cam = r.cam, R = 2, d = cam.position.z, limit = R / Math.sqrt(d * d - R * R);   // the silhouette's tangent
  for (const k of [0, 1]) for (const p of r.scene.getObjectByName(`globe-arc-${k}`)!.userData.drawn as THREE.Vector3[]) {
    expect(Math.hypot(p.x, p.y) / (d - p.z)).toBeLessThan(limit);
  }
});

test('places written as common.worldmap writes them (comma separated, 中文|英文|經度|緯度) are every place, at its own latitude', async () => {
  const { parsePlaces } = await import('./globe.ts');
  const { EUROPE_TRIP } = await import('./geo.ts');
  expect(parsePlaces(EUROPE_TRIP)).toEqual([{ name: '巴黎', lon: 2.35, lat: 48.86 }, { name: '克拉科夫', lon: 19.94, lat: 50.06 }, { name: '塔林', lon: 24.75, lat: 59.44 }]);
  expect(parsePlaces('台北|121.5|25.0\n東京|139.7|35.7，大阪|135.5|34.7')).toEqual([{ name: '台北', lon: 121.5, lat: 25 }, { name: '東京', lon: 139.7, lat: 35.7 }, { name: '大阪', lon: 135.5, lat: 34.7 }]);
});
