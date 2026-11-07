// The desk's light (spec 2026-11-07-desk3d): a window to one side and above, its frame and leaves projected by a spot light's map,
// the leaves swaying slowly; a soft sky fill. Velvet gets a warm spot from straight above instead, the rest sinking into the dark.
// Plain numbers, a pure function of t (the scene applies them). Values from the 3D spike.
import { SURFACE_LOOK, type Surface } from './surface.ts';

export type Side = 'left' | 'right';
export type Warmth = 'morning' | 'afternoon' | 'golden';
export type Vec3 = [number, number, number];

export interface Rig {
  spot: { pos: Vec3; target: Vec3; color: number; intensity: number; angle: number; penumbra: number; gobo: boolean; goboOffset: [number, number] };
  sky: { color: number; ground: number; intensity: number };
  /** the spike's exposure, applied as a multiplier on both lights (the kit's render has no exposure) */
  exposure: number;
}

/** the window light's colour: a cool morning, a warm afternoon, a low golden sun */
export const WARMTH: Record<Warmth, number> = { morning: 0xdfe8ff, afternoon: 0xffe2bf, golden: 0xffb877 };
const STRENGTH: Record<Surface, { spot: number; sky: number }> = {
  linen: { spot: 110, sky: 0.95 }, marble: { spot: 100, sky: 1 }, concrete: { spot: 110, sky: 0.9 }, velvet: { spot: 105, sky: 0.06 }, none: { spot: 110, sky: 0.95 },
};

export function lightRig(o: { surface: Surface; side: Side; warmth: Warmth }, t: number): Rig {
  const s = STRENGTH[o.surface] ?? STRENGTH.linen, look = SURFACE_LOOK[o.surface] ?? SURFACE_LOOK.linen;
  const sky = { color: 0xf3efe8, ground: 0x6b5a48, intensity: s.sky };
  if (o.surface === 'velvet') {
    // a lamp straight above, a little to the light's side so the objects keep some modelling
    const x = o.side === 'right' ? 0.3 : -0.3;
    return { spot: { pos: [x, 5.5, -0.35], target: [0, 0, 0], color: 0xffe4c4, intensity: s.spot, angle: 0.26, penumbra: 0.9, gobo: false, goboOffset: [0, 0] }, sky, exposure: look.exposure };
  }
  const m = o.side === 'right' ? -1 : 1;
  // the leaves: two slow waves on u, one on v, a few thousandths of the picture
  const goboOffset: [number, number] = [0.012 * Math.sin(0.37 * t) + 0.006 * Math.sin(0.91 * t + 1), 0.008 * Math.sin(0.53 * t + 2)];
  return {
    spot: { pos: [-3.2 * m, 4.6, -2.4], target: [0.1 * m, 0, -0.1], color: WARMTH[o.warmth] ?? WARMTH.afternoon, intensity: s.spot, angle: 0.42, penumbra: 0.55,
      // no table to fall on (none): no window shadow either
      gobo: o.surface !== 'none', goboOffset },
    sky, exposure: look.exposure,
  };
}
