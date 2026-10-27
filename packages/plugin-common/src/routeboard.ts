// common.routeboard — a dark route board that hangs over a travel edit: a mini map of the trip's real cities (longitude and latitude),
// the legs dashed until travelled and then lit, the current city pulsing, a split-flap station counter (01/03) and the date.
// The stops say which city is lit from which second. Promoted from the uk-beat short's fx.hud.
import { abs, cssCamel, eOut3 as eOut, h, type ItemType, prog } from '@tellcut/engine';
import { canvasAt } from './inkline.ts';
import { boundsOf, dot, EUROPE_TRIP, graticule, labelSide, pad2, parseCities, projector, ring, strokeArc, type Pt } from './geo.ts';
import { withAlpha } from './color.ts';

interface P { cities: string; stops: unknown; legs: unknown; counter: string; y: number; w: number; font: string; mono: string; panel: string; text: string; accent: string; hl: string }
interface S { panel: HTMLElement; bar: HTMLElement; cv: HTMLCanvasElement; rule: HTMLElement; cap: HTMLElement; num: HTMLElement; total: HTMLElement; date: HTMLElement; labs: HTMLElement[]; key: string }

/** one stop: from `t` seconds city `city` (an index; -1 on the road, nothing lit; `all` every city) with its date */
export interface Stop { t: number; city: number | 'all'; date: string }

/** "秒|城市|日期, …" (城市: 0, 1, 2…, - on the road, all) or the [[秒, 城市, 日期]] list cut.ts writes (3 or more = all, as uk-beat did) */
export function parseStops(v: unknown, cities: number): Stop[] {
  const rows: unknown[][] = Array.isArray(v) ? (v as unknown[][]) : String(v ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => x.split('|').map((y) => y.trim()));
  return rows.map((r) => {
    const raw = String(r[1] ?? '').trim(), n = Number(raw);
    const city: number | 'all' = /^(all|\*|全部)$/i.test(raw) || (Number.isFinite(n) && n >= cities) ? 'all' : raw === '-' || raw === '' || !Number.isFinite(n) || n < 0 ? -1 : Math.floor(n);
    return { t: Number(r[0]) || 0, city, date: String(r[2] ?? '') };
  }).sort((a, b) => a.t - b.t);
}

/** the stop showing at `local`, the cities reached by then, and when each leg (city i → i+1) counts as travelled */
export function boardAt(stops: Stop[], cities: number, local: number, legs: number[] = []) {
  let cur: Stop = stops[0] ?? { t: 0, city: 0, date: '' };
  const visited = new Set<number>();
  for (const s of stops) if (s.t <= local + 1e-6) { cur = s; if (s.city === 'all') for (let i = 0; i < cities; i++) visited.add(i); else if (s.city >= 0) visited.add(s.city); }
  // a leg without a time given is travelled once its far end is first lit
  const legAt = Array.from({ length: Math.max(0, cities - 1) }, (_, i) => {
    if (Number.isFinite(legs[i])) return legs[i];
    const s = stops.find((x) => x.city === 'all' || x.city >= i + 1);
    return s ? s.t : Infinity;
  });
  return { cur, since: local - cur.t, visited, done: legAt.map((t) => local >= t - 1e-6) };
}

export const routeboard: ItemType<P, S> = {
  type: 'common.routeboard', label: '路線看板', category: 'travel', kind: 'overlay',
  doc: '上方一塊深色路線看板：真實經緯度的迷你地圖（城市點、走過的線變亮）、目前那站閃一下、站數 01/03 翻牌、日期；stops「秒|城市|日期」決定每一刻亮哪一站（- 途中、all 全部）；多城市旅行快剪整片掛著',
  params: [
    { key: 'cities', label: '城市（中文|英文|經度|緯度，逗號分隔）', type: 'text', default: EUROPE_TRIP },
    { key: 'stops', label: '站點（秒|城市編號|日期，逗號分隔；城市 0 起，- 途中，all 全部）', type: 'text', default: '0|0|05.26, 1|1|06.06, 2|2|08.21, 2.6|all|05.26–08.21' },
    { key: 'legs', label: '每段路線畫亮的時間（秒，逗號分隔；空＝到下一站時）', type: 'string', default: '' },
    { key: 'counter', label: '站數上方的小字', type: 'string', default: '第幾站' },
    { key: 'y', label: '上緣（畫面高比例；-1＝安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '寬（畫面短邊的比例）', type: 'number', min: 0.4, max: 1.2, step: 0.01, default: 0.76 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'mono', label: '數字字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'panel', label: '看板底色', type: 'color', default: '#0c0c0e', theme: 'palette.ink' },
    { key: 'text', label: '字色', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '目前那站與左邊色條', type: 'color', default: '#ff3b1f', theme: 'palette.accent' },
    { key: 'hl', label: '走過的線、站數與城市名', type: 'color', default: '#ffd60a', theme: 'palette.hl' },
  ],
  build(ctx) {
    const panel = abs(ctx.root), bar = abs(panel), cv = abs(panel, {}, 'canvas') as HTMLCanvasElement, rule = abs(panel), cap = abs(panel), num = abs(panel), total = abs(panel), date = abs(panel);
    cssCamel(panel, { overflow: 'hidden' });
    cssCamel(cv, { left: '0', top: '0' });
    for (const e of [cap, num, total, date]) cssCamel(e, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' });
    cssCamel(num, { transformOrigin: '50% 50%' });
    return { panel, bar, cv, rule, cap, num, total, date, labs: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local } = ctx, cities = parseCities(p.cities), n = cities.length;
    const pw = Math.min(p.w * Math.min(W, H), W * (1 - 2 * theme.safe.side)), k = pw / 820, ph = 206 * k;
    const font = `'${p.font}', 'Noto Sans TC', sans-serif`, mono = `'${p.mono}', 'JetBrains Mono', monospace`;
    if (s.key !== p.cities) {   // the city names are rebuilt only when the list changes
      s.key = p.cities;
      for (const l of s.labs) l.remove();
      s.labs = cities.map((c) => { const d = h('div', null, null, s.panel); d.textContent = c.zh; cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' }); return d; });
    }
    const legs = String(Array.isArray(p.legs) ? p.legs.join(',') : p.legs ?? '').split(/[,，]/).map((x) => (x.trim() === '' ? NaN : Number(x)));
    const st = boardAt(parseStops(p.stops, n), n, local, legs), city = st.cur.city;
    const out = 1 - prog(local, ctx.dur - 0.2, ctx.dur);
    cssCamel(s.panel, { left: `${(W - pw) / 2}px`, top: `${p.y >= 0 ? p.y * H : theme.safe.top * H}px`, width: `${pw}px`, height: `${ph}px`, background: withAlpha(p.panel, 0.84),
      borderRadius: `${18 * k}px`, boxShadow: `0 ${6 * k}px ${24 * k}px rgba(0,0,0,.35)`, opacity: String(out), fontFamily: font, color: p.text });
    cssCamel(s.bar, { left: '0', top: '0', width: `${10 * k}px`, height: '100%', background: p.accent });
    // the map
    const box: [number, number, number, number] = [34 * k, 22 * k, 500 * k, 150 * k], b = boundsOf(cities), P = projector(box, b);
    const pos: Pt[] = cities.map((c) => P(c.lon, c.lat));
    const g = canvasAt(s.cv, pw, ph);
    cssCamel(s.cv, { width: `${pw}px`, height: `${ph}px` });
    graticule(g, P, b, withAlpha(p.text, 0.08), 1.5 * k);
    g.lineCap = 'round';
    for (let i = 0; i + 1 < n; i++) {
      const done = st.done[i];
      g.setLineDash(done ? [] : [7 * k, 9 * k]); g.strokeStyle = done ? p.hl : withAlpha(p.text, 0.35); g.lineWidth = (done ? 5 : 3) * k;
      strokeArc(g, pos[i], pos[i + 1], 1, 18 * k);
    }
    g.setLineDash([]);
    pos.forEach(([x, y], i) => {
      const on = city === i || city === 'all', seen = st.visited.has(i);
      if (on) {
        dot(g, x, y, 13 * k, p.accent); ring(g, x, y, 13 * k, p.text, 3 * k);
        const q = prog(st.since, 0, 0.35);
        if (q < 1) ring(g, x, y, (13 + 34 * eOut(q)) * k, p.accent, 4 * k, 1 - q);
      } else if (seen) dot(g, x, y, 8 * k, p.text);
      else ring(g, x, y, 8 * k, withAlpha(p.text, 0.55), 3 * k);
      const lab = s.labs[i], left = labelSide(y, box) === 'left';
      cssCamel(lab, { left: `${left ? x - 22 * k : x}px`, top: `${left ? y : y + 20 * k}px`, transform: left ? 'translate(-100%, -50%)' : 'translate(-50%, 0)', fontSize: `${26 * k}px`,
        color: on ? p.hl : seen ? p.text : withAlpha(p.text, 0.55) });
    });
    // the counter: the digits flip in over 0.1 s at every change
    cssCamel(s.rule, { left: `${565 * k}px`, top: `${22 * k}px`, width: `${2 * k}px`, height: `${152 * k}px`, background: withAlpha(p.text, 0.18) });
    s.cap.textContent = p.counter;
    cssCamel(s.cap, { left: `${592 * k}px`, top: `${20 * k}px`, fontSize: `${22 * k}px`, letterSpacing: `${4 * k}px`, color: withAlpha(p.text, 0.6) });
    s.num.textContent = city === 'all' ? pad2(n) : city >= 0 ? pad2(city + 1) : '--';
    cssCamel(s.num, { left: `${588 * k}px`, top: `${50 * k}px`, fontSize: `${92 * k}px`, fontFamily: mono, color: p.hl, transform: `scaleY(${(0.15 + 0.85 * eOut(prog(st.since, 0, 0.1))).toFixed(3)})` });
    s.total.textContent = `/${pad2(n)}`;
    cssCamel(s.total, { left: `${700 * k}px`, top: `${92 * k}px`, fontSize: `${40 * k}px`, fontFamily: mono, color: withAlpha(p.text, 0.55) });
    s.date.textContent = st.cur.date;
    cssCamel(s.date, { left: `${592 * k}px`, top: `${148 * k}px`, fontSize: `${(st.cur.date.length > 6 ? 22 : 30) * k}px`, fontFamily: mono });
  },
};
