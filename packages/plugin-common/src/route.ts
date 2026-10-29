// common.route — a hand-drawn route map on a paper card: a row of big promises on top (1 條商圈／10 分鐘／6 家), streets in
// pencil, and a dashed red route from the start (a clock tower, or an emoji) that lights the stops one by one; the last
// stops can stay a question mark. Promoted from a food-review hook short's fx.route; also day trips, walking tours, a series.
// look 'page' (fd-map's fx.nbPage, routepage.ts): the whole page is a notebook route map — places as doodles with red ticks, a dashed
// ballpoint line leg by leg with the walking time beside each, the camera moving between full / walk / stop / end / near.
import { abs, clamp, cssCamel, eBack, eOut3 as eOut, h, type ItemType, prog, type Theme } from '@tellcut/engine';
import { drawRoutePage, pageState, type PageP, type PageS } from './routepage.ts';
import { canvasAt, parsePairs, penPath, snake, spline, freeCanvas } from './inkline.ts';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P extends PageP {
  look: 'card' | 'page'; heads: string; stops: number; hidden: number; names: string; start: string; startIcon: string; from: number; to: number; beat: number;
  x: number; y: number; w: number; h: number; tilt: number; dim: number; font: string; numFont: string; paper: string; ink: string; accent: string; hl: string;
}
interface Stop { num: HTMLElement; name: HTMLElement }
interface S { page?: PageS; dim: HTMLElement; card: HTMLElement; cv: HTMLCanvasElement; rule: HTMLElement; heads: HTMLElement[]; stops: Stop[]; start: HTMLElement; icon: HTMLElement; key: string }

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";

/** the card in the frame: a w×h share of the short side, shrunk to fit the safe area; u is one pixel of the 864-wide original */
export function routeBox(p: Pick<P, 'x' | 'y' | 'w' | 'h'>, W: number, H: number, safe: Theme['safe']) {
  const S = Math.min(W, H), w0 = p.w * S, h0 = p.h * S, aw = W * (1 - 2 * safe.side), ah = H * (1 - safe.top - safe.bottom);
  const f = Math.min(1, aw / w0, ah / h0), w = w0 * f, hh = h0 * f;
  return { x0: p.x * W - w / 2, y0: p.y >= 0 ? p.y * H : safe.top * H + (ah - hh) * 0.4, w, h: hh, u: w / 864 };
}

/** when the route reaches stop n (1-based) of `count`, drawing from t0 to t1 */
export const reachAt = (n: number, count: number, t0: number, t1: number) => t0 + (n / Math.max(1, count)) * (t1 - t0) - 0.05;

export const route: ItemType<P, S> = {
  type: 'common.route', label: '手繪路線圖', category: 'travel', kind: 'overlay',
  doc: '米色紙卡上的手繪路線圖：上方一排大數字承諾（數字|說明），下面鉛筆街道，從起點（大時鐘或 emoji）畫出紅色虛線一站一站點亮，最後幾站可以打問號；探店、一日遊、走讀路線、系列預告；look page 是整頁筆記本路線圖（fd-map）：各站排成一圈（或 pts 指定位置），鉛筆先淡淡描出整條路，藍色原子筆虛線一段一段畫過去（筆尖跟著走），每段旁邊紅筆寫步行時間（legs）加波浪底線，到站時變成塗鴉（icons：bowl／bun／box／jar／tofu／cup／station／train／house／star 或 emoji）＋紅勾、站名用手寫字寫出來加螢光筆；鏡頭依 cams「秒|模式」在 full 整張、walk 地圖在上（留下面給影片）、stop 縮成角落小紙片（現在這站閃）、end、near 拉近跟著現在這站之間移動；loop 畫回起點、flash 讓所有勾依序跳一下；放在 common.paper look grid 上面',
  params: [
    { key: 'look', label: '樣子（card 紙卡路線圖、page 整頁筆記本路線圖）', type: 'enum', options: ['card', 'page'], default: 'card' },
    { key: 'heads', label: '上方大數字（數字|說明，逗號分隔；空＝不顯示）', type: 'string', default: '1|條商圈, 10|分鐘走完, 6|家吃好吃滿' },
    { key: 'stops', label: '站數', type: 'number', min: 2, max: 9, step: 1, default: 6 },
    { key: 'hidden', label: '最後幾站打問號', type: 'number', min: 0, max: 9, step: 1, default: 2 },
    { key: 'names', label: '各站名稱（| 分隔；空＝只有編號）', type: 'string', default: '' },
    { key: 'start', label: '起點名稱', type: 'string', default: '大時鐘' },
    { key: 'startIcon', label: '起點圖示（emoji；空＝手繪鐘樓）', type: 'string', default: '' },
    { key: 'from', label: '路線開始畫的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.35 },
    { key: 'to', label: '畫到最後一站的時間（秒；-1＝結束前 0.7 秒）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'beat', label: '大數字一個一個出現的間隔（秒；配樂一拍）', type: 'number', min: 0.1, max: 2, step: 0.01, default: 0.56 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝安全區裡偏上）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '寬（畫面短邊的比例）', type: 'number', min: 0.3, max: 1.6, step: 0.01, default: 0.8 },
    { key: 'h', label: '高（畫面短邊的比例）', type: 'number', min: 0.3, max: 1.6, step: 0.01, default: 1 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -15, max: 15, step: 0.5, default: -1.6 },
    { key: 'dim', label: '後面畫面壓暗', type: 'number', min: 0, max: 1, step: 0.05, default: 0.42 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'numFont', label: '大數字字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'paper', label: '紙色', type: 'color', default: '#f4ebdd', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#1e1712', theme: 'palette.ink' },
    { key: 'accent', label: '路線與大數字顏色', type: 'color', default: '#d9442b', theme: 'palette.accent' },
    { key: 'hl', label: '鐘面與問號顏色（page：螢光筆）', type: 'color', default: '#f0b429', theme: 'palette.hl' },
    { key: 'icons', label: 'page：各站的塗鴉（| 分隔；bowl、bun、box、jar、tofu、cup、station、train、house、star 或 emoji；空＝輪流畫食物）', type: 'string', default: '' },
    { key: 'legs', label: 'page：每段路旁的步行時間（| 分隔，第 n 段是第 n−1 站到第 n 站）', type: 'string', default: '' },
    { key: 'arrive', label: 'page：到各站的時間（秒，逗號分隔；空＝from 到 to 平均排開）', type: 'string', default: '' },
    { key: 'cams', label: 'page：鏡頭「秒|模式」（full、walk、stop、end、near，逗號分隔；空＝一直 full）', type: 'string', default: '' },
    { key: 'pts', label: 'page：起點和各站的位置「x,y|x,y」（地圖比例；空＝自動排成一圈）', type: 'string', default: '' },
    { key: 'loop', label: 'page：畫回起點的時間「秒-秒」（空＝不畫）', type: 'string', default: '' },
    { key: 'flash', label: 'page：所有紅勾依序跳一下的時間（秒；-1＝不跳）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'note', label: 'page：地圖下方的鉛筆小字（空＝沒有）', type: 'string', default: '' },
    { key: 'inset', label: 'page：縮成角落小地圖時下面的小字', type: 'string', default: '示意圖' },
    { key: 'handFont', label: 'page：手寫字型', type: 'string', default: 'LXGW WenKai TC' },
  ],
  build(ctx) {
    const dim = abs(ctx.root), card = abs(ctx.root), cv = abs(card, {}, 'canvas') as HTMLCanvasElement, rule = abs(card), start = abs(card), icon = abs(card);
    cssCamel(dim, { inset: '0' });
    cssCamel(card, { overflow: 'hidden', boxSizing: 'border-box', transformOrigin: '50% 100%' });
    cssCamel(cv, { left: '0', top: '0', width: '100%', height: '100%' });
    for (const el of [start, icon]) cssCamel(el, { whiteSpace: 'pre', lineHeight: '1', transform: 'translate(-50%, 0)' });
    return { dim, card, cv, rule, heads: [], stops: [], start, icon, key: '', page: ctx.params.look === 'page' ? pageState(ctx.root) : undefined };
  },
  async ready(s) {
    if (!s.page || typeof document === 'undefined' || !document.fonts) return;
    await Promise.all(["700 40px 'LXGW WenKai TC'", "400 40px 'LXGW WenKai TC'"].map((f) => document.fonts.load(f, '站分鐘').catch(() => [])));
  },
  hide(s) { freeCanvas(s.cv, s.page?.cv); },
  draw(ctx, s) {
    const page = ctx.params.look === 'page';
    cssCamel(s.dim, { display: page ? 'none' : 'block' }); cssCamel(s.card, { display: page ? 'none' : 'block' });
    if (page && !s.page) s.page = pageState(ctx.root);
    if (s.page) cssCamel(s.page.box, { display: page ? 'block' : 'none' });
    if (page) { drawRoutePage(ctx, s.page!); return; }
    const p = ctx.params, { W, H, theme, local, dur } = ctx, b = routeBox(p, W, H, theme.safe), u = b.u;
    const font = `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`, numFont = `'${p.numFont}', 'Noto Serif TC', serif`;
    const heads = parsePairs(p.heads), count = Math.max(2, Math.min(9, Math.round(p.stops))), names = String(p.names ?? '').split('|').map((x) => x.trim());
    const key = JSON.stringify([heads, count]);
    if (s.key !== key) {   // the heads and stop labels are rebuilt only when their number or text changes
      s.key = key;
      for (const el of s.heads) el.remove();
      for (const st of s.stops) { st.num.remove(); st.name.remove(); }
      s.heads = heads.map(([n, t]) => {
        const c = h('div', null, null, s.card), a = h('div', null, null, c), d = h('div', null, null, c);
        cssCamel(c, { position: 'absolute', textAlign: 'center', transformOrigin: '50% 70%' });
        a.textContent = n; d.textContent = t;
        for (const e of [a, d]) cssCamel(e, { whiteSpace: 'pre', lineHeight: '1' });
        return c;
      });
      s.stops = Array.from({ length: count }, () => {
        const mk = () => { const e = h('div', null, null, s.card); cssCamel(e, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', transform: 'translate(-50%, -50%)', fontWeight: '900' }); return e; };
        return { num: mk(), name: mk() };
      });
    }
    const out = 1 - prog(local, dur - 0.25, dur), pc = prog(local, 0, 0.38);
    cssCamel(s.dim, { background: withAlpha(p.ink, clamp(p.dim)), opacity: String(prog(local, 0, 0.2) * out) });
    cssCamel(s.card, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.w}px`, height: `${b.h}px`, background: p.paper, color: p.ink, fontFamily: font,
      border: `${5 * u}px solid ${p.ink}`, borderRadius: `${28 * u}px`, boxShadow: `${10 * u}px ${14 * u}px 0 ${withAlpha(p.ink, 0.55)}`,
      backgroundImage: `repeating-linear-gradient(0deg, ${withAlpha(p.ink, 0.05)} 0 ${2 * u}px, transparent ${2 * u}px ${46 * u}px)`,
      opacity: String(clamp(pc * 3) * out), transform: `translateY(${(1 - eOut(pc)) * 260 * u + (1 - out) * 120 * u}px) rotate(${p.tilt + (1 - eOut(pc)) * 6}deg)` });
    // the promises: big numbers in a row, popping in one a beat
    const colW = (b.w - 40 * u) / Math.max(1, heads.length);
    s.heads.forEach((c, i) => {
      const [a, d] = c.children as any as HTMLElement[], q = prog(local, 0.35 + i * p.beat, 0.6 + i * p.beat);
      cssCamel(c, { left: `${20 * u + i * colW}px`, top: `${40 * u}px`, width: `${colW}px`, opacity: String(clamp(q * 3)), transform: `scale(${0.4 + 0.6 * eBack(q, 1.9)})` });
      cssCamel(a, { fontFamily: numFont, fontWeight: '900', color: p.accent, fontSize: `${fitPx(heads[i][0], 150 * u, colW - 10 * u)}px` });
      cssCamel(d, { marginTop: `${10 * u}px`, fontWeight: '900', letterSpacing: `${2 * u}px`, fontSize: `${fitPx(heads[i][1], 44 * u, colW - 10 * u)}px` });
    });
    const top = heads.length ? 330 * u : 40 * u;
    cssCamel(s.rule, { display: heads.length ? 'block' : 'none', left: `${50 * u}px`, right: `${50 * u}px`, top: `${292 * u}px`, height: '0', borderTop: `${4 * u}px dashed ${withAlpha(p.ink, 0.35)}` });
    const cw = b.w - 10 * u, ch = b.h - 10 * u, mh = ch - top, g = canvasAt(s.cv, cw, ch);
    cssCamel(s.cv, { width: `${cw}px`, height: `${ch}px` });
    const at = ([x, y]: [number, number]): [number, number] => [x * cw, top + y * mh];
    // streets: two long avenues, one more below, three cross streets and a rail line (decor, not a real map)
    const street = (pts: Array<[number, number]>, seed: number) => penPath(g, pts.map(at), 5 * u, withAlpha(p.ink, 0.28), seed);
    if (eOut(prog(local, 0.3, 1.1)) > 0) {
      street([[0.03, 0.22], [0.5, 0.2], [0.97, 0.24]], 11); street([[0.03, 0.3], [0.5, 0.28], [0.97, 0.32]], 12); street([[0.04, 0.7], [0.5, 0.72], [0.96, 0.69]], 13);
      [0.22, 0.5, 0.78].forEach((x, i) => street([[x, 0.05], [x + 0.01, 0.95]], 20 + i));
      penPath(g, [at([0.02, 0.06]), at([0.98, 0.05])], 4 * u, withAlpha(p.ink, 0.4), 30);
      g.strokeStyle = withAlpha(p.ink, 0.4); g.lineWidth = 3 * u;
      for (let x = 0.04; x < 0.97; x += 0.035) { const [X, Y] = at([x, 0.055]); g.beginPath(); g.moveTo(X, Y - 9 * u); g.lineTo(X + 2 * u, Y + 9 * u); g.stroke(); }
    }
    // the route: dashed, drawn as it goes, a walker dot at its head
    const P = snake(count + 1, names.some(Boolean)).map(at), path = spline(P, 18);
    const t0 = p.from, t1 = Math.max(t0 + 0.1, p.to >= 0 ? p.to : dur - 0.7), pr = prog(local, t0, t1);
    if (pr > 0) {
      const upto = pr * (path.length - 1), i = Math.min(path.length - 1, Math.floor(upto)), f = upto - i;
      g.setLineDash([16 * u, 14 * u]); g.lineDashOffset = -local * 60 * u;
      penPath(g, path.slice(0, i + 2), 9 * u, p.accent, 40, 1);
      g.setLineDash([]);
      const a = path[i], c = path[Math.min(path.length - 1, i + 1)];
      if (pr < 1) { g.fillStyle = p.ink; g.beginPath(); g.arc(a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, 11 * u, 0, Math.PI * 2); g.fill(); }
    }
    // the start: a clock tower whose hands turn, or the emoji on a gold disc
    const pk = eBack(prog(local, 0.9, 1.3), 1.9), [sx, sy] = P[0], r = 50 * u * Math.max(0, pk);
    if (pk > 0) {
      g.fillStyle = p.paper; g.strokeStyle = p.ink; g.lineWidth = 6 * u;
      if (!p.startIcon) {
        g.beginPath(); g.moveTo(sx - r * 0.9, sy + r * 1.9); g.lineTo(sx - r * 0.75, sy + r * 0.6); g.lineTo(sx + r * 0.75, sy + r * 0.6); g.lineTo(sx + r * 0.9, sy + r * 1.9); g.closePath(); g.fill(); g.stroke();
      }
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fillStyle = p.hl; g.fill(); g.stroke();
      if (!p.startIcon) {
        const ah = local * 2.4, am = local * 0.3;
        g.lineWidth = 5 * u; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.sin(ah) * r * 0.75, sy - Math.cos(ah) * r * 0.75); g.stroke();
        g.lineWidth = 7 * u; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.sin(am) * r * 0.5, sy - Math.cos(am) * r * 0.5); g.stroke();
      }
    }
    s.icon.textContent = p.startIcon; s.start.textContent = p.start;
    cssCamel(s.icon, { display: p.startIcon && pk > 0 ? 'block' : 'none', left: `${sx + 5 * u}px`, top: `${sy + 5 * u}px`, fontSize: `${56 * u}px`, transform: `translate(-50%, -50%) scale(${Math.max(0.01, pk)})` });
    cssCamel(s.start, { display: p.start && pk > 0 ? 'block' : 'none', left: `${sx + 5 * u}px`, top: `${sy + 5 * u + 50 * u * (p.startIcon ? 1.25 : 2.05)}px`, fontWeight: '900', fontSize: `${38 * u}px` });
    // the stops: a hollow pencil circle that fills red (or ink with a gold ? when hidden) as the route reaches it
    for (let n = 1; n < P.length; n++) {
      const reach = reachAt(n, P.length - 1, t0, t1), q = prog(local, reach, reach + 0.28), [x, y] = P[n], hid = n > count - p.hidden, rr = 40 * u;
      g.lineWidth = 5 * u; g.strokeStyle = withAlpha(p.ink, 0.55); g.fillStyle = p.paper;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); g.stroke();
      if (q > 0) {
        if (q < 1) { g.strokeStyle = hid ? p.ink : p.accent; g.globalAlpha = 1 - q; g.lineWidth = 6 * u; g.beginPath(); g.arc(x, y, rr * (1 + q * 1.2), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
        g.fillStyle = hid ? p.ink : p.accent; g.beginPath(); g.arc(x, y, rr * eBack(q, 1.9), 0, Math.PI * 2); g.fill();
      }
      const st = s.stops[n - 1], label = hid ? '?' : String(n), nm = hid ? '' : names[n - 1] ?? '';
      st.num.textContent = label; st.name.textContent = nm;
      cssCamel(st.num, { left: `${x + 5 * u}px`, top: `${y + 7 * u}px`, fontSize: `${44 * u}px`, color: q > 0.4 ? (hid ? p.hl : '#ffffff') : withAlpha(p.ink, 0.6) });
      cssCamel(st.name, { display: nm ? 'block' : 'none', left: `${x + 5 * u}px`, top: `${y + 5 * u + rr + 26 * u}px`, fontSize: `${fitPx(nm, 30 * u, 0.2 * cw)}px`, opacity: String(0.55 + 0.45 * clamp(q * 2)) });
    }
  },
};
