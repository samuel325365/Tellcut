// common.dolly (spec 2026-10-25-brand-preset §6.2-2) — a 3D frame push / pull: a clip on the face of a frame floating in space.
// dir in pushes the camera until the face is exactly the screen on the item's last frame, where the main-track clip carries on;
// dir out starts exactly full frame (where the clip stopped) and pulls back. The handoff is seamless when the face shows the same
// source time, crop and grade as the clip (c.dolly fills them in): the face is the picture's aspect, the camera sits at
// fillDistance with no tilt, tone mapping is off and the texture is uploaded in late(), after the media pool seeked the video.
import { clamp, coverPlacement, eIO3, h, type ItemType, type MediaRef } from '@tellcut/engine';
import type * as T from 'three';
import type { ThreeKit } from './three/kit.ts';

/** the camera's vertical field of view (degrees) */
export const FOV = 35;
/** how much farther than full frame the camera starts (in) or ends (out) */
const FAR = 3.2;

interface P { source: string; from: number; dir: 'in' | 'out'; x: number; y: number; zoom: number; grade: string; tilt: number; depth: number; bg: string; accent: string }
interface S {
  cv: HTMLCanvasElement; holder: HTMLElement; img: HTMLImageElement | null;
  gl?: { scene: T.Scene; cam: T.PerspectiveCamera; frame: T.Mesh; face: T.MeshBasicMaterial; parts: Array<{ dispose(): void }> };
  tex?: { texture: T.Texture; update(): void; dispose(): void; el: unknown } | null;
}

/** 0 = far, 1 = full frame; exactly 1 on the last frame (in) or the first (out) */
export function dollyProgress(dir: 'in' | 'out', local: number, dur: number, fps: number): number {
  const e = eIO3(clamp(local / Math.max(dur - 1 / fps, 1e-6)));
  return dir === 'out' ? 1 - e : e;
}

const kindOf = (ctx: { project: { sources: Record<string, { kind?: string }> } }, source: string) =>
  !source ? 'none' : ctx.project.sources[source]?.kind === 'image' ? 'image' : 'video';
const videoRef = (p: P, dur: number): MediaRef => ({ source: p.source, in: Number(p.from) || 0, out: (Number(p.from) || 0) + dur, speed: 1, interp: 'none' });
const stillRef = (p: P, W: number, H: number) => ({ source: p.source, t: 0, w: Math.max(W, H) });

export const dolly: ItemType<P, S> = {
  type: 'common.dolly', label: '3D 畫框推拉', category: 'frame', kind: 'overlay', three: true,
  doc: '3D 畫框推拉：片段貼在空間裡一個有厚度的畫框正面；dir in 鏡頭推到畫框剛好填滿畫面（最後一格滿版，接著主軌片段），dir out 從滿版開始往後拉，畫框傾斜退遠；實拍和 3D 之間的無縫轉場，用 c.dolly(片段 id, { dir, len }) 放才會接得剛好',
  params: [
    { key: 'source', label: '畫框上的素材（影片或照片；空＝畫一張漸層佔位）', type: 'source-ref', default: '' },
    { key: 'from', label: '素材起點（項目開始時是素材的第幾秒）', type: 'number', min: 0, max: 36000, step: 0.01, default: 0 },
    { key: 'dir', label: '方向（in 推進到滿版接主軌；out 從滿版往後拉）', type: 'enum', options: ['in', 'out'], default: 'in' },
    { key: 'x', label: '焦點 x（交接那一格片段的 crop）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '焦點 y（交接那一格片段的 crop）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'zoom', label: '放大（交接那一格片段的 crop）', type: 'number', min: 1, max: 5, step: 0.01, default: 1 },
    { key: 'grade', label: '調色（片段的 grade，畫面套同一個濾鏡）', type: 'string', default: '' },
    { key: 'tilt', label: '傾斜（離滿版最遠時，度）', type: 'number', min: 0, max: 60, step: 1, default: 18 },
    { key: 'depth', label: '厚度（畫框正面高的比例）', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.04 },
    { key: 'bg', label: '背景色', type: 'color', default: '#101014', theme: 'palette.ink' },
    { key: 'accent', label: '佔位漸層的顏色（沒有素材時）', type: 'color', default: '#ff6b2c', theme: 'palette.accent' },
  ],
  media(item, project) {
    const p = item.params as unknown as P;
    if (!p.source) return { videos: [], stills: [] };
    if (project.sources[p.source]?.kind === 'image') return { videos: [], stills: [stillRef(p, project.meta.width, project.meta.height)] };
    return { videos: [videoRef(p, item.end - item.start)], stills: [] };
  },
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    cv.dataset.id = ctx.item.id;
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    // the clip's <video> lives here unseen: the pool seeks it, the face shows it
    const holder = h('div', null, null, ctx.root);
    Object.assign(holder.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: '0', pointerEvents: 'none' });
    const p = ctx.params, img = kindOf(ctx, p.source) === 'image' ? document.createElement('img') : null;
    if (img) { img.decoding = 'sync'; img.src = ctx.media.stillUrl(stillRef(p, ctx.W, ctx.H)); }
    return { cv, holder, img };
  },
  async ready(s) { if (s.img) await s.img.decode().catch(() => {}); s.tex?.update(); },
  draw(ctx, s) {
    const kind = kindOf(ctx, ctx.params.source);
    const el = kind === 'video' ? ctx.media.video(videoRef(ctx.params, ctx.dur), s.holder, ctx.local) : null;
    // a video's picture is only right after the sync: it is drawn in late()
    if (kind !== 'video') paint(ctx, s, el);
  },
  late(ctx, s) {
    if (kindOf(ctx, ctx.params.source) !== 'video') return;
    const el = s.holder.querySelector('video');
    paint(ctx, s, el, true);
  },
  hide(s) {
    s.tex?.dispose(); s.tex = undefined;
    for (const x of s.gl?.parts ?? []) x.dispose();
    s.gl = undefined;
    s.cv.width = 0; s.cv.height = 0;
  },
  dispose(s) { s.tex?.dispose(); s.tex = undefined; for (const x of s.gl?.parts ?? []) x.dispose(); s.gl = undefined; },
};

type Ctx = Parameters<NonNullable<typeof dolly.draw>>[0];

function paint(ctx: Ctx, s: S, video: HTMLVideoElement | null, upload = false) {
  const { W, H, params: p } = ctx, kit = ctx.three as ThreeKit | undefined;
  if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
  s.cv.style.filter = (p.grade && ctx.grades[p.grade]) || '';
  const c2 = s.cv.getContext('2d');
  const src = ctx.project.sources[p.source] as { width?: number; height?: number } | undefined;
  const srcW = src?.width || W, srcH = src?.height || H, crop = { x: p.x, y: p.y, zoom: p.zoom };
  const el: HTMLVideoElement | HTMLImageElement | null = video ?? s.img;
  const gl = kit ? scene(kit, ctx, s) : undefined;
  if (kit && gl) {
    texture(kit, ctx, s, el, gl.face);
    if (upload) s.tex?.update();
    const uv = kit.coverUv(srcW, srcH, W, H, crop);
    s.tex!.texture.repeat.set(uv.repeat[0], uv.repeat[1]);
    s.tex!.texture.offset.set(uv.offset[0], uv.offset[1]);
    place(kit, gl, ctx);
    const out = kit.render(gl.scene, gl.cam, W, H, { toneMapping: false, background: p.bg });
    if (out && c2) { c2.clearRect(0, 0, W, H); c2.drawImage(out, 0, 0, W, H); return; }
  }
  // no WebGL2: the picture flat, placed as the stage places the clip
  if (!c2) return;
  c2.clearRect(0, 0, W, H);
  if (el) { const b = coverPlacement(srcW, srcH, W, H, crop); c2.drawImage(el, b.left, b.top, b.width, b.height); }
  else { const g = c2.createLinearGradient(0, 0, W, H); g.addColorStop(0, p.bg); g.addColorStop(1, p.accent); c2.fillStyle = g; c2.fillRect(0, 0, W, H); }
}

function scene(kit: ThreeKit, ctx: Ctx, s: S): NonNullable<S['gl']> {
  if (s.gl) return s.gl;
  const T3 = kit.THREE, { W, H, params: p } = ctx;
  const sc = new T3.Scene();
  const cam = new T3.PerspectiveCamera(FOV, W / H, 0.01, 100);
  const geo = new T3.BoxGeometry(W / H, 1, Math.max(1e-4, p.depth));
  const face = new T3.MeshBasicMaterial({ toneMapped: false });
  const side = new T3.MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.45, metalness: 0.35 });
  // BoxGeometry groups: +x, -x, +y, -y, +z (the face), -z
  const frame = new T3.Mesh(geo, [side, side, side, side, face, side]);
  frame.name = 'dolly-frame';
  const amb = new T3.AmbientLight(0xffffff, 0.6), key = new T3.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 3, 4);
  sc.add(frame, amb, key);
  return (s.gl = { scene: sc, cam, frame, face, parts: [geo, face, side] });
}

function texture(kit: ThreeKit, ctx: Ctx, s: S, el: HTMLVideoElement | HTMLImageElement | null, face: T.MeshBasicMaterial) {
  const want = el ?? 'placeholder';
  if (s.tex && s.tex.el === want) return;
  s.tex?.dispose();
  // a photo is uploaded now (and again once decoded, in ready); a video in late(), after the sync
  if (el) { const t = kit.mediaTexture(el); s.tex = { ...t, el }; if (el instanceof HTMLImageElement) t.update(); }
  else {
    // no source: a gradient from the background to the accent (the golden pictures, a dolly just dragged in)
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const c2 = cv.getContext('2d');
    if (c2) { const g = c2.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, ctx.params.bg); g.addColorStop(1, ctx.params.accent); c2.fillStyle = g; c2.fillRect(0, 0, 64, 64); }
    const texture = new kit.THREE.CanvasTexture(cv);
    texture.colorSpace = kit.THREE.SRGBColorSpace;
    s.tex = { texture, update: () => { texture.needsUpdate = true; }, dispose: () => texture.dispose(), el: want };
  }
  face.map = s.tex!.texture;
  face.needsUpdate = true;
}

/** the camera before the frame (spec: the camera is set first); at progress 1 both are exactly the full-frame pose */
function place(kit: ThreeKit, gl: NonNullable<S['gl']>, ctx: Ctx) {
  const p = ctx.params, k = dollyProgress(p.dir, ctx.local, ctx.dur, ctx.fps), away = 1 - k;
  const full = kit.fillDistance(1, FOV), front = Math.max(1e-4, p.depth) / 2, tilt = (p.tilt * Math.PI) / 180;
  gl.cam.aspect = ctx.W / ctx.H;
  gl.cam.position.set(0, 0, front + full + (FAR - 1) * full * away);
  gl.cam.rotation.set(0, 0, 0);
  gl.cam.updateProjectionMatrix();
  // + 0: no -0 when the frame faces the camera
  gl.frame.rotation.set(-0.3 * tilt * away + 0, tilt * away + 0, 0);
}
