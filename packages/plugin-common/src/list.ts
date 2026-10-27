// common.list — a card with a title and a few lines that come in one by one: a checklist (✓), pros and cons (+ / −) or numbered
// steps. Reviews, tutorials, "3 things to know", myth busting.
// look "stack" (from the uk-beat short's fx.stack): no card — big outlined words slammed in down the left, one per beat, each with a
// numbered chip; the newest is in the highlight colour. Keeps the names of a photo burst on screen.
import { clamp, cssCamel, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

type Style = 'check' | 'pros' | 'number';
interface P { title: string; items: string; style: Style; y: number; size: number; stagger: number; paper: string; ink: string; accent: string; good: string; font: string; look: 'card' | 'stack'; hl: string; mono: string }
interface S { card: HTMLElement; title: HTMLElement; rows: Array<{ row: HTMLElement; mark: HTMLElement; text: HTMLElement }>; key: string }
export interface ListItem { mark: string; text: string; good: boolean }

/** the items: one a line (or split by |: a comma may belong to the sentence); with `pros` a line starting with - or − is a con */
export function listItems(text: string, style: Style): ListItem[] {
  const lines = String(text).split(/\n|\|/).map((x) => x.trim()).filter(Boolean);
  return lines.map((l, i) => {
    const con = style === 'pros' && /^[-−]/.test(l), t = style === 'pros' ? l.replace(/^[-−+＋]\s*/, '') : l;
    return { mark: style === 'number' ? String(i + 1) : style === 'pros' ? (con ? '−' : '+') : '✓', text: t, good: !con };
  });
}

/** how many of `n` items are in at `local`: the first after `lead`, then one every `stagger` seconds */
export const shownItems = (n: number, local: number, lead: number, stagger: number) => Math.max(0, Math.min(n, Math.floor((local - lead) / stagger) + 1));

export const list: ItemType<P, S> = {
  type: 'common.list', label: '清單卡', category: 'card', kind: 'overlay',
  doc: '一張卡片：標題加幾行項目，一行一行出現；check（✓ 打勾）、pros（+ 優點／− 缺點，項目前加 - 算缺點）、number（1. 2. 3.）；評測、教學、三個重點、迷思破解；look: stack 沒有卡片，大字一拍一行砸進來、編號色塊、最新一行螢光色（照片連發時留下每張的名字）',
  params: [
    { key: 'title', label: '標題（空＝沒有）', type: 'string', default: '三個重點' },
    { key: 'items', label: '項目（一行一個，或用 | 分開）', type: 'text', default: '先過篩\n小火慢煎\n翻一次就好' },
    { key: 'style', label: '樣式', type: 'enum', options: ['check', 'pros', 'number'], default: 'check' },
    { key: 'y', label: '卡片上緣（畫面高比例；-1＝安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '項目字級（畫面短邊 %）', type: 'number', min: 2, max: 12, step: 0.1, default: 5.2 },
    { key: 'stagger', label: '每一行間隔 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.45 },
    { key: 'paper', label: '卡片底色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'ink', label: '字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'accent', label: '標題列與缺點的顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'good', label: '打勾與優點的顏色', type: 'color', default: '#2ec4b6', theme: 'palette.accent2' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'look', label: '樣子（card 卡片、stack 沒有卡片的大字逐行砸入）', type: 'enum', options: ['card', 'stack'], default: 'card' },
    { key: 'hl', label: '最新一行的顏色（stack）', type: 'color', default: '#ffd60a', theme: 'palette.hl' },
    { key: 'mono', label: '編號字型（stack）', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true },
  ],
  build(ctx) {
    const card = h('div', null, null, ctx.root), title = h('div', null, null, card);
    cssCamel(card, { position: 'absolute', boxSizing: 'border-box', overflow: 'hidden' });
    cssCamel(title, { whiteSpace: 'pre', fontWeight: '900', lineHeight: '1' });
    return { card, title, rows: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, side = theme.safe.side * W, w = W - 2 * side;
    const items = listItems(p.items, p.style), px = (p.size / 100) * Math.min(W, H), font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    const key = JSON.stringify([p.items, p.style]);
    if (s.key !== key) {   // rows rebuilt only when the list changes
      s.key = key;
      for (const r of s.rows) r.row.remove();
      s.rows = items.map(() => {
        const row = h('div', null, null, s.card), mark = h('div', null, null, row), text = h('div', null, null, row);
        cssCamel(row, { display: 'flex', alignItems: 'center', gap: '0.45em' });
        cssCamel(mark, { flex: 'none', width: '1.35em', height: '1.35em', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', lineHeight: '1' });
        cssCamel(text, { whiteSpace: 'pre', fontWeight: '700', lineHeight: '1.2' });
        return { row, mark, text };
      });
    }
    if (p.look === 'stack') return drawStack(ctx, s, items);
    const top = p.y >= 0 ? p.y * H : theme.safe.top * H, inn = eOut3(clamp(local / 0.35)), out = 1 - prog(local, dur - 0.3, dur);
    cssCamel(s.card, { left: `${side}px`, top: `${top}px`, width: `${w}px`, padding: `${28 * k}px ${34 * k}px ${34 * k}px`, borderRadius: `${theme.radius * k}px`,
      background: p.paper, color: p.ink, fontFamily: font, border: `${theme.stroke * 0.6 * k}px solid ${p.ink}`, boxShadow: `${10 * k}px ${10 * k}px 0 ${withAlpha(p.ink, 0.9)}`,
      opacity: String(out), transform: `translateY(${(1 - inn) * 40 * k}px)`, display: 'flex', flexDirection: 'column', gap: `${px * 0.45}px`, overflow: 'hidden' });
    s.title.textContent = p.title;
    cssCamel(s.title, { display: p.title ? 'block' : 'none', fontSize: `${fitPx(p.title, px * 1.15, w - 70 * k)}px`, color: p.accent, paddingBottom: `${px * 0.15}px`,
      borderBottom: `${4 * k}px solid ${withAlpha(p.accent, 0.35)}` });
    const shown = shownItems(items.length, local, 0.35, p.stagger);
    s.rows.forEach((r, i) => {
      const it = items[i], at = 0.35 + i * p.stagger, e = eOut3(clamp((local - at) / 0.3)), on = i < shown;
      r.mark.textContent = it.mark; r.text.textContent = it.text;
      const tint = it.good ? p.good : p.accent;
      cssCamel(r.row, { fontSize: `${fitPx(it.text, px, w - 70 * k - px * 1.8)}px`, opacity: on ? String(e) : '0', transform: `translateX(${(1 - e) * -30 * k}px)`, transformOrigin: '', gap: '0.45em' });
      cssCamel(r.mark, { background: tint, color: '#ffffff', fontSize: p.style === 'number' ? '0.75em' : '0.85em', width: '1.35em', height: '1.35em', borderRadius: '50%', padding: '0', fontFamily: '', fontWeight: '900' });
      cssCamel(r.text, { color: '', textShadow: 'none', fontWeight: '700', letterSpacing: '' });
    });
  },
};

/** look "stack": the card turned invisible, its rows slammed in one every `stagger` seconds from the item start, big and outlined */
function drawStack(ctx: Parameters<typeof list.draw>[0], s: S, items: ListItem[]) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * Math.min(W, H) * 1.8, left = theme.safe.side * W + 20 * k;
  const o = 4 * k, outline = [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, o], [o, -o], [-o, -o]].map(([x, y]) => `${x}px ${y}px 0 ${p.ink}`).join(',');
  cssCamel(s.card, { left: `${left}px`, top: `${p.y >= 0 ? p.y * H : 0.43 * H}px`, width: `${W - 2 * left}px`, padding: '0', background: 'none', border: 'none', boxShadow: 'none', borderRadius: '0',
    overflow: 'visible', transform: 'none', opacity: String(1 - prog(local, dur - 0.15, dur)), display: 'flex', flexDirection: 'column', gap: `${px * 0.18}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif` });
  cssCamel(s.title, { display: 'none' });
  s.rows.forEach((r, i) => {
    const t0 = i * p.stagger, q = eOut3(prog(local, t0, t0 + 0.1)), on = local >= t0 - 1e-6, latest = on && (i === s.rows.length - 1 || local < (i + 1) * p.stagger);
    r.mark.textContent = String(i + 1).padStart(2, '0'); r.text.textContent = items[i].text;
    cssCamel(r.row, { fontSize: `${fitPx(items[i].text, px, W - 2 * left - px * 1.2)}px`, opacity: on ? String(clamp((local - t0) / 0.04)) : '0', transform: `scale(${(1.5 - 0.5 * q).toFixed(4)})`, transformOrigin: '0 50%', gap: `${18 * k}px` });
    cssCamel(r.mark, { width: 'auto', height: 'auto', borderRadius: '0', padding: `${4 * k}px ${10 * k}px`, background: p.accent, color: p.hl, fontSize: '0.42em', fontFamily: `'${p.mono}', 'JetBrains Mono', monospace`, fontWeight: '700' });
    cssCamel(r.text, { color: latest ? p.hl : p.paper, textShadow: `${outline}, 0 ${8 * k}px ${22 * k}px rgba(0,0,0,.45)`, fontWeight: '900', letterSpacing: `${3 * k}px` });
  });
}
