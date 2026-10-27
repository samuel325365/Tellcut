// The one place three.js is loaded (spec 2026-10-25-brand-preset §6.1): dynamically, so the player's bundle keeps it in a
// chunk of its own that only projects using a type marked `three` download, and Node never runs it unless asked.
import { makeKit, type ThreeKit } from './kit.ts';

let kit: Promise<ThreeKit> | undefined;

export function loadThreeKit(): Promise<ThreeKit> {
  kit ??= Promise.all([
    import('three'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/loaders/SVGLoader.js'),
    import('three/addons/objects/Reflector.js'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('opentype.js'),
    import('clipper-lib'),
  ]).then(([THREE, rb, env, svg, refl, ec, rp, ub, op, ot, cl]) => makeKit(THREE, { RoundedBoxGeometry: rb.RoundedBoxGeometry, RoomEnvironment: env.RoomEnvironment,
    SVGLoader: svg.SVGLoader, Reflector: refl.Reflector, EffectComposer: ec.EffectComposer, RenderPass: rp.RenderPass, UnrealBloomPass: ub.UnrealBloomPass, OutputPass: op.OutputPass,
    opentype: ((ot as { default?: unknown }).default ?? ot) as never,
    clipper: ((cl as { default?: unknown }).default ?? cl) as never }));
  // a failed load (offline chunk) may be tried again
  kit.catch(() => { kit = undefined; });
  return kit;
}
