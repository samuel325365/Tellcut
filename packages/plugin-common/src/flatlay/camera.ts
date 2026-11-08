// The desk's camera (spec 2026-11-07-desk3d): by default the spike's slow push-in with a little orbit; or still; or rising to look
// straight down on the whole desk (the ending); and the fly into one object's picture, which ends with the picture covering the
// screen exactly so the main track's clip of the same shot can take over without a seam (flyCrop is that clip's crop), and can
// pull back out. World: y up, the table is y = 0, desk (x, y) is world (x, 0, −y). A pure function of time.
import { clamp, coverPlacement, eIO3, eOut3, type Crop } from '@tellcut/engine';
import { objectPose, type Pose } from './motion.ts';
import { REST_Z, sizeOf, type Obj } from './objects.ts';

export type Vec3 = [number, number, number];
export type CameraMode = 'push' | 'still' | 'top';
export interface Fly { index: number; at: number; dur: number; back: number | null; backDur: number }
export interface CameraPose { pos: Vec3; look: Vec3; up: Vec3; fov: number; focus: number }

/** how long the rise to the top view takes */
export const TOP_DUR = 1.5;
/** the photo face lies this far above its sheet */
export const PIC_LIFT = 0.0015;

/** the distance at which a face `faceH` tall fills a camera of vertical field fovDeg (ThreeKit.fillDistance; here for node) */
export const fillDistance = (faceH: number, fovDeg: number) => (faceH / 2) / Math.tan((fovDeg * Math.PI) / 360);
const span = (t: number, a: number, d: number) => { const q = clamp((t - a) / Math.max(0.05, d)); return q > 1 - 1e-9 ? 1 : q; };
const lerp3 = (a: Vec3, b: Vec3, e: number): Vec3 => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
const len3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const dist3 = (a: Vec3, b: Vec3) => len3([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);

/** an object's picture in the world: its centre, its up and right directions, its size and corners */
export function picWorld(o: Obj, pose: Pose): { center: Vec3; up: Vec3; right: Vec3; w: number; h: number; corners: Vec3[] } {
  const s = sizeOf(o), [px, py, pw, ph] = s.pic;
  const lx = (px + pw / 2 - 0.5) * s.w, ly = (0.5 - (py + ph / 2)) * s.h, c = Math.cos(pose.rotZ), sn = Math.sin(pose.rotZ);
  const center: Vec3 = [pose.x + lx * c - ly * sn, pose.z + s.depth + PIC_LIFT, -(pose.y + lx * sn + ly * c)];
  const up: Vec3 = [-sn, 0, -c], right: Vec3 = [c, 0, -sn], w = pw * s.w, h = ph * s.h;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): Vec3 => [center[0] + (right[0] * a * w + up[0] * b * h) / 2, center[1], center[2] + (right[2] * a * w + up[2] * b * h) / 2]);
  return { center, up, right, w, h, corners };
}

/** the middle of the objects' resting places, where the push-in looks */
function middle(objs: Obj[]): Vec3 {
  if (!objs.length) return [0, 0, 0];
  const x = objs.reduce((a, o) => a + o.x, 0) / objs.length, y = objs.reduce((a, o) => a + o.y, 0) / objs.length;
  return [x, 0, -y];
}

/** the camera straight above the whole desk, every object in the picture with a margin */
function topPose(objs: Obj[], fov: number, W: number, H: number): { pos: Vec3; look: Vec3 } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const o of objs) {
    const s = sizeOf(o), c = Math.cos(o.rot), sn = Math.sin(o.rot);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = (a * s.w) / 2, ly = (b * s.h) / 2, x = o.x + lx * c - ly * sn, y = o.y + lx * sn + ly * c;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) { x0 = -1; x1 = 1; y0 = -1; y1 = 1; }
  const look: Vec3 = [(x0 + x1) / 2, 0, -(y0 + y1) / 2];
  const d = fillDistance(Math.max(y1 - y0, ((x1 - x0) * H) / W) * 1.15, fov);
  return { pos: [look[0], d, look[2]], look };
}

/** the push-in (the spike's): 6.3 → 5.6 units away, a slow orbit to the right and down a little */
function pushPose(look: Vec3, k: number): Vec3 {
  const dist = 6.3 - 0.7 * eOut3(k), az = -0.1 + 0.14 * k, el = 1.02 - 0.06 * k;
  return [look[0] + Math.sin(az) * Math.cos(el) * dist, look[1] + Math.sin(el) * dist, look[2] + Math.cos(az) * Math.cos(el) * dist];
}

/** how far the fly has gone: 0 on the desk, 1 while the picture covers the screen (then the desk is not drawn) */
export function flyCover(fly: Fly | null, local: number): number {
  if (!fly || local <= fly.at) return 0;
  if (fly.back !== null && local >= fly.back) return 1 - eIO3(span(local, fly.back, fly.backDur));
  return eIO3(span(local, fly.at, fly.dur));
}

/** an object's pose with the fly folded in: the picture is on the front, so a fly into a turned-over object turns it face up as the
 *  camera flies in (lifted while it turns, like a flip) and back over as it pulls out. Everything that poses an object (the camera,
 *  the 3D scene, the flat draw without three.js, the words for check) goes through this, so they all agree */
export function posed(o: Obj, index: number, fly: Fly | null, local: number, W: number, H: number): Pose {
  const p = objectPose(o, index, local, W, H);
  if (!fly || fly.index !== index || p.flip <= 0) return p;
  const e = flyCover(fly, local);
  if (e <= 0) return p;
  const flip = p.flip * (1 - e), rest = o.rest ?? REST_Z * (index + 1);
  return { ...p, flip, z: Math.max(p.z, rest + 0.25 * Math.sin(flip)) };
}

export function cameraPose(o: { mode: CameraMode; topAt: number | null; fly: Fly | null; fov: number }, objs: Obj[], local: number, len: number, W: number, H: number): CameraPose {
  const fov = o.fov, centre = middle(objs);
  const k = o.mode === 'still' ? 0 : clamp(local / Math.max(0.1, len));
  let pos = pushPose(centre, k), look = centre;
  const up: Vec3 = [0, 0, -1];   // the desk's "up the picture": also right when looking straight down
  if (o.mode === 'top') {
    const at = o.topAt ?? Math.max(0, len - 2.5);
    if (local > at) {
      const e = eIO3(span(local, at, TOP_DUR)), t = topPose(objs, fov, W, H);
      pos = lerp3(pushPose(centre, clamp(at / Math.max(0.1, len))), t.pos, e); look = lerp3(centre, t.look, e);
    }
  }
  // the subject: the newest object that has come in
  let subject = -1;
  objs.forEach((ob, i) => { if (posed(ob, i, o.fly, local, W, H).visible && (ob.enter === 'none' || local >= ob.at)) subject = i; });
  const fly = o.fly && objs[o.fly.index] ? o.fly : null;
  const e = flyCover(fly, local);
  if (fly && e > 0) {
    const ob = objs[fly.index], pic = picWorld(ob, posed(ob, fly.index, fly, local, W, H));
    const d = fillDistance(Math.min(pic.h, (pic.w * H) / W), fov);
    const end: Vec3 = [pic.center[0], pic.center[1] + d, pic.center[2]];
    const p = lerp3(pos, end, e), l = lerp3(look, pic.center, e), u = lerp3(up, pic.up, e), n = len3(u) || 1;
    return { pos: p, look: l, up: e >= 1 ? pic.up : [u[0] / n, u[1] / n, u[2] / n], fov, focus: dist3(p, pic.center) };
  }
  let focus = dist3(pos, look);
  if (subject >= 0) { const q = posed(objs[subject], subject, fly, local, W, H); focus = dist3(pos, [q.x, q.z, -q.y]); }
  return { pos, look, up, fov, focus };
}

/** the crop of the main-track clip that shows exactly what the covering picture shows: the picture shows the shot cropped to its own
 *  shape (pw×ph); the screen sees the centred part of it of the screen's shape; this finds the crop (x, y, zoom) whose cover
 *  placement in a W×H frame shows that same part of the source */
export function flyCrop(shotCrop: Crop, srcW: number, srcH: number, pw: number, ph: number, W: number, H: number): Crop {
  const b = coverPlacement(srcW, srcH, pw, ph, shotCrop);
  const vh = Math.min(ph, (pw * H) / W), vw = (vh * W) / H, vx = (pw - vw) / 2, vy = (ph - vh) / 2;
  // the source rectangle (fractions of the source) the screen must show
  const u0 = (vx - b.left) / b.width, v0 = (vy - b.top) / b.height, uw = vw / b.width;
  const base = Math.max(W / srcW, H / srcH), zoom = Math.max(1, W / (uw * srcW * base));
  // left edge of the placement as a function of x falls as x grows (cover clamp included): bisect for each axis
  const solve = (want: number, edge: (x: number) => number) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (edge(mid) > want) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const width = srcW * base * zoom, height = srcH * base * zoom;
  const x = solve(-u0 * width, (x) => coverPlacement(srcW, srcH, W, H, { x, y: 0.5, zoom }).left);
  const y = solve(-v0 * height, (y) => coverPlacement(srcW, srcH, W, H, { x: 0.5, y, zoom }).top);
  return { x, y, zoom };
}
