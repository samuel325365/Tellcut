// common.mapcam — a camera over the map pictures `assets map` downloads (from t2-map-assets' fx.satmap and fx.minimap): every map
// picture knows where it lies on the earth (its project.json source keeps `map: { center, zoom }`, Web Mercator), so longitudes and
// latitudes become pixels of it. The camera moves on keyframes (place + zoom); pictures of the same place at other zooms are stacked
// and each fades in once it covers the frame (from space to street in one move). Routes draw along their points, pins drop, circles
// pulse, places and notes are named, and the map can open out of a small round map in a corner and close back into it — mode mini is
// that corner map on its own, with the stop's name beside it. Without a picture the coarse world coastline stands in.
import { abs, clamp, cssCamel, eIO3, eOut3, h, type ItemType, lerp, prog, type Project, type Theme } from '@tellcut/engine';
import { canvasAt, spline, freeCanvas } from './inkline.ts';
import { cityOf, cutLine, EUROPE_TRIP, keysAt, mapPin, merc, parseCities, pinDrop, placeOf, placesOf, ringsPath, rowsOf, spanOf, type City, type Pt } from './geo.ts';
import { WORLD_LAND } from './world110.ts';
import { fitPx, nl } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  mode: 'cam' | 'mini'; source: string; at: string; zoom: number; layers: string; places: string; cam: string;
  routes: string; pins: string; rings: string; areas: string; labels: string; titles: string; open: string; close: string;
  corner: 'tl' | 'tr' | 'bl' | 'br'; mini: number; no: string; name: string; latin: string; cta: string; credit: string;
  fadeIn: number; fadeOut: number; vignette: number; grade: string;
  font: string; body: string; latinFont: string; mono: string; accent: string; paper: string; ink: string; hl: string; sea: string; land: string;
}
interface S {
  wrap: HTMLElement; cv: HTMLCanvasElement; imgs: Map<string, HTMLImageElement>; pins: Pool; notes: Pool; heads: Pool; titles: Pool;
  cta: HTMLElement; credit: HTMLElement; side: HTMLElement; job: Promise<void>;
}

/** a few DOM boxes reused frame after frame: next() hands out the n-th (made on first use), end() hides the ones not handed out */
interface Pool { begin(): void; next(): HTMLElement; end(): void }
function pool(root: HTMLElement, make: () => HTMLElement): Pool {
  const els: HTMLElement[] = [];
  let n = 0;
  return {
    begin() { n = 0; },
    next() { const e = els[n] ?? (els[n] = make()); n++; e.style.display = ''; return e; },
    end() { for (let i = n; i < els.length; i++) els[i].style.display = 'none'; },
  };
}

/** a map picture placed on the earth: centre [lon, lat], its zoom, its size in px, the tiles' attribution */
export interface MapPic { id: string; path: string; center: Pt; zoom: number; w: number; h: number; credit: string }

/** "18.77,42.42,12.45" → centre and zoom (null when it is not three numbers) */
const geoOf = (s: string): { center: Pt; zoom: number } | null => {
  const n = String(s ?? '').split(/[,，\s]+/).filter(Boolean).map(Number);
  return n.length === 3 && n.every(Number.isFinite) ? { center: [n[0], n[1]], zoom: n[2] } : null;
};

/** The pictures a mapcam draws, lowest zoom first: `source` and the `layers` ("id" or "id@lon,lat,zoom", one a line or comma
 *  separated), each placed by the `map` its project.json source keeps (`assets map` writes it), else by the coordinates given with it
 *  — for `source`, `at` + `zoom` (a map downloaded before the record was kept). One placed by neither is left out. */
export function mapPictures(project: Pick<Project, 'sources'>, source: string, layers: string, at = '', zoom = 0): MapPic[] {
  const out: MapPic[] = [];
  const add = (id: string, given: { center: Pt; zoom: number } | null) => {
    const s = project.sources?.[id];
    if (!s) return;
    const g = given ?? (s.map ? { center: [s.map.center[0], s.map.center[1]] as Pt, zoom: s.map.zoom } : null);
    if (g) out.push({ id, path: s.path, center: g.center, zoom: g.zoom, w: s.width, h: s.height, credit: s.map?.credit ?? '' });
  };
  if (source) {
    // the record wins unless `at` is given: "lon,lat,zoom", or "lon,lat" with `zoom`
    const c = placeOf(at, []), z = Number(zoom);
    add(source, geoOf(at) ?? (c && z > 0 ? { center: c, zoom: z } : null));
  }
  // one a line (or ; between); ids without coordinates may also be comma separated
  for (const piece of nl(layers).split(/[\n;；]+/)) {
    const t = piece.trim();
    if (!t) continue;
    if (!t.includes('@')) { for (const id of t.split(/[,，\s]+/).filter(Boolean)) add(id, null); continue; }
    const [id, geo] = t.split('@').map((x) => x.trim());
    add(id, geoOf(geo));
  }
  return out.map((p, i) => ({ p, i })).sort((a, b) => a.p.zoom - b.p.zoom || a.i - b.i).map((x) => x.p);
}

/** the view zoom at which picture `m` (centred) just covers a W×H frame; u = px of a 1080-short-side frame */
export const coverZoom = (m: Pick<MapPic, 'zoom' | 'w' | 'h'>, W: number, H: number, u: number) => m.zoom + Math.log2(Math.max(W / (m.w * u), H / (m.h * u)));

/** How much of each picture shows at view zoom v: the lowest-zoom ones always, every other one fading in over a third of a zoom
 *  level once it covers the frame (so a closer picture takes over only when nothing around it is missing). */
export function pictureAlphas(pics: MapPic[], v: number, W: number, H: number, u: number): number[] {
  const z0 = pics.length ? pics[0].zoom : 0;
  return pics.map((m) => { if (m.zoom <= z0 + 1e-9) return 1; const zc = coverZoom(m, W, H, u); return prog(v, zc - 0.05, zc + 0.25); });
}

/** camera keys "秒|地點或經度,緯度|zoom" (one a line) → [t, x, y, z] with x, y in Mercator units; bad lines dropped */
export function parseCam(s: string, places: City[]): number[][] {
  return rowsOf(s).map(([t, at, z]) => { const c = placeOf(at, places), [x, y] = c ? merc(c[0], c[1]) : [NaN, NaN]; return [Number(t), x, y, Number(z)]; })
    .filter((k) => k.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
}

/** The camera when none is given: a slow push into the main picture (from where it covers the frame), or, without one, the places
 *  fitted into the middle of the frame (the whole world without places). */
export function autoCam(main: MapPic | undefined, places: City[], dur: number, W: number, H: number, u: number): number[][] {
  if (main) { const [x, y] = merc(main.center[0], main.center[1]), z = coverZoom(main, W, H, u); return [[0, x, y, z + 0.02], [dur, x, y, z + 0.3]]; }
  if (!places.length) return [[0, 128, 128, 1], [dur, 128, 128, 1.1]];
  const ps = places.map((c) => merc(c.lon, c.lat)), xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const z = Math.min(14, Math.log2(Math.min((W * 0.62) / (Math.max(x1 - x0, 1e-4) * u), (H * 0.5) / (Math.max(y1 - y0, 1e-4) * u))));
  return [[0, (x0 + x1) / 2, (y0 + y1) / 2, z - 0.12], [dur, (x0 + x1) / 2, (y0 + y1) / 2, z + 0.12]];
}

/** the small round map: its centre and radius (`size` × the short side), inside the safe area at `corner` */
export function miniCircle(W: number, H: number, safe: Theme['safe'], corner: P['corner'], size: number) {
  const r = size * Math.min(W, H), left = corner[1] === 'l', top = corner[0] === 't';
  return { x: left ? safe.side * W + r : W * (1 - safe.side) - r, y: top ? safe.top * H + r : H * (1 - safe.bottom) - r, r, left };
}

/** iris at t: 0 = the small round map, 1 = the whole frame (open "a-b" grows it, close "a-b" shrinks it back) */
export function irisAt(t: number, open: string, close: string): number {
  let v = 1;
  const o = open ? spanOf(open) : null, c = close ? spanOf(close) : null;
  if (o && Number.isFinite(o[0])) v = Math.min(v, eIO3(prog(t, o[0], Number.isFinite(o[1]) ? o[1] : o[0] + 0.6)));
  if (c && Number.isFinite(c[0])) v = Math.min(v, 1 - eIO3(prog(t, c[0], Number.isFinite(c[1]) ? c[1] : c[0] + 0.6)));
  return v;
}

/** a route's share drawn at t: "-" (or nothing) already drawn; "a" drawn over 1.2 s from a; "a-b" over a…b */
export function routeAt(span: [number, number], t: number) {
  if (!Number.isFinite(span[0])) return 1;
  return eIO3(prog(t, span[0], Number.isFinite(span[1]) && span[1] > span[0] ? span[1] : span[0] + 1.2));
}

/** fade in over 0.3 s from a, out over 0.3 s up to b */
const windowAt = (t: number, [a, b]: [number, number]) => Math.min(Number.isFinite(a) ? prog(t, a, a + 0.3) : 1, Number.isFinite(b) ? 1 - prog(t, b - 0.3, b) : 1);

export const mapcam: ItemType<P, S> = {
  type: 'common.mapcam', label: '地圖鏡頭', category: 'travel', kind: 'overlay',
  doc: '把 assets map 抓的地圖照片當成可以推拉的鏡頭（source 給地圖的素材 id；地圖的經緯度和 zoom 記在素材裡，舊的地圖用 at＋zoom 補）：cam 關鍵影格「秒|地點|zoom」（空＝慢慢推近）、layers 疊同一地方不同 zoom 的圖（蓋滿畫面時自動淡入，從太空推到街上）、routes 路線逐段畫出（頭可以是箭頭、點或 emoji）、pins 圖釘落下＋地名、rings 圓圈、areas 框出一塊區域、labels 海名與註記、titles 大標、cta 片尾大圖釘；open／close 從角落小圓地圖打開、收回，mode mini 就是那個角落小地圖（旁邊寫第幾站）；地名全部用 places（中文|英文|經度|緯度）；沒有地圖照片時用粗略的世界海岸線代替。地球儀到國家用 common.worldmap，再接 mapcam（zoom ≈ log2(2π·cos緯度·10^log10R／256)）',
  params: [
    { key: 'mode', label: '模式（cam 滿版鏡頭、mini 角落小圓地圖）', type: 'enum', options: ['cam', 'mini'], default: 'cam' },
    { key: 'source', label: '地圖照片（assets map 的素材；空＝用世界海岸線代替）', type: 'source-ref', default: '' },
    { key: 'at', label: '舊地圖的中心（經度,緯度,zoom 或 經度,緯度；素材裡有記錄就不用）', type: 'string', default: '' },
    { key: 'zoom', label: '舊地圖的 zoom（配 at 的經度,緯度；0＝看素材記錄）', type: 'number', min: 0, max: 22, step: 0.01, default: 0 },
    { key: 'layers', label: '疊上去的其他地圖（素材 id，或 id@經度,緯度,zoom；一行一張）', type: 'text', default: '' },
    { key: 'places', label: '地點（中文|英文|經度|緯度，逗號分隔；其他欄用名字指它）', type: 'text', default: EUROPE_TRIP },
    { key: 'cam', label: '鏡頭（秒|地點或經度,緯度|zoom，一行一個；空＝慢慢推近地圖或框住所有地點）', type: 'text', default: '' },
    { key: 'routes', label: '路線（起-迄|地點>地點>…|頭 arrow、dot 或 emoji|dash 虛線；- ＝一開始就畫好）', type: 'text', default: '0.3-1.8|巴黎>克拉科夫>塔林|dot' },
    { key: 'pins', label: '圖釘（起[-標籤收起]|地點|打勾秒|標籤在 r 右、l 左、u 上、d 下或 - 不要；空＝自動）', type: 'text', default: '0.2|巴黎|1.0\n0.9|克拉科夫|1.9\n1.7|塔林' },
    { key: 'rings', label: '圓圈（起[-迄]|地點|半徑 px）', type: 'text', default: '' },
    { key: 'areas', label: '框出區域（起[-迄]|地點>地點>地點…，兩點＝方框）', type: 'text', default: '' },
    { key: 'labels', label: '標籤（起-迄|地點、經度,緯度或 @x,y 畫面比例|文字|小字|note 註記卡或 sea 海名）', type: 'text', default: '0.8-3|3,56|北海|North Sea|sea' },
    { key: 'titles', label: '大標（起-迄|大字|小字）', type: 'text', default: '' },
    { key: 'open', label: '從小圓地圖打開（起-迄 秒；空＝一開始就滿版）', type: 'string', default: '' },
    { key: 'close', label: '收回小圓地圖（起-迄 秒）', type: 'string', default: '' },
    { key: 'corner', label: '小圓地圖的角落（tl 左上、tr 右上、bl 左下、br 右下）', type: 'enum', options: ['tl', 'tr', 'bl', 'br'], default: 'tl' },
    { key: 'mini', label: '小圓地圖半徑（畫面短邊比例）', type: 'number', min: 0.05, max: 0.3, step: 0.005, default: 0.11 },
    { key: 'no', label: '小地圖旁的第幾站（mini）', type: 'string', default: '' },
    { key: 'name', label: '小地圖旁的站名（mini）', type: 'string', default: '' },
    { key: 'latin', label: '小地圖旁的外文站名（mini）', type: 'string', default: '' },
    { key: 'cta', label: '片尾大圖釘（秒|大字|小字；空＝沒有）', type: 'string', default: '' },
    { key: 'credit', label: '地圖署名（auto＝素材記錄的署名、空＝不顯示）', type: 'string', default: 'auto' },
    { key: 'fadeIn', label: '淡入（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'fadeOut', label: '淡出（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'vignette', label: '四周壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: 'grade', label: '地圖照片的調色（CSS filter，例如 saturate(1.2) brightness(1.1)）', type: 'string', default: '' },
    { key: 'font', label: '地名與大標字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'body', label: '註記字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'latinFont', label: '外文字型', type: 'string', default: 'Cormorant Garamond' },
    { key: 'mono', label: '數字字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'accent', label: '圖釘與路線光暈', type: 'color', default: '#e2673a', theme: 'palette.accent' },
    { key: 'paper', label: '路線、字與框線', type: 'color', default: '#fff4e0', theme: 'palette.paper' },
    { key: 'ink', label: '標籤底色', type: 'color', default: '#0b1219', theme: 'palette.ink' },
    { key: 'hl', label: '區域框', type: 'color', default: '#e8c35a', theme: 'palette.hl' },
    { key: 'sea', label: '海（沒有照片的地方）', type: 'color', default: '#0b1622' },
    { key: 'land', label: '陸地（世界海岸線代替照片時）', type: 'color', default: '#2c3b3a' },
  ],
  build(ctx) {
    const r = h('div', null, null, ctx.root), cv = h('canvas', null, null, r) as HTMLCanvasElement, p = ctx.params;
    cssCamel(r, { position: 'absolute', inset: '0' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const pill = () => { const d = abs(r, { whiteSpace: 'pre', lineHeight: '1.05' }); h('div', null, null, d); h('div', null, null, d); return d; };
    const s: S = {
      wrap: r, cv, imgs: new Map(), pins: pool(r, pill), notes: pool(r, pill), heads: pool(r, () => abs(r, { whiteSpace: 'pre', lineHeight: '1', textAlign: 'center', fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" })),
      titles: pool(r, pill), cta: pill(), credit: abs(r, { whiteSpace: 'pre', lineHeight: '1.2' }), side: pill(), job: Promise.resolve(),
    };
    h('div', null, null, s.side);
    // the pictures known now are loaded before the first frame (ready); one chosen later in the editor loads as it is drawn
    const pics = mapPictures(ctx.project, p.source, p.layers, p.at, p.zoom);
    s.job = Promise.all(pics.map((m) => imageOf(s, ctx.media.fileUrl(m.path)).decode().catch(() => {}))).then(() => {});
    return s;
  },
  ready: (s) => s.job,
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.cv, W, H);
    for (const pl of [s.pins, s.notes, s.heads, s.titles]) pl.begin();
    const done = () => { for (const pl of [s.pins, s.notes, s.heads, s.titles]) pl.end(); };
    const hide = (...els: HTMLElement[]) => els.forEach((e) => { e.style.display = 'none'; });
    const alpha = Math.min(p.fadeIn > 0 ? prog(t, 0, p.fadeIn) : 1, p.fadeOut > 0 ? 1 - prog(t, dur - p.fadeOut, dur) : 1);
    const places = parseCities(p.places), pics = mapPictures(ctx.project, p.source, p.layers, p.at, p.zoom);
    const main = pics.find((m) => m.id === p.source) ?? pics[0];
    const keys = parseCam(p.cam, places), cam = keysAt(keys.length ? keys : autoCam(main, places, dur, W, H, u), t)!;
    const mc = miniCircle(W, H, theme.safe, p.corner, p.mini), iris = p.mode === 'mini' ? 0 : irisAt(t, p.open, p.close);
    const ax = lerp(mc.x, W / 2, iris), ay = lerp(mc.y, H / 2, iris), rad = lerp(mc.r, Math.hypot(W, H) * 0.62, iris);
    const [cx, cy, z] = cam, sc = 2 ** z * u;
    const px = (lon: number, lat: number): Pt => { const [x, y] = merc(lon, lat); return [ax + (x - cx) * sc, ay + (y - cy) * sc]; };
    if (alpha <= 0) { hide(s.cta, s.credit, s.side); done(); return; }
    cssCamel(s.wrap, { opacity: String(alpha) });
    const font = `'${p.font}', 'Noto Serif TC', serif`, body = `'${p.body}', 'Noto Sans TC', sans-serif`, latin = `'${p.latinFont}', 'Cormorant Garamond', serif`, mono = `'${p.mono}', 'JetBrains Mono', monospace`;

    // ── the map: sea, the world's coast standing in, the pictures, a vignette (inside the circle while it is not open)
    g.save();
    if (iris < 1) { g.beginPath(); g.arc(ax, ay, rad, 0, Math.PI * 2); g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 24 * u; g.fillStyle = p.sea; g.fill(); g.restore(); g.clip(); }
    g.fillStyle = p.sea; g.fillRect(0, 0, W, H);
    ringsPath(g, px, WORLD_LAND, W, H);
    g.fillStyle = p.land; g.fill('evenodd'); g.strokeStyle = withAlpha(p.paper, 0.25); g.lineWidth = 1.5 * u; g.stroke();
    const al = pictureAlphas(pics, z, W, H, u);
    pics.forEach((m, i) => {
      const img = imageOf(s, ctx.media.fileUrl(m.path));
      if (al[i] <= 0 || !img.complete || !img.naturalWidth) return;
      const k = 2 ** (z - m.zoom) * u, [x, y] = px(m.center[0], m.center[1]);
      g.save(); g.globalAlpha = al[i]; if (p.grade) g.filter = p.grade;
      g.drawImage(img, x - (m.w / 2) * k, y - (m.h / 2) * k, m.w * k, m.h * k);
      g.restore();
    });
    if (p.vignette > 0) {
      const vg = g.createRadialGradient(ax, ay, Math.min(W, H) * 0.35, ax, ay, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${p.vignette})`); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    const k = lerp(0.7, 1, iris) * u;
    // areas: an outline drawn round in a second, a faint fill
    for (const [sp, pts] of rowsOf(p.areas)) {
      const span = spanOf(sp), a = windowAt(t, span), ll = placesOf(pts, places);
      if (a <= 0 || ll.length < 2) continue;
      const ring = (ll.length === 2 ? [ll[0], [ll[1][0], ll[0][1]], ll[1], [ll[0][0], ll[1][1]]] as Pt[] : ll).map(([lo, la]) => px(lo, la));
      const f = Number.isFinite(span[0]) ? eOut3(prog(t, span[0], span[0] + 1)) : 1, line = cutLine([...ring, ring[0]], f);
      g.save(); g.globalAlpha = a; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = withAlpha(p.hl, 0.14 * f); g.fill();
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8 * u; g.strokeStyle = p.hl; g.lineWidth = 7 * k;
      g.beginPath(); line.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.restore();
    }
    // routes: a glow, a dark casing, the line (dots for a planned one), a head on the moving end
    for (const [sp, pts, head = '', look = ''] of rowsOf(p.routes)) {
      const f = routeAt(spanOf(sp), t), ll = placesOf(pts, places);
      if (f <= 0 || ll.length < 2) continue;
      const path = cutLine(spline(ll.map(([lo, la]) => px(lo, la)), 10), f), w = 8 * k;
      const stroke = (color: string, lw: number, dash: number[] = []) => {
        g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); path.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      };
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      if (look === 'dash') stroke(withAlpha(p.paper, 0.8), w * 0.75, [w * 0.2, w * 2.4]);
      else { stroke(withAlpha(p.accent, 0.35), w * 3.2); stroke(withAlpha(p.ink, 0.55), w + 5 * k); stroke(p.paper, w); }
      g.restore();
      const moving = f > 0 && f < 1, [hx, hy] = path.head;
      if (head === 'arrow' && (moving || f >= 1)) arrow(g, hx, hy, path.ang, k, p.paper, p.ink);
      else if (head === 'dot' && moving) { g.save(); g.fillStyle = p.paper; g.strokeStyle = p.accent; g.lineWidth = 5 * k; g.beginPath(); g.arc(hx, hy, 11 * k, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
      else if (head && head !== 'arrow' && head !== 'dot' && moving && iris > 0.6) {
        const e = s.heads.next(), r = 34 * k;
        e.textContent = head;
        cssCamel(e, { left: `${hx - r}px`, top: `${hy - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, lineHeight: `${2 * r}px`, fontSize: `${r * 1.15}px`, borderRadius: '50%',
          background: p.accent, border: `${5 * k}px solid ${p.paper}`, boxSizing: 'border-box', boxShadow: `0 ${4 * u}px ${12 * u}px rgba(0,0,0,.4)` });
      }
    }
    // circles round a place: drawn in, then one ring pulsing out
    for (const [sp, at, rr] of rowsOf(p.rings)) {
      const span = spanOf(sp), c = placeOf(at, places);
      if (!c || !Number.isFinite(span[0]) || t < span[0] || t > span[1]) continue;
      const [x, y] = px(c[0], c[1]), r = (Number(rr) || 60) * k, q = t - span[0], a = eOut3(clamp(q / 0.4));
      g.save(); g.strokeStyle = p.paper; g.lineWidth = 6 * k; g.globalAlpha = a * windowAt(t, [-Infinity, span[1]]);
      g.beginPath(); g.arc(x, y, r * (1.4 - 0.4 * a), 0, Math.PI * 2); g.stroke();
      const ph = (q % 1.4) / 1.4; g.globalAlpha *= (1 - ph) * 0.8; g.lineWidth = 4 * k;
      g.beginPath(); g.arc(x, y, r * (1 + ph * 0.9), 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    // pins: dropped in with a bounce, ticked at their check time, named beside (labels only once the map is open)
    const pinA = prog(iris, 0.6, 0.8), ui = iris > 0.85;
    for (const [sp, at, chk = '', side0 = ''] of rowsOf(p.pins)) {
      const span = spanOf(sp), c = placeOf(at, places);
      if (!c || pinA <= 0) continue;
      const t0 = Number.isFinite(span[0]) ? span[0] : -1, q = prog(t, t0, t0 + 0.38);
      if (q <= 0) continue;
      const [x, y] = px(c[0], c[1]), size = 76 * k, drop = pinDrop(q) * 90 * k, ck = chk !== '' && Number.isFinite(Number(chk)) ? eOut3(prog(t, Number(chk), Number(chk) + 0.3)) : 0;
      g.save(); g.globalAlpha = pinA * clamp(q * 3); mapPin(g, x, y + drop, size, p.accent, { edge: p.paper, check: ck }); g.restore();
      // no side given: to the right, or to the left of a pin in the right third of the frame
      const side = side0 || (x > W * 0.64 ? 'l' : 'r'), city = cityOf(at, places), la = (ui ? 1 : 0) * eOut3(prog(t, t0 + 0.15, t0 + 0.45)) * (Number.isFinite(span[1]) ? 1 - prog(t, span[1], span[1] + 0.3) : 1);
      if (!city || side === '-' || la <= 0) continue;
      placeLabel(s.pins.next(), city.zh, city.en, x, y, size, side, la, u, { font, latin, ink: p.ink, paper: p.paper, accent: p.accent });
    }
    g.restore();
    // the circle's rim while it is not open; the small map's "you are here" and its north mark
    if (iris < 1) {
      g.save(); g.strokeStyle = p.paper; g.lineWidth = lerp(6 * u, 0, iris); g.beginPath(); g.arc(ax, ay, rad, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    if (p.mode === 'mini') {
      const ph = (t % 1.2) / 1.2;
      g.save();
      g.fillStyle = withAlpha(p.accent, 0.55 * (1 - ph)); g.beginPath(); g.arc(mc.x, mc.y, (12 + ph * 34) * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.paper; g.beginPath(); g.arc(mc.x, mc.y, 12 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.accent; g.beginPath(); g.arc(mc.x, mc.y, 7 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.paper; g.beginPath(); g.moveTo(mc.x, mc.y - mc.r - 16 * u); g.lineTo(mc.x - 9 * u, mc.y - mc.r + 2 * u); g.lineTo(mc.x + 9 * u, mc.y - mc.r + 2 * u); g.closePath(); g.fill();
      g.restore();
    }

    // ── words (DOM): notes and sea names, titles, the closing pin's card, the credit, the stop beside the small map
    for (const [sp, at, text = '', sub = '', look = 'note'] of rowsOf(p.labels)) {
      const a = (ui ? 1 : 0) * windowAt(t, spanOf(sp));
      if (a <= 0 || !text) continue;
      const scr = at.startsWith('@') ? at.slice(1).split(',').map(Number) : null, c = scr ? null : placeOf(at, places);
      if (!(scr && scr.length === 2 && scr.every(Number.isFinite)) && !c) continue;
      const [x, y] = scr ? [scr[0] * W, scr[1] * H] : px(c![0], c![1]), e = s.notes.next(), [l1, l2] = e.children as unknown as HTMLElement[];
      l1.textContent = text.replace(/\\n/g, '\n'); l2.textContent = sub;
      if (look === 'sea') {
        const fs = 46 * u, shadow = `0 0 ${12 * u}px rgba(0,0,0,.6), 0 ${2 * u}px ${4 * u}px rgba(0,0,0,.5)`;
        cssCamel(e, { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)', textAlign: 'center', opacity: String(a), background: 'none', padding: '0', borderRadius: '0', boxShadow: 'none', borderLeft: 'none' });
        cssCamel(l1, { fontFamily: font, fontWeight: '900', fontSize: `${fs}px`, letterSpacing: '0.35em', textIndent: '0.35em', color: 'rgba(214,236,255,0.95)', textShadow: shadow });
        cssCamel(l2, { display: sub ? 'block' : 'none', fontFamily: latin, fontStyle: 'italic', fontWeight: '500', fontSize: `${fs * 0.7}px`, color: 'rgba(214,236,255,0.9)', textShadow: shadow, marginTop: `${fs * 0.15}px` });
      } else {
        const fs = 44 * u;
        cssCamel(e, { left: `${x}px`, top: `${y}px`, transform: `translate(-50%, -50%) scale(${(0.9 + 0.1 * a).toFixed(4)})`, textAlign: 'center', opacity: String(a), background: withAlpha(p.paper, 0.94),
          padding: `${11 * u}px ${20 * u}px`, borderRadius: `${14 * u}px`, boxShadow: `0 ${4 * u}px ${16 * u}px rgba(0,0,0,.45)`, borderLeft: 'none' });
        cssCamel(l1, { fontFamily: body, fontWeight: '700', fontSize: `${fs}px`, lineHeight: '1.3', letterSpacing: '0', textIndent: '0', color: p.ink, textShadow: 'none' });
        cssCamel(l2, { display: sub ? 'block' : 'none', fontFamily: body, fontStyle: 'normal', fontWeight: '500', fontSize: `${fs * 0.62}px`, color: withAlpha(p.ink, 0.7), textShadow: 'none', marginTop: `${4 * u}px` });
      }
    }
    const room = W * (1 - 2 * theme.safe.side);
    for (const [sp, text = '', sub = ''] of rowsOf(p.titles)) {
      const a = (ui ? 1 : 0) * windowAt(t, spanOf(sp));
      if (a <= 0 || !text) continue;
      const e = s.titles.next(), [l1, l2] = e.children as unknown as HTMLElement[], fs = fitPx(text, 112 * u, room), shadow = `0 0 ${26 * u}px rgba(0,0,0,.7), 0 ${2 * u}px ${6 * u}px rgba(0,0,0,.6)`;
      l1.textContent = text; l2.textContent = sub;
      cssCamel(e, { left: '0', width: `${W}px`, top: `${theme.safe.top * H + 40 * u}px`, textAlign: 'center', opacity: String(a), transform: `translateY(${((1 - a) * 30 * u).toFixed(2)}px)` });
      cssCamel(l1, { fontFamily: font, fontWeight: '900', fontSize: `${fs}px`, lineHeight: '1.15', color: p.paper, textShadow: shadow });
      cssCamel(l2, { display: sub ? 'block' : 'none', fontFamily: latin, fontStyle: 'italic', fontWeight: '500', fontSize: `${fitPx(sub, 64 * u, room)}px`, color: withAlpha(p.paper, 0.9), textShadow: shadow, marginTop: `${10 * u}px` });
    }
    const [ctaT, ctaText = '', ctaSub = ''] = p.cta ? String(p.cta).split('|').map((x) => x.trim()) : [];
    if (ui && ctaText && t >= Number(ctaT)) {
      const q = t - Number(ctaT), x = W / 2, y = ((theme.safe.top + 1 - theme.safe.bottom) / 2) * H, size = 150 * u;
      g.save(); g.globalAlpha = clamp(prog(q, 0, 0.38) * 3); mapPin(g, x, y + pinDrop(prog(q, 0, 0.38)) * 90 * u, size, p.accent, { edge: p.paper }); g.restore();
      const a = eOut3(prog(q, 0.3, 0.65)), [l1, l2] = s.cta.children as unknown as HTMLElement[];
      l1.textContent = ctaText; l2.textContent = ctaSub;
      cssCamel(s.cta, { display: a > 0 ? 'block' : 'none', left: `${x}px`, top: `${y + 40 * u}px`, transform: `translate(-50%, ${((1 - a) * 30 * u).toFixed(2)}px)`, opacity: String(a), textAlign: 'center',
        background: p.paper, padding: `${26 * u}px ${45 * u}px ${34 * u}px`, borderRadius: `${26 * u}px`, borderBottom: `${14 * u}px solid ${p.accent}`, boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,.55)` });
      cssCamel(l1, { fontFamily: font, fontWeight: '900', fontSize: `${fitPx(ctaText, 92 * u, room - 90 * u)}px`, color: '#1b1712' });
      cssCamel(l2, { display: ctaSub ? 'block' : 'none', fontFamily: body, fontWeight: '700', fontSize: `${42 * u}px`, color: '#5a4a3a', marginTop: `${14 * u}px` });
    } else hide(s.cta);
    const credit = p.credit === 'auto' ? [...new Set(pics.map((m) => m.credit).filter(Boolean))].join(' · ') : p.credit;
    if (ui && credit) {
      s.credit.textContent = credit;
      cssCamel(s.credit, { display: 'block', left: `${theme.safe.side * W}px`, top: `${(1 - theme.safe.bottom) * H - 40 * u}px`, maxWidth: `${room}px`, whiteSpace: 'normal',
        fontFamily: mono, fontSize: `${20 * u}px`, color: 'rgba(255,255,255,0.72)', textShadow: '0 0 6px rgba(0,0,0,.8)' });
    } else hide(s.credit);
    if (p.mode === 'mini' && (p.no || p.name || p.latin)) {
      const a = eOut3(prog(t, 0, 0.35)), [l0, l1, l2] = s.side.children as unknown as HTMLElement[], shadow = `0 0 ${14 * u}px rgba(0,0,0,.75)`;
      const roomSide = W * (1 - theme.safe.side) - (mc.x + mc.r + 30 * u);
      l0.textContent = p.no; l1.textContent = p.name; l2.textContent = p.latin;
      // the stop sits beside the circle, toward the middle of the frame
      cssCamel(s.side, { display: 'block', top: `${mc.y}px`, ...(mc.left ? { left: `${mc.x + mc.r + 30 * u - (1 - a) * 20 * u}px`, right: 'auto', textAlign: 'left' } : { right: `${W - (mc.x - mc.r - 30 * u) - (1 - a) * 20 * u}px`, left: 'auto', textAlign: 'right' }),
        transform: 'translateY(-50%)', opacity: String(a), textShadow: shadow });
      cssCamel(l0, { display: p.no ? 'block' : 'none', fontFamily: mono, fontWeight: '700', fontSize: `${34 * u}px`, color: p.accent });
      cssCamel(l1, { display: p.name ? 'block' : 'none', fontFamily: font, fontWeight: '900', fontSize: `${fitPx(p.name, 64 * u, roomSide)}px`, color: p.paper, lineHeight: '1.2' });
      cssCamel(l2, { display: p.latin ? 'block' : 'none', fontFamily: latin, fontStyle: 'italic', fontWeight: '500', fontSize: `${fitPx(p.latin, 44 * u, roomSide)}px`, color: withAlpha(p.paper, 0.88) });
    } else hide(s.side);
    done();
  },
};

/** the picture for a URL, made once (an <img> outside the layer: drawn into the canvas) */
function imageOf(s: S, url: string): HTMLImageElement {
  let img = s.imgs.get(url);
  if (!img) { img = new Image(); img.decoding = 'sync'; img.src = url; s.imgs.set(url, img); }
  return img;
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, ang: number, k: number, fill: string, edge: string) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = fill; g.strokeStyle = withAlpha(edge, 0.7); g.lineWidth = 4 * k; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(26 * k, 0); g.lineTo(-14 * k, -18 * k); g.lineTo(-6 * k, 0); g.lineTo(-14 * k, 18 * k); g.closePath(); g.stroke(); g.fill();
  g.restore();
}

/** a pin's name: a dark card with an accent bar, the name over its Latin spelling, beside the pin's head (r, l), above it (u) or below (d) */
function placeLabel(e: HTMLElement, name: string, sub: string, x: number, y: number, size: number, side: string, a: number, u: number,
  c: { font: string; latin: string; ink: string; paper: string; accent: string }) {
  const [l1, l2] = e.children as unknown as HTMLElement[], fs = 50 * u, gap = 30 * u, head = y - size * 0.64;
  l1.textContent = name; l2.textContent = sub;
  const at = side === 'l' ? { left: `${x - gap}px`, top: `${head}px`, tr: 'translate(-100%, -50%)' } : side === 'u' ? { left: `${x}px`, top: `${y - size - gap * 0.6}px`, tr: 'translate(-50%, -100%)' }
    : side === 'd' ? { left: `${x}px`, top: `${y + gap}px`, tr: 'translate(-50%, 0)' } : { left: `${x + gap}px`, top: `${head}px`, tr: 'translate(0, -50%)' };
  cssCamel(e, { left: at.left, top: at.top, transform: `${at.tr} scale(${(0.85 + 0.15 * a).toFixed(4)})`, transformOrigin: side === 'l' ? '100% 50%' : side === 'r' ? '0 50%' : '50% 100%', opacity: String(a),
    textAlign: 'left', background: withAlpha(c.ink, 0.82), padding: `${fs * 0.24}px ${fs * 0.44}px ${fs * 0.3}px ${fs * 0.48}px`, borderRadius: `${16 * u}px`,
    borderLeft: `${6 * u}px solid ${c.accent}`, boxShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,.45)` });
  cssCamel(l1, { fontFamily: c.font, fontWeight: '900', fontSize: `${fs}px`, color: c.paper, lineHeight: '1.2' });
  cssCamel(l2, { display: sub ? 'block' : 'none', fontFamily: c.latin, fontStyle: 'italic', fontWeight: '500', fontSize: `${fs * 0.72}px`, color: withAlpha(c.paper, 0.82), lineHeight: '1.15' });
}
