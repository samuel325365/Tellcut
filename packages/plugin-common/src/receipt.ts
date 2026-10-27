// common.receipt — a thermal receipt that prints one line at a time (icon, name, amount; the paper grows, old lines scroll up)
// and ends with a total. Promoted from the fishing-reel short's "這輩子最貴的魚" bill; also trip costs, shopping, unboxing.
// Tone bar prints the line in reverse on a black bar (a shop's name, from the food-receipt short; common.printer is its dot-matrix printer).
import { abs, clamp, cssCamel, eBack, eOut3 as eOut, h, type ItemType, textEm } from '@tellcut/engine';
import { emParts, fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  title: string; sub: string; items: string; totalAt: number; totalLabel: string; total: string; rows: number;
  x: number; y: number; w: number; tilt: number; enter: number; font: string; paper: string; ink: string; bad: string; good: string; hl: string;
}
interface Row { box: HTMLElement; flash: HTMLElement; icon: HTMLElement; name: HTMLElement; value: HTMLElement }
interface S { wrap: HTMLElement; paper: HTMLElement; title: HTMLElement; sub: HTMLElement; rule: HTMLElement; area: HTMLElement; rows: Row[]; tot: HTMLElement; rules: HTMLElement[]; totLabel: HTMLElement; totText: HTMLElement; key: string }

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";
export interface ReceiptLine { t: number; icon: string; name: string; value: string; tone: string }
/** "秒|圖示|名稱|金額|色調" per line; blank lines dropped, a missing field is empty and the tone defaults to n */
export const parseReceipt = (text: string): ReceiptLine[] => String(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [t, icon, name, value, tone] = l.split('|').map((x) => x.trim());
  return { t: Number(t) || 0, icon: icon ?? '', name: name ?? '', value: value ?? '', tone: tone || 'n' };
});
/** how far the paper has been fed (lines, each eased in over 0.35 s) and how many of them are scrolled away above `room` lines */
export function feed(lines: ReceiptLine[], local: number, room: number): { fed: number; visible: number; scroll: number } {
  let fed = 0;
  for (const l of lines) if (local >= l.t) fed += eOut(clamp((local - l.t) / 0.35));
  const visible = Math.min(fed, room);
  return { fed, visible, scroll: Math.max(0, fed - visible) };
}

export const receipt: ItemType<P, S> = {
  type: 'common.receipt', label: '收據', category: 'card', kind: 'overlay',
  doc: '一張熱感應收據：每行「秒|圖示|名稱|金額|色調」到時間就印出來（紙往下長、舊的往上捲），最後印出合計（【詞】變紅）；色調 bar 是黑底反白的店名條；花費、旅行記帳、開箱、「付出了多少 vs 換到什麼」',
  params: [
    { key: 'title', label: '抬頭', type: 'string', default: '這趟出遊' },
    { key: 'sub', label: '抬頭下小字（空＝不顯示）', type: 'string', default: '— 明細 —' },
    { key: 'items', label: '明細（每行：秒|圖示|名稱|金額|色調 n/bad/good/bar）', type: 'text', default: '0.2|🚄|來回車票|NT$1,480|n\n0.55|🏨|民宿一晚|NT$2,600|n\n0.9|🍜|三餐|NT$960|n\n1.25|☔|下雨|全天|bad\n1.6|📸|照片|312 張|good' },
    { key: 'totalAt', label: '合計印出時間（秒；-1＝不印）', type: 'number', min: -1, max: 600, step: 0.1, default: 1.9 },
    { key: 'totalLabel', label: '合計標籤', type: 'string', default: '合計' },
    { key: 'total', label: '合計內容（【詞】變紅）', type: 'string', default: '值得【再去一次】' },
    { key: 'rows', label: '最多顯示幾行（含合計佔的兩行）', type: 'number', min: 2, max: 10, step: 1, default: 6 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝印滿時下緣貼齊下方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '寬（畫面短邊的比例）', type: 'number', min: 0.2, max: 1.6, step: 0.01, default: 0.72 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -15, max: 15, step: 0.5, default: -1.5 },
    { key: 'enter', label: '從下方滑入的時間（秒；0＝不滑）', type: 'number', min: 0, max: 3, step: 0.1, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '紙色', type: 'color', default: '#fbf8f1', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#22262b', theme: 'palette.ink' },
    { key: 'bad', label: '「壞」與強調的顏色', type: 'color', default: '#e0402f', theme: 'palette.accent' },
    { key: 'good', label: '「好」的顏色', type: 'color', default: '#1c8f7a', theme: 'palette.accent2' },
    { key: 'hl', label: '新印那行的閃色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
  ],
  build(ctx) {
    const wrap = abs(ctx.root), paper = abs(wrap), title = abs(wrap), sub = abs(wrap), rule = abs(wrap), area = abs(wrap), tot = abs(wrap);
    const rules = [abs(tot), abs(tot)], totLabel = abs(tot), totText = abs(tot);
    cssCamel(area, { overflow: 'hidden' });
    for (const el of [title, sub, totLabel, totText]) cssCamel(el, { whiteSpace: 'pre', lineHeight: '1' });
    return { wrap, paper, title, sub, rule, area, rows: [], tot, rules, totLabel, totText, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local } = ctx, k = Math.min(W, H) / 1080, font = `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`;
    const lines = parseReceipt(p.items);
    if (s.key !== String(lines.length)) {   // the rows are rebuilt only when their number changes
      s.key = String(lines.length);
      for (const r of s.rows) r.box.remove();
      s.rows = lines.map(() => {
        const box = h('div', null, null, s.area), mk = () => { const e = h('div', null, null, box); cssCamel(e, { position: 'absolute', top: '50%', whiteSpace: 'pre', lineHeight: '1' }); return e; };
        cssCamel(box, { position: 'absolute', left: '0', width: '100%' });
        const flash = h('div', null, null, box); cssCamel(flash, { position: 'absolute' });
        return { box, flash, icon: mk(), name: mk(), value: mk() };
      });
    }
    // sizes: the short side; the default place keeps a full receipt above the bottom safe line
    const w = p.w * Math.min(W, H), headH = (p.sub ? 104 : 76) * k, rowH = 70 * k, totH = 132 * k, padB = 26 * k, zig = 14 * k;
    const rows = Math.max(2, Math.round(p.rows)), fullH = headH + Math.max(1, rows - 2) * rowH + (p.totalAt >= 0 ? totH : 2 * rowH) + padB + zig;
    const top0 = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - fullH, x0 = p.x * W - w / 2;
    const totalOn = p.totalAt >= 0 && local >= p.totalAt, tk = totalOn ? eOut(clamp((local - p.totalAt) / 0.45)) : 0;
    const room = Math.max(1, rows - (totalOn ? 2 : 0)), f = feed(lines, local, rows + (room - rows) * tk);
    const paperH = headH + f.visible * rowH + tk * totH + padB;
    const slide = p.enter > 0 ? (1 - eBack(clamp(local / p.enter), 2)) * (H - top0 + 60 * k) : 0;
    const out = 1 - clamp((local - ctx.dur + 0.2) / 0.2);
    cssCamel(s.wrap, { left: `${x0}px`, top: `${top0 + slide}px`, width: `${w}px`, height: `${paperH + zig}px`, fontFamily: font, color: p.ink, opacity: String(out),
      transformOrigin: '50% 0', transform: `rotate(${p.tilt}deg)`, filter: `drop-shadow(${10 * k}px ${14 * k}px 0 rgba(0,0,0,0.38))` });
    // the paper: faint thermal lines and a torn (zigzag) lower edge
    const teeth = Math.max(4, Math.round(w / (zig * 2))), pts = [`0 0`, `${w}px 0`, `${w}px ${paperH}px`];
    for (let i = teeth; i > 0; i--) { const xa = (w / teeth) * i; pts.push(`${xa - w / teeth / 2}px ${paperH + zig}px`, `${xa - w / teeth}px ${paperH}px`); }
    cssCamel(s.paper, { left: '0', top: '0', width: `${w}px`, height: `${paperH + zig}px`, background: p.paper, clipPath: `polygon(${pts.join(', ')})`,
      backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${7 * k}px, ${withAlpha(p.ink, 0.035)} ${7 * k}px ${9 * k}px)` });
    // the head
    s.title.textContent = p.title; s.sub.textContent = p.sub;
    cssCamel(s.title, { left: '50%', top: `${40 * k}px`, transform: 'translate(-50%, -50%)', fontWeight: '900', fontSize: `${fitPx(p.title, 42 * k, w - 52 * k)}px` });
    cssCamel(s.sub, { display: p.sub ? 'block' : 'none', left: '50%', top: `${76 * k}px`, transform: 'translate(-50%, -50%)', fontWeight: '500', fontSize: `${26 * k}px`, color: withAlpha(p.ink, 0.65) });
    cssCamel(s.rule, { left: `${26 * k}px`, top: `${headH - 9 * k}px`, width: `${w - 52 * k}px`, height: '0', borderTop: `${3 * k}px dashed ${withAlpha(p.ink, 0.55)}` });
    // the lines, in a window that scrolls
    const areaH = f.visible * rowH;
    cssCamel(s.area, { left: '0', top: `${headH}px`, width: `${w}px`, height: `${areaH + 1}px` });
    let acc = 0;
    s.rows.forEach((r, i) => {
      const l = lines[i], age = local - l.t, on = age >= 0;
      const ry = acc * rowH - f.scroll * rowH;
      if (on) acc += eOut(clamp(age / 0.35));
      const bar = l.tone === 'bar';
      cssCamel(r.box, { display: on ? 'block' : 'none', top: `${ry}px`, height: `${rowH}px`, background: bar ? `linear-gradient(transparent ${8 * k}px, ${p.ink} ${8 * k}px ${rowH - 8 * k}px, transparent ${rowH - 8 * k}px) ${14 * k}px 0 / calc(100% - ${28 * k}px) 100% no-repeat` : 'none', color: bar ? p.paper : '' });
      if (!on) return;
      const fl = 0.55 * (1 - clamp((age - 0.4) / 0.8));
      cssCamel(r.flash, { display: fl > 0 ? 'block' : 'none', left: `${14 * k}px`, top: `${5 * k}px`, width: `${w - 28 * k}px`, height: `${rowH - 10 * k}px`, background: p.hl, opacity: String(fl) });
      // the name is printed character by character, the amount pops in after it
      const chars = [...l.name], name = chars.slice(0, Math.ceil(chars.length * clamp(age / 0.45))).join('');
      const valW = Math.max(textEm(l.value) * 44 * k, 60 * k) + 40 * k;
      r.icon.textContent = l.icon; r.name.textContent = name; r.value.textContent = l.value;
      cssCamel(r.icon, { left: `${26 * k}px`, transform: 'translateY(-50%)', fontSize: `${44 * k}px` });
      cssCamel(r.name, { left: `${96 * k}px`, transform: 'translateY(-50%)', fontWeight: '900', fontSize: `${fitPx(l.name, 42 * k, w - 96 * k - valW)}px` });
      const vk = Math.max(0.01, eBack(clamp((age - 0.3) / 0.35), 2));
      cssCamel(r.value, { display: age > 0.3 ? 'block' : 'none', right: `${28 * k}px`, transformOrigin: '100% 50%', transform: `translateY(-50%) scale(${vk})`, fontWeight: '900',
        fontSize: `${fitPx(l.value, 44 * k, w * 0.45)}px`, color: l.tone === 'bad' ? p.bad : l.tone === 'good' ? p.good : bar ? p.paper : p.ink });
    });
    // the total: a double rule, the label, then the line itself (【word】 in red) popping in
    cssCamel(s.tot, { display: totalOn ? 'block' : 'none', left: '0', top: `${headH + areaH}px`, width: `${w}px`, height: `${totH}px`, opacity: String(tk) });
    if (totalOn) {
      s.rules.forEach((r, i) => cssCamel(r, { left: `${26 * k}px`, top: `${(i ? 19 : 12) * k}px`, width: `${w - 52 * k}px`, height: `${3 * k}px`, background: p.ink }));
      s.totLabel.textContent = p.totalLabel;
      cssCamel(s.totLabel, { left: `${28 * k}px`, top: `${50 * k}px`, transform: 'translateY(-50%)', fontWeight: '700', fontSize: `${30 * k}px`, color: withAlpha(p.ink, 0.7) });
      const parts = emParts(String(p.total)), plain = parts.map(([t]) => t).join('');
      if (s.totText.dataset.v !== p.total) {
        s.totText.dataset.v = p.total; s.totText.textContent = '';
        for (const [t, em] of parts) { const sp = h('span', null, null, s.totText); sp.textContent = t; if (em) sp.dataset.em = '1'; }
      }
      for (const sp of s.totText.children as any as HTMLElement[]) sp.style.color = sp.dataset.em ? p.bad : p.ink;
      const vk = Math.max(0.01, eBack(clamp((local - p.totalAt - 0.25) / 0.4), 2));
      cssCamel(s.totText, { left: '50%', top: `${94 * k}px`, transform: `translate(-50%, -50%) scale(${vk})`, fontWeight: '900', fontSize: `${fitPx(plain, 56 * k, w - 60 * k)}px` });
    }
  },
};
