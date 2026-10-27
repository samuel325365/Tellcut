// common.globe (spec 2026-10-25-brand-preset §6.2-4) — a dotted 3D globe: land as glowing dots, places as dots with a breathing
// ring, a home drawn brighter, arcs that grow from place to place, and the globe turning to put a place in front. An arc is only
// drawn on the near side: where its head would run behind the globe (Colombia → Taipei crosses the North Pacific), the arc waits
// until the globe turns it into view, so it never climbs over the rim. From the spike 2-kilnworth-coffee/scene.js (the globe).
// A block of its own, not a look of common.worldmap: that one is 2D, and marking it three would load three.js for every map.
import { clamp, eIO3, h, type ItemType } from '@tellcut/engine';
import type * as T from 'three';
import { loadLineFaces } from './brand-text.ts';
import { landDots } from './land-dots.ts';
import { ghostLayer, ghostLines, type GhostLine } from './text.ts';
import type { ThreeKit } from './three/kit.ts';

export const GLOBE_FOV = 36;
const R = 2, ARC_N = 80;

interface P { places: string; home: string; arcs: string; turn: string; labels: boolean; dot: string; accent: string; bg: string; font: string }
interface Place { name: string; lon: number; lat: number }
interface Arc { t0: number; t1: number; a: Place; b: Place }
interface S {
  cv: HTMLCanvasElement; ghost: HTMLElement; p: P; W: number; H: number; kit?: ThreeKit;
  places: Place[]; arcs: Arc[]; keys: Array<{ t: number; lon: number; lat: number }>;
  gl?: { scene: T.Scene; cam: T.PerspectiveCamera; globe: T.Group; pins: Array<{ g: T.Group; ring: T.Mesh; place: Place }>; arcs: Array<{ g: T.Group; local: T.Vector3[]; head: T.Mesh; tubes: T.Mesh[] }>; mat: T.Material; parts: Array<{ dispose(): void }> };
}

const rad = (d: number) => (d * Math.PI) / 180;
/** a place on the unrotated globe: longitude 0 faces +z */
const llx = (lon: number, lat: number, r: number): [number, number, number] => [r * Math.cos(rad(lat)) * Math.sin(rad(lon)), r * Math.sin(rad(lat)), r * Math.cos(rad(lat)) * Math.cos(rad(lon))];

/** "name|lon|lat" a line or comma separated, as common.worldmap's parseCities splits; its "中文|英文|經度|緯度" works too (the first two numbers) */
export function parsePlaces(text: string): Place[] {
  return String(text ?? '').split(/[,，\n]/).map((l) => l.split('|').map((x) => x.trim())).flatMap((f) => {
    const vals = f.slice(1).filter((x) => x !== '' && Number.isFinite(Number(x))).map(Number);
    return f[0] && vals.length >= 2 ? [{ name: f[0], lon: vals[0], lat: vals[1] }] : [];
  });
}

/** where the globe faces at `t`: keys "t|lon,lat" eased one to the next (the short way round in longitude) */
function facingAt(keys: S['keys'], t: number): { lon: number; lat: number } {
  if (!keys.length) return { lon: t * 10, lat: 15 };
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) if (t < keys[i].t) {
    const a = keys[i - 1], b = keys[i], x = eIO3((t - a.t) / (b.t - a.t || 1));
    let d = b.lon - a.lon; d -= 360 * Math.round(d / 360);
    return { lon: a.lon + d * x, lat: a.lat + (b.lat - a.lat) * x };
  }
  return keys[keys.length - 1];
}

/** a point turned so that (lon0, lat0) faces +z: first about y by -lon0, then about x by lat0 (as the 3D globe turns) */
function turnTo(v: [number, number, number], lon0: number, lat0: number): [number, number, number] {
  const a = -rad(lon0), b = rad(lat0), [x, y, z] = v;
  const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)];
}

export const globe: ItemType<P, S> = {
  type: 'common.globe', label: '點陣地球產地圖', category: 'travel', kind: 'overlay', three: true,
  doc: '3D 點陣地球：陸地是發光的點、產地是圓點加呼吸的光圈、據點（home）更亮，弧線從一地長到另一地，地球轉到讓某地正對鏡頭；弧線只畫在正面，頭跑到背面時會等地球轉過來再畫，不會從邊緣冒出去（產地、據點、出貨、分店；地點寫法同 common.worldmap）',
  params: [
    { key: 'places', label: '地點（名字|經度|緯度，一行一個或用逗號分開；common.worldmap 的「中文|英文|經度|緯度」也可以）', type: 'text', default: '' },
    { key: 'home', label: '據點的名字（亮白色，弧線都畫向它）', type: 'string', default: '' },
    { key: 'arcs', label: '弧線（起-迄秒|起點>終點，一行一條）', type: 'text', default: '' },
    { key: 'turn', label: '轉向（秒|經度,緯度，一行一個；空＝從第一個地點轉到據點）', type: 'text', default: '' },
    { key: 'labels', label: '地名小字', type: 'bool', default: true },
    { key: 'dot', label: '陸地點', type: 'color', default: '#d9a27a' },
    { key: 'accent', label: '產地點和弧線', type: 'color', default: '#ff9a52', theme: 'palette.accent' },
    { key: 'bg', label: '背景色', type: 'color', default: '#0d0f14', theme: 'palette.ink' },
    { key: 'font', label: '地名字型', type: 'string', default: 'Inter' },
  ],
  media: () => ({ videos: [], stills: [] }),
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const p = ctx.params, places = parsePlaces(p.places), byName = new Map(places.map((x) => [x.name, x]));
    const arcs = p.arcs.split('\n').flatMap((l) => {
      const [time, route] = l.split('|').map((x) => x.trim()), [t0, t1] = (time ?? '').split('-').map(Number), [a, b] = (route ?? '').split('>').map((x) => byName.get(x.trim()));
      return a && b && Number.isFinite(t0) && Number.isFinite(t1) ? [{ t0, t1, a, b }] : [];
    });
    let keys = p.turn.split('\n').flatMap((l) => {
      const [time, at] = l.split('|').map((x) => x.trim()), [lon, lat] = (at ?? '').split(',').map(Number);
      return Number.isFinite(Number(time)) && time !== '' && Number.isFinite(lon) && Number.isFinite(lat) ? [{ t: Number(time), lon, lat }] : [];
    }).sort((x, y) => x.t - y.t);
    if (!keys.length && places.length) {
      const home = byName.get(p.home), first = places[0];
      keys = home && home !== first ? [{ t: 0, ...first }, { t: ctx.dur, ...home }] : [{ t: 0, ...first }];
    }
    return { cv, ghost: ghostLayer(ctx.root), p, W: ctx.W, H: ctx.H, kit: ctx.three as ThreeKit | undefined, places, arcs, keys };
  },
  async ready(s) {
    await loadLineFaces((document as Document & { fonts?: FontFaceSet }).fonts, [{ weight: 600, family: s.p.font, text: s.places.map((x) => x.name).join('') }]);
    if (s.kit) build3d(s, s.kit);
  },
  draw(ctx, s) {
    const { W, H } = ctx;
    if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
    const g = s.cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const out = s.gl && s.kit ? (pose(s, ctx.local, W, H), s.kit.render(s.gl.scene, s.gl.cam, W, H, { toneMapping: 'neutral', background: s.p.bg })) : null;
    // the place names for check and the editor: transparent copies over the canvas
    if (out) { g.drawImage(out, 0, 0, W, H); ghostLines(s.ghost, s.p.labels ? labels3d(g, s, W, H) : []); return; }
    ghostLines(s.ghost, flat(g, s, ctx.local, W, H));
  },
  hide(s) { s.cv.width = 0; s.cv.height = 0; },
  dispose(s) { for (const a of s.gl?.arcs ?? []) for (const m of a.tubes) m.geometry.dispose(); for (const p of s.gl?.parts ?? []) p.dispose(); s.gl = undefined; },
};

function build3d(s: S, kit: ThreeKit) {
  const T3 = kit.THREE, p = s.p, parts: Array<{ dispose(): void }> = [];
  const scene = new T3.Scene(), cam = new T3.PerspectiveCamera(GLOBE_FOV, s.W / s.H, 0.05, 100);
  const globe = new T3.Group(); scene.add(globe);
  const bodyGeo = new T3.SphereGeometry(R * 0.985, 64, 48), body = new T3.MeshStandardMaterial({ color: new T3.Color(p.bg).offsetHSL(0, 0, 0.05), roughness: 0.85 });
  const haloGeo = new T3.SphereGeometry(R * 1.06, 64, 48), halo = new T3.MeshBasicMaterial({ color: p.accent, transparent: true, opacity: 0.07, side: T3.BackSide, depthWrite: false });
  globe.add(new T3.Mesh(bodyGeo, body), new T3.Mesh(haloGeo, halo)); parts.push(bodyGeo, body, haloGeo, halo);
  // land: a soft round dot per point
  const dc = document.createElement('canvas'); dc.width = dc.height = 64;
  const dx = dc.getContext('2d');
  if (dx) { const gr = dx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); dx.fillStyle = gr; dx.fillRect(0, 0, 64, 64); }
  const dotTex = new T3.CanvasTexture(dc), pts = landDots(), pos = new Float32Array(pts.length * 3);
  pts.forEach(([lon, lat], i) => pos.set(llx(lon, lat, R * 1.002), i * 3));
  const landGeo = new T3.BufferGeometry(); landGeo.setAttribute('position', new T3.BufferAttribute(pos, 3));
  const landMat = new T3.PointsMaterial({ color: p.dot, size: 0.045, map: dotTex, transparent: true, depthWrite: false });
  globe.add(new T3.Points(landGeo, landMat)); parts.push(dotTex, landGeo, landMat);
  // places
  const dotGeo = new T3.CircleGeometry(0.035, 24), ringGeo = new T3.RingGeometry(0.06, 0.075, 40); parts.push(dotGeo, ringGeo);
  const pins = s.places.map((place) => {
    const g = new T3.Group(), at = new T3.Vector3(...llx(place.lon, place.lat, R * 1.01)), home = place.name === p.home;
    g.name = `globe-pin-${place.name}`; g.position.copy(at); g.lookAt(at.clone().multiplyScalar(2));
    const dm = new T3.MeshBasicMaterial({ color: home ? '#ffffff' : p.accent }), rm = new T3.MeshBasicMaterial({ color: home ? '#ffffff' : p.accent, transparent: true });
    const dot = new T3.Mesh(dotGeo, dm), ring = new T3.Mesh(ringGeo, rm); dot.name = 'dot';
    g.add(dot, ring); globe.add(g); parts.push(dm, rm);
    return { g, ring, place };
  });
  // arcs: the great-circle way, lifted in the middle
  const mat = new T3.MeshBasicMaterial({ color: p.accent }), headGeo = new T3.SphereGeometry(0.03, 16, 12); parts.push(mat, headGeo);
  const arcs = s.arcs.map((arc, k) => {
    const A = new T3.Vector3(...llx(arc.a.lon, arc.a.lat, 1)), B = new T3.Vector3(...llx(arc.b.lon, arc.b.lat, 1)), ang = A.angleTo(B) || 1e-6, local: T.Vector3[] = [];
    for (let i = 0; i <= ARC_N; i++) {
      const u = i / ARC_N, q = A.clone().multiplyScalar(Math.sin((1 - u) * ang) / Math.sin(ang)).add(B.clone().multiplyScalar(Math.sin(u * ang) / Math.sin(ang)));
      local.push(q.normalize().multiplyScalar(R * (1.01 + 0.16 * Math.sin(Math.PI * u) * Math.min(1, ang))));
    }
    const g = new T3.Group(); g.name = `globe-arc-${k}`; g.userData.drawn = [];
    const head = new T3.Mesh(headGeo, mat); g.add(head); globe.add(g);
    return { g, local, head, tubes: [] as T.Mesh[] };
  });
  scene.add(new T3.AmbientLight(0xffffff, 0.6));
  const key = new T3.DirectionalLight(0xffffff, 1.0); key.position.set(3, 4, 6); scene.add(key);
  s.gl = { scene, cam, globe, pins, arcs, mat, parts };
}

/** the camera first, then the globe's turn, then what depends on facing the camera (the arcs) */
function pose(s: S, t: number, W: number, H: number) {
  const gl = s.gl!, T3 = s.kit!.THREE, aspect = W / H, tan = Math.tan(rad(GLOBE_FOV / 2));
  gl.cam.aspect = aspect;
  // the globe with its halo and some room around: about 70 % of the height
  gl.cam.position.set(0, 0, Math.max(8.5, (R * 1.5) / (tan * Math.min(1, aspect))));
  gl.cam.lookAt(0, 0, 0); gl.cam.updateProjectionMatrix();
  const f = facingAt(s.keys, t);
  gl.globe.rotation.set(rad(f.lat), -rad(f.lon), 0);
  gl.globe.updateMatrixWorld(true);
  gl.pins.forEach(({ ring }, k) => { const b = (t * 0.8 + k * 0.31) % 1; ring.scale.setScalar(1 + b * 1.4); (ring.material as T.MeshBasicMaterial).opacity = 1 - b; });
  // in view: on the camera's side and, as seen, inside the globe's disc (a lifted arc near the rim would stick out past it)
  const d = gl.cam.position.z, rim = (R * 0.98) / Math.sqrt(d * d - R * R);
  const front = (v: T.Vector3) => v.z > 0 && Math.hypot(v.x, v.y) / (d - v.z) < rim;
  s.arcs.forEach((arc, k) => {
    const a = gl.arcs[k], n = t >= arc.t0 ? Math.round(clamp((t - arc.t0) / Math.max(0.001, arc.t1 - arc.t0)) * ARC_N) + 1 : 0;
    // only what has grown and is on the near side, in runs: a part behind the globe is left out (it is drawn once turned into view)
    const drawn: T.Vector3[] = [], runs: T.Vector3[][] = [];
    let run: T.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const w = a.local[i].clone().applyMatrix4(gl.globe.matrixWorld);
      if (front(w)) { drawn.push(w); run.push(a.local[i]); } else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    a.g.userData.drawn = drawn;
    for (const m of a.tubes) { a.g.remove(m); m.geometry.dispose(); }
    a.tubes = runs.filter((r) => r.length >= 2).map((r) => { const m = new T3.Mesh(new T3.TubeGeometry(new T3.CatmullRomCurve3(r), Math.max(4, r.length), 0.008, 6, false), gl.mat); a.g.add(m); return m; });
    // the head rides the tip while it grows, if the tip is in view
    const tip = n > 0 ? a.local[n - 1].clone().applyMatrix4(gl.globe.matrixWorld) : null;
    a.head.visible = !!tip && n <= ARC_N && front(tip);
    if (n > 0) a.head.position.copy(a.local[n - 1]);
  });
}

/** the place names next to their dots, on the near side only */
function labels3d(g: CanvasRenderingContext2D, s: S, W: number, H: number): GhostLine[] {
  const gl = s.gl!, k = Math.min(W, H) / 1080, T3 = s.kit!.THREE, family = `'${s.p.font}', 'Noto Sans TC', sans-serif`, out: GhostLine[] = [];
  g.font = `600 ${26 * k}px ${family}`; g.fillStyle = '#f1ece4'; g.textAlign = 'left';
  for (const { g: pin, place } of gl.pins) {
    const w = pin.getWorldPosition(new T3.Vector3());
    if (w.clone().normalize().dot(gl.cam.position.clone().sub(w).normalize()) <= 0.15) continue;
    const v = w.project(gl.cam);
    const x = ((v.x + 1) / 2) * W + 16 * k, y = ((1 - v.y) / 2) * H - 12 * k;
    g.fillText(place.name, x, y);
    out.push({ text: place.name, x, y, size: 26 * k, family, weight: 600 });
  }
  return out;
}

/** no WebGL2: the near hemisphere as a flat disc of dots, with the places */
function flat(g: CanvasRenderingContext2D, s: S, t: number, W: number, H: number): GhostLine[] {
  const out: GhostLine[] = [], p = s.p, f = facingAt(s.keys, t), r = Math.min(W, H) * 0.36, cx = W / 2, cy = H / 2, k = Math.min(W, H) / 1080;
  g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = p.dot;
  for (const [lon, lat] of landDots()) {
    const [x, y, z] = turnTo(llx(lon, lat, 1), f.lon, f.lat);
    if (z <= 0) continue;
    g.beginPath(); g.arc(cx + x * r, cy - y * r, 1.6 * k, 0, Math.PI * 2); g.fill();
  }
  const family = `'${p.font}', 'Noto Sans TC', sans-serif`;
  g.font = `600 ${26 * k}px ${family}`; g.textAlign = 'left';
  for (const place of s.places) {
    const [x, y, z] = turnTo(llx(place.lon, place.lat, 1), f.lon, f.lat);
    if (z <= 0) continue;
    g.fillStyle = place.name === p.home ? '#ffffff' : p.accent;
    g.beginPath(); g.arc(cx + x * r, cy - y * r, 6 * k, 0, Math.PI * 2); g.fill();
    if (p.labels) { g.fillStyle = '#f1ece4'; g.fillText(place.name, cx + x * r + 14 * k, cy - y * r - 10 * k); out.push({ text: place.name, x: cx + x * r + 14 * k, y: cy - y * r - 10 * k, size: 26 * k, family, weight: 600 }); }
  }
  return out;
}
