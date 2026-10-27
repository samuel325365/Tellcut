// @vitest-environment jsdom
import * as THREE from 'three';
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { makeKit } from './three/kit.ts';
import { dolly, dollyProgress, FOV } from './dolly.ts';

// jsdom has no canvas: a 2D context that records what is drawn on which canvas
let drawn: Array<{ canvas: HTMLCanvasElement; src: unknown; args: number[] }>, order: string[];
beforeEach(() => {
  drawn = []; order = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const canvas = this;
    return { canvas, clearRect() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }), set fillStyle(_v: unknown) {},
      drawImage: (src: unknown, ...args: number[]) => { drawn.push({ canvas, src, args }); order.push(`copy:${canvas.dataset.id ?? ''}`); } } as any;
  });
});
afterEach(() => vi.restoreAllMocks());

/** the real kit math with a fake renderer: render() records the camera and returns one shared canvas */
function fakeKit(o: { noGl?: boolean } = {}) {
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  const shared = document.createElement('canvas');
  const renders: Array<{ cam: THREE.PerspectiveCamera; scene: THREE.Scene; toneMapping?: boolean; id: string }> = [];
  const textures: Array<{ updates: number; texture: THREE.Texture }> = [];
  let current = '';
  return {
    renders, textures, setCurrent: (id: string) => { current = id; },
    kit: { ...kit,
      render: (scene: THREE.Scene, cam: THREE.Camera, _w: number, _h: number, ro: { toneMapping?: boolean } = {}) => {
        if (o.noGl) return null;
        renders.push({ cam: (cam as THREE.PerspectiveCamera).clone(), scene, toneMapping: ro.toneMapping, id: current }); order.push(`render:${current}`);
        return shared;
      },
      mediaTexture: (el: HTMLVideoElement | HTMLImageElement) => { const t = { updates: 0, texture: new THREE.Texture(el) }; textures.push(t); return { texture: t.texture, update: () => { t.updates++; }, dispose: () => t.texture.dispose() }; },
    },
  };
}
const media = (calls: string[] = []): any => ({
  begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'),
  video: (ref: any, parent: HTMLElement) => { calls.push(`video:${ref.source}`); const v = document.createElement('video'); parent.appendChild(v); return v; },
  stillUrl: (r: any) => { calls.push(`still:${r.source}`); return `/still/${r.source}.jpg`; },
});
const W = 1920, H = 1080;
function project(o: { W?: number; H?: number; items?: any[]; sources?: Record<string, unknown> } = {}): any {
  return { version: 1, meta: { width: o.W ?? W, height: o.H ?? H, fps: 30, duration: 10, background: '#000', plugins: [] },
    sources: o.sources ?? { clip: { path: 'a.mp4', duration: 30, width: 1920, height: 1080 }, pic: { path: 'b.jpg', kind: 'image', width: 1600, height: 1200 } }, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: o.items ?? [{ id: 'd', type: 'common.dolly', start: 0, end: 2, params: { source: 'clip', from: 3, dir: 'in' } }] }] };
}
function stage(p: any, k = fakeKit(), m = media()) {
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'common', items: [dolly as ItemType], grades: { warm: 'sepia(0.3)' } }]), m, { three: k.kit });
  st.load(p);
  return st;
}
const at = (st: Stage, t: number) => { st.draw(t); st.late(t); };
const faceOf = (scene: THREE.Scene) => scene.getObjectByName('dolly-frame') as THREE.Mesh;

test('in: the last frame is the full frame — the camera sits at fillDistance and the frame faces it straight', () => {
  const k = fakeKit(), st = stage(project(), k);
  at(st, 2 - 1 / 30);
  const r = k.renders.at(-1)!, frame = faceOf(r.scene), front = (frame.geometry as THREE.BoxGeometry).parameters.depth / 2;
  expect(r.cam.position.z - front).toBeCloseTo(k.kit.fillDistance(1, FOV), 10);
  expect([frame.rotation.x, frame.rotation.y, r.cam.position.x, r.cam.position.y]).toEqual([0, 0, 0, 0]);
  at(st, 0);
  expect(k.renders.at(-1)!.cam.position.z - front).toBeGreaterThan(2 * k.kit.fillDistance(1, FOV));
});

test('out: the first frame is the full frame, then the camera pulls back and the frame tilts', () => {
  const k = fakeKit(), st = stage(project({ items: [{ id: 'd', type: 'common.dolly', start: 0, end: 2, params: { source: 'clip', from: 3, dir: 'out' } }] }), k);
  at(st, 0);
  expect(faceOf(k.renders.at(-1)!.scene).rotation.y).toBe(0);
  at(st, 1);
  const r = k.renders.at(-1)!;
  expect(r.cam.position.z).toBeGreaterThan(k.kit.fillDistance(1, FOV) * 1.2);
  expect(Math.abs(faceOf(r.scene).rotation.y)).toBeGreaterThan(0.05);
  expect(dollyProgress('out', 0, 2, 30)).toBe(1);
  expect(dollyProgress('in', 2 - 1 / 30, 2, 30)).toBe(1);
  expect(dollyProgress('in', 0, 2, 30)).toBe(0);
});

test("the face is the picture's aspect at 16:9, 9:16 and 1:1", () => {
  for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
    const k = fakeKit(), st = stage(project({ W: w, H: h }), k);
    at(st, 1);
    const g = (faceOf(k.renders.at(-1)!.scene).geometry as THREE.BoxGeometry).parameters;
    expect(g.width / g.height).toBeCloseTo(w / h, 10);
    expect(k.renders.at(-1)!.cam.aspect).toBeCloseTo(w / h, 10);
  }
});

test("the texture shows the clip's crop (coverUv with x, y, zoom) and the canvas takes the clip's grade", () => {
  const k = fakeKit(), st = stage(project({ W: 1080, H: 1920, items: [{ id: 'd', type: 'common.dolly', start: 0, end: 2, params: { source: 'clip', from: 3, x: 0.3, y: 0.5, zoom: 1.2, grade: 'warm' } }] }), k);
  at(st, 1);
  const tex = k.textures[0].texture, uv = k.kit.coverUv(1920, 1080, 1080, 1920, { x: 0.3, y: 0.5, zoom: 1.2 });
  expect([tex.repeat.x, tex.repeat.y, tex.offset.x, tex.offset.y]).toEqual([...uv.repeat, ...uv.offset]);
  expect(drawn.at(-1)!.canvas.style.filter).toBe('sepia(0.3)');
});

test('the video texture is uploaded in late, not in draw', () => {
  const k = fakeKit(), st = stage(project(), k);
  st.draw(1);
  expect(k.textures.reduce((n, x) => n + x.updates, 0)).toBe(0);
  st.late(1);
  expect(k.textures[0].updates).toBe(1);
});

test('a photo source is drawn from its still, with no video asked', () => {
  const calls: string[] = [], k = fakeKit();
  const p = project({ items: [{ id: 'd', type: 'common.dolly', start: 0, end: 2, params: { source: 'pic', dir: 'in' } }] });
  expect(dolly.media!(p.tracks[0].items[0], p).videos).toEqual([]);
  expect(dolly.media!(p.tracks[0].items[0], p).stills.map((s) => s.source)).toEqual(['pic']);
  const st = stage(p, k, media(calls));
  at(st, 1);
  expect(calls.some((c) => c.startsWith('video:'))).toBe(false);
  expect(calls).toContain('still:pic');
  expect(k.renders.length).toBeGreaterThan(0);
});

test('a video source asks for the stretch it shows, from `from`', () => {
  const p = project();
  expect(dolly.media!(p.tracks[0].items[0], p)).toEqual({ videos: [{ source: 'clip', in: 3, out: 5, speed: 1, interp: 'none' }], stills: [] });
});

test('two dollies in one frame each keep their own picture', () => {
  const k = fakeKit();
  const st = stage(project({ items: [
    { id: 'a', type: 'common.dolly', start: 0, end: 2, params: { source: 'pic', dir: 'out' } },
    { id: 'b', type: 'common.dolly', start: 0, end: 2, params: { source: 'pic', dir: 'in' } },
  ] }), k);
  order.length = 0;
  at(st, 1);
  // each render is copied onto that item's own canvas before the next one draws over the shared canvas
  const seq = order.map((o) => o.split(':')[0]);
  expect(seq).toEqual(['render', 'copy', 'render', 'copy']);
  const own = drawn.slice(-2).map((d) => d.canvas);
  expect(own[0]).not.toBe(own[1]);
});

test('tone mapping is off: render is called with toneMapping false', () => {
  const k = fakeKit(), st = stage(project(), k);
  at(st, 1);
  expect(k.renders.every((r) => r.toneMapping === false)).toBe(true);
});

test('without WebGL2 (render returns null) it draws the picture flat with cover placement', () => {
  const k = fakeKit({ noGl: true }), st = stage(project(), k);
  at(st, 1);
  const last = drawn.at(-1)!;
  expect(last.src).toBeInstanceOf(HTMLVideoElement);
  expect(last.args).toEqual([0, 0, 1920, 1080]);
});

test('hide frees the texture and the canvas', () => {
  const k = fakeKit(), st = stage(project(), k);
  at(st, 1);
  const tex = k.textures[0].texture, spy = vi.spyOn(tex, 'dispose');
  at(st, 5);   // past the item: the stage hides it
  expect(spy).toHaveBeenCalled();
  expect(drawn.at(-1)!.canvas.width).toBe(0);
});
