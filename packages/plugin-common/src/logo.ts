// common.logo (spec 2026-10-25-brand-preset §6.2-1, §8) — the brand's ending: the logo lands with a bounce in 3D, slides aside
// while the name rises letter by letter, a light sweeps across, then the tagline and the url come in from a blur. The logo
// (tellcut logo puts it in media/brand/): an SVG three can extrude is extruded in its own colours; anything else (a PNG, a JPG,
// an SVG with text or a picture inside) becomes a plate — 12 layered cut-outs for a see-through picture, a rounded slab with the
// picture on its face for an opaque one. The name: Latin letters extruded from Inter 700 (INTER_3D), other characters (Chinese,
// Japanese) as layered cut-outs. Timings follow the spike's S5 (3-tellcut-film/scene.js), all from `hit`.
import { clamp, eBack, eIO3, eOut3, eOut5, h, type ItemType, lerp } from '@tellcut/engine';
import type * as T from 'three';
import { drawBlurLine, loadLineFaces } from './brand-text.ts';
import { ghostLayer, ghostLines, type GhostLine } from './text.ts';
import type { Glyphs } from './three/glyphs.ts';
import { INTER_3D, type ThreeKit } from './three/kit.ts';

export const LOGO_FOV = 36;
/** the logo's height, the plate's depth, the letters' size and depth, the gap between the logo and the name */
/** LETTER_EM: the em of the 3D letters (Inter's capitals stand about 0.87 high) */
const MARK_H = 1.3, PLATE_D = 0.18, LETTER = 0.86, LETTER_EM = 1.2, LETTER_D = 0.14, GAP = 0.4, TRACK = -0.012, CJK_W = 0.92, SPACE_W = 0.3;
/** seconds the camera takes to push in, from hit - 0.75 */
const CAMERA_S = 5;

interface P { logo: string; mode: 'auto' | 'extrude' | 'plate'; name: string; tagline: string; url: string; hit: number; color: string; ink: string; split: number; bg: string; font: string }
interface Letter { g: T.Group; x: number; w: number }
interface S {
  cv: HTMLCanvasElement; ghost: HTMLElement; p: P; W: number; H: number; kit?: ThreeKit; url: string;
  img: HTMLImageElement | null; svg: string | null; font: Glyphs | null;
  gl?: { scene: T.Scene; cam: T.PerspectiveCamera; mark: T.Group; markW: number; hasMark: boolean; letters: Letter[]; wordW: number; sweep: T.PointLight; parts: Array<{ dispose(): void }> };
}

const LATIN = /^[!-ɏ]$/;
const extOf = (path: string) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();

export const logo: ItemType<P, S> = {
  type: 'common.logo', label: '立體商標出場', category: 'moment', kind: 'overlay', three: true,
  doc: '品牌片的片尾：商標在 3D 裡回彈落定、一道光掃過，往旁邊讓位給一個字一個字立起的名稱，最後標語和網址從模糊變清楚；SVG 直接擠出成立體，PNG／JPG 做成照外形切的立體板，沒有商標只放名稱；英文字母擠出、中文字做成有厚度的切字（商標先用 npm run tellcut -- logo 放進 media/brand/）',
  params: [
    { key: 'logo', label: '商標檔（專案裡的路徑，例如 media/brand/logo.svg；空＝只有名稱）', type: 'string', default: '' },
    { key: 'mode', label: '做法（auto 和 extrude 相同：能擠出的 SVG 就擠出、其他做立體板；plate 一律做立體板）', type: 'enum', options: ['auto', 'extrude', 'plate'], default: 'auto' },
    { key: 'name', label: '名稱（字標）', type: 'string', default: '' },
    { key: 'tagline', label: '標語', type: 'string', default: '' },
    { key: 'url', label: '網址（照原字）', type: 'string', default: '' },
    { key: 'hit', label: '商標落定（項目開始後第幾秒）', type: 'number', min: 0.2, max: 30, step: 0.05, default: 0.75 },
    { key: 'color', label: '主色（名稱從 split 起的字；不透明立體板的側面用圖的邊緣色，讀不到時才用主色）', type: 'color', default: '#2f8cff', theme: 'palette.accent' },
    { key: 'ink', label: '名稱的顏色', type: 'color', default: '#e9ecf1' },
    { key: 'split', label: '名稱從第幾個字起改用主色（0＝不改）', type: 'number', min: 0, max: 40, step: 1, default: 0 },
    { key: 'bg', label: '背景色', type: 'color', default: '#0d0f14', theme: 'palette.ink' },
    { key: 'font', label: '標語和網址的字型', type: 'string', default: 'Inter' },
  ],
  media: () => ({ videos: [], stills: [] }),
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const p = ctx.params;
    return { cv, ghost: ghostLayer(ctx.root), p, W: ctx.W, H: ctx.H, kit: ctx.three as ThreeKit | undefined, url: p.logo ? ctx.media.fileUrl(p.logo) : '', img: null, svg: null, font: null };
  },
  async ready(s) {
    const p = s.p, ext = extOf(p.logo), fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (p.logo) {
      if (ext === 'svg') s.svg = await fetch(s.url).then((r) => (r.ok ? r.text() : null)).catch(() => null);
      const img = new Image(); img.decoding = 'sync'; img.src = s.url;
      // a file that cannot be read: no logo (the name still comes), not a broken picture that throws when drawn
      s.img = (await img.decode().then(() => true, () => false)) ? img : null;
    }
    const chars = [...p.name];
    if (s.kit && chars.some((c) => LATIN.test(c))) s.font = await s.kit.loadFont(INTER_3D).catch(() => null);
    // the name's cut-outs draw in Noto Sans TC 900; the tagline and url (and the name, drawn flat without WebGL) in p.font, their
    // Chinese or Japanese in Noto Sans TC
    if (fonts) await fonts.load(`900 64px "Noto Sans TC"`, p.name || 'A').catch(() => {});
    await loadLineFaces(fonts, [{ weight: 300, family: p.font, text: p.tagline }, { weight: 600, family: p.font, text: p.url }, { weight: 700, family: 'Inter', text: p.name }]);
    if (s.kit) build3d(s, s.kit);
  },
  draw(ctx, s) {
    const { W, H } = ctx;
    if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
    const g = s.cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const name = s.gl && s.kit ? pose(s, ctx.local, W, H) : null, out = s.gl && s.kit ? s.kit.render(s.gl.scene, s.gl.cam, W, H, { toneMapping: 'neutral', background: s.p.bg }) : null;
    if (out) g.drawImage(out, 0, 0, W, H);
    // the words for check and the editor: transparent copies over the canvas
    ghostLines(s.ghost, [out ? name : flat(g, s, ctx.local, W, H), ...words(g, s, ctx.local, W, H, out ? underY(s, H) : H * 0.68)]);
  },
  hide(s) { s.cv.width = 0; s.cv.height = 0; },
  dispose(s) { for (const p of s.gl?.parts ?? []) p.dispose(); s.gl = undefined; },
};

/** the plate's picture: a see-through one (some alpha) or not, read from a small copy */
function seeThrough(img: HTMLImageElement, ext: string): boolean {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  if (!g) return ext !== 'jpg' && ext !== 'jpeg';
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  return clear / (d.length / 4) >= 0.02;
}

/** the picture's edge colour (spec §8.3: an opaque plate's sides): the average of the outer ring of a small copy, as #rrggbb;
 *  null when it cannot be read (no 2D canvas, a picture from another origin) */
export function edgeColour(img: HTMLImageElement): string | null {
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

function build3d(s: S, kit: ThreeKit) {
  const T3 = kit.THREE, p = s.p, parts: Array<{ dispose(): void }> = [];
  const scene = new T3.Scene();
  scene.environment = kit.environment();
  scene.environmentIntensity = 0.5;
  const cam = new T3.PerspectiveCamera(LOGO_FOV, s.W / s.H, 0.05, 100);
  cam.name = 'logo-camera'; scene.add(cam);
  const key = new T3.DirectionalLight(0xffffff, 1.2); key.position.set(3, 4, 6);
  const rim = new T3.DirectionalLight(0x4aa3ff, 1.8); rim.position.set(-5, 2, -4);
  const sweep = new T3.PointLight(0xffffff, 0, 12, 1.5);
  scene.add(key, rim, sweep);
  // the logo
  const mark = new T3.Group(); mark.name = 'logo-mark'; scene.add(mark);
  let markW = 0;
  if (p.logo) {
    const ext = extOf(p.logo), extruded = ext === 'svg' && p.mode !== 'plate' && s.svg && !/<(image|text|clipPath|mask)\b/i.test(s.svg) ? extrude(kit, s.svg, mark, parts) : 0;
    markW = extruded || (s.img ? plate(kit, s.img, ext, p.color, mark, parts) : 0);
  }
  mark.visible = markW > 0;
  // the name
  const letters: Letter[] = [];
  let x = 0;
  for (const [k, ch] of [...p.name].entries()) {
    if (ch === ' ') { x += SPACE_W; continue; }
    const colour = p.split > 0 && k >= p.split ? p.color : p.ink, g = new T3.Group();
    g.name = `logo-letter-${k}`;
    const shapes = s.font && LATIN.test(ch) && s.font.has(ch) ? s.font.shapes(ch, LETTER_EM) : [];
    let w: number;
    if (shapes.length && s.font) {
      const geo = new T3.ExtrudeGeometry(shapes, { depth: LETTER_D, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3 });
      const mat = new T3.MeshPhysicalMaterial({ color: colour, roughness: 0.32, clearcoat: 0.8, transparent: true, envMapIntensity: 0.5 });
      g.add(new T3.Mesh(geo, mat)); parts.push(geo, mat);
      w = s.font.advance(ch, LETTER_EM);
    } else { cutout(kit, ch, colour, g, parts); w = CJK_W; }
    scene.add(g);
    letters.push({ g, x, w });
    x += w + TRACK;
  }
  s.gl = { scene, cam, mark, markW, hasMark: markW > 0, letters, wordW: letters.length ? x - TRACK : 0, sweep, parts };
}

/** the SVG's filled shapes extruded in their own colours, 1.3 high, centred on the group; its width. 0 (a plate instead) when
 *  there is nothing to extrude, or when some shape is only a stroke or fills with a gradient: those would vanish or turn white */
function extrude(kit: ThreeKit, svg: string, mark: T.Group, parts: Array<{ dispose(): void }>): number {
  const T3 = kit.THREE, data = new kit.addons.SVGLoader().parse(svg), inner = new T3.Group();
  const filled: Array<{ fill: string; shapes: T.Shape[] }> = [];
  for (const path of data.paths) {
    const st = (path.userData as { style?: { fill?: string; stroke?: string } } | undefined)?.style ?? {};
    const fill = st.fill ?? '#000', stroke = st.stroke ?? 'none';
    if (fill === 'none') { if (stroke !== 'none') return 0; continue; }
    if (fill.startsWith('url(')) return 0;
    const shapes = kit.addons.SVGLoader.createShapes(path);
    if (shapes.length) filled.push({ fill, shapes });
  }
  if (!filled.length) return 0;
  const box = new T3.Box2();
  for (const { shapes } of filled) for (const sh of shapes) for (const pt of sh.getPoints()) box.expandByPoint(pt);
  const size = box.getSize(new T3.Vector2()), sc = MARK_H / (size.y || 1), d = PLATE_D / sc;
  filled.forEach(({ fill, shapes }, k) => {
    // one depth for every shape; each later one a hair in front of the one under it (no z-fighting where they overlap)
    const geo = new T3.ExtrudeGeometry(shapes, { depth: d, curveSegments: 16, bevelEnabled: true, bevelThickness: d * 0.1, bevelSize: 0.02 / sc, bevelSegments: 3 });
    const mat = new T3.MeshPhysicalMaterial({ color: fill, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.65, side: T3.DoubleSide });
    const m = new T3.Mesh(geo, mat); m.position.z = (k * 0.004) / sc;
    inner.add(m); parts.push(geo, mat);
  });
  const c = box.getCenter(new T3.Vector2());
  // SVG's y runs down: flip it
  inner.scale.set(sc, -sc, sc);
  inner.position.set(-c.x * sc, c.y * sc, -(PLATE_D / 2));
  mark.add(inner);
  return size.x * sc;
}

/** the picture as a plate: 12 cut-out layers (see-through) or a rounded slab (opaque) with sides in the picture's edge colour (`side`
 *  when that cannot be read); its width */
function plate(kit: ThreeKit, img: HTMLImageElement, ext: string, side: string, mark: T.Group, parts: Array<{ dispose(): void }>): number {
  const T3 = kit.THREE, aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1), w = MARK_H * aspect;
  // an SVG drawn on a canvas first (three cannot upload an SVG image reliably)
  let src: HTMLImageElement | HTMLCanvasElement = img;
  if (ext === 'svg') { const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 / aspect); c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height); src = c; }
  const tex = new T3.Texture(src); tex.colorSpace = T3.SRGBColorSpace; tex.needsUpdate = true; parts.push(tex);
  if (seeThrough(img, ext)) {
    const geo = new T3.PlaneGeometry(w, MARK_H); parts.push(geo);
    for (let i = 0; i < 12; i++) {
      const mat = new T3.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.35, color: i === 11 ? 0xffffff : 0x999999, side: T3.DoubleSide });
      const m = new T3.Mesh(geo, mat); m.position.z = -PLATE_D / 2 + (PLATE_D * i) / 11; mark.add(m); parts.push(mat);
    }
  } else {
    const geo = new kit.addons.RoundedBoxGeometry(w, MARK_H, PLATE_D, 4, 0.06);
    const sideMat = new T3.MeshPhysicalMaterial({ color: edgeColour(img) ?? side, roughness: 0.25, clearcoat: 1 }), face = new T3.MeshStandardMaterial({ map: tex, roughness: 0.3 });
    mark.add(new T3.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, face, sideMat])); parts.push(geo, sideMat, face);
  }
  return w;
}

/** a character with no 3D glyph (Chinese, Japanese) as 6 cut-out layers of a canvas drawing, the size of a Latin capital */
function cutout(kit: ThreeKit, ch: string, colour: string, g: T.Group, parts: Array<{ dispose(): void }>) {
  const T3 = kit.THREE, c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  if (x) { x.clearRect(0, 0, 256, 256); x.fillStyle = colour; x.font = '900 220px "Noto Sans TC", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 128, 140); }
  const tex = new T3.CanvasTexture(c); tex.colorSpace = T3.SRGBColorSpace;
  const geo = new T3.PlaneGeometry(CJK_W, CJK_W); parts.push(tex, geo);
  for (let i = 0; i < 6; i++) {
    const mat = new T3.MeshStandardMaterial({ map: tex, alphaTest: 0.4, transparent: true, roughness: 0.35, color: i === 5 ? 0xffffff : 0x8a8a8a, side: T3.DoubleSide });
    const m = new T3.Mesh(geo, mat); m.position.set(CJK_W / 2, LETTER * 0.36, (LETTER_D * i) / 5); g.add(m); parts.push(mat);
  }
}

/** the 3D world at item time `t` (the camera first); where the name stands, for its transparent copy */
function pose(s: S, t: number, W: number, H: number): GhostLine | null {
  const gl = s.gl!, p = s.p, hit = p.hit, i0 = hit - 0.75;
  // whether there is a logo was settled when the scene was built: mark.visible only says whether it shows this frame
  const has = gl.hasMark, named = gl.letters.length > 0;
  const total = (has ? gl.markW : 0) + (has && named ? GAP : 0) + gl.wordW;
  // the camera backs off until everything fits 80 % of the width (a tall frame)
  const tan = Math.tan((LOGO_FOV * Math.PI) / 360), aspect = W / H, need = (total / 0.8) / 2 / (tan * aspect);
  // the slow push in lasts CAMERA_S from the logo's start, wherever `hit` puts it (the default hit ends it at item time 5)
  const x = clamp((t - i0) / CAMERA_S), base = Math.max(8.4, need + 1.2);
  gl.cam.aspect = aspect;
  gl.cam.position.set(lerp(0, 0.12, eOut3(x)), lerp(0.22, 0.1, eOut3(x)), lerp(base, base * (7.3 / 8.4), eOut3(x)));
  const hh = t - hit;
  if (hh > 0 && hh < 0.4) gl.cam.position.z += Math.sin(hh * 40) * 0.03 * Math.exp(-hh * 10);
  gl.cam.lookAt(0, 0.12, 0);
  gl.cam.updateProjectionMatrix();
  // the logo lands, then slides aside for the name
  const gs = eBack(clamp((t - i0) / 0.75), 1.15), slide = named && has ? eIO3(clamp((t - (hit + 0.35)) / 0.8)) : 0;
  const markX = -total / 2 + gl.markW / 2;
  gl.mark.visible = has && t >= i0;
  gl.mark.scale.setScalar(Math.max(0.001, gs));
  gl.mark.position.set(lerp(0, markX, slide), 0.3, 0);
  gl.mark.rotation.set(0.2 * (1 - clamp(gs)) - 0.035 * Math.sin(t * 0.8) * gs, lerp(-1.35, 0, eOut5(clamp((t - i0) / 1.9))) + 0.045 * Math.sin(t * 0.6) * clamp((t - hit) / 0.6), 0);
  // the letters rise one by one
  const x0 = has ? markX + gl.markW / 2 + GAP : -total / 2;
  let shown = 0;
  gl.letters.forEach((l, k) => {
    const q = named && has ? eOut5(clamp((t - (hit + 1.0 + k * 0.055)) / 0.8)) : eOut5(clamp((t - (i0 + 0.2 + k * 0.055)) / 0.8));
    l.g.visible = q > 0; shown = Math.max(shown, q);
    // see-through only while coming in: a transparent extruded letter sorts its own faces wrongly
    for (const m of l.g.children as T.Mesh[]) { const mt = m.material as T.Material; mt.opacity = q; mt.transparent = q < 1 || mt.alphaTest > 0; }
    l.g.position.set(x0 + l.x, (1 - q) * -0.3, (1 - q) * 0.5);
    l.g.rotation.x = (1 - q) * 0.75;
  });
  // the light that sweeps across after the landing
  const sw = clamp((t - (hit + 0.12)) / 1.6);
  gl.sweep.intensity = sw > 0 && sw < 1 ? Math.sin(sw * Math.PI) * 26 : 0;
  gl.sweep.position.set(lerp(-4.5, 4.5, eIO3(sw)), 1.2, 2.2);
  // the name's box where the letters come to rest: baseline 0, capitals LETTER high
  if (!named || !s.p.name.trim()) return null;
  const T3 = s.kit!.THREE, at = (x: number, y: number) => { const v = new T3.Vector3(x, y, 0).project(gl.cam); return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H }; };
  const a = at(x0, 0), b = at(x0 + gl.wordW, LETTER), cap = Math.max(1, a.y - b.y);
  return { text: s.p.name, x: a.x, y: a.y, size: cap / 0.72, family: "'Inter', 'Noto Sans TC', sans-serif", weight: 700, width: b.x - a.x, alpha: shown };
}

/** where the words go: under the logo and the name, in px */
function underY(s: S, H: number): number {
  const gl = s.gl!, T3 = s.kit!.THREE, v = new T3.Vector3(0, -0.55, 0).project(gl.cam);
  return Math.min(H * 0.9, ((1 - v.y) / 2) * H + H * 0.06);
}

/** the tagline and the url, from a blur */
function words(g: CanvasRenderingContext2D, s: S, t: number, W: number, H: number, y: number): GhostLine[] {
  const p = s.p, k = Math.min(W, H) / 1080, family = `'${p.font}', 'Noto Sans TC', sans-serif`;
  return [drawBlurLine(g, { text: p.tagline, x: W / 2, y, size: 46 * k, family, weight: 300, color: p.ink, align: 'center' }, t, p.hit + 2.0),
    drawBlurLine(g, { text: p.url, x: W / 2, y: y + 70 * k, size: 30 * k, family, weight: 600, color: p.color, align: 'center', spacing: 2 * k }, t, p.hit + 2.6)];
}

/** no WebGL2: the logo picture and the name, flat and centred */
function flat(g: CanvasRenderingContext2D, s: S, t: number, W: number, H: number): GhostLine {
  const p = s.p, k = Math.min(W, H) / 1080, a = clamp((t - (p.hit - 0.75)) / 0.75);
  g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = a;
  if (s.img) { const hh = 220 * k, ww = hh * ((s.img.naturalWidth || 1) / (s.img.naturalHeight || 1)); g.drawImage(s.img, (W - ww) / 2, H * 0.42 - hh, ww, hh); }
  g.font = `700 ${96 * k}px 'Inter', 'Noto Sans TC', sans-serif`; g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if (p.name) g.fillText(p.name, W / 2, H * 0.42 + 130 * k);
  g.restore();
  return { text: p.name, x: W / 2, y: H * 0.42 + 130 * k, size: 96 * k, family: "'Inter', 'Noto Sans TC', sans-serif", weight: 700, align: 'center', alpha: a };
}
