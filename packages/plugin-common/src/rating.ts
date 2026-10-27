// common.rating — a score card: a few rows of 項目:分數 as stars (halves too) or bars filling up, and a total in big type.
// Food, product and film reviews.
import { clamp, cssCamel, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P { title: string; rows: string; max: number; style: 'stars' | 'bar'; total: string; y: number; size: number; paper: string; ink: string; accent: string; star: string; font: string }
interface Row { row: HTMLElement; label: HTMLElement; marks: HTMLElement[]; bar: HTMLElement; fill: HTMLElement; num: HTMLElement }
interface S { card: HTMLElement; title: HTMLElement; total: HTMLElement; rows: Row[]; key: string }

/** "口味:4.5, 份量：4" → rows; a part without a number is left out */
export function ratingRows(text: string): Array<{ label: string; value: number }> {
  return String(text).split(/[,，\n|]/).map((x) => x.trim()).flatMap((x) => {
    const m = /^(.+?)\s*[:：]\s*(-?\d+(?:\.\d+)?)$/.exec(x);
    return m ? [{ label: m[1].trim(), value: Number(m[2]) }] : [];
  });
}

/** how full each of `max` stars is when `share` (0–1) of the score `value` has grown in */
export function starFills(value: number, max: number, share: number): number[] {
  const v = clamp(value * share, 0, max);
  return Array.from({ length: Math.round(max) }, (_, i) => Math.round(clamp(v - i) * 2) / 2);
}

const STAR = 'polygon(50% 2%, 61% 37%, 98% 37%, 68% 59%, 79% 95%, 50% 73%, 21% 95%, 32% 59%, 2% 37%, 39% 37%)';

export const rating: ItemType<P, S> = {
  type: 'common.rating', label: '評分卡', category: 'card', kind: 'overlay',
  doc: '評分卡：幾列「項目:分數」（星星可以半顆，或長條），分數一列一列長上去，可以加總分大字；美食、開箱、影視評測',
  params: [
    { key: 'title', label: '標題（空＝沒有）', type: 'string', default: '我的評分' },
    { key: 'rows', label: '項目:分數（逗號分隔）', type: 'text', default: '口味:4.5, 份量:4, CP值:5' },
    { key: 'max', label: '滿分', type: 'number', min: 1, max: 10, step: 1, default: 5 },
    { key: 'style', label: '樣式', type: 'enum', options: ['stars', 'bar'], default: 'stars' },
    { key: 'total', label: '總分大字（空＝沒有；例 9/10）', type: 'string', default: '4.5' },
    { key: 'y', label: '卡片上緣（畫面高比例；-1＝安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '字級（畫面短邊 %）', type: 'number', min: 2, max: 12, step: 0.1, default: 5 },
    { key: 'paper', label: '卡片底色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'ink', label: '字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'accent', label: '標題與總分的顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'star', label: '星星與長條的顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const card = h('div', null, null, ctx.root), head = h('div', null, null, card), title = h('div', null, null, head), total = h('div', null, null, head);
    cssCamel(card, { position: 'absolute', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' });
    cssCamel(head, { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' });
    for (const el of [title, total]) cssCamel(el, { whiteSpace: 'pre', fontWeight: '900', lineHeight: '1' });
    return { card, title, total, rows: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, side = theme.safe.side * W, w = W - 2 * side;
    const rows = ratingRows(p.rows), px = (p.size / 100) * Math.min(W, H), n = Math.max(1, Math.round(p.max)), key = JSON.stringify([p.rows, n, p.style]);
    if (s.key !== key) {   // rows rebuilt only when they change
      s.key = key;
      for (const r of s.rows) r.row.remove();
      s.rows = rows.map(() => {
        const row = h('div', null, null, s.card), label = h('div', null, null, row), marks = Array.from({ length: n }, () => h('div', null, null, row));
        const bar = h('div', null, null, row), fill = h('div', null, null, bar), num = h('div', null, null, row);
        cssCamel(row, { display: 'flex', alignItems: 'center', gap: '0.3em' });
        cssCamel(label, { whiteSpace: 'pre', fontWeight: '700', flex: 'none', width: '4.2em', lineHeight: '1.2' });
        cssCamel(bar, { flex: '1', height: '0.55em', borderRadius: '0.3em', overflow: 'hidden', position: 'relative' });
        cssCamel(fill, { position: 'absolute', left: '0', top: '0', bottom: '0' });
        cssCamel(num, { whiteSpace: 'pre', fontWeight: '900', flex: 'none', minWidth: '1.8em', textAlign: 'right', lineHeight: '1' });
        for (const m of marks) cssCamel(m, { flex: 'none', width: '1em', height: '1em', clipPath: STAR });
        return { row, label, marks, bar, fill, num };
      });
    }
    const top = p.y >= 0 ? p.y * H : theme.safe.top * H, inn = eOut3(clamp(local / 0.35)), out = 1 - prog(local, dur - 0.3, dur);
    cssCamel(s.card, { left: `${side}px`, top: `${top}px`, width: `${w}px`, padding: `${28 * k}px ${34 * k}px`, gap: `${px * 0.5}px`, borderRadius: `${theme.radius * k}px`,
      background: p.paper, color: p.ink, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`, border: `${theme.stroke * 0.6 * k}px solid ${p.ink}`,
      boxShadow: `${10 * k}px ${10 * k}px 0 ${withAlpha(p.ink, 0.9)}`, opacity: String(out), transform: `translateY(${(1 - inn) * 40 * k}px)` });
    s.title.textContent = p.title;
    cssCamel(s.title, { display: p.title ? 'block' : 'none', fontSize: `${fitPx(p.title, px * 1.1, w * 0.6)}px`, color: p.accent });
    // the total pops in after the rows have grown
    const tIn = eOut3(clamp((local - 0.35 - rows.length * 0.35) / 0.35));
    s.total.textContent = p.total;
    cssCamel(s.total, { display: p.total ? 'block' : 'none', fontSize: `${px * 1.8}px`, color: p.accent, opacity: String(tIn), transform: `scale(${0.6 + 0.4 * tIn})`, transformOrigin: '100% 70%' });
    s.rows.forEach((r, i) => {
      const it = rows[i], share = eOut3(clamp((local - 0.35 - i * 0.35) / 0.6)), fills = starFills(it.value, n, share);
      r.label.textContent = it.label;
      r.num.textContent = (it.value * share).toFixed(Number.isInteger(it.value) ? 0 : 1);
      const stars = p.style === 'stars';
      r.marks.forEach((m, j) => cssCamel(m, { display: stars ? 'block' : 'none',
        background: `linear-gradient(90deg, ${p.star} ${fills[j] * 100}%, ${withAlpha(p.ink, 0.15)} ${fills[j] * 100}%)` }));
      cssCamel(r.bar, { display: stars ? 'none' : 'block', background: withAlpha(p.ink, 0.12) });
      cssCamel(r.fill, { width: `${clamp((it.value * share) / n) * 100}%`, background: p.star, borderRight: `${3 * k}px solid ${p.ink}` });
      cssCamel(r.row, { opacity: String(clamp((local - 0.3 - i * 0.35) / 0.2)) });
    });
  },
};
