// ThreeKit (spec 2026-10-25-brand-preset §6.1): what three.js blocks and project fx draw with, handed over as ctx.three. One
// WebGLRenderer for the whole page (a page may hold only about 16 contexts), made on first use: each item renders its scene at
// its own time here and copies the canvas onto its own 2D canvas right away, as the shader blocks do (shader-gl.ts).
// Only types reach this file from three; the module itself comes from three/load.ts.
import type * as T from 'three';
import type { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { Reflector } from 'three/addons/objects/Reflector.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type ClipperLibType from 'clipper-lib';
import type * as Opentype from 'opentype.js';
import { glyphsFrom, type Glyphs } from './glyphs.ts';
import { coverUv } from './uv.ts';

type Three = typeof import('three');
export interface ThreeAddons {
  RoundedBoxGeometry: typeof RoundedBoxGeometry; RoomEnvironment: typeof RoomEnvironment;
  SVGLoader: typeof SVGLoader; Reflector: typeof Reflector;
  EffectComposer: typeof EffectComposer; RenderPass: typeof RenderPass; UnrealBloomPass: typeof UnrealBloomPass; OutputPass: typeof OutputPass;
  /** opentype.js (three's TTFLoader would fetch it from a CDN): TTFs are read with it, see loadFont */
  opentype: typeof Opentype;
  /** Clipper: a letter's overlapping contours unioned by the nonzero rule before three triangulates them (three/glyphs.ts) */
  clipper: typeof ClipperLibType;
}

/** the TTF the 3D letters are extruded from (fonts/files/, downloaded by npm run fonts; no @font-face) */
export const INTER_3D = 'Inter-700.ttf';

export interface ThreeKit {
  THREE: Three;
  /** addons the blocks and fx use */
  addons: ThreeAddons;
  /** Draw `scene` through `camera` at w×h on the one shared renderer; the canvas holds it until the next render. null without
   *  WebGL2. toneMapping (default on, ACES) must be off where the picture shows real footage: false for footage handed over to
   *  a clip (never glows), 'none' for stills that keep their colours but may glow (the wall). */
  render(scene: T.Scene, camera: T.Camera, w: number, h: number, o?: { toneMapping?: boolean | 'neutral' | 'none'; background?: string | null; bloom?: number }): HTMLCanvasElement | null;
  /** A TTF in the player's fonts/files (INTER_3D) as letter shapes to extrude, read once (call it in ready()). */
  loadFont(file: string): Promise<Glyphs>;
  /** RoomEnvironment reflections made once on the shared renderer (scene.environment); null without WebGL2. */
  environment(): T.Texture | null;
  /** A texture fed by hand from a <video> or <img>: update() uploads the element's current picture (call it in late()). Mipmapped,
   *  so a picture seen small or at a slant (a frame receding) does not shimmer. */
  mediaTexture(el: HTMLVideoElement | HTMLImageElement): { texture: T.Texture; update(): void; dispose(): void };
  /** camera distance at which a face `faceH` tall fills a camera of vertical field `fovDeg` exactly: (faceH/2)/tan(fov/2) */
  fillDistance(faceH: number, fovDeg: number): number;
  /** UV repeat and offset that show the part of a srcW×srcH picture a w×h box shows with this crop (as coverPlacement) */
  coverUv: typeof coverUv;
}

/** a glow pass chain for one size: strength set before each render */
export interface Composer { strength: number; setSize(w: number, h: number): void; render(scene: T.Scene, camera: T.Camera): void; dispose?(): void }
/** test seams: what makes the shared renderer (default: a WebGLRenderer on a new canvas; null where WebGL2 fails), the bloom chain,
 *  and the clock (ms) that spaces the retries after a lost context */
export interface KitOptions { makeRenderer?: () => T.WebGLRenderer | null; makeComposer?: (r: T.WebGLRenderer, w: number, h: number) => Composer; now?: () => number }

/** after a lost context, how long (ms) a failed rebuild waits before the next try */
export const RETRY_MS = 1000;

export function makeKit(THREE: Three, addons: ThreeAddons, o: KitOptions = {}): ThreeKit {
  let shared: T.WebGLRenderer | null | undefined;
  // a context was lost: a failed rebuild is tried again (at most every RETRY_MS) instead of turning 3D off for good
  let lost = false, retryAt = 0;
  const now = o.now ?? (() => performance.now());
  const fonts = new Map<string, Promise<Glyphs>>();
  let env: T.Texture | null = null, envFor: T.WebGLRenderer | null = null;
  // the bloom chain (the spike's): render → UnrealBloom (radius 0.5, threshold 0.95) → output; one per renderer and size
  let comp: { c: Composer; r: T.WebGLRenderer; w: number; h: number } | null = null;
  const makeComposer = o.makeComposer ?? ((r: T.WebGLRenderer, w: number, h: number): Composer => {
    const ec = new addons.EffectComposer(r, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }));
    const pass = new addons.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera()), bloom = new addons.UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.5, 0.95);
    ec.addPass(pass); ec.addPass(bloom); ec.addPass(new addons.OutputPass());
    const c: Composer = { strength: 0.3, setSize: (ww, hh) => ec.setSize(ww, hh), render: (scene, camera) => { pass.scene = scene; pass.camera = camera; bloom.strength = c.strength; ec.render(); },
      // the composer frees its two targets, each pass its own (the bloom's mip chain)
      dispose: () => { for (const ps of ec.passes) ps.dispose(); ec.dispose(); } };
    return c;
  });
  const make = o.makeRenderer ?? (() => {
    const canvas = document.createElement('canvas');
    try { return new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true, alpha: true }); } catch { return null; }
  });
  const renderer = () => {
    if (shared !== undefined) return shared;
    if (lost && now() < retryAt) return null;
    const r = make();
    if (r) {
      lost = false;
      r.outputColorSpace = THREE.SRGBColorSpace;
      // a lost context (driver reset) is made again on the next render
      r.domElement.addEventListener('webglcontextlost', () => { if (shared === r) { shared = undefined; lost = true; retryAt = 0; } });
    } else if (lost) { retryAt = now() + RETRY_MS; return null; }
    return (shared = r);
  };
  return {
    THREE, addons, coverUv,
    render(scene, camera, w, h, ro = {}) {
      const r = renderer();
      if (!r) return null;
      const cv = r.domElement as HTMLCanvasElement;
      if (cv.width !== w || cv.height !== h) r.setSize(w, h, false);
      r.toneMapping = ro.toneMapping === false || ro.toneMapping === 'none' ? THREE.NoToneMapping : ro.toneMapping === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
      if (ro.background) r.setClearColor(ro.background, 1); else r.setClearColor(0x000000, 0);
      // a glow only where there is no footage (toneMapping false is the footage's mark): a picture must stay as the clip is
      if ((ro.bloom ?? 0) > 0 && ro.toneMapping !== false) {
        if (!comp || comp.r !== r || comp.w !== w || comp.h !== h) {
          comp?.c.dispose?.();   // the old size's render targets would stay on the GPU
          comp = { c: makeComposer(r, w, h), r, w, h };
        }
        comp.c.strength = ro.bloom!;
        // the composer clears its own target: a clear colour set for the canvas comes out gamma-lifted there, the scene's
        // background does not (the spike's way), so the colour is the scene's background while it renders
        const before = scene.background;
        if (ro.background && !before) scene.background = new THREE.Color(ro.background);
        try { comp.c.render(scene, camera); } finally { scene.background = before; }
      } else r.render(scene, camera);
      return cv;
    },
    mediaTexture(el) {
      // a <video> goes through a 2D canvas: headless Chrome hands WebGL a black picture for a hardware-decoded video, while
      // drawing it on a canvas gives the right one (found by the seam test, 2026-10-25)
      const video = typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement ? el : null;
      const copy = video ? document.createElement('canvas') : null;
      const texture = new THREE.Texture(copy ?? el);
      texture.colorSpace = THREE.SRGBColorSpace;
      // mipmaps (WebGL2 makes them for any size) and anisotropy (clamped to the GPU's): a receding, tilted picture stays calm
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 8;
      let uploaded = false;
      const update = () => {
        if (video && copy) {
          // no picture yet: an upload now would fix the texture's storage at 1×1 (three allocates it once, on the first upload)
          if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
          const w = video.videoWidth, h = video.videoHeight;
          if (copy.width !== w || copy.height !== h) {
            // a new size needs new storage: freed here, made again by the next render
            if (uploaded) texture.dispose();
            copy.width = w; copy.height = h;
          }
          copy.getContext('2d')?.drawImage(video, 0, 0, w, h);
          uploaded = true;
        }
        texture.needsUpdate = true;
      };
      return { texture, update, dispose: () => { texture.dispose(); if (copy) { copy.width = 0; copy.height = 0; } } };
    },
    fillDistance: (faceH, fovDeg) => (faceH / 2) / Math.tan((fovDeg * Math.PI) / 360),
    loadFont(file) {
      let p = fonts.get(file);
      if (!p) {
        p = fetch(new URL(`fonts/files/${file}`, document.baseURI).href)
          .then((r) => { if (!r.ok) throw new Error(`${r.status} fonts/files/${file}`); return r.arrayBuffer(); })
          .then((buf) => glyphsFrom(addons.opentype.parse(buf), THREE, addons.clipper));
        p.catch(() => fonts.delete(file));
        fonts.set(file, p);
      }
      return p;
    },
    environment() {
      const r = renderer();
      if (!r) return null;
      if (env && envFor === r) return env;
      const pm = new THREE.PMREMGenerator(r);
      env = pm.fromScene(new addons.RoomEnvironment(), 0.04).texture; envFor = r;
      pm.dispose();
      return env;
    },
  };
}
