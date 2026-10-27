// common.mapjump — the whole frame turns into a paper route map of the trip's real cities (longitude and latitude, a graticule with
// degree marks) for a beat or two: `leg` draws a red arc from one city to the next and the marker lands on the beat; `all` draws the
// whole route and stamps every station in turn. A big heading on top, the dates under the map. Promoted from uk-beat's fx.mapjump.
// `land` shades the real coastline (Natural Earth 1:110m, world110.ts) under the graticule.
import { abs, cssCamel, eIO3 as eInOut, eOut3 as eOut, h, type ItemType, prog } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { arcPt, boundsOf, degrees, dot, EUROPE_TRIP, graticule, gridStep, labelSide, pad2, parseCities, projector, ring, ringsPath, strokeArc, type Pt } from './geo.ts';
import { WORLD_LAND } from './world110.ts';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  mode: 'leg' | 'all'; cities: string; from: number; to: number; kicker: string; title: string; latin: string; dates: string; arrive: number; step: number;
  font: string; mono: string; paper: string; ink: string; accent: string; muted: string; land: boolean;
}
interface S { bg: HTMLElement; cv: HTMLCanvasElement; head: HTMLElement; kick: HTMLElement; title: HTMLElement; latin: HTMLElement; dates: HTMLElement; labs: HTMLElement[]; marks: HTMLElement[]; key: string }

/** where things go: u (1 = a 1080-wide 9:16 frame), the heading's top, the map box (keeps the original 820:690 shape) and the dates' top */
export function mapLayout(W: number, H: number, safe: { top: number; bottom: number; side: number }) {
  const u = Math.min(W, H) / 1080, top = safe.top * H + 30 * u, headH = 300 * u, datesTop = (1 - safe.bottom) * H - 60 * u;
  const roomW = W * (1 - 2 * safe.side), roomH = datesTop - 130 * u - (top + headH + 70 * u), f = Math.max(0.2, Math.min(1, roomW / (820 * u), roomH / (690 * u)));
  const w = 820 * u * f, hh = 690 * u * f, y = top + headH + 70 * u + (roomH - hh) / 2;
  return { u, top, box: [(W - w) / 2, y, w, hh] as [number, number, number, number], datesTop };
}

/** leg mode: how far the arc is drawn (0–1) and whether the marker has landed, at `local` with the landing at `arrive` */
export const legAt = (local: number, arrive: number) => ({ f: eInOut(prog(local, 0.06, Math.max(0.1, arrive))), landed: local >= arrive });

export const mapjump: ItemType<P, S> = {
  type: 'common.mapjump', label: '全螢幕路線跳點', category: 'travel', kind: 'overlay',
  doc: '整個畫面變成米色紙的路線圖（真實經緯度、經緯線與度數）一兩拍：leg 從上一站畫紅色弧線到下一站、點在拍點落地；all 整條路線畫出、每站依序蓋章；上方大標、下方日期；land 在經緯線下畫出真實的海岸線；旅行快剪換城市、全程回顧',
  params: [
    { key: 'mode', label: '模式（leg 一段、all 全部依序蓋章）', type: 'enum', options: ['leg', 'all'], default: 'leg' },
    { key: 'cities', label: '城市（中文|英文|經度|緯度，逗號分隔）', type: 'text', default: EUROPE_TRIP },
    { key: 'from', label: '出發站（0 起）', type: 'number', min: 0, max: 20, step: 1, default: 0 },
    { key: 'to', label: '到達站（0 起）', type: 'number', min: 0, max: 20, step: 1, default: 1 },
    { key: 'kicker', label: '小標', type: 'string', default: '下一站' },
    { key: 'title', label: '大標', type: 'string', default: '克拉科夫' },
    { key: 'latin', label: '拉丁字', type: 'string', default: 'KRAKÓW · POLSKA' },
    { key: 'dates', label: '日期', type: 'string', default: '05.29 → 06.06' },
    { key: 'arrive', label: '落地時間（秒；leg）', type: 'number', min: 0.1, max: 10, step: 0.01, default: 0.46 },
    { key: 'step', label: '每站蓋章間隔（秒；all）', type: 'number', min: 0.05, max: 2, step: 0.01, default: 0.25 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'mono', label: '數字字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'paper', label: '紙色', type: 'color', default: '#f3ecdf', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#0e0e10', theme: 'palette.ink' },
    { key: 'accent', label: '路線與到達站', type: 'color', default: '#ff3b1f', theme: 'palette.accent' },
    { key: 'muted', label: '拉丁字與度數', type: 'color', default: '#6b665e' },
    { key: 'land', label: '畫出陸地（真實海岸線，淡墨色）', type: 'bool', default: false },
  ],
  build(ctx) {
    const bg = abs(ctx.root), cv = abs(ctx.root, {}, 'canvas') as HTMLCanvasElement, head = abs(ctx.root), dates = abs(ctx.root);
    const line = () => { const d = h('div', null, null, head); cssCamel(d, { whiteSpace: 'pre', lineHeight: '1.2' }); return d; };
    cssCamel(bg, { inset: '0' });
    cssCamel(cv, { left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(head, { left: '0', width: '100%', textAlign: 'center', transformOrigin: '50% 50%' });
    cssCamel(dates, { left: '0', width: '100%', textAlign: 'center', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' });
    return { bg, cv, head, kick: line(), title: line(), latin: line(), dates, labs: [], marks: [], key: '' };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local } = ctx, cities = parseCities(p.cities), n = cities.length, L = mapLayout(W, H, theme.safe), u = L.u, box = L.box;
    const font = `'${p.font}', 'Noto Sans TC', sans-serif`, mono = `'${p.mono}', 'JetBrains Mono', monospace`, b = boundsOf(cities), P = projector(box, b);
    const pos: Pt[] = cities.map((c) => P(c.lon, c.lat)), grid = gridStep(Math.max(b.lon1 - b.lon0, b.lat1 - b.lat0));
    const lons = degrees(b.lon0, b.lon1, grid), lats = degrees(b.lat0, b.lat1, grid);
    const key = JSON.stringify([p.cities, lons, lats]);
    if (s.key !== key) {   // names and degree marks rebuilt only when the cities change
      s.key = key;
      for (const e of [...s.labs, ...s.marks]) e.remove();
      const mk = (text: string) => { const d = h('div', null, null, ctx.root); d.textContent = text; cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1' }); return d; };
      s.labs = cities.map((c) => mk(c.zh));
      s.marks = [...lons.map((v) => mk(v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? 'E' : 'W'}`)), ...lats.map((v) => mk(`${Math.abs(v)}°${v >= 0 ? 'N' : 'S'}`))];
    }
    cssCamel(s.bg, { background: p.paper });
    const hp = eOut(prog(local, 0, 0.1));
    cssCamel(s.head, { top: `${L.top}px`, fontFamily: font, transform: `scale(${(1.3 - 0.3 * hp).toFixed(4)})` });
    s.kick.textContent = p.kicker; s.title.textContent = p.title; s.latin.textContent = p.latin;
    cssCamel(s.kick, { fontSize: `${44 * u}px`, fontWeight: '700', color: p.accent, letterSpacing: `${14 * u}px` });
    cssCamel(s.title, { fontSize: `${fitPx(p.title, 150 * u, W * 0.9)}px`, fontWeight: '900', color: p.ink, lineHeight: '1.15' });
    cssCamel(s.latin, { fontSize: `${36 * u}px`, fontWeight: '700', fontFamily: mono, color: p.muted, letterSpacing: `${8 * u}px`, lineHeight: '1.3' });
    s.dates.textContent = p.dates;
    cssCamel(s.dates, { top: `${L.datesTop}px`, fontSize: `${54 * u}px`, fontFamily: mono, color: p.ink, opacity: String(prog(local, 0.05, 0.15)) });
    s.marks.forEach((e, i) => {
      const isLon = i < lons.length, v = isLon ? lons[i] : lats[i - lons.length];
      const [x, y] = isLon ? P(v, b.lat1) : P(b.lon0, v);
      cssCamel(e, { display: n ? 'block' : 'none', left: `${isLon ? x + 6 * u : box[0] + 6 * u}px`, top: `${isLon ? box[1] - 34 * u : y - 26 * u}px`, fontSize: `${22 * u}px`, fontFamily: mono, color: p.muted });
    });
    const g = canvasAt(s.cv, W, H);
    if (!n) return;   // no city it can read (none given, or a typo in the numbers): the paper and the heading only
    if (p.land) {
      g.save(); g.beginPath(); g.rect(box[0], box[1], box[2], box[3]); g.clip();
      ringsPath(g, P, WORLD_LAND, W, H); g.fillStyle = withAlpha(p.ink, 0.07); g.fill('evenodd'); g.lineJoin = 'round'; g.strokeStyle = withAlpha(p.ink, 0.28); g.lineWidth = 2 * u; g.stroke();
      g.restore();
    }
    graticule(g, P, b, withAlpha(p.ink, 0.13), 2 * u);
    g.lineCap = 'round';
    const label = (i: number, color: string, alpha: number) => {
      const [x, y] = pos[i], left = labelSide(y, box) === 'left';
      cssCamel(s.labs[i], { left: `${left ? x - 44 * u : x}px`, top: `${left ? y : y + 52 * u}px`, transform: left ? 'translate(-100%, -50%)' : 'translate(-50%, 0)',
        fontFamily: font, fontWeight: '900', fontSize: `${46 * u}px`, color, opacity: String(alpha) });
    };
    if (p.mode === 'all') {
      // every leg drawn in ink, then the stations stamped one after another
      const legDur = 0.45 / Math.max(1, n - 1);
      for (let i = 0; i + 1 < n; i++) { g.strokeStyle = p.ink; g.lineWidth = 7 * u; strokeArc(g, pos[i], pos[i + 1], eInOut(prog(local, i * legDur, (i + 1) * legDur)), 60 * u); }
      pos.forEach(([x, y], i) => {
        const t0 = i * p.step, q = prog(local, t0, t0 + 0.08);
        if (local < t0) { dot(g, x, y, 12 * u, p.ink); label(i, p.ink, 0.35); return; }
        const r = (64 - 18 * eOut(q)) * u;
        dot(g, x, y, r * 0.78, p.accent); ring(g, x, y, r, p.accent, 6 * u);
        g.fillStyle = p.paper; g.font = `700 ${30 * u}px ${mono}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pad2(i + 1), x, y + 1 * u);
        const bq = prog(local, t0, t0 + 0.35); if (bq < 1) ring(g, x, y, r + 60 * u * eOut(bq), p.accent, 5 * u, 1 - bq);
        label(i, p.ink, 1);
      });
      return;
    }
    const a = Math.max(0, Math.min(n - 1, Math.round(p.from))), z = Math.max(0, Math.min(n - 1, Math.round(p.to)));
    // legs already travelled: solid ink; the ones still ahead: faint dashes
    for (let i = 0; i < Math.min(a, z); i++) { g.strokeStyle = p.ink; g.lineWidth = 6 * u; strokeArc(g, pos[i], pos[i + 1], 1, 60 * u); }
    g.setLineDash([12 * u, 14 * u]); g.strokeStyle = withAlpha(p.ink, 0.3); g.lineWidth = 4 * u;
    for (let i = Math.max(a, z); i + 1 < n; i++) strokeArc(g, pos[i], pos[i + 1], 1, 60 * u);
    g.setLineDash([]);
    const { f, landed } = legAt(local, p.arrive);
    g.strokeStyle = p.accent; g.lineWidth = 9 * u; strokeArc(g, pos[a], pos[z], f, 60 * u);
    pos.forEach(([x, y], i) => {
      if (i === z) { label(i, p.accent, 1); return; }
      if (i === a) { dot(g, x, y, 16 * u, p.ink); ring(g, x, y, 24 * u, p.ink, 4 * u); }
      else if (i < a) dot(g, x, y, 14 * u, p.ink);
      else ring(g, x, y, 12 * u, withAlpha(p.ink, 0.45), 4 * u);
      label(i, p.ink, i <= a ? 0.85 : 0.35);
    });
    // the travelling marker, then the landing on the beat
    const [x, y] = pos[z];
    if (!landed) {
      const m = arcPt(pos[a], pos[z], f, 60 * u);
      dot(g, m[0], m[1], 18 * u, p.accent); ring(g, m[0], m[1], 26 * u, p.accent, 4 * u, 0.6); ring(g, x, y, 14 * u, withAlpha(p.ink, 0.45), 4 * u);
    } else {
      const q = prog(local, p.arrive, p.arrive + 0.08), bq = prog(local, p.arrive, p.arrive + 0.4);
      dot(g, x, y, (34 - 12 * eOut(q)) * u, p.accent); ring(g, x, y, (44 - 12 * eOut(q)) * u, p.accent, 6 * u);
      if (bq < 1) ring(g, x, y, (40 + 90 * eOut(bq)) * u, p.accent, 6 * u, 1 - bq);
    }
  },
};
