// How the desk's objects move (spec 2026-11-07-desk3d): a drop from above that floats down, settles with a little bounce and a
// turn that overshoots, a slide in from a side, a real flip about the long edge that lifts the object while it turns, an exit, and
// the stack (each later object lies a sheet's thickness above the one before). Written curves, a pure function of time.
import { clamp, eBack, eIn3, eIO3, eOut3 } from '@tellcut/engine';
import { EXIT_DUR, REST_Z, sizeOf, type Enter, type Obj } from './objects.ts';

export { REST_Z };

/** z, height above the table; flip, the turn about the long edge (0 face up, π back up); tilt, the drop's lean */
export interface Pose { x: number; y: number; z: number; rotZ: number; flip: number; tilt: number; visible: boolean }

/** how high a drop starts */
export const DROP_LIFT = 1.6;
/** the part of a drop spent falling; the rest is the bounce */
const FALL = 0.78;
const BOUNCE = 0.035 * DROP_LIFT;
/** progress 0..1 over [a, a + d], snapped to 1 within float error (1.9 − 1 is 0.8999…: a landing must be exact) */
export const span = (t: number, a: number, d: number) => { const q = clamp((t - a) / Math.max(0.05, d)); return q > 1 - 1e-9 ? 1 : q; };

/** half the desk the resting camera sees, [across, up], in desk units */
export const viewHalf = (W: number, H: number): [number, number] => (W > H ? [3.0, 1.6] : [1.2, 2.0]);

/** where an object starts (enter) or ends up (exit) outside the picture, as an offset from its resting place */
function outside(dir: Enter, o: Obj, W: number, H: number): { dx: number; dy: number } {
  const [hw, hh] = viewHalf(W, H), s = sizeOf(o), far = 1.2 * Math.max(s.w, s.h);
  if (dir === 'left') return { dx: -hw - far - o.x, dy: 0 };
  if (dir === 'right') return { dx: hw + far - o.x, dy: 0 };
  if (dir === 'bottom') return { dx: 0, dy: -hh - far - o.y };
  return { dx: 0, dy: 0 };
}

export function objectPose(o: Obj, index: number, local: number, W: number, H: number): Pose {
  const rest = o.rest ?? REST_Z * (index + 1);
  const pose: Pose = { x: o.x, y: o.y, z: rest, rotZ: o.rot, flip: 0, tilt: 0, visible: true };
  if (o.enter !== 'none' && local < o.at) return { ...pose, visible: false };
  const q = o.enter === 'none' ? 1 : span(local, o.at, o.dur);
  if (q < 1) {
    if (o.enter === 'drop') {
      // falling (slowing as paper does in air), then one small hop; the turn and the drift overshoot and come back
      const f = clamp(q / FALL), e = eBack(q, 1.2);
      pose.z = rest + (q < FALL ? DROP_LIFT * Math.pow(1 - eOut3(f), 1.6) : BOUNCE * Math.sin((Math.PI * (q - FALL)) / (1 - FALL)));
      pose.x = o.x - 0.25 * (1 - e); pose.y = o.y + 0.5 * (1 - e);
      pose.rotZ = o.rot - 0.9 * (1 - e); pose.tilt = 0.5 * (1 - e);
    } else {
      const { dx, dy } = outside(o.enter, o, W, H), e = eOut3(q);
      pose.x = o.x + dx * (1 - e); pose.y = o.y + dy * (1 - e);
      pose.z = rest + 0.03 * (1 - e);   // carried just above the pile while it slides over it
      pose.rotZ = o.rot + 0.25 * (1 - e) * (o.enter === 'right' ? 1 : -1);
    }
  }
  if (o.flipAt !== null && local > o.flipAt) {
    const f = span(local, o.flipAt, o.flipDur);
    pose.flip = Math.PI * eIO3(f);
    if (f < 1) pose.z = Math.max(pose.z, rest + 0.25 * Math.sin(Math.PI * f));
  }
  if (o.exit && local >= o.exitAt) {
    const x = span(local, o.exitAt, EXIT_DUR);
    if (x >= 1) return { ...pose, visible: false };
    const e = eIn3(x);
    if (o.exit === 'drop') pose.z += DROP_LIFT * 2 * e;   // lifted away out of the picture
    else { const { dx, dy } = outside(o.exit, o, W, H); pose.x += dx * e; pose.y += dy * e; pose.z += 0.03 * e; }
  }
  return pose;
}

/** the object lies still at `local`: come in, not turning over, not leaving (only then are its words where check expects them) */
export function atRest(o: Obj, local: number): boolean {
  if (o.enter !== 'none' && local < o.at + Math.max(0.05, o.dur)) return false;
  if (o.flipAt !== null && local > o.flipAt && local < o.flipAt + Math.max(0.05, o.flipDur)) return false;
  return !(o.exit && local >= o.exitAt);
}

/** the soft shadow right under an object: larger and fainter the higher it is above the table */
export const contactShadow = (lift: number) => ({ scale: 1 + Math.max(0, lift) * 1.6, opacity: 0.55 / (1 + Math.max(0, lift) * 3) });
