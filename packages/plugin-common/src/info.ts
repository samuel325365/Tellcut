// common.info — an information card in the project's look: a title bar and rows of icon + text (📍 address, 🕐 hours, 💰 price),
// sliding up from the bottom safe line or down from the top. Travel, food, outfit and shop videos.
import { clamp, cssCamel, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P { title: string; rows: string; position: 'bottom' | 'top'; size: number; paper: string; ink: string; accent: string; font: string }
interface Line { row: HTMLElement; icon: HTMLElement; text: HTMLElement }
interface S { card: HTMLElement; title: HTMLElement; rows: Line[]; key: string }

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";
const PIC = /^\p{Extended_Pictographic}/u;

/** "📍 台北市, 🕐 11:00–20:00" → rows; a row that does not start with an emoji gets a dot */
export function infoRows(text: string): Array<{ icon: string; text: string }> {
  return String(text).split(/\n|[,，](?=\s*\p{Extended_Pictographic})/u).map((x) => x.trim()).filter(Boolean).map((x) => {
    const g = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(x)][0]?.segment ?? '';
    return PIC.test(g) ? { icon: g, text: x.slice(g.length).trim() } : { icon: '•', text: x };
  });
}

/** the card's bottom (a share of the frame height) when at the bottom: above the room two lines of speech captions take on the safe line */
export const infoBottom = (safeBottom: number) => safeBottom + 0.13;

export const info: ItemType<P, S> = {
  type: 'common.info', label: '資訊卡', category: 'card', kind: 'overlay',
  doc: '套 theme 的資訊卡：標題列加幾列「圖示 文字」（📍地址、🕐營業時間、💰價錢、🚇交通…），從下方安全區往上滑出（或從上方）；旅遊、美食、穿搭、店家介紹',
  params: [
    { key: 'title', label: '標題（店名、地名）', type: 'string', default: '阿桃的店' },
    { key: 'rows', label: '資訊（一行一列，或用逗號接下一個 emoji）', type: 'text', default: '📍 台北市中山區南京東路, 🕐 11:00–20:00（週一公休）, 💰 一碗 150 元' },
    { key: 'position', label: '位置（bottom 在字幕區上方）', type: 'enum', options: ['bottom', 'top'], default: 'bottom' },
    { key: 'size', label: '字級（畫面短邊 %）', type: 'number', min: 2, max: 10, step: 0.1, default: 4.2 },
    { key: 'paper', label: '卡片底色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'ink', label: '字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'accent', label: '標題列顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const card = h('div', null, null, ctx.root), title = h('div', null, null, card);
    cssCamel(card, { position: 'absolute', boxSizing: 'border-box', overflow: 'hidden' });
    cssCamel(title, { whiteSpace: 'pre', fontWeight: '900', lineHeight: '1', color: '#ffffff' });
    return { card, title, rows: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, side = theme.safe.side * W, w = W - 2 * side;
    const rows = infoRows(p.rows), px = (p.size / 100) * Math.min(W, H), pad = 30 * k;
    if (s.key !== p.rows) {   // rows rebuilt only when they change
      s.key = p.rows;
      for (const r of s.rows) r.row.remove();
      s.rows = rows.map(() => {
        const row = h('div', null, null, s.card), icon = h('div', null, null, row), text = h('div', null, null, row);
        cssCamel(row, { display: 'flex', alignItems: 'center', gap: '0.5em' });
        cssCamel(icon, { flex: 'none', width: '1.3em', textAlign: 'center', fontFamily: EMOJI, lineHeight: '1' });
        cssCamel(text, { whiteSpace: 'pre', fontWeight: '700', lineHeight: '1.3' });
        return { row, icon, text };
      });
    }
    const inn = eOut3(clamp(local / 0.45)), out = 1 - prog(local, dur - 0.3, dur), bottom = p.position !== 'top';
    const slide = (1 - inn) * 60 * k * (bottom ? 1 : -1);
    cssCamel(s.card, { left: `${side}px`, width: `${w}px`, top: bottom ? '' : `${theme.safe.top * H}px`, bottom: bottom ? `${infoBottom(theme.safe.bottom) * H}px` : '',
      borderRadius: `${theme.radius * k}px`, background: p.paper, color: p.ink, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`,
      border: `${theme.stroke * 0.6 * k}px solid ${p.ink}`, boxShadow: `0 ${12 * k}px ${30 * k}px ${withAlpha(p.ink, 0.35)}`, paddingBottom: `${pad * 0.8}px`,
      display: 'flex', flexDirection: 'column', gap: `${px * 0.35}px`, opacity: String(out * clamp(inn * 2)), transform: `translateY(${slide}px)` });
    s.title.textContent = p.title;
    cssCamel(s.title, { display: p.title ? 'block' : 'none', background: p.accent, padding: `${pad * 0.7}px ${pad}px`, marginBottom: `${px * 0.1}px`,
      fontSize: `${fitPx(p.title, px * 1.25, w - 2 * pad)}px` });
    s.rows.forEach((r, i) => {
      const it = rows[i], e = eOut3(clamp((local - 0.25 - i * 0.18) / 0.3));
      r.icon.textContent = it.icon; r.text.textContent = it.text;
      cssCamel(r.row, { padding: `0 ${pad}px`, fontSize: `${fitPx(it.text, px, w - 2 * pad - px * 1.8)}px`, opacity: String(e), transform: `translateX(${(1 - e) * 24 * k}px)` });
    });
  },
};
