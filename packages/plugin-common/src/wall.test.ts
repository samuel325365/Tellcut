// @vitest-environment jsdom
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { makeKit } from './three/kit.ts';
import { tileList, wall, WALL_FOV } from './wall.ts';

let drawn: unknown[], texts: string[];
beforeEach(() => {
  drawn = []; texts = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { canvas: this, clearRect() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, set fillStyle(_v: unknown) {},
      drawImage: (src: unknown) => drawn.push(src), fillText: (s: string) => texts.push(s), createRadialGradient: () => ({ addColorStop() {} }) } as any;
  });
  (HTMLImageElement.prototype as any).decode = async () => {};
});
afterEach(() => vi.restoreAllMocks());

function fakeKit(o: { noGl?: boolean } = {}) {
  const kit = makeKit(THREE, { RoundedBoxGeometry, RoomEnvironment, SVGLoader, Reflector, opentype: {} as any, clipper: {} as any } as any, { makeRenderer: () => null });
  const renders: Array<{ scene: THREE.Scene; cam: THREE.PerspectiveCamera; o: { toneMapping?: unknown; bloom?: number } }> = [];
  return { renders, kit: { ...kit, environment: () => null,
    render: (scene: THREE.Scene, cam: THREE.Camera, _w: number, _h: number, ro: any = {}) => { if (o.noGl) return null; renders.push({ scene, cam: (cam as THREE.PerspectiveCamera).clone(), o: { ...ro } }); return document.createElement('canvas'); } } };
}
const SOURCES = {
  a: { path: 'a.mp4', duration: 10, width: 1920, height: 1080 },
  tall: { path: 't.mp4', duration: 6, width: 1080, height: 1920 },
  pic: { path: 'p.jpg', kind: 'image', width: 1600, height: 1200 },
  song: { path: 's.wav', kind: 'audio', duration: 30 },
};
const stills: Array<{ source: string; t: number }> = [];
const media = (): any => ({ begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'),
  stillUrl: (r: { source: string; t: number }) => { stills.push(r); return `/still/${r.source}-${r.t}.jpg`; }, fileUrl: (p: string) => p });
async function stage(params: Record<string, unknown>, o: { noGl?: boolean; W?: number; H?: number; dur?: number } = {}) {
  stills.length = 0;
  const k = fakeKit({ noGl: o.noGl });
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'common', items: [wall as ItemType] }]), media(), { three: k.kit, onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: o.W ?? 1920, height: o.H ?? 1080, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: SOURCES, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'w', type: 'common.wall', start: 0, end: o.dur ?? 4, params }] }] } as any);
  await st.ready();
  return { st, k, at: (t: number) => { st.draw(t); return k.renders.at(-1)!; } };
}
const tiles = (s: THREE.Scene) => { const out: THREE.Object3D[] = []; s.traverse((x) => { if (x.name.startsWith('wall-tile-')) out.push(x); }); return out; };
const faceOf = (t: THREE.Object3D) => t.getObjectByName('wall-face') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

test('the tiles are the project sources in turn, each at its middle second unless given', () => {
  expect(tileList('', SOURCES as any)).toEqual([{ source: 'a', t: 5 }, { source: 'tall', t: 3 }, { source: 'pic', t: 0 }]);
  expect(tileList('a@2.5, pic', SOURCES as any)).toEqual([{ source: 'a', t: 2.5 }, { source: 'pic', t: 0 }]);
  expect(tileList('nope, a', SOURCES as any)).toEqual([{ source: 'a', t: 5 }]);
});

test('media() asks for one still per distinct source and time', () => {
  const item: any = { start: 0, end: 4, params: { tiles: 'a@1, a@1, tall' } };
  expect(wall.media!(item, { sources: SOURCES } as any).stills).toEqual([{ source: 'a', t: 1, w: 480 }, { source: 'tall', t: 3, w: 480 }]);
});

test('the wall has cols × rows tiles and repeats the sources over them', async () => {
  const s = (await stage({ cols: 5, rows: 3 })).at(1).scene;
  expect(tiles(s).length).toBe(15);
  expect(new Set(tiles(s).map((t) => faceOf(t).material.map)).size).toBe(3);
});

test('a tall source fills its tile by cover, not stretched', async () => {
  const s = (await stage({ cols: 3, rows: 1, tiles: 'tall' })).at(1).scene, map = faceOf(tiles(s)[0]).material.map!;
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null }), uv = kit.coverUv(1080, 1920, 16, 9, { x: 0.5, y: 0.5, zoom: 1 });
  expect([map.repeat.x, map.repeat.y, map.offset.x, map.offset.y].map((v) => +v.toFixed(6))).toEqual([...uv.repeat, ...uv.offset].map((v) => +v.toFixed(6)));
});

test('wall: at the end the focus tile fills the frame width, the camera on its normal', async () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    const { at } = await stage({ cols: 5, rows: 3, focus: 3, push: 0.5 }, { W, H });
    const r = at(4 - 1 / 30), tile = tiles(r.scene)[3], face = faceOf(tile);
    const width = face.geometry.parameters.width, centre = face.getWorldPosition(new THREE.Vector3());
    const d = r.cam.position.distanceTo(centre);
    const halfW = Math.tan((WALL_FOV * Math.PI) / 360) * (W / H) * d;
    expect(halfW * 2).toBeCloseTo(width, 2);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tile.getWorldQuaternion(new THREE.Quaternion()));
    expect(r.cam.position.clone().sub(centre).normalize().dot(normal)).toBeCloseTo(1, 3);
  }
});

test('sphere: tiles facing away are faded, those facing the camera are not', async () => {
  const s = (await stage({ look: 'sphere' })).at(2).scene, ts = tiles(s);
  expect(ts.length).toBe(90);
  const ops = ts.map((t) => faceOf(t).material.opacity);
  expect(Math.min(...ops)).toBeLessThan(0.05);
  expect(Math.max(...ops)).toBeGreaterThan(0.95);
});

test('sphere x moves the ball across the frame (proof words on the left, the ball on the right) and it still fades its far side', async () => {
  const r = (await stage({ look: 'sphere', x: 0.7 })).at(2), ball = tiles(r.scene)[0].parent!;
  const c = new THREE.Vector3(); ball.getWorldPosition(c);
  r.cam.updateMatrixWorld(true);
  expect(c.clone().project(r.cam).x).toBeCloseTo(0.4, 2);   // 0.7 of the width in NDC
  const ops = tiles(r.scene).map((t) => faceOf(t).material.opacity);
  const mid = (await stage({ look: 'sphere' })).at(2), cm = new THREE.Vector3();
  tiles(mid.scene)[0].parent!.getWorldPosition(cm);
  expect(cm.x).toBe(0);
  // the far side fades as much as on a centred ball (faded by the ball's own centre, not the world's)
  const lit = (sc: THREE.Scene) => tiles(sc).map((t) => faceOf(t).material.opacity).filter((o) => o > 0.95).length;
  expect(Math.abs(lit(r.scene) - lit(mid.scene))).toBeLessThanOrEqual(2);
  expect(ops.filter((o) => o < 0.05).length).toBeGreaterThan(40);
});

test('the same time draws the same picture state', async () => {
  const { at } = await stage({ look: 'sphere' });
  const pose = () => JSON.stringify(tiles(at(2.2).scene).slice(0, 5).map((t) => t.matrixWorld.elements.map((v) => +v.toFixed(5))));
  const a = pose(); at(0.4); expect(pose()).toBe(a);
});

test('without WebGL2 it draws the stills as a flat grid', async () => {
  const { st } = await stage({ cols: 3, rows: 2 }, { noGl: true });
  drawn = [];
  st.draw(1);
  expect(drawn.filter((d) => d instanceof HTMLImageElement).length).toBe(6);
});

test("wall: while gliding, the wall covers the frame's long side (16:9 across, 9:16 top to bottom)", async () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    const { at } = await stage({ cols: 13, rows: 7, push: 0.5 }, { W, H });
    for (const t of [0, 1, 1.9]) {
      const r = at(t), box = new THREE.Box2();
      r.cam.updateMatrixWorld(true);
      for (const tile of tiles(r.scene)) {
        tile.updateMatrixWorld(true);
        const v = faceOf(tile).getWorldPosition(new THREE.Vector3()).project(r.cam);
        box.expandByPoint(new THREE.Vector2(v.x, v.y));
      }
      if (W > H) expect([box.min.x < -0.9, box.max.x > 0.9, box.max.y - box.min.y > 1.4]).toEqual([true, true, true]);
      else expect([box.min.y < -0.9, box.max.y > 0.9, box.max.x - box.min.x > 1.4]).toEqual([true, true, true]);
    }
  }
});


// brand plan 5: the spike's floor, dust, count and glow
test('the wall has a reflective floor under it, dust that is the same at the same time, and a count that climbs to its number', async () => {
  const a = await stage({ cols: 5, rows: 3, push: 0.5, count: 696, countLabel: 'clips.' }, { dur: 6 });   // the count leaves before the push (3 s)
  const s = a.at(1).scene, floor = s.getObjectByName('wall-floor')!, veil = s.getObjectByName('wall-floor-veil')!;
  expect(floor && veil).toBeTruthy();
  const lowest = Math.min(...tiles(s).map((t) => t.position.y));
  expect(floor.position.y).toBeLessThan(lowest);
  expect(veil.position.y).toBeGreaterThan(floor.position.y);
  expect((await stage({ cols: 5, rows: 3, floor: false })).at(1).scene.getObjectByName('wall-floor')).toBeUndefined();
  // dust: the same at the same time, in a fresh stage too
  const dustAt = (r: { scene: THREE.Scene }) => { const d = r.scene.getObjectByName('wall-dust') as THREE.Points; d.updateMatrixWorld(true); return JSON.stringify([d.visible, d.matrixWorld.elements.map((v) => +v.toFixed(5)), Array.from((d.geometry.getAttribute('position').array as Float32Array).slice(0, 9))]); };
  const b = await stage({ cols: 5, rows: 3 });
  expect(dustAt(a.at(1.3))).toBe(dustAt(b.at(1.3)));
  expect(dustAt(a.at(1.3))).not.toBe(dustAt(a.at(2)));
  const none = (await stage({ cols: 5, rows: 3, dust: 0 })).at(1).scene.getObjectByName('wall-dust');
  expect(!none || !none.visible).toBe(true);
  // the count climbs from 0.6 s to 2.2 s
  texts = []; a.st.draw(1);
  const mid = texts.find((t) => / clips\.$/.test(t))!;
  expect(Number(mid.split(' ')[0].replace(/,/g, ''))).toBeGreaterThan(0);
  expect(Number(mid.split(' ')[0].replace(/,/g, ''))).toBeLessThan(696);
  texts = []; a.st.draw(2.4);
  expect(texts).toContain('696 clips.');
  texts = []; (await stage({ cols: 5, rows: 3 })).st.draw(2.4);
  expect(texts.some((t) => / clips\.$/.test(t) || /^\d/.test(t))).toBe(false);
});

test('render is called with the wall bloom', async () => {
  const { at } = await stage({ cols: 5, rows: 3, push: 0.5 });
  expect(at(1).o).toMatchObject({ bloom: 0.32, toneMapping: 'none' });
  // the push hands over to footage: the last frame has no glow and no tone mapping, as the clip is
  expect(at(4 - 1 / 30).o.bloom ?? 0).toBe(0);
  expect(at(4 - 1 / 30).o.toneMapping).toBe(false);
  expect((await stage({ cols: 5, rows: 3, bloom: 0 })).at(1).o.bloom ?? 0).toBe(0);
  expect((await stage({ look: 'sphere' })).at(2).o).toMatchObject({ bloom: 0.32, toneMapping: 'none' });
});

// review of brand plan 3: a stitched map is not footage; cover by the still that actually loaded
test('with no tiles given, the maps stitched by assets map are left out (named, they are used)', () => {
  const withMap = { ...SOURCES, m: { path: 'media/maps/m.png', kind: 'image', width: 800, height: 600, map: { center: [0, 0], zoom: 3 } } };
  expect(tileList('', withMap as any)).toEqual([{ source: 'a', t: 5 }, { source: 'tall', t: 3 }, { source: 'pic', t: 0 }]);
  expect(tileList('m', withMap as any)).toEqual([{ source: 'm', t: 0 }]);
});

test("a tile is cropped by its still's own size, not the size the source records", async () => {
  (HTMLImageElement.prototype as any).decode = async function (this: HTMLImageElement) {
    Object.defineProperty(this, 'naturalWidth', { value: 270, configurable: true });
    Object.defineProperty(this, 'naturalHeight', { value: 480, configurable: true });
  };
  const s = (await stage({ cols: 3, rows: 1, tiles: 'a' })).at(1).scene, map = faceOf(tiles(s)[0]).material.map!;   // a records 1920 × 1080
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null }), uv = kit.coverUv(270, 480, 16, 9, { x: 0.5, y: 0.5, zoom: 1 });
  expect([map.repeat.x, map.repeat.y, map.offset.x, map.offset.y].map((v) => +v.toFixed(6))).toEqual([...uv.repeat, ...uv.offset].map((v) => +v.toFixed(6)));
});
