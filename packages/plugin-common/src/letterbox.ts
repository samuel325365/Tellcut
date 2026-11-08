// common.letterbox — cinema bars that slide in from the top and bottom edges, leaving a picture of a chosen width-to-height (2.39
// on a wide frame, square on a tall one by default), with a spaced-out title (and a smaller line) set in the bars: on a tall frame
// both in the top bar below the platform's top band, on a wide one the title in the bottom bar and the small line in the top one.
// After outAt the bars go back. Derived from common.film's letterbox (which stands still and has no words). DOM text, so check
// measures it. A pure function of time.
import { abs, clamp, cssCamel, eIO3, eOut3, type ItemType } from '@tellcut/engine';
import { fitMeasuredSize } from './headline.ts';

interface P { ratio: number; color: string; inDur: number; outAt: number; outDur: number; title: string; sub: string; titleAt: number; font: string; size: number; textColor: string; spacing: number; align: 'left' | 'center' | 'right' }
interface S { top: HTMLElement; bottom: HTMLElement; title: HTMLElement; sub: HTMLElement; meas: HTMLCanvasElement }

/** each bar's depth in px: what is left of a W × H frame once the picture in the middle is `ratio` (width ÷ height; 0 = 2.39 on a
 *  wide frame, 1 on a tall one); 0 when the frame is already that wide */
export function letterboxBar(ratio: number, W: number, H: number): number {
  const r = ratio > 0 ? ratio : W >= H ? 2.39 : 1;
  return Math.max(0, (H - W / r) / 2);
}

/** where the words go (their centre lines, px), or null when the bars leave no room for them: a tall frame sets both in the top bar
 *  below the safe line (the title lower, nearer the picture), a wide one the title in the middle of the bottom bar and the small
 *  line in the middle of the top one */
export function letterboxText(W: number, H: number, bar: number, safe: { top: number; bottom: number }, sub = true): { titleY: number; subY: number; room: number; titleMax: number; subMax: number } | null {
  const k = Math.min(W, H) / 1080;
  if (H > W) {
    // alone, the title takes the middle 0.6 of the room; with the small line above it, 0.44 low down and the line 0.2 high up
    const top = safe.top * H, room = bar - top;
    if (room < 40 * k) return null;
    return sub ? { titleY: top + room * 0.64, subY: top + room * 0.22, room, titleMax: room * 0.44, subMax: room * 0.2 } : { titleY: top + room * 0.5, subY: top, room, titleMax: room * 0.6, subMax: 0 };
  }
  return bar < 24 * k ? null : { titleY: H - bar / 2, subY: bar / 2, room: bar, titleMax: bar * 0.45, subMax: bar * 0.45 };
}

/** how much of a word set in a bar (its box from y0 to y1, px) may show while the bar is `bar` deep: all of it while the bar still
 *  reaches a quarter of the box's height past it, fading out as the bar's edge comes in to the box and gone when it gets there, so a
 *  word never lies over the picture (at rest every word has that margin: see letterboxText's places) */
export function inBar(top: boolean, y0: number, y1: number, bar: number, H: number): number {
  const fade = Math.max(1, (y1 - y0) * 0.25), edge = top ? bar - y1 : y0 - (H - bar);
  return clamp(edge / fade, 0, 1);
}

export const letterbox: ItemType<P, S> = {
  type: 'common.letterbox', label: '寬銀幕', category: 'frame', kind: 'overlay',
  doc: '電影黑邊從上下兩邊滑進來，中間留下 ratio 寬高比的畫面（0＝自動：橫式 2.39、直式正方形），黑邊上有字距拉開的 title 標題和一行小的 sub：直式片兩行都在上方黑邊、平台上方安全區以下（黑邊不夠深就不放字），橫式片標題在下方黑邊中間、小字在上方黑邊；titleAt 字淡入的秒（-1＝黑邊到位時）；outAt 之後黑邊收回去；和 common.film 的 letterbox 參數不同：會動、帶字；電影感開場、章節標題',
  params: [
    { key: 'ratio', label: '中間畫面的寬高比（0＝自動：橫式 2.39、直式 1）', type: 'number', min: 0, max: 4, step: 0.01, default: 0 },
    { key: 'color', label: '黑邊顏色', type: 'color', default: '#000000' },
    { key: 'inDur', label: '黑邊滑進來的長度（秒）', type: 'number', min: 0.05, max: 5, step: 0.05, default: 0.8 },
    { key: 'outAt', label: '黑邊收回的秒（-1＝不收）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'outDur', label: '收回的長度（秒）', type: 'number', min: 0.05, max: 5, step: 0.05, default: 0.8 },
    { key: 'title', label: '標題（空＝不放字）', type: 'string', default: 'CHAPTER ONE' },
    { key: 'sub', label: '小字', type: 'string', default: '' },
    { key: 'titleAt', label: '字出現的秒（-1＝黑邊到位時）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'size', label: '標題大小（px，短邊 1080；最大到黑邊放得下的大小）', type: 'number', min: 12, max: 160, step: 1, default: 44 },
    { key: 'textColor', label: '字色', type: 'color', default: '#f3ecdc' },
    { key: 'spacing', label: '字距（em）', type: 'number', min: 0, max: 1.5, step: 0.05, default: 0.3 },
    { key: 'align', label: '對齊', type: 'enum', options: ['left', 'center', 'right'], default: 'center' },
  ],
  build(ctx) {
    const mk = (tag: string) => { const e = abs(ctx.root); e.dataset[tag] = ''; return e; };
    const s: S = { top: mk('bar'), bottom: mk('bar'), title: mk('title'), sub: mk('sub'), meas: document.createElement('canvas') };
    for (const e of [s.title, s.sub]) cssCamel(e, { whiteSpace: 'nowrap', lineHeight: '1', boxSizing: 'border-box' });
    return s;
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, theme } = ctx, k = Math.min(W, H) / 1080, full = letterboxBar(p.ratio, W, H);
    const out = p.outAt >= 0 && local > p.outAt ? 1 - eIO3(clamp((local - p.outAt) / Math.max(0.01, p.outDur), 0, 1)) : 1;
    const bar = full * eOut3(clamp(local / Math.max(0.01, p.inDur), 0, 1)) * out;
    cssCamel(s.top, { left: '0', top: '0', width: '100%', height: `${bar.toFixed(2)}px`, background: p.color });
    cssCamel(s.bottom, { left: '0', top: `${(H - bar).toFixed(2)}px`, width: '100%', height: `${bar.toFixed(2)}px`, background: p.color });
    const subText = String(p.sub ?? ''), at = letterboxText(W, H, full, theme.safe, !!subText.trim()), side = Math.max(32 * k, theme.safe.side * W), room = W - 2 * side;
    const titleAt = p.titleAt >= 0 ? p.titleAt : p.inDur, a = eOut3(clamp((local - titleAt) / 0.5, 0, 1)), rise = 8 * k * (1 - a);
    const family = `'${p.font}', serif`, g = s.meas.getContext('2d');
    // each word fades as the bar it lies in pulls back past it (in or out), never lying over the picture. 700: the weight fonts.css
    // loads (a 600 was drawn with the 700 face anyway). CSS letter-spacing also follows the last letter, so a centred line would sit
    // half a spacing left of the middle and a right-aligned one a whole spacing short of the edge: the box moves right by as much.
    const lean = p.align === 'center' ? 0.5 : p.align === 'right' ? 1 : 0;
    const place = (e: HTMLElement, text: string, want: number, y: number, top: boolean) => {
      const size = g ? fitMeasuredSize(g, [text], want, family, 700, room, want * p.spacing) : want, y0 = y - size / 2 + rise, x0 = side + lean * p.spacing * size;
      e.textContent = text;
      cssCamel(e, { display: at && text ? 'block' : 'none', left: `${x0.toFixed(2)}px`, width: `${room.toFixed(2)}px`, top: `${y0.toFixed(2)}px`,
        fontFamily: family, fontWeight: '700', fontSize: `${size.toFixed(2)}px`, letterSpacing: `${p.spacing}em`, color: p.textColor, textAlign: p.align,
        opacity: String(a * inBar(top, y0, y0 + size, bar, H)) });
    };
    // the title as big as asked within the room the bar gives it; the small line 0.45 of it, but not below 20 px (short side 1080)
    // while the room allows
    const want = at ? Math.min(p.size * k, at.titleMax) : 0, subWant = at ? Math.min(at.subMax, Math.max(want * 0.45, 20 * k)) : 0;
    place(s.title, String(p.title ?? ''), want, at?.titleY ?? 0, H > W);
    place(s.sub, subText, subWant, at?.subY ?? 0, true);
  },
};
