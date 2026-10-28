// ThreeKit's parts for a brand's own mark and name in 3D (from the common.logo block, retired 2026-10-28; a project fx builds its
// logo with these now): an SVG of filled shapes extruded in its own colours, any other picture as a plate (12 cut-out layers when
// it has a see-through background, a rounded slab with the picture on its face when not), and a word whose Latin letters are
// extruded from a TTF (kit.loadFont) and whose other characters (Chinese, Japanese) are thick cut slabs. Each is built once in
// ready(), posed in draw(), freed with its own dispose(). Like parts.ts, only types come from three here: the module is passed in.
import type * as T from 'three';
import type { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { Glyphs } from './glyphs.ts';

type Three = typeof import('three');
type RoundedBox = new (w: number, h: number, d: number, seg: number, r: number) => T.BufferGeometry;

export interface MarkOptions {
  /** the mark's height in scene units (1.3) and its depth (0.18) */
  h?: number; depth?: number;
}
export interface Mark {
  /** add this to the scene and pose it: centred on its origin, the face toward +z */
  group: T.Group;
  /** its width and height in scene units */
  w: number; h: number;
  /** extrude: the SVG's shapes; layers: 12 cut-outs of a see-through picture; slab: a rounded slab with the picture on its face */
  kind: 'extrude' | 'layers' | 'slab';
  dispose(): void;
}
export interface PictureMarkOptions extends MarkOptions {
  /** layers (cut-outs following the picture's alpha) or a slab; default: layers when the picture has a see-through background */
  cutout?: boolean;
  /** a slab's sides when the picture's edge colour cannot be read (#2f8cff) */
  side?: T.ColorRepresentation;
}
export interface LoadMarkOptions extends PictureMarkOptions {
  /** always a plate, even for an SVG that could be extruded */
  plate?: boolean;
}

type Fill = { fill: string; shapes: T.Shape[] };
const disposeAll = (parts: Array<{ dispose(): void }>) => () => { for (const p of parts) p.dispose(); };

/** an SVG three cannot extrude cleanly: a picture, text, a clip or a mask inside */
const UNEXTRUDABLE = /<(image|text|clipPath|mask)\b/i;

/** the SVG's filled shapes in their own colours; null when there is nothing to extrude, or when some shape is only a stroke or
 *  fills with a gradient: those would vanish or turn white */
function svgFills(Loader: typeof SVGLoader, svg: string): Fill[] | null {
  if (UNEXTRUDABLE.test(svg)) return null;
  const filled: Fill[] = [];
  for (const path of new Loader().parse(svg).paths) {
    const st = (path.userData as { style?: { fill?: string; stroke?: string } } | undefined)?.style ?? {};
    const fill = st.fill ?? '#000', stroke = st.stroke ?? 'none';
    if (fill === 'none') { if (stroke !== 'none') return null; continue; }
    if (fill.startsWith('url(')) return null;
    const shapes = path.toShapes();
    if (shapes.length) filled.push({ fill, shapes });
  }
  return filled.length ? filled : null;
}

/** An SVG of filled shapes extruded in its own colours, `h` tall and centred; null when it cannot be extruded (a stroke-only
 *  shape, a gradient, text, a picture, a clip or mask inside: make it a pictureMark instead). */
export function svgMark(THREE: Three, Loader: typeof SVGLoader, svg: string, o: MarkOptions = {}): Mark | null {
  const filled = svgFills(Loader, svg);
  if (!filled) return null;
  const H = o.h ?? 1.3, D = o.depth ?? 0.18, parts: Array<{ dispose(): void }> = [];
  const box = new THREE.Box2();
  for (const { shapes } of filled) for (const sh of shapes) for (const pt of sh.getPoints()) box.expandByPoint(pt);
  const size = box.getSize(new THREE.Vector2()), sc = H / (size.y || 1), d = D / sc, inner = new THREE.Group();
  filled.forEach(({ fill, shapes }, k) => {
    // one depth for every shape; each later one a hair in front of the one under it (no z-fighting where they overlap)
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: d, curveSegments: 16, bevelEnabled: true, bevelThickness: d * 0.1, bevelSize: 0.02 / sc, bevelSegments: 3 });
    const mat = new THREE.MeshPhysicalMaterial({ color: fill, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.65, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.z = (k * 0.004) / sc;
    inner.add(m); parts.push(geo, mat);
  });
  const c = box.getCenter(new THREE.Vector2());
  // SVG's y runs down: flip it
  inner.scale.set(sc, -sc, sc);
  inner.position.set(-c.x * sc, c.y * sc, -(D / 2));
  const group = new THREE.Group();
  group.add(inner);
  return { group, w: size.x * sc, h: H, kind: 'extrude', dispose: disposeAll(parts) };
}

/** the picture has a see-through background (alpha below 250 on at least 2 % of a small copy); false when it cannot be read */
export function seeThrough(img: CanvasImageSource): boolean {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  if (!g) return false;
  let d: Uint8ClampedArray;
  try { g.drawImage(img, 0, 0, 32, 32); d = g.getImageData(0, 0, 32, 32).data; } catch { return false; }
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  return clear / (d.length / 4) >= 0.02;
}

/** the picture's edge colour (an opaque slab's sides): the average of the outer ring of a small copy, as #rrggbb; null when it
 *  cannot be read (no 2D canvas, a picture from another origin) */
export function edgeColour(img: CanvasImageSource): string | null {
  const N = 32, c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d');
  if (!g) return null;
  let d: Uint8ClampedArray;
  try { g.drawImage(img, 0, 0, N, N); d = g.getImageData(0, 0, N, N).data; } catch { return null; }
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x > 0 && y > 0 && x < N - 1 && y < N - 1) continue;
    const i = (y * N + x) * 4;
    for (let k = 0; k < 3; k++) sum[k] += d[i + k];
    n++;
  }
  return `#${sum.map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
}

/** A picture (a PNG, a JPG, an SVG that cannot be extruded) as a plate `h` tall in its own aspect, centred: 12 cut-out layers
 *  that follow its alpha (a see-through background), or a rounded slab with the picture on its face and sides in its edge colour.
 *  An SVG <img> is drawn on a canvas first (three cannot upload an SVG image reliably). */
export function pictureMark(THREE: Three, RoundedBoxType: RoundedBox, img: HTMLImageElement | HTMLCanvasElement, o: PictureMarkOptions = {}): Mark {
  const H = o.h ?? 1.3, D = o.depth ?? 0.18, parts: Array<{ dispose(): void }> = [];
  const nw = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth, nh = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight;
  const aspect = (nw || 1) / (nh || 1), w = H * aspect;
  let src: HTMLImageElement | HTMLCanvasElement = img;
  if (img instanceof HTMLImageElement && /\.svg(\?|#|$)|^data:image\/svg/i.test(img.src)) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 / aspect); c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height); src = c;
  }
  const tex = new THREE.Texture(src); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; parts.push(tex);
  const group = new THREE.Group(), layers = o.cutout ?? seeThrough(img);
  if (layers) {
    const geo = new THREE.PlaneGeometry(w, H); parts.push(geo);
    for (let i = 0; i < 12; i++) {
      // the front layer full colour, the ones behind it darker: the cut edge reads as a thickness
      const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.35, color: i === 11 ? 0xffffff : 0x999999, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat); m.position.z = -D / 2 + (D * i) / 11; group.add(m); parts.push(mat);
    }
  } else {
    const geo = new RoundedBoxType(w, H, D, 4, 0.06);
    const sideMat = new THREE.MeshPhysicalMaterial({ color: edgeColour(img) ?? o.side ?? 0x2f8cff, roughness: 0.25, clearcoat: 1 }), face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
    group.add(new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, face, sideMat])); parts.push(geo, sideMat, face);
  }
  return { group, w, h: H, kind: layers ? 'layers' : 'slab', dispose: disposeAll(parts) };
}

/** A logo file (a project path through ctx.media.fileUrl, as `tellcut logo` put it in media/brand/) as a mark: an SVG that can be
 *  extruded is extruded (unless `plate`), anything else a pictureMark; null when the file cannot be read. Call it in ready(). */
export async function loadMark(THREE: Three, Loader: typeof SVGLoader, RoundedBoxType: RoundedBox, url: string, o: LoadMarkOptions = {}): Promise<Mark | null> {
  if (!o.plate && /\.svg(\?|#|$)|^data:image\/svg/i.test(url)) {
    const svg = await fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    const m = svg ? svgMark(THREE, Loader, svg, o) : null;
    if (m) return m;
  }
  const img = new Image(); img.decoding = 'sync'; img.src = url;
  return (await img.decode().then(() => true, () => false)) ? pictureMark(THREE, RoundedBoxType, img, o) : null;
}

export interface WordOptions {
  /** the TTF's letters (await kit.loadFont(INTER_3D) in ready()); without it every character is a cut slab */
  glyphs?: Glyphs | null;
  /** the em in scene units (1.2: Inter's capitals stand about 0.86), the letters' depth (0.14) */
  em?: number; depth?: number;
  /** each letter's colour (#e9ecf1); `colorAt(k)` per character index (k counts spaces too) wins over it */
  color?: T.ColorRepresentation; colorAt?: (k: number) => T.ColorRepresentation;
  /** the gap added between letters, in scene units (-0.012); a space's width (0.3) */
  track?: number; space?: number;
  /** the canvas font of the cut slabs (900 "Noto Sans TC": load it in ready() with document.fonts.load first) */
  font?: string;
}
export interface Letter {
  /** the letter's group: its origin on the baseline at its left edge */
  g: T.Group;
  ch: string;
  /** where it starts along the word, and its advance */
  x: number; w: number;
  /** fade; hidden at 0. A fully faded-in letter is drawn opaque: an extruded letter left transparent sorts its own faces wrongly */
  setOpacity(a: number): void;
}
export interface Word {
  /** add this to the scene: the letters stand on y = 0 from x = 0 to x = w, at their place in it (pose each l.g to animate it) */
  group: T.Group;
  letters: Letter[];
  /** the word's width; its capitals' height */
  w: number; cap: number;
  dispose(): void;
}

/** a Latin character a TTF can draw (Latin-1 and Latin Extended) */
const LATIN = /^[!-ɏ]$/;

/** A word in 3D: Latin letters extruded from `glyphs`, every other character (Chinese, Japanese, a letter the font lacks) a thick
 *  cut slab: 6 layers of a canvas drawing, about a capital's size. */
export function word3d(THREE: Three, text: string, o: WordOptions = {}): Word {
  const em = o.em ?? 1.2, depth = o.depth ?? 0.14, track = o.track ?? -0.012, space = o.space ?? 0.3, glyphs = o.glyphs ?? null;
  const cut = em * 0.77, parts: Array<{ dispose(): void }> = [], group = new THREE.Group(), letters: Letter[] = [];
  let x = 0;
  for (const [k, ch] of [...text].entries()) {
    if (ch === ' ') { x += space; continue; }
    const colour = o.colorAt?.(k) ?? o.color ?? 0xe9ecf1, g = new THREE.Group();
    const shapes = glyphs && LATIN.test(ch) && glyphs.has(ch) ? glyphs.shapes(ch, em) : [];
    let w: number;
    if (shapes.length && glyphs) {
      const geo = new THREE.ExtrudeGeometry(shapes, { depth, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3 });
      const mat = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.32, clearcoat: 0.8, envMapIntensity: 0.5 });
      g.add(new THREE.Mesh(geo, mat)); parts.push(geo, mat);
      w = glyphs.advance(ch, em);
    } else {
      cutSlab(THREE, ch, colour, cut, depth, o.font ?? '900 220px "Noto Sans TC", sans-serif', g, parts);
      // the slab sits where a capital would: from a little under the baseline to about cap height
      for (const m of g.children) m.position.set(cut / 2, em * 0.258, m.position.z);
      w = cut;
    }
    g.position.x = x;
    group.add(g);
    const meshes = g.children as T.Mesh[];
    letters.push({ g, ch, x, w, setOpacity(a) {
      for (const m of meshes) { const mt = m.material as T.Material; mt.opacity = a; mt.transparent = a < 1 || mt.alphaTest > 0; }
      g.visible = a > 0.003;
    } });
    x += w + track;
  }
  return { group, letters, w: letters.length ? x - track : 0, cap: em * 0.717, dispose: disposeAll(parts) };
}

/** a character as 6 cut-out layers of a canvas drawing, `size` square, `depth` deep, centred on the group's origin */
function cutSlab(THREE: Three, ch: string, colour: T.ColorRepresentation, size: number, depth: number, font: string, g: T.Group, parts: Array<{ dispose(): void }>) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  if (x) { x.clearRect(0, 0, 256, 256); x.fillStyle = `#${new THREE.Color(colour).getHexString()}`; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 128, 140); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(size, size); parts.push(tex, geo);
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, transparent: true, roughness: 0.35, color: i === 5 ? 0xffffff : 0x8a8a8a, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.z = (depth * i) / 5; g.add(m); parts.push(mat);
  }
}
