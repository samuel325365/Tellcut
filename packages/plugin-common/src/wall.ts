// common.wall (spec 2026-10-25-brand-preset §6.2-3) — the project's pictures as rounded glass tiles in 3D: look wall, a gently
// curved wall the camera glides across and then pushes into one tile until it fills the frame's width; look sphere, 90 tiles on a
// slowly turning ball whose far side fades. Each tile shows a still of a source, cropped by cover (a tall clip is not squashed).
// Built from the spike (3-tellcut-film/scene.js: tile(), the wall and the proof sphere, the floor, the dust, "696 clips.").
import { clamp, coverPlacement, eIO3, eOut5, h, type ItemType, lerp, type Project } from '@tellcut/engine';
import { drawBlurLine } from './brand-text.ts';
import { ghostLayer, ghostLines, type GhostLine } from './text.ts';
import type * as T from 'three';
import type { ThreeKit } from './three/kit.ts';
import type { Dust, Floor, Slab } from './three/parts.ts';

export const WALL_FOV = 36;
const TW = 1.22, TH = (TW * 9) / 16, GAP = 0.16, WALL_Z = -3, BALL_TW = 0.62, BALL_N = 90, BALL_R = 3;

interface P {
  look: 'wall' | 'sphere'; tiles: string; cols: number; rows: number; focus: number; push: number; dim: number; bg: string;
  floor: boolean; dust: number; count: number; countLabel: string; bloom: number; font: string; color: string; x: number;
}
interface Tile { g: T.Group; face: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>; slab: T.Mesh; home: T.Vector3; part: Slab }
interface S {
  cv: HTMLCanvasElement; ghost: HTMLElement; p: P; W: number; H: number; kit?: ThreeKit;
  pics: Array<{ img: HTMLImageElement; w: number; h: number }>;
  gl?: { scene: T.Scene; cam: T.PerspectiveCamera; ball: T.Group; tiles: Tile[]; parts: Array<{ dispose(): void }>; dust: Dust; floor?: Floor };
}


/** the tiles' pictures: `id@seconds` list, or every video and photo of the project (a video at its middle second; not the maps
 *  stitched by `assets map`, which are not footage) */
export function tileList(spec: string, sources: Project['sources']): Array<{ source: string; t: number }> {
  const usable = (id: string) => { const s = sources[id] as { kind?: string } | undefined; return !!s && s.kind !== 'audio'; };
  const middle = (id: string) => { const s = sources[id] as { kind?: string; duration?: number }; return s.kind === 'image' ? 0 : Math.round(((s.duration ?? 0) / 2) * 100) / 100; };
  const items = spec.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  if (!items.length) return Object.keys(sources).filter((id) => usable(id) && !(sources[id] as { map?: unknown }).map).map((id) => ({ source: id, t: middle(id) }));
  return items.flatMap((x) => {
    const [id, t] = x.split('@').map((v) => v.trim());
    return usable(id) ? [{ source: id, t: t !== undefined && Number.isFinite(Number(t)) ? Number(t) : middle(id) }] : [];
  });
}
const distinct = (l: Array<{ source: string; t: number }>) => l.filter((x, i) => l.findIndex((y) => y.source === x.source && y.t === x.t) === i);

export const wall: ItemType<P, S> = {
  type: 'common.wall', label: '畫面牆／畫面球', category: 'frame', kind: 'overlay', three: true,
  doc: '專案素材的畫面排成 3D 的圓角玻璃格：look wall 一面微彎的牆，鏡頭斜斜滑過，最後推向其中一格直到填滿畫面寬度；look sphere 90 格排成一顆慢慢轉的球，背面的格子淡掉；直式素材照比例裁切、不會拉長（「我們拍了很多」「累積的作品」）',
  params: [
    { key: 'look', label: '樣子（wall 牆、sphere 球）', type: 'enum', options: ['wall', 'sphere'], default: 'wall' },
    { key: 'tiles', label: '畫面（素材 id@秒，逗號分隔；空＝專案所有影片和照片，各取中間那一秒，拼好的地圖不算）', type: 'text', default: '' },
    { key: 'cols', label: '牆的欄數', type: 'number', min: 1, max: 30, step: 1, default: 13 },
    { key: 'rows', label: '牆的列數', type: 'number', min: 1, max: 15, step: 1, default: 7 },
    { key: 'x', label: '球心的左右位置（sphere；畫面寬比例，0.5＝正中間；旁邊有字時移到另一邊）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'focus', label: '推近的那一格（從 0 數；-1＝中間那格）', type: 'number', min: -1, max: 400, step: 1, default: -1 },
    { key: 'push', label: '最後多少比例的時間推向那一格（0＝不推）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'dim', label: '其他格子的亮度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: 'bg', label: '背景色', type: 'color', default: '#0d0f14', theme: 'palette.ink' },
    { key: 'floor', label: '牆下的反光地板', type: 'bool', default: true },
    { key: 'dust', label: '飄浮的灰塵（0＝沒有）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'count', label: '牆中央往上數的大數字（0＝沒有）', type: 'number', min: 0, max: 1000000, step: 1, default: 0 },
    { key: 'countLabel', label: '數字後面的字（例：clips.）', type: 'text', default: '' },
    { key: 'bloom', label: '光暈（0＝沒有；推近時淡掉，交給下一段實拍時沒有光暈）', type: 'number', min: 0, max: 1, step: 0.02, default: 0.32 },
    { key: 'font', label: '數字的字型', type: 'string', default: 'Inter' },
    { key: 'color', label: '數字的顏色', type: 'color', default: '#f4f5f7', theme: 'palette.paper' },
  ],
  media(item, project) {
    return { videos: [], stills: distinct(tileList(String((item.params as Partial<P>).tiles ?? ''), project.sources)).map((x) => ({ ...x, w: 480 })) };
  },
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const pics = distinct(tileList(ctx.params.tiles, ctx.project.sources)).map(({ source, t }) => {
      const img = new Image(); img.decoding = 'sync'; img.src = ctx.media.stillUrl({ source, t, w: 480 });
      const s = ctx.project.sources[source] as { width?: number; height?: number };
      return { img, w: s.width || 16, h: s.height || 9 };
    });
    return { cv, ghost: ghostLayer(ctx.root), p: ctx.params, W: ctx.W, H: ctx.H, kit: ctx.three as ThreeKit | undefined, pics };
  },
  async ready(s) {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    await Promise.all([...s.pics.map((p) => p.img.decode().catch(() => {})), s.p.count > 0 && fonts ? fonts.load(`300 104px "${s.p.font}"`, '0123456789').catch(() => {}) : null]);
    // cover by the still's own size, not the one the source records (the two can differ); the recorded size when it did not load
    for (const p of s.pics) if (p.img.naturalWidth > 0 && p.img.naturalHeight > 0) { p.w = p.img.naturalWidth; p.h = p.img.naturalHeight; }
    if (s.kit) build3d(s, s.kit);
  },
  draw(ctx, s) {
    const { W, H } = ctx;
    if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
    const g = s.cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    let out: HTMLCanvasElement | null = null;
    if (s.gl && s.kit) {
      // the glow fades with the push: the frame handed to the next clip is the still as it is (no glow, no tone mapping)
      const k = pose(s, ctx.local, ctx.dur, ctx.fps, W, H), bloom = s.p.bloom * (1 - k);
      out = s.kit.render(s.gl.scene, s.gl.cam, W, H, bloom > 0.001 ? { toneMapping: 'none', background: s.p.bg, bloom } : { toneMapping: false, background: s.p.bg });
    }
    if (out) g.drawImage(out, 0, 0, W, H); else flat(g, s, W, H);
    // the count for check and the editor: a transparent copy over the canvas
    ghostLines(s.ghost, [s.p.count > 0 ? drawCount(g, s.p, ctx.local, ctx.dur, W, H) : null]);
  },
  hide(s) { s.cv.width = 0; s.cv.height = 0; },
  dispose(s) { for (const p of s.gl?.parts ?? []) p.dispose(); s.gl = undefined; },
};

function build3d(s: S, kit: ThreeKit) {
  const T3 = kit.THREE, p = s.p, parts: Array<{ dispose(): void }> = [];
  const scene = new T3.Scene();
  scene.environment = kit.environment();
  scene.environmentIntensity = 0.5;
  const cam = new T3.PerspectiveCamera(WALL_FOV, s.W / s.H, 0.05, 120);
  const key = new T3.DirectionalLight(0xffffff, 1.2); key.position.set(3, 4, 6);
  const rim = new T3.DirectionalLight(0x4aa3ff, 1.4); rim.position.set(-5, 2, -4);
  scene.add(key, rim);
  // one texture per picture, cropped by cover into the 16:9 face
  const maps = s.pics.map((pic) => {
    const tex = new T3.Texture(pic.img); tex.colorSpace = T3.SRGBColorSpace; tex.needsUpdate = true;
    const uv = kit.coverUv(pic.w, pic.h, 16, 9, { x: 0.5, y: 0.5, zoom: 1 });
    tex.repeat.set(uv.repeat[0], uv.repeat[1]); tex.offset.set(uv.offset[0], uv.offset[1]);
    parts.push(tex);
    return tex;
  });
  const sphere = p.look === 'sphere', tw = sphere ? BALL_TW : TW, th = (tw * 9) / 16;
  const ball = new T3.Group(); scene.add(ball);
  const n = sphere ? BALL_N : Math.max(1, p.cols) * Math.max(1, p.rows), tiles: Tile[] = [];
  for (let k = 0; k < n; k++) {
    // the kit's slab (the spike's tile): the first one makes the geometry, the rest share it
    const part = kit.videoSlab({ w: tw, h: th, map: maps.length ? maps[k % maps.length] : null, transparent: sphere, geometry: tiles[0]?.part.geometry });
    const { group: g, slab, face } = part;
    g.name = `wall-tile-${k}`; face.name = 'wall-face';
    parts.push(part);
    let home: T.Vector3;
    if (sphere) {
      // a golden-angle spiral over the ball, each tile facing out
      const y = 1 - (2 * (k + 0.5)) / BALL_N, rr = Math.sqrt(1 - y * y), a = k * 2.39996;
      home = new T3.Vector3(Math.cos(a) * rr * BALL_R, y * BALL_R, Math.sin(a) * rr * BALL_R);
      g.position.copy(home); g.lookAt(home.clone().multiplyScalar(2));
      ball.add(g);
    } else {
      const c = k % p.cols, r = Math.floor(k / p.cols), x = (c - (p.cols - 1) / 2) * (TW + GAP), yy = ((p.rows - 1) / 2 - r) * (TH + GAP);
      home = new T3.Vector3(x, yy, WALL_Z - 0.03 * x * x);
      g.position.copy(home); g.rotation.y = Math.atan(0.06 * x);
      scene.add(g);
    }
    tiles.push({ g, face, slab, home, part });
  }
  // the spike's floor: a reflector under the wall with a veil of the background over it
  let floor: Floor | undefined;
  if (!sphere && p.floor) {
    floor = kit.floor({ y: -(Math.max(1, p.rows) * (TH + GAP)) / 2 - 0.25, bg: p.bg, frame: [s.W, s.H] });
    floor.mirror.name = 'wall-floor'; floor.veil.name = 'wall-floor-veil';
    scene.add(floor.group); parts.push(floor);
  }
  // the spike's dust: 600 soft points from a fixed seed, drifting with time
  const dust = kit.dust();
  dust.points.name = 'wall-dust'; scene.add(dust.points);
  parts.push(dust);
  s.gl = { scene, cam, ball, tiles, parts, dust, floor };
}

/** "696 clips.": the number climbs from 0 over 0.6–2.2 s at the wall's centre on a soft dark pool, gone before the push */
function drawCount(g: CanvasRenderingContext2D, p: P, t: number, dur: number, W: number, H: number): GhostLine {
  const k = Math.min(W, H) / 1080, out = p.look === 'wall' && p.push > 0 ? dur * (1 - p.push) : dur;
  const a = clamp((t - 0.4) / 0.8) * (1 - clamp((t - (out - 0.5)) / 0.5));
  if (a > 0) {
    const pool = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 560 * k);
    pool.addColorStop(0, `rgba(5,7,11,${0.75 * a})`); pool.addColorStop(1, 'rgba(5,7,11,0)');
    g.fillStyle = pool; g.fillRect(0, 0, W, H);
  }
  const n = Math.round(p.count * eOut5(clamp((t - 0.6) / 1.6)));
  const text = `${n.toLocaleString('en-US')}${p.countLabel.trim() ? ` ${p.countLabel.trim()}` : ''}`;
  return drawBlurLine(g, { text, x: W / 2, y: H / 2 + 10 * k, size: 104 * k, family: `'${p.font}', 'Noto Sans TC', sans-serif`, weight: 300, color: p.color, align: 'center', spacing: -2 * k }, t, 0.55, out);
}

/** the camera first (the sphere fades its tiles by where the camera is), then the tiles */
function pose(s: S, t: number, dur: number, fps: number, W: number, H: number): number {
  const gl = s.gl!, p = s.p, T3 = s.kit!.THREE, aspect = W / H, tan = Math.tan((WALL_FOV * Math.PI) / 360);
  gl.cam.aspect = aspect;
  gl.dust.pose(t);
  gl.dust.points.material.opacity = 0.35 * (p.dust / 0.4);
  if (p.look === 'sphere') {
    const back = Math.max(10, (BALL_R * 1.2) / (tan * Math.min(1, aspect)));
    gl.cam.position.set(0, 0.15, back); gl.cam.lookAt(0, 0, 0); gl.cam.updateProjectionMatrix();
    const grow = eOut5(clamp(t / 1.2));
    gl.ball.scale.setScalar(lerp(0.7, 1, grow));
    gl.ball.rotation.set(0.25, t * 0.16, 0.05);
    // across the frame by x: at the ball's depth the frame is 2·tan·back·aspect wide (the camera stays put, so words beside it keep their place)
    gl.ball.position.x = (p.x - 0.5) * 2 * tan * back * aspect;
    gl.ball.updateMatrixWorld(true);
    const wp = new T3.Vector3(), nrm = new T3.Vector3(), toCam = new T3.Vector3();
    for (const tile of gl.tiles) {
      // only the side facing the camera: tiles fade out as they turn away
      tile.g.getWorldPosition(wp); nrm.copy(wp).sub(gl.ball.position).normalize(); toCam.copy(gl.cam.position).sub(wp).normalize();
      const f = clamp((nrm.dot(toCam) - 0.05) / 0.45);
      tile.part.setOpacity(grow * f);
      tile.face.material.color.setScalar(tile.face.material.map ? lerp(0.45, 0.95, f) : 0.2);
    }
    gl.dust.points.visible = p.dust > 0;
    return 0;
  }
  const cols = Math.max(1, p.cols), rows = Math.max(1, p.rows), focus = p.focus >= 0 && p.focus < gl.tiles.length ? p.focus : Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  const glide = dur * (1 - p.push), e = eIO3(clamp(t / Math.max(0.001, glide)));
  // gliding: near enough that the wall covers the frame's long side (as the spike: the short side may show the wall's edge),
  // sliding sideways across it
  const wallW = cols * (TW + GAP), wallH = rows * (TH + GAP), travel = wallW * 0.08;
  const dist = aspect >= 1 ? (wallW / 2 - TW - travel) / (tan * aspect) : (wallH / 2 - TH) / tan;
  const sx = lerp(-travel, travel, e), from = new T3.Vector3(sx, 0.1, WALL_Z + Math.max(1.5, dist)), look = new T3.Vector3(sx, 0, WALL_Z);
  const k = p.push > 0 ? eIO3(clamp((t - glide) / Math.max(0.001, dur - glide - 1 / fps))) : 0;
  const tile = gl.tiles[focus];
  // the focus tile fills the frame's width at the end: on its normal, at (TW/2) / (tan(fov/2) × aspect) from its face
  tile.g.updateMatrixWorld(true);
  const centre = tile.face.getWorldPosition(new T3.Vector3()), normal = new T3.Vector3(0, 0, 1).applyQuaternion(tile.g.getWorldQuaternion(new T3.Quaternion()));
  const end = centre.clone().addScaledVector(normal, TW / 2 / (tan * aspect));
  gl.cam.position.copy(from.lerp(end, k));
  gl.cam.lookAt(look.lerp(centre, k));
  gl.cam.updateProjectionMatrix();
  gl.tiles.forEach((tl, i) => { tl.face.material.color.setScalar(tl.face.material.map ? (i === focus ? 1 : lerp(1, p.dim, k > 0 ? k : 0.4)) : 0.2); });
  // as the spike: no dust or floor in the push, only the tile
  gl.dust.points.visible = p.dust > 0 && k < 0.5;
  if (gl.floor) gl.floor.group.visible = k < 0.5;
  return k;
}

/** no WebGL2: the stills as a flat grid, each cropped by cover */
function flat(g: CanvasRenderingContext2D, s: S, W: number, H: number) {
  const p = s.p, cols = p.look === 'sphere' ? 4 : Math.max(1, p.cols), rows = p.look === 'sphere' ? 3 : Math.max(1, p.rows);
  g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
  if (!s.pics.length) return;
  const cw = W / cols, ch = H / rows;
  for (let k = 0; k < cols * rows; k++) {
    const pic = s.pics[k % s.pics.length], x = (k % cols) * cw, y = Math.floor(k / cols) * ch, b = coverPlacement(pic.w, pic.h, cw - 8, ch - 8, { x: 0.5, y: 0.5, zoom: 1 });
    g.save(); g.beginPath(); g.rect(x + 4, y + 4, cw - 8, ch - 8); g.clip();
    g.drawImage(pic.img, x + 4 + b.left, y + 4 + b.top, b.width, b.height);
    g.restore();
  }
}
