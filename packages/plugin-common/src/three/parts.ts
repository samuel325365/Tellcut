// ThreeKit's ready-made parts (promotion E1; from the brand spikes and the Tellcut film fx): a rounded slab with a picture or a
// clip on its face (common.wall's tile), a glass bar with a canvas face (a prompt bar, a label in space), drifting dust and a
// reflective floor (common.wall's). Each is built once in build()/ready(), posed in draw() from the time alone, and freed with
// its own dispose(). Like kit.ts, only types come from three here: the module is passed in.
import { clamp, mulberry32 } from '@tellcut/engine';
import type * as T from 'three';
import type { Reflector } from 'three/addons/objects/Reflector.js';
import type { coverUv as CoverUv } from './uv.ts';

type Three = typeof import('three');
type Crop = { x: number; y: number; zoom: number };

/** the two geometries of a slab, shared by slabs of the same size (pass one slab's `geometry` to the next) */
export interface SlabGeometry { slab: T.BufferGeometry; face: T.PlaneGeometry; dispose(): void }
export interface SlabOptions {
  /** the picture face's size in scene units (16:9 → h = w × 9 / 16) */
  w: number; h: number;
  /** the face's picture: a still, or kit.mediaTexture(video).texture; none = a dark empty face */
  map?: T.Texture | null;
  /** the slab's thickness (0.045), the glass rim around the face (0.03), the corner radius (0.03), the slab's colour (#0e1117) */
  depth?: number; rim?: number; radius?: number; color?: T.ColorRepresentation;
  /** made to fade (setOpacity below 1); an opaque slab draws faster and sorts better */
  transparent?: boolean;
  /** another slab's geometry of the same size and options, shared instead of made again (freed by the slab that made it) */
  geometry?: SlabGeometry;
}
export interface Slab {
  /** add this to the scene; pose it (position, rotation, scale) */
  group: T.Group;
  slab: T.Mesh<T.BufferGeometry, T.MeshPhysicalMaterial>;
  /** the picture: face.material.map, face.material.color (dim it with color.setScalar) */
  face: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  geometry: SlabGeometry;
  /** crop the face's picture (a srcW × srcH still or clip) by cover, as the stage crops a clip; it sets the map's repeat and offset */
  cover(srcW: number, srcH: number, crop?: Crop): void;
  /** fade (needs `transparent`); hidden at 0 */
  setOpacity(a: number): void;
  dispose(): void;
}

export function videoSlab(THREE: Three, RoundedBox: new (w: number, h: number, d: number, seg: number, r: number) => T.BufferGeometry, coverUv: typeof CoverUv, o: SlabOptions): Slab {
  const depth = o.depth ?? 0.045, rim = o.rim ?? 0.03, own = !o.geometry;
  const geometry: SlabGeometry = o.geometry ?? (() => {
    const slab = new RoundedBox(o.w + 2 * rim, o.h + 2 * rim, depth, 4, o.radius ?? 0.03), face = new THREE.PlaneGeometry(o.w, o.h);
    return { slab, face, dispose: () => { slab.dispose(); face.dispose(); } };
  })();
  const slabMat = new THREE.MeshPhysicalMaterial({ color: o.color ?? 0x0e1117, roughness: 0.22, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, transparent: !!o.transparent });
  const faceMat = new THREE.MeshBasicMaterial({ map: o.map ?? null, color: o.map ? 0xffffff : 0x2a2f38, toneMapped: false, transparent: !!o.transparent });
  const group = new THREE.Group(), slab = new THREE.Mesh(geometry.slab, slabMat), face = new THREE.Mesh(geometry.face, faceMat);
  // a hair in front of the slab's face, so the picture never fights it
  face.position.z = depth / 2 + 0.001;
  group.add(slab, face);
  return {
    group, slab, face, geometry,
    cover(srcW, srcH, crop = { x: 0.5, y: 0.5, zoom: 1 }) {
      const map = face.material.map;
      if (!map) return;
      const uv = coverUv(srcW, srcH, o.w, o.h, crop);
      map.repeat.set(uv.repeat[0], uv.repeat[1]); map.offset.set(uv.offset[0], uv.offset[1]);
    },
    setOpacity(a) { faceMat.opacity = a; slabMat.opacity = a; group.visible = a > 0.003; },
    dispose() { slabMat.dispose(); faceMat.dispose(); if (own) geometry.dispose(); },
  };
}

export interface GlassBarOptions {
  /** the bar's size in scene units */
  w: number; h: number;
  /** thickness (0.06); corner radius (default h / 2: a pill); canvas pixels per scene unit (512); the body's colour, seen at the
   *  rounded rim (#161a22) */
  depth?: number; radius?: number; px?: number; tint?: T.ColorRepresentation;
  /** the glass on the face, top and bottom of a gradient (the spike's dark glass: rgba(40,44,54,.86) → rgba(20,22,28,.9)) */
  fill?: [string, string];
}
export interface GlassBar {
  /** add this to the scene and pose it */
  group: T.Group;
  /** the face's canvas (canvas.width × canvas.height pixels, the bar's w × h) and its texture */
  canvas: HTMLCanvasElement; texture: T.CanvasTexture;
  /** repaint the face: the glass (its fill and a hairline edge), then `content(g, width, height)` in canvas pixels; uploads
   *  it. Call it in ready() (after document.fonts.load) or in draw() only when what it shows changed (a key, as a typed prompt) */
  paint(content?: (g: CanvasRenderingContext2D, w: number, h: number) => void): void;
  /** fade; hidden at 0 */
  setOpacity(a: number): void;
  dispose(): void;
}

/** a rounded rectangle w × h centred on 0, corners r */
function roundedShape(THREE: Three, w: number, h: number, r: number): T.Shape {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function glassBar(THREE: Three, o: GlassBarOptions): GlassBar {
  const depth = o.depth ?? 0.06, r = Math.min(o.radius ?? o.h / 2, o.w / 2, o.h / 2), bevel = Math.min(0.012, depth / 4, r / 3);
  const shape = roundedShape(THREE, o.w, o.h, r);
  // the body: an extruded pill of clear-coated glass; the face: the same outline, flat, a hair in front, with the canvas on it
  const body = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, curveSegments: 12, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
  body.translate(0, 0, -(depth - 2 * bevel) / 2);
  const faceGeo = new THREE.ShapeGeometry(shape, 12);
  const px = Math.min(o.px ?? 512, 4096 / Math.max(o.w, o.h)), canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(o.w * px)); canvas.height = Math.max(2, Math.round(o.h * px));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  // a ShapeGeometry's uv is the shape's own x, y: moved and scaled onto the canvas
  texture.repeat.set(1 / o.w, 1 / o.h); texture.offset.set(0.5, 0.5);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: o.tint ?? 0x161a22, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true });
  const faceMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false });
  const group = new THREE.Group(), face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = depth / 2 + 0.001;
  group.add(new THREE.Mesh(body, bodyMat), face);
  const paint: GlassBar['paint'] = (content) => {
    const g = canvas.getContext('2d');
    if (!g) return;
    const W = canvas.width, H = canvas.height, k = canvas.height / o.h, line = Math.max(2, H * 0.012);
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath(); g.roundRect(line / 2, line / 2, W - line, H - line, Math.max(0, r * k - line / 2));
    const fill = g.createLinearGradient(0, 0, 0, H), [top, bottom] = o.fill ?? ['rgba(40,44,54,0.86)', 'rgba(20,22,28,0.9)'];
    fill.addColorStop(0, top); fill.addColorStop(1, bottom);
    g.fillStyle = fill; g.fill();
    const edge = g.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, 'rgba(255,255,255,0.26)'); edge.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.lineWidth = line; g.strokeStyle = edge; g.stroke();
    g.restore();
    if (content) { g.save(); content(g, W, H); g.restore(); }
    texture.needsUpdate = true;
  };
  paint();
  return {
    group, canvas, texture, paint,
    setOpacity(a) { bodyMat.opacity = a; faceMat.opacity = a; group.visible = a > 0.003; },
    dispose() { body.dispose(); faceGeo.dispose(); bodyMat.dispose(); faceMat.dispose(); texture.dispose(); },
  };
}

/** a soft round dot, white with a falling alpha, for points (the default point is a square) */
export function softDot(THREE: Three): T.DataTexture {
  const px = new Uint8Array(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) { const dx = (i % 32) - 15.5, dy = Math.floor(i / 32) - 15.5, a = clamp(1 - Math.hypot(dx, dy) / 16); px.set([255, 255, 255, Math.round(255 * a * a)], i * 4); }
  const dot = new THREE.DataTexture(px, 32, 32); dot.needsUpdate = true;
  return dot;
}

export interface DustOptions {
  /** how many motes (600), the seed of their places (7), their size in scene units (0.045), colour (#9cc8ff) and opacity (0.35) */
  count?: number; seed?: number; size?: number; color?: T.ColorRepresentation; opacity?: number;
  /** the box they fill: width, height, depth (34, 18, 26) from z = `z` (-20) toward the camera */
  spread?: [number, number, number]; z?: number;
}
export interface Dust {
  /** add this to the scene; points.material.opacity fades it */
  points: T.Points<T.BufferGeometry, T.PointsMaterial>;
  /** drift at time t: a slow turn and rise, the same at the same time */
  pose(t: number): void;
  dispose(): void;
}

export function dust(THREE: Three, o: DustOptions = {}): Dust {
  const n = o.count ?? 600, [sx, sy, sz] = o.spread ?? [34, 18, 26], z0 = o.z ?? -20, rnd = mulberry32(o.seed ?? 7), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * sx; pos[i * 3 + 1] = (rnd() - 0.5) * sy; pos[i * 3 + 2] = z0 + rnd() * sz; }
  const dot = softDot(THREE), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: o.color ?? 0x9cc8ff, size: o.size ?? 0.045, map: dot, transparent: true, opacity: o.opacity ?? 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  return {
    points,
    pose(t) { points.rotation.y = t * 0.01; points.position.y = t * 0.025; },
    dispose() { dot.dispose(); geo.dispose(); mat.dispose(); },
  };
}

export interface FloorOptions {
  /** the floor's height (under what stands on it) and the colour of the veil laid over the reflection (the background) */
  y: number; bg: T.ColorRepresentation;
  /** the frame's size in pixels: the reflection is drawn at half of it */
  frame: [number, number];
  /** how much the veil hides the reflection (0.55), the mirror's tint (#2a2f38), the floor's size (80 × 80) */
  veil?: number; tint?: T.ColorRepresentation; size?: number;
}
export interface Floor {
  /** add this to the scene; group.visible hides it (as the spike, no floor in a push into a picture) */
  group: T.Group; mirror: Reflector; veil: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  dispose(): void;
}

export function floor(THREE: Three, ReflectorType: typeof Reflector, o: FloorOptions): Floor {
  const geo = new THREE.PlaneGeometry(o.size ?? 80, o.size ?? 80);
  const mirror = new ReflectorType(geo, { textureWidth: Math.round(o.frame[0] / 2), textureHeight: Math.round(o.frame[1] / 2), color: o.tint ?? 0x2a2f38 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = o.y;
  const veilMat = new THREE.MeshBasicMaterial({ color: o.bg, transparent: true, opacity: o.veil ?? 0.55 }), veil = new THREE.Mesh(geo, veilMat);
  veil.rotation.x = -Math.PI / 2; veil.position.y = o.y + 0.002;
  const group = new THREE.Group();
  group.add(mirror, veil);
  return { group, mirror, veil, dispose() { geo.dispose(); veilMat.dispose(); mirror.dispose(); } };
}
