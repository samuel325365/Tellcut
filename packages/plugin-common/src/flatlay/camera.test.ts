import * as THREE from 'three';
import { coverPlacement, type Crop } from '@tellcut/engine';
import { cameraPose, flyCover, flyCrop, picWorld, type Fly } from './camera.ts';
import { objectPose } from './motion.ts';
import { parseObjects, sizeOf } from './objects.ts';

const LEN = 8;
const objs = (json: string, W = 1080, H = 1920) => parseObjects({ objects: json }, W, H).objs;
const PUSH = { mode: 'push' as const, topAt: null, fly: null as Fly | null, fov: 30 };
const dist = (p: { pos: number[]; look: number[] }) => Math.hypot(p.pos[0] - p.look[0], p.pos[1] - p.look[1], p.pos[2] - p.look[2]);

/** a pose as a three camera, to project points with */
function cam(p: ReturnType<typeof cameraPose>, W: number, H: number) {
  const c = new THREE.PerspectiveCamera(p.fov, W / H, 0.01, 100);
  c.position.set(...p.pos); c.up.set(...p.up); c.lookAt(...p.look); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return (v: [number, number, number]) => { const q = new THREE.Vector3(...v).project(c); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
}

test('push moves in slowly with a little drift', () => {
  const list = objs('[{"kind":"postcard"},{"kind":"polaroid"}]');
  const a = cameraPose(PUSH, list, 0, LEN, 1080, 1920), b = cameraPose(PUSH, list, LEN, LEN, 1080, 1920);
  expect(dist(a)).toBeCloseTo(6.3, 1);
  expect(dist(b)).toBeCloseTo(5.6, 1);
  // the spike's slow orbit: it drifts, but only a little for a camera six units away
  const drift = Math.abs(b.pos[0] - a.pos[0]);
  expect(drift).toBeGreaterThan(0.05);
  expect(drift).toBeLessThan(0.6);
  expect(cameraPose(PUSH, list, 3.3, LEN, 1080, 1920)).toEqual(cameraPose(PUSH, list, 3.3, LEN, 1080, 1920));
});

test('still does not move', () => {
  const list = objs('[{"kind":"postcard"}]'), o = { ...PUSH, mode: 'still' as const };
  const a = cameraPose(o, list, 0, LEN, 1080, 1920), b = cameraPose(o, list, LEN, LEN, 1080, 1920);
  // the camera holds; its focus still moves to the object once it has landed
  expect([a.pos, a.look, a.up]).toEqual([b.pos, b.look, b.up]);
});

test('top looks straight down on the whole desk', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const list = objs('[{"kind":"postcard"},{"kind":"polaroid"},{"kind":"card"},{"kind":"photo"}]', W, H);
    const o = { ...PUSH, mode: 'top' as const, topAt: 4 };
    const p = cameraPose(o, list, 5.5, LEN, W, H);
    expect(p.pos[0]).toBeCloseTo(p.look[0], 9);
    expect(p.pos[2]).toBeCloseTo(p.look[2], 9);
    expect(p.up).toEqual([0, 0, -1]);
    const project = cam(p, W, H);
    list.forEach((ob) => {
      const s = sizeOf(ob);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const c = Math.cos(ob.rot), sn = Math.sin(ob.rot), lx = (dx * s.w) / 2, ly = (dy * s.h) / 2;
        const [x, y] = project([ob.x + lx * c - ly * sn, 0, -(ob.y + lx * sn + ly * c)]);
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(W);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(H);
      }
    });
  }
});

test('the fly ends with the picture covering the screen exactly', () => {
  for (const [W, H, json] of [[1080, 1920, '[{"kind":"postcard"},{"kind":"polaroid"}]'], [1920, 1080, '[{"kind":"card"},{"kind":"tv"}]']] as const) {
    const list = objs(json, W, H), fly: Fly = { index: 1, at: 2, dur: 1.5, back: null, backDur: 1 };
    const p = cameraPose({ ...PUSH, fly }, list, 4, LEN, W, H);
    const project = cam(p, W, H);
    const pw = picWorld(list[1], objectPose(list[1], 1, 4, W, H));
    const pts = pw.corners.map(project);
    // every corner on or past the edge; the picture centred, so one pair of opposite edges lies exactly on the screen's
    for (const [x, y] of pts) expect(x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1).toBe(true);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const onX = Math.abs(Math.min(...xs)) <= 1 && Math.abs(Math.max(...xs) - W) <= 1, onY = Math.abs(Math.min(...ys)) <= 1 && Math.abs(Math.max(...ys) - H) <= 1;
    expect(onX || onY).toBe(true);
    expect(Math.min(...xs)).toBeLessThanOrEqual(1); expect(Math.max(...xs)).toBeGreaterThanOrEqual(W - 1);
    expect(Math.min(...ys)).toBeLessThanOrEqual(1); expect(Math.max(...ys)).toBeGreaterThanOrEqual(H - 1);
  }
});

test('flyCover is 1 only while the picture covers the screen', () => {
  const fly: Fly = { index: 0, at: 2, dur: 1, back: 5, backDur: 1 };
  expect(flyCover(fly, 1)).toBe(0);
  expect(flyCover(fly, 2.98)).toBeLessThan(1);
  expect(flyCover(fly, 3)).toBe(1);
  expect(flyCover(fly, 4.99)).toBe(1);
  expect(flyCover(fly, 5.5)).toBeLessThan(1);
  expect(flyCover(fly, 6)).toBe(0);
  expect(flyCover({ ...fly, back: null }, 30)).toBe(1);
  expect(flyCover(null, 3)).toBe(0);
});

test('flyCrop shows the same part of the footage the covering picture shows', () => {
  const cases: Array<[number, number, number, number, number, number, Crop]> = [
    [1920, 1080, 1.42, 0.84, 1080, 1920, { x: 0.5, y: 0.5, zoom: 1 }],     // a postcard in a 9:16 film
    [1920, 1080, 0.76, 0.76, 1080, 1920, { x: 0.3, y: 0.45, zoom: 1.2 }],  // a polaroid
    [1280, 720, 1.0, 0.75, 1920, 1080, { x: 0.62, y: 0.4, zoom: 1.1 }],    // an old TV in a 16:9 film
    [1920, 1080, 1.42, 0.84, 1080, 1920, { x: 0.05, y: 0.5, zoom: 1 }],    // a crop pushed to the edge
  ];
  for (const [sw, sh, pw, ph, W, H, crop] of cases) {
    // what the picture face shows, then the screen's part of it (centred, the screen's shape)
    const b = coverPlacement(sw, sh, pw, ph, crop);
    const vh = Math.min(ph, (pw * H) / W), vw = (vh * W) / H, vx = (pw - vw) / 2, vy = (ph - vh) / 2;
    const want = [((vx - b.left) / b.width) * sw, ((vy - b.top) / b.height) * sh, ((vx + vw - b.left) / b.width) * sw, ((vy + vh - b.top) / b.height) * sh];
    const m = coverPlacement(sw, sh, W, H, flyCrop(crop, sw, sh, pw, ph, W, H));
    const got = [((0 - m.left) / m.width) * sw, ((0 - m.top) / m.height) * sh, ((W - m.left) / m.width) * sw, ((H - m.top) / m.height) * sh];
    got.forEach((g, i) => expect(Math.abs(g - want[i])).toBeLessThanOrEqual(0.5));
  }
});

test('focus follows the newest object, or the one flown into', () => {
  const list = objs('[{"kind":"postcard","at":0},{"kind":"polaroid","at":2}]');
  const at = (local: number, o = PUSH) => cameraPose(o, list, local, LEN, 1080, 1920);
  const toObj = (p: ReturnType<typeof cameraPose>, i: number) => { const q = objectPose(list[i], i, 99, 1080, 1920); return Math.hypot(p.pos[0] - list[i].x, p.pos[1] - q.z, p.pos[2] + list[i].y); };
  expect(at(1).focus).toBeCloseTo(toObj(at(1), 0), 6);
  expect(at(3).focus).toBeCloseTo(toObj(at(3), 1), 6);
  const fly: Fly = { index: 0, at: 4, dur: 1, back: null, backDur: 1 };
  const p = at(4.5, { ...PUSH, fly });
  expect(p.focus).toBeCloseTo(toObj(p, 0), 1);
});
