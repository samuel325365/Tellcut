import { contactShadow, DROP_LIFT, objectPose, REST_Z, viewHalf } from './motion.ts';
import { parseObjects, sizeOf } from './objects.ts';

const objs = (json: string, W = 1080, H = 1920) => parseObjects({ objects: json }, W, H).objs;

test('before it comes in an object is not drawn', () => {
  const [o] = objs('[{"kind":"polaroid","at":1}]');
  expect(objectPose(o, 0, 0.5, 1080, 1920).visible).toBe(false);
  expect(objectPose(o, 0, 1.2, 1080, 1920).visible).toBe(true);
  const [still] = objs('[{"kind":"card","at":1,"enter":"none"}]');
  expect(objectPose(still, 0, 0, 1080, 1920).visible).toBe(true);
});

test('a drop lands exactly on its resting pose', () => {
  const [, o] = objs('[{"kind":"card"},{"kind":"polaroid","at":1,"dur":0.9,"x":0.3,"y":-0.4,"rot":-0.12}]');
  const rest = { x: 0.3, y: -0.4, z: REST_Z * 2, rotZ: -0.12, flip: 0, tilt: 0, visible: true };
  expect(objectPose(o, 1, 1.9, 1080, 1920)).toEqual(rest);
  expect(objectPose(o, 1, 4.9, 1080, 1920)).toEqual(rest);
});

test('a drop bounces a little and never sinks into the table', () => {
  const [o] = objs('[{"kind":"polaroid","at":1,"dur":0.9}]');
  const rest = REST_Z;
  let landed = false, bounce = 0;
  for (let i = 0; i <= 200; i++) {
    const local = 1 + (0.9 * i) / 200, z = objectPose(o, 0, local, 1080, 1920).z;
    expect(z).toBeGreaterThanOrEqual(rest - 1e-9);
    if (z - rest < 1e-6) landed = true;
    else if (landed) bounce = Math.max(bounce, z - rest);
  }
  expect(landed).toBe(true);
  expect(bounce).toBeGreaterThan(0);
  expect(bounce).toBeLessThanOrEqual(0.04 * DROP_LIFT);
});

test('slides come from their side', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const [hw, hh] = viewHalf(W, H);
    const [l, r, b] = objs('[{"kind":"card","enter":"left","at":0},{"kind":"card","enter":"right","at":0},{"kind":"card","enter":"bottom","at":0}]', W, H);
    expect(objectPose(l, 0, 0, W, H).x).toBeLessThan(-hw);
    expect(objectPose(r, 1, 0, W, H).x).toBeGreaterThan(hw);
    expect(objectPose(b, 2, 0, W, H).y).toBeLessThan(-hh);
  }
});

test('later objects lie on top of earlier ones', () => {
  const list = objs('[{"kind":"postcard"},{"kind":"postcard"},{"kind":"postcard"}]');
  const zs = list.map((o, i) => objectPose(o, i, 5, 1080, 1920).z);
  expect(zs[0]).toBeLessThan(zs[1]);
  expect(zs[1]).toBeLessThan(zs[2]);
});

test('a flip turns over in 3D and lifts while turning', () => {
  const [o] = objs('[{"kind":"postcard","at":0,"flipAt":2,"flipDur":1}]');
  const mid = objectPose(o, 0, 2.5, 1080, 1920), end = objectPose(o, 0, 3, 1080, 1920);
  expect(mid.flip).toBeCloseTo(Math.PI / 2, 9);
  expect(mid.z - REST_Z).toBeGreaterThan(0.15);
  expect(end.flip).toBeCloseTo(Math.PI, 9);
  expect(end.z).toBeCloseTo(REST_Z, 9);
});

test('an exit leaves the frame and stays gone', () => {
  const [o] = objs('[{"kind":"card","at":0,"exit":"right","exitAt":3}]');
  expect(objectPose(o, 0, 3.4, 1080, 1920).x).toBeGreaterThan(o.x);
  expect(objectPose(o, 0, 3.8, 1080, 1920).visible).toBe(false);
  expect(objectPose(o, 0, 9, 1080, 1920).visible).toBe(false);
});

test('contactShadow grows and fades with height', () => {
  const a = contactShadow(0), b = contactShadow(0.2), c = contactShadow(0.8);
  expect(a).toEqual({ scale: 1, opacity: 0.55 });
  expect(a.scale).toBeLessThan(b.scale); expect(b.scale).toBeLessThan(c.scale);
  expect(a.opacity).toBeGreaterThan(b.opacity); expect(b.opacity).toBeGreaterThan(c.opacity);
});

test('objectPose is the same for the same local', () => {
  const list = objs('[{"kind":"postcard","enter":"left","flipAt":1.5},{"kind":"polaroid","at":0.6,"exit":"bottom","exitAt":3}]');
  for (let i = 0; i < 50; i++) {
    const t = i * 0.09;
    list.forEach((o, k) => expect(objectPose(o, k, t, 1080, 1920)).toEqual(objectPose(o, k, t, 1080, 1920)));
  }
  expect(sizeOf(list[0]).w).toBe(1.5);
});
