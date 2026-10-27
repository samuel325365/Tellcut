import * as THREE from 'three';
import { coverPlacement } from '@tellcut/engine';
import { makeKit, RETRY_MS } from './kit.ts';
import { loadThreeKit } from './load.ts';
import { coverUv } from './uv.ts';

const addons = {} as any;

test('fillDistance is (faceH/2)/tan(fov/2)', () => {
  const kit = makeKit(THREE, addons);
  expect(kit.fillDistance(2, 40)).toBeCloseTo(1 / Math.tan((20 * Math.PI) / 180), 10);
  expect(kit.fillDistance(1, 35)).toBeCloseTo(0.5 / Math.tan((17.5 * Math.PI) / 180), 10);
});

test('coverUv matches coverPlacement for a wide source in a tall box and a zoomed crop', () => {
  const cases = [
    [1920, 1080, 1920, 1080, { x: 0.5, y: 0.5, zoom: 1 }],
    [1920, 1080, 1080, 1920, { x: 0.3, y: 0.5, zoom: 1 }],
    [1280, 720, 1920, 1080, { x: 0.6, y: 0.4, zoom: 1.4 }],
    [1080, 1920, 1920, 1080, { x: 0.5, y: 0.2, zoom: 1.1 }],
  ] as const;
  for (const [srcW, srcH, w, h, crop] of cases) {
    const b = coverPlacement(srcW, srcH, w, h, crop), uv = coverUv(srcW, srcH, w, h, crop);
    // the part of the picture the box shows, in fractions of the picture, top-down
    const u0 = -b.left / b.width, uw = w / b.width, v0 = -b.top / b.height, vh = h / b.height;
    expect(uv.repeat[0]).toBeCloseTo(uw, 10);
    expect(uv.repeat[1]).toBeCloseTo(vh, 10);
    expect(uv.offset[0]).toBeCloseTo(u0, 10);
    expect(uv.offset[1]).toBeCloseTo(1 - v0 - vh, 10);   // WebGL's v runs bottom-up
  }
  expect(coverUv(1920, 1080, 1920, 1080, { x: 0.5, y: 0.5, zoom: 1 })).toEqual({ repeat: [1, 1], offset: [0, 0] });
});

test('loadThreeKit gives one kit however often it is called', async () => {
  const [a, b] = await Promise.all([loadThreeKit(), loadThreeKit()]);
  expect(a).toBe(b);
  expect(a.THREE.REVISION).toBe('186');
  expect(typeof a.addons.RoundedBoxGeometry).toBe('function');
  expect(typeof a.addons.RoomEnvironment).toBe('function');
});

test('a lost context is made again on the next render', () => {
  const made: Array<{ canvas: { listeners: Record<string, () => void> } }> = [];
  const makeRenderer = () => {
    const canvas = { width: 0, height: 0, listeners: {} as Record<string, () => void>, addEventListener(k: string, f: () => void) { this.listeners[k] = f; } };
    const r = { domElement: canvas, toneMapping: 0, outputColorSpace: '', setSize(w: number, h: number) { canvas.width = w; canvas.height = h; }, setClearColor() {}, render() {}, dispose() {} };
    made.push({ canvas });
    return r as any;
  };
  const kit = makeKit(THREE, addons, { makeRenderer });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  expect(kit.render(scene, cam, 64, 36)).not.toBeNull();
  kit.render(scene, cam, 64, 36);
  expect(made.length).toBe(1);
  made[0].canvas.listeners.webglcontextlost();
  kit.render(scene, cam, 64, 36);
  expect(made.length).toBe(2);
});

test('after a lost context a failed rebuild is tried again later, not given up for the session', () => {
  let fail = false, clock = 0, tries = 0;
  const canvases: Array<Record<string, () => void>> = [];
  const makeRenderer = () => {
    tries++;
    if (fail) return null;
    const listeners: Record<string, () => void> = {};
    canvases.push(listeners);
    return { domElement: { width: 0, height: 0, addEventListener: (k: string, f: () => void) => { listeners[k] = f; } }, setSize() {}, setClearColor() {}, render() {}, dispose() {} } as any;
  };
  const kit = makeKit(THREE, addons, { makeRenderer, now: () => clock });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  expect(kit.render(scene, cam, 8, 8)).not.toBeNull();
  canvases[0].webglcontextlost();
  fail = true;
  expect(kit.render(scene, cam, 8, 8)).toBeNull();      // the rebuild fails (GPU still resetting)
  expect(kit.render(scene, cam, 8, 8)).toBeNull();      // not tried again on every frame
  expect(tries).toBe(2);
  fail = false; clock += RETRY_MS;
  expect(kit.render(scene, cam, 8, 8)).not.toBeNull();  // a second later it comes back
  expect(tries).toBe(3);
});

test('render says null where no renderer can be made, and the tone mapping follows the option', () => {
  expect(makeKit(THREE, addons, { makeRenderer: () => null }).render(new THREE.Scene(), new THREE.PerspectiveCamera(), 8, 8)).toBeNull();
  const seen: number[] = [];
  const r: any = { domElement: { addEventListener() {} }, setSize() {}, setClearColor() {}, render() { seen.push(this.toneMapping); }, dispose() {} };
  const kit = makeKit(THREE, addons, { makeRenderer: () => r });
  kit.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 8, 8);
  kit.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 8, 8, { toneMapping: false });
  expect(seen).toEqual([THREE.ACESFilmicToneMapping, THREE.NoToneMapping]);
});

test('render takes neutral tone mapping', () => {
  const seen: number[] = [];
  const r: any = { domElement: { addEventListener() {} }, setSize() {}, setClearColor() {}, render() { seen.push(this.toneMapping); }, dispose() {} };
  const kit = makeKit(THREE, addons, { makeRenderer: () => r });
  kit.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 8, 8, { toneMapping: 'neutral' });
  expect(seen).toEqual([THREE.NeutralToneMapping]);
});

test('environment is null without a renderer', () => {
  expect(makeKit(THREE, addons, { makeRenderer: () => null }).environment()).toBeNull();
});

test('loadThreeKit brings the SVG and font loaders', async () => {
  const kit = await loadThreeKit();
  expect([typeof kit.addons.SVGLoader, typeof kit.addons.opentype.parse]).toEqual(['function', 'function']);
});


// brand plan 5: the spike's glow on 3D without footage
test('bloom renders through a composer; bloom never applies with toneMapping false', () => {
  const calls: string[] = [];
  const r: any = { domElement: { width: 8, height: 8, addEventListener() {} }, setSize() {}, setClearColor() {}, render() { calls.push('plain'); }, dispose() {} };
  const made: Array<{ strength: number }> = [];
  const makeComposer = () => { const c = { strength: 0, setSize() {}, render() { calls.push(`bloom ${c.strength}`); } }; made.push(c); return c; };
  const kit = makeKit(THREE, addons, { makeRenderer: () => r, makeComposer } as any);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  kit.render(scene, cam, 8, 8, { bloom: 0.3 });
  kit.render(scene, cam, 8, 8, { bloom: 0.5, toneMapping: 'neutral' });
  kit.render(scene, cam, 8, 8, { toneMapping: false, bloom: 0.3 });
  kit.render(scene, cam, 8, 8);
  kit.render(scene, cam, 8, 8, { toneMapping: 'none', bloom: 0.4 });
  expect(calls).toEqual(['bloom 0.3', 'bloom 0.5', 'plain', 'plain', 'bloom 0.4']);
  expect(r.toneMapping).toBe(THREE.NoToneMapping);   // 'none': stills keep their colours, but may glow
  expect(made.length).toBe(1);   // one composer for the size, reused
});

test('a new size gets a new bloom chain and the old one is disposed (its render targets would stay on the GPU)', () => {
  const r: any = { domElement: { width: 8, height: 8, addEventListener() {} }, setSize() {}, setClearColor() {}, render() {}, dispose() {} };
  const log: string[] = [];
  const makeComposer = (_r: unknown, w: number, h: number) => ({ strength: 0, setSize() {}, render() {}, dispose() { log.push(`dispose ${w}x${h}`); } });
  const kit = makeKit(THREE, addons, { makeRenderer: () => r, makeComposer } as any);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  kit.render(scene, cam, 8, 8, { bloom: 0.3 });
  kit.render(scene, cam, 8, 8, { bloom: 0.3 });
  expect(log).toEqual([]);
  kit.render(scene, cam, 16, 9, { bloom: 0.3 });
  expect(log).toEqual(['dispose 8x8']);
  // the kit's own chain frees the composer's targets and every pass's (the bloom's mip chain)
  const freed: string[] = [];
  class Pass { constructor(public name: string) {} dispose() { freed.push(this.name); } }
  const fake = { ...addons,
    EffectComposer: class { passes: Pass[] = []; addPass(p: Pass) { this.passes.push(p); } setSize() {} render() {} dispose() { freed.push('composer'); } },
    RenderPass: class extends Pass { constructor() { super('render'); } }, UnrealBloomPass: class extends Pass { constructor() { super('bloom'); } },
    OutputPass: class extends Pass { constructor() { super('output'); } } };
  const own = makeKit(THREE, fake as any, { makeRenderer: () => r });
  own.render(scene, cam, 8, 8, { bloom: 0.3 });
  own.render(scene, cam, 16, 9, { bloom: 0.3 });
  expect(freed).toEqual(['render', 'bloom', 'output', 'composer']);
});

test("bloom keeps the background colour: it is the scene's background while the composer renders, then put back", () => {
  const r: any = { domElement: { width: 8, height: 8, addEventListener() {} }, setSize() {}, setClearColor() {}, render() {}, dispose() {} };
  const seen: unknown[] = [];
  const makeComposer = () => ({ strength: 0, setSize() {}, render(scene: THREE.Scene) { seen.push((scene.background as THREE.Color | null)?.getHexString()); } });
  const kit = makeKit(THREE, addons, { makeRenderer: () => r, makeComposer } as any);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  kit.render(scene, cam, 8, 8, { bloom: 0.3, background: '#1a1a1a' });
  expect(seen).toEqual(['1a1a1a']);
  expect(scene.background).toBeNull();
});
