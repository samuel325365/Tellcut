// common.worldmap — a hand-drawn world in one orthographic projection (from t2-map's fx.atlas): a camera on keyframes (longitude,
// latitude, log10 of the globe's radius, rotation) flies from the whole globe in space — a sphere, its glow, a graticule — down to a
// country, where the globe fades into a flat sea chart with rippled coasts. Natural Earth's 1:110m land (world110.ts) is the only
// coastline: closer than a country, cut to common.mapcam on an assets map photo (geo.ts zoomOfRadius gives its zoom). On it: pins,
// flight arcs or drawn routes with an icon at their head, regions filled on the land, sea and land names, big titles; it can open as a
// circle from a point (iris) or sit in a small tilted card.
import { clamp, cssCamel, eBack, eIO3, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { canvasAt, spline, freeCanvas } from './inkline.ts';
import { arcPt, cityOf, cutLine, EUROPE_TRIP, keysAt, mapPin, orthographic, parseCities, pinDrop, placeOf, placesOf, ringsPath, rowsOf, spanOf, type City, type Pt } from './geo.ts';
import { WORLD_LAND } from './world110.ts';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  places: string; cam: string; routes: string; pins: string; regions: string; labels: string; titles: string; iris: string; card: string;
  fadeIn: number; fadeOut: number; cy: number; grid: boolean; ripples: boolean;
  font: string; sea: string; land: string; ink: string; accent: string; space: string; paper: string;
}
interface S { wrap: HTMLElement; layer: HTMLElement; cv: HTMLCanvasElement; pins: HTMLElement[]; labels: HTMLElement[]; titles: HTMLElement[]; heads: HTMLElement[] }

/** camera keys "秒|地點或經度,緯度|log10 半徑|旋轉" → [t, lon, lat, L, rot]; longitudes made continuous (a turn of more than 180°
 *  goes the short way round), bad lines dropped */
export function parseGlobeCam(s: string, places: City[]): number[][] {
  const keys = rowsOf(s).map(([t, at, L, rot = '0']) => { const c = placeOf(at, places); return [Number(t), c ? c[0] : NaN, c ? c[1] : NaN, Number(L), Number(rot) || 0]; })
    .filter((k) => k.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < keys.length; i++) {
    while (keys[i][1] - keys[i - 1][1] > 180) keys[i][1] -= 360;
    while (keys[i - 1][1] - keys[i][1] > 180) keys[i][1] += 360;
  }
  return keys;
}

/** how much of the globe look shows at log10 radius L: the whole of it up to 3.0, gone by 3.35 (a flat sea chart from there) */
export const globeShare = (L: number) => 1 - prog(L, 3.0, 3.35);

/** a region "a>b>c…" (or two corners "west,south>east,north") as a ring of lon/lat points, the box's edges sampled every degree */
export function regionRing(s: string, places: City[]): Pt[] {
  const pts = placesOf(s, places);
  if (pts.length !== 2) return pts;
  const [[w, so], [e, n]] = pts, out: Pt[] = [], steps = (a: number, b: number) => Math.max(1, Math.ceil(Math.abs(b - a)));
  const edge = (a: Pt, b: Pt) => { const k = steps(a[0] === b[0] ? a[1] : a[0], a[0] === b[0] ? b[1] : b[0]); for (let i = 0; i < k; i++) out.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]); };
  edge([w, so], [e, so]); edge([e, so], [e, n]); edge([e, n], [w, n]); edge([w, n], [w, so]);
  return out;
}

/** a route drawn to share f over its legs (each leg its equal part) */
export const legShare = (f: number, legs: number, i: number) => clamp(f * legs - i);

const fracs = (s: string, n: number) => { const v = String(s ?? '').split(/[,，\s]+/).filter(Boolean).map(Number); return v.length === n && v.every(Number.isFinite) ? v : null; };
const windowAt = (t: number, [a, b]: [number, number]) => Math.min(Number.isFinite(a) ? prog(t, a, a + 0.35) : 1, Number.isFinite(b) ? 1 - prog(t, b, b + 0.3) : 1);

export const worldmap: ItemType<P, S> = {
  type: 'common.worldmap', label: '地球儀地圖', category: 'travel', kind: 'overlay',
  doc: '手繪風的世界地圖：鏡頭關鍵影格「秒|地點|log10 半徑|旋轉」從太空裡的地球儀（球體、光暈、經緯網）一路推到國家，推近時地球儀淡成平面海圖（海岸有漣漪）；pins 圖釘落下＋地名卡、routes 航線弧線（arc）或沿點畫的路線（line），頭可放 emoji（✈️ 🛵 ⛵）、regions 把自己給的多邊形或方框範圍塗上強調色（只塗在陸地上；沒有國界資料，形狀是你給的點，不是真實國界）、labels 海名與地名、titles 大標；iris 從一點圓形展開，card 變成斜放的小卡片地圖；海岸線是 Natural Earth 1:110m（看國家夠用），再近就接 common.mapcam 用地圖照片（zoom ≈ log2(2π·cos緯度·10^log10R／256)）；開場定位、跨國旅行、航線',
  params: [
    { key: 'places', label: '地點（中文|英文|經度|緯度，逗號分隔；其他欄用名字指它）', type: 'text', default: EUROPE_TRIP },
    { key: 'cam', label: '鏡頭（秒|地點或經度,緯度|log10 半徑（2.5 整顆地球、3.5 一個國家）|旋轉度數，一行一個）', type: 'text', default: '0|-8,40|2.55|0\n0.6|-2,44|2.6|0\n3|14,52|3.3|0' },
    { key: 'routes', label: '路線（起-迄|地點>地點>…|頭：emoji、dot 或空|arc 弧線或 line 沿點；- ＝一開始就畫好）', type: 'text', default: '1.0-2.4|巴黎>克拉科夫>塔林|✈️|arc' },
    { key: 'pins', label: '圖釘（起[-標籤收起]|地點|打勾秒|標籤在 u 上、r 右、l 左或 - 不要）', type: 'text', default: '0.9|巴黎||l\n1.6|克拉科夫||u\n2.3|塔林||r' },
    { key: 'regions', label: '塗色區域（起-迄|地點>地點>…自己給的多邊形，或 西,南>東,北 一個方框；只塗在陸地上，不是真實國界）', type: 'text', default: '' },
    { key: 'labels', label: '地名（起-迄|地點或經度,緯度|文字|小字|sea 海名或 land 地名）', type: 'text', default: '0.6-3|-28,44|大西洋|Atlantic Ocean|sea' },
    { key: 'titles', label: '大標（起-迄|大字|小字）', type: 'text', default: '' },
    { key: 'iris', label: '圓形展開（起-迄|x,y 畫面比例；空＝不用）', type: 'string', default: '' },
    { key: 'card', label: '小卡片地圖（x,y,w,h 畫面比例；空＝滿版）', type: 'string', default: '' },
    { key: 'fadeIn', label: '淡入（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'fadeOut', label: '淡出（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'cy', label: '地圖中心高度（畫面高比例；-1＝安全區正中間）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'grid', label: '地球儀上的經緯網', type: 'bool', default: true },
    { key: 'ripples', label: '平面海圖的海岸漣漪', type: 'bool', default: true },
    { key: 'font', label: '字型', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'sea', label: '海', type: 'color', default: '#1f6c8a' },
    { key: 'land', label: '陸地', type: 'color', default: '#efe4cc' },
    { key: 'ink', label: '海岸線與字', type: 'color', default: '#3d3024', theme: 'palette.ink' },
    { key: 'accent', label: '圖釘、路線與塗色', type: 'color', default: '#d0603a', theme: 'palette.accent' },
    { key: 'space', label: '太空', type: 'color', default: '#0b1e2b' },
    { key: 'paper', label: '地名卡與路線底色', type: 'color', default: '#fbf5e8', theme: 'palette.paper' },
  ],
  build(ctx) {
    // the canvas and, over it, the words (a layer of their own: in card mode it turns and clips like the card the canvas draws)
    const wrap = h('div', null, null, ctx.root), cv = h('canvas', null, null, wrap) as HTMLCanvasElement, layer = h('div', null, null, wrap);
    cssCamel(wrap, { position: 'absolute', inset: '0' });
    cssCamel(layer, { position: 'absolute', inset: '0' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { wrap, layer, cv, pins: [], labels: [], titles: [], heads: [] };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur } = ctx, u = Math.min(W, H) / 1080, places = parseCities(p.places);
    const font = `'${p.font}', 'LXGW WenKai TC', 'Noto Sans TC', sans-serif`, g = canvasAt(s.cv, W, H);
    const used = { pins: 0, labels: 0, titles: 0, heads: 0 };
    const take = (k: keyof typeof used, make: () => HTMLElement) => { const list = s[k]; const e = list[used[k]] ?? (list[used[k]] = make()); used[k]++; e.style.display = ''; return e; };
    const finish = () => (Object.keys(used) as Array<keyof typeof used>).forEach((k) => s[k].slice(used[k]).forEach((e) => { e.style.display = 'none'; }));
    const box = (lines: number) => { const d = h('div', null, null, s.layer); cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.1' }); for (let i = 0; i < lines; i++) h('div', null, null, d); return d; };

    const alpha = Math.min(p.fadeIn > 0 ? prog(t, 0, p.fadeIn) : 1, p.fadeOut > 0 ? 1 - prog(t, dur - p.fadeOut, dur) : 1);
    // the viewport: the frame, or the small card popping in at the start and out at the end
    let vp = { x: 0, y: 0, w: W, h: H };
    const card = fracs(p.card, 4);
    let cardA = 1;
    cssCamel(s.layer, { transform: 'none', clipPath: 'none' });
    if (card) {
      cardA = eBack(prog(t, 0, 0.45), 1.9) * (1 - eIO3(prog(t, dur - 0.35, dur)));
      vp = { x: card[0] * W, y: card[1] * H, w: card[2] * W, h: card[3] * H };
      const mx = vp.x + vp.w / 2, my = vp.y + vp.h / 2, r = 22 * u;
      cssCamel(s.layer, { transformOrigin: `${mx}px ${my}px`, transform: `rotate(-2deg) scale(${Math.max(0, cardA).toFixed(4)})`,
        clipPath: `inset(${vp.y}px ${W - vp.x - vp.w}px ${H - vp.y - vp.h}px ${vp.x}px round ${r}px)` });
    }
    if (alpha <= 0 || cardA <= 0.001) { cssCamel(s.wrap, { opacity: '0' }); finish(); return; }
    cssCamel(s.wrap, { opacity: String(alpha) });
    const keys = parseGlobeCam(p.cam, places), cam = keysAt(keys, t) ?? [0, 20, 2.55, 0];
    const [lon0, lat0, L, rot] = cam, R = 10 ** L * u, cx = vp.x + vp.w / 2;
    const cy = card ? vp.y + vp.h / 2 : p.cy >= 0 ? p.cy * H : ((theme.safe.top + 1 - theme.safe.bottom) / 2) * H;
    const P = orthographic(lon0, lat0, R, rot, cx, cy), VW = vp.x + vp.w, VH = vp.y + vp.h, ga = globeShare(L);

    g.save();
    if (card) {
      // the card itself: a shadow, a paper frame, then the map clipped to its rounded window
      const mx = vp.x + vp.w / 2, my = vp.y + vp.h / 2;
      g.translate(mx, my); g.rotate((-2 * Math.PI) / 180); g.scale(cardA, cardA); g.translate(-mx, -my);
      g.fillStyle = 'rgba(0,0,0,0.35)'; rrect(g, vp.x + 10 * u, vp.y + 14 * u, vp.w, vp.h, 26 * u); g.fill();
      g.fillStyle = p.paper; rrect(g, vp.x - 12 * u, vp.y - 12 * u, vp.w + 24 * u, vp.h + 24 * u, 32 * u); g.fill();
      g.lineWidth = 4 * u; g.strokeStyle = p.ink; g.stroke();
      rrect(g, vp.x, vp.y, vp.w, vp.h, 22 * u); g.clip();
    }
    const ir = String(p.iris ?? '').split('|').map((x) => x.trim());
    if (!card && ir[0]) {
      const [a, b] = spanOf(ir[0]), at = fracs(ir[1] ?? '', 2) ?? [0.5, 0.5], q = eIO3(prog(t, a, Number.isFinite(b) ? b : a + 0.45));
      if (q <= 0) { g.restore(); finish(); return; }
      if (q < 1) { g.beginPath(); g.arc(at[0] * W, at[1] * H, q * Math.hypot(W, H), 0, Math.PI * 2); g.clip(); }
    }
    // ── sea, or space and the sphere
    g.fillStyle = p.sea; g.fillRect(vp.x, vp.y, vp.w, vp.h);
    if (ga > 0) {
      g.save(); g.globalAlpha = ga; g.fillStyle = p.space; g.fillRect(vp.x, vp.y, vp.w, vp.h);
      const glow = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25); glow.addColorStop(0, 'rgba(120,190,220,0.35)'); glow.addColorStop(1, 'rgba(120,190,220,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = p.sea; g.fill();
      const shade = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R); shade.addColorStop(0, 'rgba(255,255,255,0.14)'); shade.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = shade; g.fill();
      g.restore();
    }
    if (ga < 1) {
      g.save(); g.globalAlpha = 1 - ga; const lg = g.createLinearGradient(vp.x, vp.y, vp.x + vp.w * 0.4, VH);
      lg.addColorStop(0, 'rgba(255,255,255,0.1)'); lg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = lg; g.fillRect(vp.x, vp.y, vp.w, vp.h); g.restore();
    }
    // ── land (clipped to the sphere while it is a globe), coastal ripples on the flat chart
    const onGlobe = (f: () => void) => { g.save(); if (ga > 0.01) { g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip(); } f(); g.restore(); };
    onGlobe(() => {
      ringsPath(g, P, WORLD_LAND, VW, VH);
      if (p.ripples && ga < 0.5) {
        g.lineJoin = 'round'; g.strokeStyle = 'rgba(190,230,240,1)';
        g.globalAlpha = 0.22 * (1 - 2 * ga); g.lineWidth = 34 * u; g.stroke(); g.globalAlpha = 0.28 * (1 - 2 * ga); g.lineWidth = 14 * u; g.stroke();
      }
      g.globalAlpha = 1; g.fillStyle = p.land; g.fill('evenodd');
      g.lineWidth = (ga > 0.5 ? 1.5 : 2.6) * u; g.strokeStyle = p.ink; g.stroke();
    });
    // ── regions: filled on the land only
    for (const [sp, pts] of rowsOf(p.regions)) {
      const a = windowAt(t, spanOf(sp)), ring = regionRing(pts, places);
      if (a <= 0 || ring.length < 3) continue;
      onGlobe(() => {
        ringsPath(g, P, WORLD_LAND, VW, VH); g.clip('evenodd');
        ringsPath(g, P, [ring.flat()], VW, VH); g.globalAlpha = a * 0.85; g.fillStyle = p.accent; g.fill();
        g.globalAlpha = a; g.lineWidth = 3 * u; g.strokeStyle = withAlpha(p.ink, 0.6); g.stroke();
      });
    }
    // ── the graticule on the globe: only its near side
    if (p.grid && ga > 0.01) {
      onGlobe(() => {
        g.globalAlpha = ga * 0.18; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2 * u;
        const line = (pts: Array<[number, number]>) => { g.beginPath(); let on = false; for (const [lo, la] of pts) { const q = P(lo, la); if (q[2]) { if (on) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); on = true; } else on = false; } g.stroke(); };
        for (let lo = -180; lo < 180; lo += 20) line(Array.from({ length: 41 }, (_, i) => [lo, -80 + i * 4] as [number, number]));
        for (let la = -60; la <= 60; la += 20) line(Array.from({ length: 91 }, (_, i) => [-180 + i * 4, la] as [number, number]));
      });
    }
    // ── routes: flight arcs between the places, or a drawn line along them; a paper casing under an accent line
    for (const [sp, pts, head = '', look = 'arc'] of rowsOf(p.routes)) {
      const span = spanOf(sp), ll = placesOf(pts, places);
      if (ll.length < 2) continue;
      const f = !Number.isFinite(span[0]) ? 1 : eIO3(prog(t, span[0], Number.isFinite(span[1]) && span[1] > span[0] ? span[1] : span[0] + 1.5));
      if (f <= 0) continue;
      let drawn: Pt[] = [], tip: Pt | null = null, front = true;
      if (look === 'line') {
        const line = spline(ll, 8).map(([lo, la]) => P(lo, la)), cut = cutLine(line.map((q) => [q[0], q[1]] as Pt), f);
        drawn = cut.pts; tip = cut.head; front = line.every((q) => q[2]);
      } else {
        for (let i = 0; i + 1 < ll.length; i++) {
          const a = P(ll[i][0], ll[i][1]), b = P(ll[i + 1][0], ll[i + 1][1]), share = legShare(f, ll.length - 1, i);
          if (share <= 0) break;
          front = front && !!a[2] && !!b[2];
          const A: Pt = [a[0], a[1]], B: Pt = [b[0], b[1]], lift = Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.22, n = 40;
          for (let k = 0; k <= Math.ceil(n * share); k++) drawn.push(arcPt(A, B, Math.min(share, k / n), lift));
          tip = drawn[drawn.length - 1];
        }
      }
      if (!front || drawn.length < 2) continue;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      const path = () => { g.beginPath(); drawn.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
      path(); g.strokeStyle = p.paper; g.lineWidth = 15 * u; g.stroke();
      g.setLineDash([24 * u, 15 * u]); g.lineDashOffset = -t * 40 * u; g.strokeStyle = p.accent; g.lineWidth = 8 * u; path(); g.stroke();
      g.restore();
      if (tip && head && f < 1) {
        if (head === 'dot') { g.save(); g.fillStyle = p.paper; g.strokeStyle = p.accent; g.lineWidth = 6 * u; g.beginPath(); g.arc(tip[0], tip[1], 13 * u, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
        else {
          const e = take('heads', () => { const d = box(0); cssCamel(d, { textAlign: 'center', borderRadius: '50%', boxSizing: 'border-box', fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }); return d; }), r = 36 * u;
          e.textContent = head;
          cssCamel(e, { left: `${tip[0] - r}px`, top: `${tip[1] - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, lineHeight: `${2 * r - 8 * u}px`, fontSize: `${r * 1.05}px`,
            background: p.paper, border: `${4 * u}px solid ${p.ink}`, boxShadow: `0 ${8 * u}px ${10 * u}px rgba(0,0,0,.25)` });
        }
      }
    }
    // ── pins and their names
    for (const [sp, at, chk = '', side0 = ''] of rowsOf(p.pins)) {
      const side = side0 || 'u';
      const span = spanOf(sp), c = placeOf(at, places), t0 = Number.isFinite(span[0]) ? span[0] : -1, q = prog(t, t0, t0 + 0.45);
      if (!c || q <= 0) continue;
      const [x, y0, fr] = P(c[0], c[1]);
      if (!fr) continue;
      const s0 = 92 * u, drop = pinDrop(q) * 160 * u, y = y0 + drop, ck = chk !== '' && Number.isFinite(Number(chk)) ? eOut3(prog(t, Number(chk), Number(chk) + 0.35)) : 0;
      g.save(); g.globalAlpha = clamp(q * 3); mapPin(g, x, y, s0, p.accent, { check: ck }); g.restore();
      const city = cityOf(at, places), lp = eBack(prog(t, t0 + 0.25, t0 + 0.65), 1.9) * (Number.isFinite(span[1]) ? 1 - prog(t, span[1], span[1] + 0.3) : 1);
      if (!city || side === '-' || lp <= 0) continue;
      const e = take('pins', () => box(2)), [l1, l2] = e.children as unknown as HTMLElement[], fs = 54 * u;
      l1.textContent = city.zh; l2.textContent = city.en;
      const tr = side === 'r' ? `translate(${s0 * 0.45}px, -50%)` : side === 'l' ? `translate(calc(-100% - ${s0 * 0.45}px), -50%)` : 'translate(-50%, -100%)';
      cssCamel(e, { left: `${x}px`, top: `${side === 'u' ? y - s0 - 14 * u : y - s0 * 0.35}px`, transform: `${tr} scale(${Math.max(0, lp).toFixed(4)})`,
        transformOrigin: side === 'r' ? '0 50%' : side === 'l' ? '100% 50%' : '50% 100%', textAlign: 'center', fontFamily: font, color: p.ink,
        background: p.paper, border: `${Math.max(2, fs * 0.06)}px solid ${p.ink}`, borderRadius: `${fs * 0.3}px`, padding: `${fs * 0.12}px ${fs * 0.45}px ${fs * 0.16}px`,
        boxShadow: `${4 * u}px ${6 * u}px 0 rgba(0,0,0,.25), inset 0 -${fs * 0.08}px 0 ${withAlpha(p.accent, 0.9)}` });
      cssCamel(l1, { fontSize: `${fs}px`, lineHeight: '1.25' });
      cssCamel(l2, { display: city.en ? 'block' : 'none', fontSize: `${fs * 0.55}px`, color: p.accent, lineHeight: '1.2' });
    }
    // a soft vignette on the full frame
    if (!card) {
      const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.5, W / 2, H * 0.5, Math.hypot(W, H) * 0.5);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,20,30,0.38)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    g.restore();
    // ── names on the map and big titles (DOM)
    const outline = (c: string, w: number) => [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([a, b]) => `${(a * w).toFixed(2)}px ${(b * w).toFixed(2)}px 0 ${c}`).join(', ');
    for (const [sp, at, text = '', sub = '', look = 'sea'] of rowsOf(p.labels)) {
      const a = windowAt(t, spanOf(sp)), c = placeOf(at, places);
      if (a <= 0 || !c || !text) continue;
      const [x, y, fr] = P(c[0], c[1]);
      if (!fr) continue;
      const e = take('labels', () => box(2)), [l1, l2] = e.children as unknown as HTMLElement[], fs = 52 * u;
      l1.textContent = text; l2.textContent = sub;
      cssCamel(e, { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)', textAlign: 'center', fontFamily: font, opacity: String(a) });
      if (look === 'land') {
        cssCamel(l1, { fontSize: `${fs}px`, color: p.paper, textShadow: outline(withAlpha(p.ink, 0.9), fs * 0.08), letterSpacing: '0' });
        cssCamel(l2, { display: sub ? 'block' : 'none', fontSize: `${fs * 0.55}px`, color: p.paper, textShadow: outline(withAlpha(p.ink, 0.9), fs * 0.06) });
      } else {
        cssCamel(l1, { fontSize: `${fs}px`, color: 'rgba(230,246,250,0.92)', textShadow: 'none', letterSpacing: '0.12em' });
        cssCamel(l2, { display: sub ? 'block' : 'none', fontSize: `${fs * 0.55}px`, color: 'rgba(230,246,250,0.7)', textShadow: 'none', marginTop: `${fs * 0.1}px` });
      }
    }
    const room = (card ? vp.w : W * (1 - 2 * theme.safe.side));
    for (const [sp, text = '', sub = ''] of rowsOf(p.titles)) {
      const span = spanOf(sp), a = eOut3(Number.isFinite(span[0]) ? prog(t, span[0], span[0] + 0.4) : 1) * (Number.isFinite(span[1]) ? 1 - prog(t, span[1], span[1] + 0.3) : 1);
      if (a <= 0 || !text) continue;
      const e = take('titles', () => box(2)), [l1, l2] = e.children as unknown as HTMLElement[], fs = fitPx(text, 120 * u, room);
      l1.textContent = text; l2.textContent = sub;
      cssCamel(e, { left: `${vp.x}px`, width: `${vp.w}px`, top: `${card ? vp.y + 30 * u : theme.safe.top * H + 50 * u}px`, textAlign: 'center', fontFamily: font, opacity: String(a),
        transform: `translateY(${((1 - a) * 30 * u).toFixed(2)}px)` });
      cssCamel(l1, { fontSize: `${fs}px`, color: p.paper, textShadow: outline('rgba(30,22,14,0.95)', fs * 0.07), lineHeight: '1.2' });
      cssCamel(l2, { display: sub ? 'block' : 'none', fontSize: `${fitPx(sub, 50 * u, room)}px`, color: p.paper, textShadow: outline('rgba(30,22,14,0.9)', 50 * u * 0.08), marginTop: `${8 * u}px` });
    }
    finish();
  },
};

const rrect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, hh, r); };
