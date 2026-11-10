// common.flatlay (spec 2026-11-07-desk3d): a real 3D desk drawn with three.js. Postcards, polaroids, a framed photo, an old TV or a
// card lie on linen, marble, concrete or velvet under a window's light (the frame and leaves projected by a spot light, the leaves
// swaying), with soft VSM shadows and a light depth of field. Each object's picture plays its own shot (silent, like the cell
// frames); objects drop in, slide in, turn over in 3D (a postcard's back is written one character at a time, then the postmark
// lands); the camera pushes in slowly, rises to look straight down, or flies into one picture until it covers the screen exactly,
// where the main track's clip of the same shot can take over (flatlayClip gives that clip's place and crop).
// draw() is a pure function of t: every pose comes from flatlay/motion.ts and flatlay/camera.ts, the back's texture is repainted
// whenever what it shows at t differs from what it holds. Video frames are uploaded in draw (playback) and again in late (the exact
// frame after a seek, and export).
import type * as T from 'three';
import { clamp, coverPlacement, type Crop, type ItemCtx, type ItemType, type MediaRef, type ParamDef, type Project, type StillRef } from '@tellcut/engine';
import { cellLive, cellRef, type CellShot } from './cells.ts';
import { HAND } from './hand.ts';
import { imagesReady } from './window.ts';
import type { ThreeKit } from './three/kit.ts';
import { cameraPose, flyCover, flyCrop, PIC_LIFT, posed, type CameraMode, type Fly } from './flatlay/camera.ts';
import { lightRig } from './flatlay/light.ts';
import { atRest, contactShadow, REST_Z, viewHalf, type Pose } from './flatlay/motion.ts';
import { EXIT_DUR, faceSource, KINDS, parseObjects, picAspect, REST_Z as REST, sheetGeometry, sheetZ, sizeOf, type FlatlayParams, type Obj } from './flatlay/objects.ts';
import { sentenceCps } from './handwrite.ts';
import { BACK_CPS, BACK_FADE, MARK_LAND, paintBack, paintBackBase, paintedText, paintFront, paintPlaceholder, PRINT, type Word } from './flatlay/paper.ts';
import { goboLayers, goboStep, paintGobo, paintSurface, SURFACE_LOOK, type GoboLayers, type Surface } from './flatlay/surface.ts';

export type { FlatlayParams } from './flatlay/objects.ts';

const ENTERS = ['drop', 'left', 'right', 'bottom', 'none'];
const PARAMS: ParamDef[] = [
  { key: 'kind', label: '東西（postcard 明信片、polaroid 拍立得、photo 相框、tv 老電視、card 卡片）', type: 'enum', options: KINDS, default: 'postcard' },
  { key: 'shot', label: '畫面（素材|素材秒數|x,y,zoom|still；空＝示意圖）', type: 'string', default: '' },
  { key: 'place', label: '地名（明信片下緣）', type: 'string', default: 'Fontana di Trevi' },
  { key: 'year', label: '年份（明信片右下）', type: 'string', default: '2024' },
  { key: 'caption', label: '手寫字（拍立得、卡片、相框的下緣；電視的牌子）', type: 'string', default: '那年夏天' },
  { key: 'back', label: '背面的手寫（一行一句：開始秒-結束秒|字，項目內的秒數）', type: 'text', default: '0.5-1.6|謝謝你\n1.7-2.8|那時候願意出發' },
  { key: 'enter', label: '進場（drop 從上面落下、left／right／bottom 滑進來、none 一開始就在）', type: 'enum', options: ENTERS, default: 'drop' },
  { key: 'at', label: '進場秒數（項目內）', type: 'number', min: 0, max: 600, step: 0.1, default: 0.2 },
  { key: 'flipAt', label: '翻面秒數（−1＝不翻）', type: 'number', min: -1, max: 600, step: 0.1, default: -1 },
  { key: 'mark', label: '郵戳（上緣字|下緣字|日期；空＝不蓋）', type: 'string', default: 'ROMA|羅馬|2024.05.12' },
  { key: 'markAt', label: '郵戳落下秒數（項目內）', type: 'number', min: 0, max: 600, step: 0.1, default: 1.2 },
  { key: 'objects', label: '多樣東西（JSON 陣列，每樣的鍵同上，另有 x、y（桌面單位，桌子中央 0，y 朝上；9:16 看得到左右 ±1.2、上下 ±2.0，16:9 是 ±3.0、±1.6；明信片寬 1.5）、rot（弧度，正＝逆時針，0.1 約 6°）、portrait、dur、exit、exitAt（沒寫＝項目結束時剛好離開）、flipDur、stamp；空或 []＝只放上面那一樣）', type: 'text', default: '' },
  { key: 'fly', label: '飛進畫面（JSON { index, at, dur, back, backDur }；back 是拉回的秒數，null 不拉回；空＝不飛）', type: 'json', default: null },
  { key: 'surface', label: '桌面（linen 亞麻、marble 大理石、concrete 水泥、velvet 絨布、none 透明）', type: 'enum', options: ['linen', 'marble', 'concrete', 'velvet', 'none'], default: 'linen' },
  { key: 'side', label: '窗在哪一邊', type: 'enum', options: ['left', 'right'], default: 'left' },
  { key: 'warmth', label: '光的顏色（morning 早晨、afternoon 午後、golden 黃昏）', type: 'enum', options: ['morning', 'afternoon', 'golden'], default: 'afternoon' },
  { key: 'camera', label: '鏡頭（push 慢慢推近、still 不動、top 最後升到正上方）', type: 'enum', options: ['push', 'still', 'top'], default: 'push' },
  { key: 'topAt', label: '升到正上方的秒數（−1＝結束前 2.5 秒）', type: 'number', min: -1, max: 600, step: 0.1, default: -1 },
  { key: 'dof', label: '景深（0＝關，1 最淺）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.35 },
  { key: 'seed', label: '桌面紋理的種子', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
];
const DEFAULTS = Object.fromEntries(PARAMS.map((d) => [d.key, d.default])) as unknown as FlatlayParams;

/** the camera's vertical field: a tall frame needs a wider one, or a postcard 1.5 units wide would not fit across it */
export const flatlayFov = (W: number, H: number) => (W >= H ? 30 : 40);

/** the fly as written: JSON text or an object; null when there is none, with why when it is there but cannot be read. A pull back
 *  written before the fly is over waits for it (from the screen fully covered, never a jump) */
export function readFly(v: unknown): { fly: Fly | null; error: string | null } {
  let f = v;
  if (typeof v === 'string') {
    if (!v.trim()) return { fly: null, error: null };
    try { f = JSON.parse(v); } catch (e) { return { fly: null, error: `fly JSON：${(e as Error).message}` }; }
  }
  if (f === null || f === undefined) return { fly: null, error: null };
  if (typeof f !== 'object' || Array.isArray(f)) return { fly: null, error: 'fly JSON：not an object { index, at, dur, back, backDur }' };
  const r = f as Record<string, unknown>, n = (x: unknown, d: number) => (x === undefined || x === null || x === '' || !Number.isFinite(Number(x)) ? d : Number(x));
  const at = n(r.at, 0), dur = Math.max(0.05, n(r.dur, 1.2));
  return { fly: { index: Math.max(0, Math.round(n(r.index, 0))), at, dur, back: r.back === undefined || r.back === null || r.back === '' ? null : Math.max(at + dur, n(r.back, 0)), backDur: Math.max(0.05, n(r.backDur, 1)) }, error: null };
}
export const parseFly = (v: unknown): Fly | null => readFly(v).fly;

type MediaTex = ReturnType<ThreeKit['mediaTexture']>;
interface Thing {
  o: Obj; size: ReturnType<typeof sizeOf>; source: 'video' | 'still' | 'placeholder';
  /** the flip turns about the object's long side: x for a wide one, y for a tall one */
  flipX: boolean;
  group: T.Group; spin: T.Group; turn: T.Group; sheet: T.Group; shadow: T.Mesh;
  face: T.Mesh; overlay: T.Mesh; faceMat: T.MeshPhysicalMaterial; overlayMat: T.MeshBasicMaterial;
  frontTex: T.CanvasTexture; frontWords: Word[]; backTex: T.CanvasTexture; backWords: Word[]; backKey: string;
  /** the back's paper and stamp (paintBackBase), painted once per stamp state, under the words written each frame */
  backBase: HTMLCanvasElement | null; backBaseReady: boolean;
  placeholder: T.CanvasTexture; showing: T.Texture;
  /** prev: the texture of a video just replaced, kept on the face until the new video has a picture */
  vt: MediaTex | null; el: HTMLVideoElement | null; prev: MediaTex | null;
  still: HTMLImageElement | null; stillTex: T.Texture | null; stamp: HTMLImageElement | null;
  pose: Pose | null;
}
interface S {
  c: HTMLCanvasElement; holder: HTMLDivElement; three: ThreeKit;
  scene: T.Scene; camera: T.PerspectiveCamera; spot: T.SpotLight; sky: T.HemisphereLight; gobo: T.CanvasTexture | null;
  /** the gobo's still frame and swaying leaves, and where the leaves were last painted (repainted when the sway moves them) */
  goboLayers: GoboLayers | null; goboAt: string;
  items: Thing[]; fly: Fly | null; mode: CameraMode; topAt: number | null; surface: Surface; side: 'left' | 'right'; warmth: 'morning' | 'afternoon' | 'golden';
  dof: number; error: string | null; dead: boolean;
  geos: Set<T.BufferGeometry>; mats: Set<T.Material>; texs: Set<T.Texture>;
  project: Project; fontsText: string;
  /** a scratch vector for toScreen (called for every corner of every word, every frame) */
  v3: T.Vector3;
  /** the depth of field the frame's draw posed, rendered again by late (same t) */
  lastDof: ReturnType<typeof dofOf>;
  /** without three.js (its chunk failed to load): the objects drawn flat on the desk's colour, no 3D state at all */
  flat: FlatThing[] | null;
}
interface FlatThing {
  o: Obj; size: ReturnType<typeof sizeOf>; source: 'video' | 'still' | 'placeholder'; flipX: boolean;
  front: HTMLCanvasElement; placeholder: HTMLCanvasElement; still: HTMLImageElement | null; back: HTMLCanvasElement | null; backKey: string;
}

/** the picture covers the screen and a main-track clip can show it (a video): the desk is not drawn. A still or the stand-in has no
 *  clip to take over, so the covering picture stays drawn */
function handedOver(s: S, local: number): boolean {
  if (!s.fly || flyCover(s.fly, local) < 1) return false;
  return (s.flat ?? s.items)[s.fly.index]?.source === 'video';
}

/** the soft shadow right under an object: a blurred rounded rectangle, drawn once */
function shadowCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.filter = 'blur(18px)'; g.fillStyle = 'rgba(0,0,0,1)';
    g.beginPath(); g.roundRect?.(48, 48, 160, 160, 18); g.fill();
    g.filter = 'none';
  }
  return c;
}

/** a still's picture cropped to the stamp's shape (paintBack draws it stretched) */
function stampCanvas(img: HTMLImageElement, crop: Crop): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 200; c.height = 240;
  const g = c.getContext('2d'), b = coverPlacement(img.naturalWidth || 16, img.naturalHeight || 9, 200, 240, crop);
  g?.drawImage(img, b.left, b.top, b.width, b.height);
  return c;
}

const stillRef = (s: CellShot): StillRef => ({ source: s.source, t: s.from, w: 1080 });
const loaded = (img: HTMLImageElement | null): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

/** what the back shows at `local`, as a key: the time while a character is still fading in or the postmark is landing (paintBack's
 *  pace), else which lines are written out and whether the mark is down */
function backKey(o: Obj, local: number, stampReady: boolean): string {
  let moving = false;
  const done = o.back.map((line) => {
    const n = [...line.text].length, last = line.start + Math.max(0, n - 1) / sentenceCps(line, BACK_CPS) + BACK_FADE;
    if (local > line.start && local < last) moving = true;
    return local >= last ? 1 : 0;
  });
  const q = o.mark ? clamp((local - o.mark.at) / MARK_LAND) : 0;
  if (q > 0 && q < 1) moving = true;
  return moving ? `t${local.toFixed(3)}|${stampReady}` : `${done.join(',')}|${q}|${stampReady}`;
}

function own<X extends T.BufferGeometry | T.Material | T.Texture>(s: Pick<S, 'geos' | 'mats' | 'texs'>, x: X): X {
  const any = x as unknown as { isBufferGeometry?: boolean; isMaterial?: boolean; isTexture?: boolean };
  if (any.isBufferGeometry) s.geos.add(x as T.BufferGeometry);
  else if (any.isMaterial) s.mats.add(x as T.Material);
  else if (any.isTexture) s.texs.add(x as T.Texture);
  return x;
}

function canvasTex(THREE: typeof import('three'), c: HTMLCanvasElement, srgb = true): T.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  return t;
}

function makeThing(s: S, THREE: typeof import('three'), o: Obj, ctx: ItemCtx<FlatlayParams>, shadowTex: T.Texture, shadowGeo: T.BufferGeometry): Thing {
  const size = sizeOf(o), { w, h, depth, curl, pic } = size, flipX = w >= h;
  const group = new THREE.Group(), spin = new THREE.Group(), turn = new THREE.Group(), sheet = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  group.add(spin); spin.add(turn); turn.add(sheet);
  turn.position.z = depth / 2; sheet.position.z = -depth / 2;
  const front = paintFront(o), frontTex = own(s, canvasTex(THREE, front.canvas));
  const back = paintBack(o, 0), backTex = own(s, canvasTex(THREE, back.canvas));
  // the back is seen from behind after the turn: its picture flipped so it reads the right way round
  if (flipX) { backTex.repeat.set(1, -1); backTex.offset.set(0, 1); } else { backTex.repeat.set(-1, 1); backTex.offset.set(1, 0); }
  const paperRough = o.kind === 'tv' ? 0.55 : o.kind === 'photo' ? 0.6 : 0.88;
  const frontMat = own(s, new THREE.MeshStandardMaterial({ map: frontTex, roughness: paperRough, side: THREE.FrontSide }));
  const backMat = own(s, new THREE.MeshStandardMaterial({ map: backTex, roughness: paperRough, side: THREE.BackSide }));
  frontMat.shadowSide = THREE.DoubleSide; backMat.shadowSide = THREE.DoubleSide;
  const cast = (m: T.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };
  if (depth > 0) {
    const frontGeo = own(s, sheetGeometry(THREE, w, h, 0)); frontGeo.translate(0, 0, depth);
    const backGeo = own(s, sheetGeometry(THREE, w, h, 0));
    // the body stops just under the front panel: a shared top face would flicker between the two (z-fighting)
    const bodyGeo = own(s, new THREE.BoxGeometry(w * 0.998, h * 0.998, depth - 0.002)); bodyGeo.translate(0, 0, (depth - 0.002) / 2);
    const bodyMat = own(s, new THREE.MeshStandardMaterial({ color: o.kind === 'tv' ? 0x35261b : 0x4f3520, roughness: 0.7 }));
    sheet.add(cast(new THREE.Mesh(frontGeo, frontMat)), cast(new THREE.Mesh(backGeo, backMat)), cast(new THREE.Mesh(bodyGeo, bodyMat)));
  } else {
    const geo = own(s, sheetGeometry(THREE, w, h, curl));
    sheet.add(cast(new THREE.Mesh(geo, frontMat)), cast(new THREE.Mesh(geo, backMat)));
  }
  // the picture: lit by the window (so its light and shadows fall on it) yet mostly its own colours (emissive)
  const faceGeo = own(s, sheetGeometry(THREE, w, h, curl, { rect: pic, lift: PIC_LIFT }));
  if (depth > 0) faceGeo.translate(0, 0, depth);
  const ph = paintPlaceholder(Math.round(pic[2] * w * 400), Math.round(pic[3] * h * 400)), placeholder = own(s, canvasTex(THREE, ph));
  const glossy = o.kind === 'polaroid' || o.kind === 'photo' || o.kind === 'tv';
  const faceMat = own(s, new THREE.MeshPhysicalMaterial({ map: placeholder, emissiveMap: placeholder, emissive: 0xffffff, emissiveIntensity: 0.55,
    roughness: glossy ? 0.5 : 0.85, clearcoat: glossy ? 1 : 0, clearcoatRoughness: 0.08 }));
  const face = cast(new THREE.Mesh(faceGeo, faceMat));
  // the same picture unlit, faded in at the end of a fly so the covering picture is exactly the footage's colours
  const overlayMat = own(s, new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  const overlay = new THREE.Mesh(faceGeo, overlayMat); overlay.visible = false; overlay.renderOrder = 2;
  sheet.add(face, overlay);
  const shadowMat = own(s, new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55 }));
  const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; shadow.renderOrder = 1;
  s.scene.add(group, shadow);
  const source = faceSource(o, ctx.project as Project);
  let still: HTMLImageElement | null = null, stillTex: T.Texture | null = null, stamp: HTMLImageElement | null = null;
  if (source === 'still' && o.shot) {
    still = new Image(); still.src = ctx.media.stillUrl(stillRef(o.shot));
    stillTex = own(s, new THREE.Texture(still)); stillTex.colorSpace = THREE.SRGBColorSpace;
    stillTex.minFilter = THREE.LinearMipmapLinearFilter; stillTex.anisotropy = 8;
  }
  if (needsStamp(o, ctx.dur) && faceSource({ shot: o.stamp }, ctx.project as Project) !== 'placeholder') {
    stamp = new Image(); stamp.src = ctx.media.stillUrl(stillRef(o.stamp));
  }
  return { o, size, source, flipX, group, spin, turn, sheet, shadow, face, overlay, faceMat, overlayMat, frontTex, frontWords: front.words, backTex, backWords: back.words, backKey: '',
    backBase: null, backBaseReady: false, placeholder, showing: placeholder, vt: null, el: null, prev: null, still, stillTex, stamp, pose: null };
}

/** a postcard's stamp is only seen on its back: a card that never turns over within the item needs no stamp picture */
const needsStamp = (o: Obj, dur: number): o is Obj & { stamp: CellShot } => o.kind === 'postcard' && !!o.stamp && o.flipAt !== null && o.flipAt < dur;

/** put `tex` on the picture face (lit and unlit), cropped as the shot says */
function show(t: Thing, tex: T.Texture, srcW: number, srcH: number, three: ThreeKit) {
  if (t.showing !== tex) {
    t.showing = tex;
    t.faceMat.map = tex; t.faceMat.emissiveMap = tex; t.overlayMat.map = tex;
    t.faceMat.needsUpdate = true; t.overlayMat.needsUpdate = true;
  }
  if (tex !== t.placeholder && t.o.shot) {
    const [, , pw, ph] = t.size.pic, uv = three.coverUv(srcW, srcH, pw * t.size.w * 1000, ph * t.size.h * 1000, t.o.shot.crop);
    tex.repeat.set(uv.repeat[0], uv.repeat[1]); tex.offset.set(uv.offset[0], uv.offset[1]);
  }
}

function sourceSize(ctx: ItemCtx<FlatlayParams>, shot: CellShot, el?: { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }): [number, number] {
  const src = (ctx.project as Project).sources?.[shot.source] as { width?: number; height?: number } | undefined;
  const w = src?.width || el?.videoWidth || el?.naturalWidth || 1920, h = src?.height || el?.videoHeight || el?.naturalHeight || 1080;
  return [w, h];
}

/** upload the object's current video picture and show it once the video has one (only then is a replaced video's texture let go) */
function upload(ctx: ItemCtx<FlatlayParams>, t: Thing) {
  if (!t.vt || !t.el || !t.o.shot) return;
  t.vt.update();
  if (t.el.readyState >= 2 && t.el.videoWidth) {
    const [w, h] = sourceSize(ctx, t.o.shot, t.el); show(t, t.vt.texture, w, h, ctx.three as ThreeKit);
    t.prev?.dispose(); t.prev = null;
  }
}

/** a new video element for the object: the face keeps the old one's last picture until the new one has its own (a replaced video
 *  that never showed is let go at once) */
function swapVideo(t: Thing, el: HTMLVideoElement, three: ThreeKit) {
  if (t.prev) t.vt?.dispose(); else t.prev = t.vt;
  t.vt = three.mediaTexture(el); t.el = el;
}

function pose(ctx: ItemCtx<FlatlayParams>, s: S) {
  const { local, dur, W, H } = ctx, three = s.three, objs = s.items.map((t) => t.o), cover = flyCover(s.fly, local);
  const fov = flatlayFov(W, H), cam = cameraPose({ mode: s.mode, topAt: s.topAt, fly: s.fly, fov }, objs, local, dur, W, H);
  s.camera.fov = cam.fov; s.camera.aspect = W / H; s.camera.position.set(...cam.pos); s.camera.up.set(...cam.up); s.camera.lookAt(...cam.look);
  s.camera.updateProjectionMatrix();
  s.items.forEach((t, i) => {
    const p = posed(t.o, i, s.fly, local, W, H);
    t.pose = p.visible ? p : null;
    t.group.visible = p.visible; t.shadow.visible = p.visible;
    if (!p.visible) return;
    const { depth, curl, w, h } = t.size;
    t.group.position.set(p.x, p.z, -p.y);
    t.spin.rotation.set(0, 0, p.rotZ);
    // turned over, a curled sheet would put its corners into the table: lifted by its curl
    t.turn.position.z = depth / 2 + (curl * (1 - Math.cos(p.flip))) / 2;
    if (t.flipX) t.turn.rotation.set(p.flip, p.tilt, 0); else t.turn.rotation.set(p.tilt, p.flip, 0);
    // flying in, the target's curl flattens so its picture meets the screen's edges
    const flying = s.fly && s.fly.index === i ? cover : 0;
    t.sheet.scale.z = curl > 0 ? Math.max(0.05, 1 - flying) : 1;
    const op = flying > 0.55 ? clamp((flying - 0.55) / 0.45) : 0;
    t.overlayMat.opacity = op; t.overlay.visible = op > 0;
    const cs = contactShadow(p.z - (t.o.rest ?? REST_Z * (i + 1)));   // the lift above where it rests
    t.shadow.position.set(p.x, 0.001, -p.y); t.shadow.rotation.z = p.rotZ;
    t.shadow.scale.set(w * 1.6 * cs.scale, h * 1.6 * cs.scale, 1);
    (t.shadow.material as T.MeshBasicMaterial).opacity = p.flip > 0 && p.flip < Math.PI ? cs.opacity * 0.8 : cs.opacity;
    // the picture: the shot playing from when the object came in, a held frame, or the stand-in
    if (t.source === 'video' && t.o.shot && cellLive(t.o.at, dur)) {
      const len = dur - t.o.at;
      const el = ctx.media.video(cellRef(t.o.shot, len), s.holder, clamp(local - t.o.at, 0, Math.max(0, len - 0.04))) as HTMLVideoElement;
      if (el && el !== t.el) swapVideo(t, el, three);
      upload(ctx, t);
    } else if (t.source === 'still' && t.stillTex && loaded(t.still)) {
      if (t.showing !== t.stillTex) t.stillTex.needsUpdate = true;
      const [sw, sh] = sourceSize(ctx, t.o.shot!, t.still);
      show(t, t.stillTex, sw, sh, three);
    }
    // the back, only once it can be seen
    if (p.flip > 0.01) {
      const ready = loaded(t.stamp), key = backKey(t.o, local, ready);
      if (key !== t.backKey) {
        if (!t.backBase || t.backBaseReady !== ready) { t.backBase = paintBackBase(t.o, ready && t.o.stamp ? stampCanvas(t.stamp!, t.o.stamp.crop) : null); t.backBaseReady = ready; }
        const painted = paintBack(t.o, local, null, undefined, t.backBase);
        t.backTex.image = painted.canvas; t.backTex.needsUpdate = true; t.backWords = painted.words; t.backKey = key;
      }
    }
  });
  const rig = lightRig({ surface: s.surface, side: s.side, warmth: s.warmth, wide: W > H }, local);
  s.spot.position.set(...rig.spot.pos); s.spot.target.position.set(...rig.spot.target); s.spot.target.updateMatrixWorld();
  s.spot.color.setHex(rig.spot.color); s.spot.intensity = rig.spot.intensity * rig.exposure;
  s.spot.angle = rig.spot.angle; s.spot.penumbra = rig.spot.penumbra;
  s.spot.map = rig.spot.gobo ? s.gobo : null;
  if (rig.spot.gobo && s.gobo && s.goboLayers) {
    const [dx, dy] = goboStep(rig.spot.goboOffset, s.goboLayers.frame.width), key = `${dx},${dy}`;
    if (key !== s.goboAt) { paintGobo(s.gobo.image as HTMLCanvasElement, s.goboLayers, dx, dy); s.gobo.needsUpdate = true; s.goboAt = key; }
  }
  s.sky.color.setHex(rig.sky.color); s.sky.groundColor.setHex(rig.sky.ground); s.sky.intensity = rig.sky.intensity * rig.exposure;
  s.scene.updateMatrixWorld(true); s.camera.updateMatrixWorld();
  return dofOf(s, cover, cam.focus);
}

/** the depth of field: off while flying in (the covering picture must be sharp: the composer would tone-map the unlit copy too),
 *  faded out over the fly's first 30 % */
function dofOf(s: S, cover: number, focus: number) {
  // a see-through desk: the blur pass writes an opaque picture, which would hide what lies under the item
  if (s.surface === 'none') return null;
  const d = s.dof * (cover > 0 ? (cover < 0.3 ? 1 - cover / 0.3 : 0) : 1);
  return d > 0 ? { focus, aperture: 0.0046 * d, maxblur: 0.017 * d } : null;
}

/** the item's own canvas from the shared renderer, or a flat stand-in without WebGL */
function paint(ctx: ItemCtx<FlatlayParams>, s: S, dof: ReturnType<typeof pose>) {
  const { W, H } = ctx, g = s.c.getContext('2d');
  const out = s.three.render(s.scene, s.camera, W, H, { shadows: true, toneMapping: 'neutral', dof });
  if (!g) return;
  g.clearRect(0, 0, W, H);
  if (out) { g.drawImage(out, 0, 0, W, H); return; }
  // no WebGL2: the desk's colour and each object's front laid where the camera sees it
  if (s.surface !== 'none') { g.fillStyle = SURFACE_LOOK[s.surface].base; g.fillRect(0, 0, W, H); }
  for (const t of s.items) {
    if (!t.pose) continue;
    // the face's canvas corners (top left, top right, bottom left) where they lie on the sheet, flat (the corners' curl left out)
    const backUp = t.pose.flip > Math.PI / 2, [p0, p1, p3] = [[0, 0], [1, 0], [0, 1]].map(([a, b]) => toScreen(s, t.sheet, ...facePoint(t, backUp, a, b, false), W, H));
    if (!p0 || !p1 || !p3) continue;
    const img = (backUp ? t.backTex.image : t.frontTex.image) as HTMLCanvasElement, cw = img.width || 1, ch = img.height || 1;
    g.save();
    g.setTransform((p1[0] - p0[0]) / cw, (p1[1] - p0[1]) / cw, (p3[0] - p0[0]) / ch, (p3[1] - p0[1]) / ch, p0[0], p0[1]);
    g.drawImage(img, 0, 0);
    if (t.pose.flip <= Math.PI / 2) {
      const [px, py, pw, ph] = t.size.pic, pic = (t.showing.image ?? t.placeholder.image) as HTMLCanvasElement & HTMLImageElement, bx = px * cw, by = py * ch, bw = pw * cw, bh = ph * ch;
      g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
      // the stand-in is painted to the face's shape; a picture is cropped to it as the shot says, never stretched
      const sw = pic.naturalWidth || pic.width, sh = pic.naturalHeight || pic.height;
      const b = t.showing === t.placeholder || !t.o.shot || !sw || !sh ? { left: 0, top: 0, width: bw, height: bh } : coverPlacement(sw, sh, bw, bh, t.o.shot.crop);
      try { g.drawImage(pic, bx + b.left, by + b.top, b.width, b.height); } catch { /* a video with no picture yet */ }
    }
    g.restore();
  }
}

/** a point of an object (its sheet's own coordinates) on the screen, px; null behind the camera */
function toScreen(s: S, sheet: T.Object3D, x: number, y: number, z: number, W: number, H: number): [number, number] | null {
  const v = s.v3.set(x, y, z).applyMatrix4(sheet.matrixWorld).project(s.camera);
  if (v.z < -1 || v.z > 1) return null;
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
}

/** a point of a face's canvas (a, b: fractions from its top left) in the sheet's own coordinates: the front on top of the sheet; the
 *  back under it, its picture turned so it reads the right way round once the object is turned over about its long side (x for a
 *  wide object, y for a tall one: makeThing's backTex repeat). `curl` puts the point on the sheet's curl */
function facePoint(t: Pick<Thing, 'size' | 'flipX'>, back: boolean, a: number, b: number, curl = true): [number, number, number] {
  const { w, h, depth } = t.size, bend = (x: number, y: number) => (curl ? sheetZ(x, y, w, h, t.size.curl) : 0);
  let x: number, y: number;
  if (!back) { x = (a - 0.5) * w; y = (0.5 - b) * h; return [x, y, depth + bend(x, y)]; }
  if (t.flipX) { x = (a - 0.5) * w; y = (b - 0.5) * h; } else { x = (0.5 - a) * w; y = (0.5 - b) * h; }
  return [x, y, bend(x, y)];
}

/** the words on the visible faces, projected, for check */
function report(ctx: ItemCtx<FlatlayParams>, s: S) {
  const { W, H } = ctx;
  if (flyCover(s.fly, ctx.local) > 0) return;
  for (const t of s.items) {
    if (!t.pose || !atRest(t.o, ctx.local)) continue;
    const backUp = t.pose.flip > Math.PI / 2, words = backUp ? t.backWords : t.frontWords;
    for (const word of words) {
      const [fx, fy, fw, fh] = word.rect, pts: Array<[number, number]> = [];
      for (const [a, b] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) {
        const p = toScreen(s, t.sheet, ...facePoint(t, backUp, a, b), W, H);
        if (p) pts.push(p);
      }
      if (pts.length < 4) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys), bh = Math.max(...ys) - y;
      ctx.reportText({ text: word.text, x, y, w: Math.max(...xs) - x, h: bh, size: bh });
    }
  }
}

export const flatlay: ItemType<FlatlayParams, S> = {
  type: 'common.flatlay', label: '3D 桌面', category: 'frame', kind: 'overlay', three: true,
  doc: '真的 3D 桌面（three.js）：明信片、拍立得、相框、老電視、卡片放在亞麻、大理石、水泥或絨布上，窗光和樹葉的影子輕輕晃，'
    + '有柔和的陰影和景深；每樣東西的照片面播它自己的鏡頭（沒有聲音），會落下、滑進、在 3D 裡翻面（明信片背面一字一字寫出來，再蓋郵戳），'
    + '鏡頭慢慢推近、升到正上方，或飛進某一張照片直到蓋滿畫面。要原音、或飛進去之後接主軌，用 c.flatlayClip 放那個鏡頭對齊好的片段。'
    + '多樣東西寫 objects（JSON 陣列），x、y 是桌面單位（桌子中央 0，y 朝上；9:16 看得到 ±1.2 × ±2.0，16:9 是 ±3.0 × ±1.6），rot 是弧度（正＝逆時針）；'
    + 'surface none 是透明桌面，疊在影片上',
  params: PARAMS,
  build(ctx) {
    const { root, W, H, params: p } = ctx;
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    const holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';
    root.append(c, holder);
    const { objs, error: objError } = parseObjects(p, W, H, ctx.dur), read = readFly(p.fly), error = objError ?? read.error;
    if (objError) console.error(`common.flatlay ${ctx.item.id}: ${objError}`);
    if (read.error) console.error(`common.flatlay ${ctx.item.id}: ${read.error}; not flying`);
    let fly = read.fly;
    if (fly && !objs[fly.index]) { console.error(`common.flatlay ${ctx.item.id}: fly index ${fly.index} names no object (there are ${objs.length}); not flying`); fly = null; }
    const surface = (Object.keys(SURFACE_LOOK).includes(p.surface) ? p.surface : 'linen') as Surface;
    if (!ctx.three) return buildFlat(ctx, c, holder, objs, surface, fly, error);
    const three = ctx.three as ThreeKit, THREE = three.THREE;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(flatlayFov(W, H), W / H, 0.05, 60);
    const s: S = { c, holder, three, scene, camera, spot: null!, sky: null!, gobo: null, goboLayers: null, goboAt: '', items: [], fly, flat: null,
      mode: (['push', 'still', 'top'].includes(p.camera) ? p.camera : 'push') as CameraMode, topAt: Number(p.topAt) >= 0 ? Number(p.topAt) : null,
      surface, side: p.side === 'right' ? 'right' : 'left', warmth: (['morning', 'afternoon', 'golden'].includes(p.warmth) ? p.warmth : 'afternoon') as S['warmth'],
      dof: clamp(Number(p.dof) || 0), error, dead: false, geos: new Set(), mats: new Set(), texs: new Set(), project: ctx.project as Project, fontsText: '',
      v3: new THREE.Vector3(), lastDof: null };
    // the table, far wider than any view so its edge never shows
    const look = SURFACE_LOOK[surface], tableGeo = own(s, new THREE.PlaneGeometry(40, 40));
    let tableMat: T.Material;
    const painted = paintSurface(surface, Number(p.seed) || 7);
    if (painted) {
      const map = own(s, canvasTex(THREE, painted.map)), bump = own(s, canvasTex(THREE, painted.bump, false));
      for (const t of [map, bump]) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.repeat.set((look.repeat * 40) / 9, (look.repeat * 40) / 9); }
      tableMat = own(s, new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: look.bump, roughness: look.roughness }));
    } else tableMat = own(s, new THREE.ShadowMaterial({ opacity: 0.35 }));
    const table = new THREE.Mesh(tableGeo, tableMat); table.rotation.x = -Math.PI / 2; table.receiveShadow = true;
    scene.add(table);
    const spot = new THREE.SpotLight(0xffffff, 100, 0, 0.42, 0.55, 2);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.radius = 10; spot.shadow.blurSamples = 20;
    spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.01; spot.shadow.camera.near = 2; spot.shadow.camera.far = 12;
    s.spot = spot; s.sky = new THREE.HemisphereLight(0xf3efe8, 0x6b5a48, 1);
    s.goboLayers = goboLayers();
    const goboCanvas = document.createElement('canvas'); goboCanvas.width = s.goboLayers.frame.width; goboCanvas.height = s.goboLayers.frame.height;
    s.gobo = own(s, canvasTex(THREE, paintGobo(goboCanvas, s.goboLayers), true));
    scene.add(spot, spot.target, s.sky);
    const shadowTex = own(s, canvasTex(THREE, shadowCanvas(), false)), shadowGeo = own(s, new THREE.PlaneGeometry(1, 1));
    s.items = objs.map((o) => makeThing(s, THREE, o, ctx, shadowTex, shadowGeo));
    s.fontsText = paintedText(objs);
    return s;
  },
  async ready(s) {
    if (typeof document !== 'undefined' && document.fonts) {
      const text = s.fontsText || 'Aa';
      await Promise.all([`italic 500 40px ${PRINT}`, `500 40px ${PRINT}`, `600 40px ${PRINT}`, `40px '${HAND}'`].map((f) => document.fonts.load(f, text).catch(() => [])));
    }
    const imgs = [...s.items.flatMap((t) => [t.still, t.stamp]), ...(s.flat ?? []).map((t) => t.still)].filter((i): i is HTMLImageElement => !!i);
    try { await imagesReady(imgs); } catch { /* no decode() here (tests): the pictures show once they load */ }
    // the words were painted before their fonts: again now
    for (const t of s.items) {
      const front = paintFront(t.o);
      t.frontTex.image = front.canvas; t.frontTex.needsUpdate = true; t.frontWords = front.words;
      t.backKey = '';
    }
    for (const t of s.flat ?? []) { t.front = paintFront(t.o).canvas; t.backKey = ''; }
  },
  draw(ctx, s) {
    if (s.dead) return;
    const { W, H } = ctx;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    if (s.flat) { drawFlat(ctx, s, s.flat); return; }
    // the picture covers the screen: the main track's clip shows it, the desk is not drawn
    if (handedOver(s, ctx.local)) { s.c.getContext('2d')?.clearRect(0, 0, W, H); s.items.forEach((t) => { t.pose = null; }); return; }
    s.lastDof = pose(ctx, s);
    paint(ctx, s, s.lastDof);
    report(ctx, s);
  },
  late(ctx, s) {
    if (s.dead) return;
    if (s.flat) { drawFlat(ctx, s, s.flat); return; }
    if (handedOver(s, ctx.local)) return;
    let any = false;
    for (const t of s.items) if (t.pose && t.vt && t.source === 'video') { upload(ctx, t); any = true; }
    if (!any) return;
    paint(ctx, s, s.lastDof);
  },
  // the spot's shadow map (2048², with its blur target) is the largest thing the item holds on the GPU while off screen: three
  // frees its render targets here and sets them up again on the next render, as it does for any disposed render target
  hide(s) { s.c.width = 0; s.c.height = 0; s.spot?.shadow.dispose(); },
  dispose(s) {
    s.dead = true;
    for (const t of s.items) { t.vt?.dispose(); t.prev?.dispose(); t.vt = null; t.prev = null; }
    s.geos.forEach((g) => g.dispose()); s.mats.forEach((m) => m.dispose()); s.texs.forEach((x) => x.dispose());
    s.spot?.shadow.dispose?.();
    s.geos.clear(); s.mats.clear(); s.texs.clear();
  },
  media(item, project) {
    const p = { ...DEFAULTS, ...(item.params as Partial<FlatlayParams>) }, dur = item.end - item.start;
    const meta = (project as Project | undefined)?.meta as { width?: number; height?: number } | undefined;
    const { objs } = parseObjects(p, meta?.width ?? 1080, meta?.height ?? 1920, dur);
    const videos: MediaRef[] = [], stills: StillRef[] = [];
    for (const o of objs) {
      if (o.shot && cellLive(o.at, dur)) { if (o.shot.still) stills.push(stillRef(o.shot)); else videos.push(cellRef(o.shot, dur - o.at)); }
      if (needsStamp(o, dur)) stills.push(stillRef(o.stamp));
    }
    return { videos, stills };
  },
};

/** the block without three.js: the same objects, posed by the same curves, drawn flat over the desk's colour from straight above
 *  (no camera, no light, no fly but the hand-off); enough to see what is where and what plays */
function buildFlat(ctx: ItemCtx<FlatlayParams>, c: HTMLCanvasElement, holder: HTMLDivElement, objs: Obj[], surface: Surface, fly: Fly | null, error: string | null): S {
  const project = ctx.project as Project;
  const flat = objs.map((o): FlatThing => {
    const size = sizeOf(o), source = faceSource(o, project), [, , pw, ph] = size.pic;
    let still: HTMLImageElement | null = null;
    if (source === 'still' && o.shot) { still = new Image(); still.src = ctx.media.stillUrl(stillRef(o.shot)); }
    return { o, size, source, flipX: size.w >= size.h, front: paintFront(o).canvas, placeholder: paintPlaceholder(Math.round(pw * size.w * 400), Math.round(ph * size.h * 400)), still, back: null, backKey: '' };
  });
  return { c, holder, three: null!, scene: null!, camera: null!, spot: null!, sky: null!, gobo: null, goboLayers: null, goboAt: '', items: [], fly, mode: 'still', topAt: null, surface, side: 'left',
    warmth: 'afternoon', dof: 0, error, dead: false, geos: new Set(), mats: new Set(), texs: new Set(), project, v3: null!, lastDof: null, fontsText: paintedText(objs), flat };
}

function drawFlat(ctx: ItemCtx<FlatlayParams>, s: S, flat: FlatThing[]) {
  const { W, H, local, dur } = ctx;
  if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
  const g = s.c.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, W, H);
  if (handedOver(s, local)) return;
  if (s.surface !== 'none') { g.fillStyle = SURFACE_LOOK[s.surface].base; g.fillRect(0, 0, W, H); }
  const k = W / (2 * viewHalf(W, H)[0]);
  flat.forEach((t, i) => {
    const p = posed(t.o, i, s.fly, local, W, H);
    if (!p.visible) return;
    // nearer the eye only while lifted above where it rests (a sheet lying high on the pile is not bigger)
    const { w, h, pic } = t.size, ow = w * k, oh = h * k, lift = 1 + Math.max(0, p.z - (t.o.rest ?? REST * (i + 1))) * 0.3, turn = Math.max(0.02, Math.abs(Math.cos(p.flip)));
    g.save();
    g.translate(W / 2 + p.x * k, H / 2 - p.y * k); g.rotate(-p.rotZ);
    if (t.flipX) g.scale(lift, lift * turn); else g.scale(lift * turn, lift);
    g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 24 * lift; g.shadowOffsetY = 8 * lift;
    if (p.flip > Math.PI / 2) {
      const key = backKey(t.o, local, false);
      if (key !== t.backKey || !t.back) { t.back = paintBack(t.o, local).canvas; t.backKey = key; }
      g.drawImage(t.back, -ow / 2, -oh / 2, ow, oh);
    } else {
      g.drawImage(t.front, -ow / 2, -oh / 2, ow, oh);
      g.shadowColor = 'transparent';
      const [px, py, pw, ph] = pic, bx = -ow / 2 + px * ow, by = -oh / 2 + py * oh, bw = pw * ow, bh = ph * oh;
      let img: CanvasImageSource = t.placeholder, sw = 0, sh = 0;
      if (t.source === 'video' && t.o.shot && cellLive(t.o.at, dur)) {
        const len = dur - t.o.at, el = ctx.media.video(cellRef(t.o.shot, len), s.holder, clamp(local - t.o.at, 0, Math.max(0, len - 0.04))) as HTMLVideoElement | null;
        if (el && el.readyState >= 2 && el.videoWidth) { img = el; [sw, sh] = sourceSize(ctx, t.o.shot, el); }
      } else if (t.source === 'still' && loaded(t.still)) { img = t.still; [sw, sh] = sourceSize(ctx, t.o.shot!, t.still); }
      g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
      if (img === t.placeholder) g.drawImage(img, bx, by, bw, bh);
      else { const b = coverPlacement(sw, sh, bw, bh, t.o.shot!.crop); try { g.drawImage(img, bx + b.left, by + b.top, b.width, b.height); } catch { /* no picture yet */ } }
      g.restore();
    }
    g.restore();
  });
}

/** the main-track clip that takes over when the camera has flown into object `index`'s picture: from the item's start + `at`, the
 *  shot from its source seconds, cropped to show exactly what the covering picture shows, until the object has left the desk (its
 *  exit over, when it has one) or the item ends; null for a still or no shot. Over a see-through desk (surface none) the clip would
 *  show through it, so there it only runs while the picture covers the screen: from the end of the fly into that object until the
 *  pull back (or the object's leaving, or the item's end), from that point of the shot */
export function flatlayClip(params: Partial<FlatlayParams>, index: number, srcW: number, srcH: number, W: number, H: number, dur: number): { at: number; len: number; source: string; from: number; crop: Crop } | null {
  const p = { ...DEFAULTS, ...params }, { objs } = parseObjects(p, W, H, dur), o = objs[index];
  if (!o?.shot || o.shot.still) return null;
  const crop = flyCrop(o.shot.crop, srcW, srcH, picAspect(o), 1, W, H);
  // gone from the desk: the end of its exit (an exit with no time already ends with the item)
  const gone = o.exit ? Math.min(dur, o.exitAt + EXIT_DUR) : dur;
  const fly = p.surface === 'none' ? parseFly(p.fly) : null;
  if (fly && fly.index === index) {
    const at = Math.max(o.at, fly.at + fly.dur), end = Math.min(gone, fly.back ?? dur);
    return end > at ? { at, len: end - at, source: o.shot.source, from: o.shot.from + (at - o.at), crop } : null;
  }
  return { at: o.at, len: gone - o.at, source: o.shot.source, from: o.shot.from, crop };
}
