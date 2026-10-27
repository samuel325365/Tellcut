// common.ticket — a cream rail ticket that slams in at the bottom of the frame: a red header band (title and No.01/03), the city
// big, a spaced Latin line, a perforated stub with the dates, notches cut at the tear line — and on the next beat a red double-ringed
// "arrived" stamp lands on it. Promoted from the uk-beat short's fx.ticket; any trip edit's arrival at a stop.
import { abs, clamp, cssCamel, eBack, eIO3 as eInOut, eOut3 as eOut, type ItemType, prog } from '@tellcut/engine';
import { fitPx } from './text.ts';

interface P {
  header: string; no: string; total: string; title: string; latin: string; dateLabel: string; date: string; date2: string; year: string; stamp: string; stampAt: number;
  y: number; w: number; font: string; mono: string; paper: string; ink: string; accent: string; muted: string;
}
interface S { wrap: HTMLElement; card: HTMLElement; band: HTMLElement; head: HTMLElement; no: HTMLElement; title: HTMLElement; latin: HTMLElement; tear: HTMLElement; lab: HTMLElement; date: HTMLElement; date2: HTMLElement; year: HTMLElement; st: HTMLElement; stText: HTMLElement }

/** the ticket's place: k = one pixel of the 800-wide original; y −1 sits it just above the bottom safe line */
export function ticketBox(p: Pick<P, 'y' | 'w'>, W: number, H: number, safe: { bottom: number; side: number }) {
  const w = Math.min(p.w * Math.min(W, H), W * (1 - 2 * safe.side)), k = w / 800, hh = 330 * k;
  return { k, w, h: hh, x: (W - w) / 2, y: p.y >= 0 ? p.y * H : (1 - safe.bottom) * H - hh - 40 * k };
}

export const ticket: ItemType<P, S> = {
  type: 'common.ticket', label: '到站車票', category: 'travel', kind: 'overlay',
  doc: '下方一張奶油色車票砸進來（紅色票頭＋No.01/03、大城市名、拉丁字、右邊日期票根、打孔線），stampAt 秒時蓋上紅色雙圈「已到站」章；旅行快剪每到一站、行程、門票、登機',
  params: [
    { key: 'header', label: '票頭', type: 'string', default: '歐洲・節拍車票' },
    { key: 'no', label: '站號', type: 'string', default: '01' },
    { key: 'total', label: '總站數（空＝不顯示）', type: 'string', default: '03' },
    { key: 'title', label: '城市', type: 'string', default: '巴黎' },
    { key: 'latin', label: '拉丁字', type: 'string', default: 'PARIS · FRANCE' },
    { key: 'dateLabel', label: '票根小標', type: 'string', default: '日期' },
    { key: 'date', label: '日期', type: 'string', default: '05.26' },
    { key: 'date2', label: '日期第二行', type: 'string', default: '→ 05.29' },
    { key: 'year', label: '年份', type: 'string', default: '2022' },
    { key: 'stamp', label: '印章字（空＝不蓋章）', type: 'string', default: '已到站' },
    { key: 'stampAt', label: '蓋章時間（秒）', type: 'number', min: 0, max: 30, step: 0.05, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝下方安全區上面）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '寬（畫面短邊的比例）', type: 'number', min: 0.3, max: 1.2, step: 0.01, default: 0.74 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'mono', label: '數字字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'paper', label: '票的紙色', type: 'color', default: '#f3ecdf', theme: 'palette.paper' },
    { key: 'ink', label: '城市名的顏色', type: 'color', default: '#0e0e10', theme: 'palette.ink' },
    { key: 'accent', label: '票頭與印章', type: 'color', default: '#ff3b1f', theme: 'palette.accent' },
    { key: 'muted', label: '拉丁字與小標', type: 'color', default: '#6b665e' },
  ],
  build(ctx) {
    const wrap = abs(ctx.root), card = abs(wrap), band = abs(card), head = abs(card), no = abs(card), title = abs(card), latin = abs(card), tear = abs(card);
    const lab = abs(card), date = abs(card), date2 = abs(card), year = abs(card), st = abs(wrap), stText = abs(st);
    cssCamel(wrap, { transformOrigin: '50% 60%' });
    cssCamel(card, { left: '0', top: '0', width: '100%', height: '100%', overflow: 'hidden' });
    for (const e of [head, no, title, latin, lab, date, date2, year, stText]) cssCamel(e, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' });
    cssCamel(st, { borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' });
    cssCamel(stText, { position: 'relative', fontWeight: '900' });
    return { wrap, card, band, head, no, title, latin, tear, lab, date, date2, year, st, stText };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, b = ticketBox(p, W, H, theme.safe), k = b.k, cut = 560 * k;
    const font = `'${p.font}', 'Noto Sans TC', sans-serif`, mono = `'${p.mono}', 'JetBrains Mono', monospace`;
    // slam in, a nudge when the stamp lands, slide down and away at the end
    const a = eBack(prog(local, 0, 0.14), 2.2), out = eInOut(prog(local, dur - 0.14, dur)), sa = p.stampAt, sq = prog(local, sa, sa + 0.09);
    const nudge = p.stamp && local >= sa ? Math.sin(prog(local, sa, sa + 0.14) * Math.PI) * 8 * k : 0;
    cssCamel(s.wrap, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, fontFamily: font,
      transform: `translateY(${((1 - a) * 90 * k + out * 120 * k + nudge).toFixed(2)}px) scale(${(1.2 - 0.2 * a).toFixed(4)}) rotate(${(5 * (1 - a) - 1.5).toFixed(3)}deg)`,
      opacity: String(clamp(prog(local, 0, 0.05)) * (1 - out)) });
    // the notches at the tear line, cut out of the card
    const mask = `radial-gradient(circle at ${cut}px 0, transparent ${17 * k}px, #000 ${18 * k}px), radial-gradient(circle at ${cut}px 100%, transparent ${17 * k}px, #000 ${18 * k}px)`;
    cssCamel(s.card, { background: p.paper, borderRadius: `${16 * k}px`, webkitMaskImage: mask, webkitMaskComposite: 'source-in', maskImage: mask, maskComposite: 'intersect' });
    cssCamel(s.band, { left: '0', top: '0', width: '100%', height: `${62 * k}px`, background: p.accent });
    s.head.textContent = p.header; s.no.textContent = p.total ? `No.${p.no}/${p.total}` : `No.${p.no}`;
    cssCamel(s.head, { left: `${30 * k}px`, top: `${16 * k}px`, fontSize: `${fitPx(p.header, 30 * k, 480 * k)}px`, color: p.paper, letterSpacing: `${5 * k}px` });
    cssCamel(s.no, { right: `${30 * k}px`, top: `${17 * k}px`, fontSize: `${30 * k}px`, fontFamily: mono, color: p.paper });
    const long = [...p.title].length > 2, big = fitPx(p.title, (long ? 92 : 136) * k, cut - 60 * k);
    s.title.textContent = p.title; s.latin.textContent = p.latin;
    cssCamel(s.title, { left: `${34 * k}px`, top: `${(long ? 118 : 94) * k}px`, fontSize: `${big}px`, fontWeight: '900', color: p.ink });
    cssCamel(s.latin, { left: `${38 * k}px`, top: `${250 * k}px`, fontSize: `${fitPx(p.latin, 30 * k, cut - 70 * k)}px`, fontFamily: mono, color: p.muted, letterSpacing: `${6 * k}px` });
    cssCamel(s.tear, { left: `${cut - k}px`, top: `${76 * k}px`, width: '0', height: `${240 * k}px`, borderLeft: `${3 * k}px dashed ${p.ink}`, opacity: '0.35' });
    s.lab.textContent = p.dateLabel; s.date.textContent = p.date; s.date2.textContent = p.date2; s.year.textContent = p.year;
    cssCamel(s.lab, { left: `${590 * k}px`, top: `${92 * k}px`, fontSize: `${24 * k}px`, color: p.muted, letterSpacing: `${4 * k}px` });
    cssCamel(s.date, { left: `${588 * k}px`, top: `${132 * k}px`, fontSize: `${fitPx(p.date, 60 * k, 190 * k)}px`, fontFamily: mono, color: p.ink });
    cssCamel(s.date2, { left: `${590 * k}px`, top: `${208 * k}px`, fontSize: `${fitPx(p.date2, 32 * k, 190 * k)}px`, fontFamily: mono, color: p.ink });
    cssCamel(s.year, { left: `${590 * k}px`, top: `${262 * k}px`, fontSize: `${24 * k}px`, fontFamily: mono, color: p.muted });
    // the stamp: a double red ring with the word in it, landing big and settling, tilted
    s.stText.textContent = p.stamp;
    cssCamel(s.st, { display: p.stamp ? 'flex' : 'none', left: `${400 * k}px`, top: `${92 * k}px`, width: `${172 * k}px`, height: `${172 * k}px`,
      border: `${7 * k}px solid ${p.accent}`, boxShadow: `inset 0 0 0 ${6 * k}px ${p.paper}, inset 0 0 0 ${10 * k}px ${p.accent}`,
      opacity: local < sa ? '0' : String(0.92 * clamp(sq * 1.5)), transform: `scale(${(2.1 - 1.1 * eOut(sq)).toFixed(4)}) rotate(-14deg)` });
    cssCamel(s.stText, { fontSize: `${fitPx(p.stamp, 44 * k, 140 * k)}px`, color: p.accent, letterSpacing: `${2 * k}px` });
  },
};
