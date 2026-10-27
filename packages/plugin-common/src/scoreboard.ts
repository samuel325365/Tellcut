// common.scoreboard — a ticket of cells (icon, name, value) under a title bar; one item per state, the cell that changed pops with a
// flash ring and can hang a small note. Promoted from the fishing2 short's "今日釣果" catch ticket; also a score card (味道 ★★★★).
import { abs, clamp, cssCamel, eBack, h, type ItemType, textEm } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  title: string; sub: string; icons: string; names: string; values: string; tones: string; pop: number; note: string; enter: boolean;
  texture: 'receipt' | 'plain'; y: number; h: number; font: string; paper: string; ink: string; bad: string; good: string; hl: string;
}
interface Cell { box: HTMLElement; icon: HTMLElement; name: HTMLElement; value: HTMLElement }
interface S { card: HTMLElement; head: HTMLElement; title: HTMLElement; sub: HTMLElement; body: HTMLElement; grid: HTMLElement; holes: HTMLElement[]; cells: Cell[]; seps: HTMLElement[]; ring: HTMLElement; flash: HTMLElement; note: HTMLElement; key: string }

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";
const split = (s: string) => String(s).split('|').map((x) => x.trim());

export const scoreboard: ItemType<P, S> = {
  type: 'common.scoreboard', label: '計分票', category: 'number', kind: 'overlay',
  doc: '上方一張票卡：標題列加幾格（圖示、名稱、數值），每段放一個狀態，改變的那格彈一下、可掛小註；戰績、釣果、收集進度、評分卡（味道 ★★★★）',
  params: [
    { key: 'title', label: '標題（可含 emoji）', type: 'string', default: '🧾 今日戰績' },
    { key: 'sub', label: '右上小字（空＝不顯示）', type: 'string', default: '目標：3 勝' },
    { key: 'icons', label: '圖示（| 分隔）', type: 'string', default: '🎯|🏆|💥|⏱️' },
    { key: 'names', label: '名稱（| 分隔，格數照這個）', type: 'string', default: '目標|勝場|失誤|時間' },
    { key: 'values', label: '數值（| 分隔）', type: 'string', default: '3|1|0|12:40' },
    { key: 'tones', label: '色調（| 分隔：n 一般、bad 壞、good 好）', type: 'string', default: 'n|good|n|n' },
    { key: 'pop', label: '這段改變的格子（0 起算，-1＝沒有）', type: 'number', min: -1, max: 7, step: 1, default: 1 },
    { key: 'note', label: '改變格子下的小註（空＝不顯示）', type: 'string', default: '+1' },
    { key: 'enter', label: '整張卡從上面滑入（第一段用）', type: 'bool', default: false },
    { key: 'texture', label: '質感', type: 'enum', options: ['receipt', 'plain'], default: 'receipt' },
    { key: 'y', label: '上緣（畫面高比例；-1＝安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'h', label: '高（畫面高比例）', type: 'number', min: 0.08, max: 0.5, step: 0.005, default: 0.17 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '紙色', type: 'color', default: '#f6efe2', theme: 'palette.paper' },
    { key: 'ink', label: '標題列與字色', type: 'color', default: '#0e2a47', theme: 'palette.ink' },
    { key: 'bad', label: '「壞」的顏色', type: 'color', default: '#e8483b', theme: 'palette.accent' },
    { key: 'good', label: '「好」的顏色', type: 'color', default: '#1f9e8a', theme: 'palette.accent2' },
    { key: 'hl', label: '閃色與小字底色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
  ],
  build(ctx) {
    const card = abs(ctx.root), head = abs(card), title = abs(head), sub = abs(head), body = abs(card);
    cssCamel(card, { overflow: 'hidden', boxSizing: 'border-box' });
    for (const el of [title, sub]) { cssCamel(el, { whiteSpace: 'pre', lineHeight: '1', top: '50%', fontWeight: '900' }); }
    // the cells sit above the card, not in it, so a popping cell is never cut off by the card edge
    const grid = abs(ctx.root), holes = [abs(ctx.root), abs(ctx.root)], ring = abs(ctx.root), flash = abs(grid), note = abs(ctx.root);
    cssCamel(note, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '900', color: '#ffffff' });
    return { card, head, title, sub, body, grid, holes, cells: [], seps: [], ring, flash, note, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, font = `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`;
    const names = split(p.names), icons = split(p.icons), values = split(p.values), tones = split(p.tones), n = names.length;
    if (s.key !== String(n)) {   // the cells are rebuilt only when their number changes
      s.key = String(n);
      for (const c of s.cells) c.box.remove();
      for (const d of s.seps) d.remove();
      s.cells = names.map(() => {
        const box = h('div', null, null, s.grid), mk = () => { const e = h('div', null, null, box); cssCamel(e, { position: 'absolute', left: '50%', whiteSpace: 'pre', lineHeight: '1', transform: 'translate(-50%, -50%)' }); return e; };
        cssCamel(box, { position: 'absolute', top: '0', height: '100%' });
        return { box, icon: mk(), name: mk(), value: mk() };
      });
      s.seps = names.slice(1).map(() => { const d = h('div', null, null, s.grid); cssCamel(d, { position: 'absolute' }); return d; });
    }
    const x0 = theme.safe.side * W, w = W - 2 * x0, ch0 = p.h * H, top0 = p.y >= 0 ? p.y * H : theme.safe.top * H;
    const y0 = top0 + (p.enter ? (1 - eBack(clamp(ctx.local / 0.6), 2.2)) * -(ch0 + top0 + 40 * k) : 0);
    const out = 1 - clamp((ctx.local - ctx.dur + 0.2) / 0.2), hh = Math.min(76 * k, ch0 * 0.3), bh = ch0 - hh;
    cssCamel(s.card, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${ch0}px`, background: p.paper, border: `${5 * k}px solid ${p.ink}`,
      borderRadius: `${26 * k}px`, boxShadow: `${8 * k}px ${10 * k}px 0 rgba(0,0,0,0.35)`, fontFamily: font, opacity: String(out) });
    cssCamel(s.head, { left: '0', top: '0', width: '100%', height: `${hh}px`, background: p.ink });
    s.title.textContent = p.title; s.sub.textContent = p.sub;
    const subPx = 33 * k, subW = p.sub ? textEm(p.sub) * subPx + 36 * k : 0;
    cssCamel(s.title, { left: `${26 * k}px`, transform: 'translateY(-50%)', color: p.paper, fontSize: `${fitPx(p.title, 44 * k, w - subW - 70 * k)}px` });
    cssCamel(s.sub, { display: p.sub ? 'block' : 'none', right: `${18 * k}px`, transform: 'translateY(-50%)', fontSize: `${subPx}px`, fontWeight: '700',
      color: p.ink, background: p.hl, padding: `${(hh - 26 * k - subPx) / 2}px ${18 * k}px`, borderRadius: '999px' });
    const lines = p.texture === 'receipt' ? `repeating-linear-gradient(180deg, transparent 0 ${12 * k}px, ${withAlpha(p.ink, 0.06)} ${12 * k}px ${14 * k}px)` : 'none';
    cssCamel(s.body, { left: '0', top: `${hh}px`, width: '100%', height: `${bh}px`, backgroundImage: lines });
    cssCamel(s.grid, { left: `${x0}px`, top: `${y0 + hh}px`, width: `${w}px`, height: `${bh}px`, fontFamily: font, opacity: String(out) });
    s.holes.forEach((d, i) => cssCamel(d, { display: p.texture === 'receipt' ? 'block' : 'none', left: `${x0 + (i ? w - 22 * k : 22 * k) - 9 * k}px`, top: `${y0 + hh + bh / 2 - 9 * k}px`,
      width: `${18 * k}px`, height: `${18 * k}px`, borderRadius: '50%', background: withAlpha(p.ink, 0.85), opacity: String(out) }));
    // the cells
    const pad = 46 * k, cw = (w - pad * 2) / Math.max(1, n), on = p.pop >= 0 && p.pop < n ? Math.floor(p.pop) : -1;
    s.cells.forEach((c, i) => {
      const kk = i === on ? Math.max(0.01, eBack(clamp((ctx.local - 0.15) / 0.45), 2.2)) : 1, tone = tones[i] ?? 'n';
      cssCamel(c.box, { left: `${pad + cw * i}px`, width: `${cw}px`, transform: `scale(${kk})` });
      c.icon.textContent = icons[i] ?? ''; c.name.textContent = names[i]; c.value.textContent = values[i] ?? '';
      cssCamel(c.icon, { top: `${bh * 0.22}px`, fontSize: `${Math.min(62 * k, bh * 0.3)}px` });
      cssCamel(c.name, { top: `${bh * 0.54}px`, fontSize: `${fitPx(names[i], Math.min(34 * k, bh * 0.16), cw - 16 * k)}px`, fontWeight: '700', color: withAlpha(p.ink, 0.75) });
      cssCamel(c.value, { top: `${bh * 0.81}px`, fontSize: `${fitPx(values[i] ?? '', Math.min(60 * k, bh * 0.27), cw - 20 * k)}px`, fontWeight: '900',
        color: tone === 'bad' ? p.bad : tone === 'good' ? p.good : p.ink });
    });
    s.seps.forEach((d, i) => cssCamel(d, { left: `${pad + cw * (i + 1)}px`, top: `${18 * k}px`, height: `${bh - 36 * k}px`, borderLeft: `${3 * k}px dashed ${withAlpha(p.ink, 0.35)}` }));
    // the changed cell: a ring that spreads, a flash behind it, then the note hanging under it
    const cx = x0 + pad + cw * (on + 0.5), cy = y0 + hh + bh / 2, ring = clamp((ctx.local - 0.15) / 0.7), fl = 0.5 * (1 - clamp((ctx.local - 0.8) / 0.8));
    const rr = 40 * k + ring * 90 * k;
    cssCamel(s.ring, { display: on >= 0 && ring < 1 ? 'block' : 'none', left: `${cx - rr}px`, top: `${cy - rr}px`, width: `${2 * rr}px`, height: `${2 * rr}px`, boxSizing: 'border-box',
      borderRadius: '50%', border: `${10 * k * (1 - ring) + 2 * k}px solid ${p.hl}`, opacity: String((1 - ring) * out) });
    cssCamel(s.flash, { display: on >= 0 && fl > 0 ? 'block' : 'none', left: `${pad + cw * on + 8 * k}px`, top: `${10 * k}px`, width: `${cw - 16 * k}px`, height: `${bh - 20 * k}px`,
      borderRadius: `${18 * k}px`, background: p.hl, opacity: String(fl) });
    const nk = eBack(clamp((ctx.local - 0.45) / 0.4), 2.2);
    s.note.textContent = p.note;
    cssCamel(s.note, { display: on >= 0 && p.note && nk > 0.01 ? 'block' : 'none', left: `${cx}px`, top: `${y0 + ch0 + 4 * k}px`, fontSize: `${28 * k}px`, fontFamily: font,
      background: p.bad, padding: `${9 * k}px ${14 * k}px`, borderRadius: `${12 * k}px`, transformOrigin: '50% 0', transform: `translateX(-50%) rotate(-3deg) scale(${nk})`, opacity: String(out) });
  },
};
