// common.stations — the closing beat of a trip edit: the lower part of the frame darkens, a red line runs down and every station of
// the trip is stamped on it at once (a numbered red badge, the name big, the Latin name spaced), then the dates rise under them.
// Promoted from the uk-beat short's fx.finale.
import { abs, clamp, cssCamel, eBack, eOut3 as eOut, h, type ItemType, prog } from '@tellcut/engine';
import { parsePairs } from './inkline.ts';
import { pad2 } from './geo.ts';
import { fitPx } from './text.ts';

interface P { stops: string; dates: string; stagger: number; font: string; mono: string; accent: string; paper: string; text: string; hl: string; shade: number }
interface Row { row: HTMLElement; badge: HTMLElement; num: HTMLElement; name: HTMLElement; latin: HTMLElement }
interface S { shade: HTMLElement; line: HTMLElement; rows: Row[]; dates: HTMLElement; key: string }

/** where the stack goes: u, the first row's top (rows 150 u apart, the dates under the last) so that the dates end on the bottom safe line */
export function stationsLayout(n: number, W: number, H: number, safe: { bottom: number; side: number }) {
  const u = Math.min(W, H) / 1080, bottom = (1 - safe.bottom) * H, top = bottom - (Math.max(1, n) * 150 + 90) * u;
  return { u, top, left: safe.side * W + 20 * u, bottom };
}

export const stations: ItemType<P, S> = {
  type: 'common.stations', label: '站章收尾', category: 'travel', kind: 'overlay',
  doc: '收尾的最後一拍：畫面下方變暗，一條紅線串起每一站的章（編號紅圓章、站名大字、拉丁字）一起蓋下，再浮出日期；旅行快剪、系列回顧、行程總結',
  params: [
    { key: 'stops', label: '各站（中文|英文，逗號分隔）', type: 'string', default: '巴黎|PARIS, 克拉科夫|KRAKÓW, 塔林|TALLINN' },
    { key: 'dates', label: '下方日期（空＝不顯示）', type: 'string', default: '2022 · 05.26 — 08.21' },
    { key: 'stagger', label: '每站間隔（秒）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.033 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'mono', label: '數字字型', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
    { key: 'accent', label: '章與線的顏色', type: 'color', default: '#ff3b1f', theme: 'palette.accent' },
    { key: 'paper', label: '章的外圈與編號', type: 'color', default: '#f3ecdf', theme: 'palette.paper' },
    { key: 'text', label: '站名顏色', type: 'color', default: '#ffffff' },
    { key: 'hl', label: '拉丁字顏色', type: 'color', default: '#ffd60a', theme: 'palette.hl' },
    { key: 'shade', label: '下方壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.86 },
  ],
  build(ctx) {
    const shade = abs(ctx.root), line = abs(ctx.root), dates = abs(ctx.root);
    cssCamel(line, { transformOrigin: '50% 0' });
    cssCamel(dates, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '700' });
    return { shade, line, rows: [], dates, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, list = parsePairs(p.stops), n = list.length, L = stationsLayout(n, W, H, theme.safe), u = L.u;
    const font = `'${p.font}', 'Noto Sans TC', sans-serif`, mono = `'${p.mono}', 'JetBrains Mono', monospace`;
    if (s.key !== p.stops) {   // rows rebuilt only when the stations change
      s.key = p.stops;
      for (const r of s.rows) r.row.remove();
      s.rows = list.map(() => {
        const row = h('div', null, null, ctx.root), badge = h('div', null, null, row), num = h('div', null, null, badge), name = h('div', null, null, row), latin = h('div', null, null, row);
        cssCamel(row, { position: 'absolute' });
        cssCamel(badge, { position: 'absolute', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' });
        for (const e of [name, latin]) cssCamel(e, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1' });
        cssCamel(num, { lineHeight: '1', fontWeight: '700' });
        return { row, badge, num, name, latin };
      });
      ctx.root.appendChild(s.dates);   // keep the dates above the rows
    }
    cssCamel(s.shade, { left: '0', top: `${L.top - 80 * u}px`, width: '100%', height: `${H - L.top + 80 * u}px`,
      background: `linear-gradient(180deg, rgba(8,8,10,0) 0%, rgba(8,8,10,${(p.shade * 0.84).toFixed(3)}) 30%, rgba(8,8,10,${p.shade}) 100%)` });
    cssCamel(s.line, { display: n > 1 ? 'block' : 'none', left: `${L.left + 55 * u}px`, top: `${L.top + 60 * u}px`, width: `${10 * u}px`, height: `${(n - 1) * 150 * u}px`, background: p.accent,
      transform: `scaleY(${eOut(prog(local, 0, 0.14)).toFixed(4)})` });
    s.rows.forEach((r, i) => {
      const [zh, en] = list[i], t0 = i * p.stagger, q = eBack(prog(local, t0, t0 + 0.12), 2.2);
      cssCamel(r.row, { left: `${L.left}px`, top: `${L.top + i * 150 * u}px`, height: `${120 * u}px`, transformOrigin: `${60 * u}px 50%`, opacity: String(clamp(prog(local, t0, t0 + 0.03))),
        transform: `scale(${(1.7 - 0.7 * q + 0.03 * prog(local, 0.2, dur)).toFixed(4)})` });
      cssCamel(r.badge, { left: '0', top: '0', width: `${120 * u}px`, height: `${120 * u}px`, background: p.accent, boxShadow: `0 0 0 ${8 * u}px ${p.paper}` });
      r.num.textContent = pad2(i + 1); r.name.textContent = zh; r.latin.textContent = en;
      cssCamel(r.num, { fontSize: `${50 * u}px`, fontFamily: mono, color: p.paper });
      cssCamel(r.name, { left: `${160 * u}px`, top: `${4 * u}px`, fontSize: `${fitPx(zh, 84 * u, W - L.left * 2 - 180 * u)}px`, fontFamily: font, fontWeight: '900', color: p.text, textShadow: `0 ${4 * u}px ${14 * u}px rgba(0,0,0,.5)` });
      cssCamel(r.latin, { display: en ? 'block' : 'none', left: `${164 * u}px`, top: `${100 * u}px`, fontSize: `${28 * u}px`, fontFamily: mono, fontWeight: '700', color: p.hl, letterSpacing: `${8 * u}px` });
    });
    const d = eOut(prog(local, 0.3, 0.55));
    s.dates.textContent = p.dates;
    cssCamel(s.dates, { display: p.dates ? 'block' : 'none', left: `${L.left}px`, top: `${L.bottom - 50 * u}px`, fontSize: `${44 * u}px`, fontFamily: mono, color: p.text, opacity: String(d), transform: `translateY(${((1 - d) * 20 * u).toFixed(2)}px)` });
  },
};
