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
export function letterboxText(W: number, H: number, bar: number, safe: { top: number; bottom: number }): { titleY: number; subY: number; room: number } | null {
  const k = Math.min(W, H) / 1080;
  if (H > W) {
    const top = safe.top * H, room = bar - top;
    return room < 40 * k ? null : { titleY: top + room * 0.62, subY: top + room * 0.28, room };
  }
  return bar < 24 * k ? null : { titleY: H - bar / 2, subY: bar / 2, room: bar };
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
    { key: 'size', label: '標題大小（px，短邊 1080）', type: 'number', min: 12, max: 160, step: 1, default: 44 },
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
    const at = letterboxText(W, H, full, theme.safe), side = Math.max(32 * k, theme.safe.side * W), room = W - 2 * side;
    const titleAt = p.titleAt >= 0 ? p.titleAt : p.inDur, a = eOut3(clamp((local - titleAt) / 0.5, 0, 1)) * out, rise = 8 * k * (1 - a);
    const family = `'${p.font}', serif`, g = s.meas.getContext('2d');
    const place = (e: HTMLElement, text: string, want: number, y: number) => {
      const size = g ? fitMeasuredSize(g, [text], want, family, 600, room, want * p.spacing) : want;
      e.textContent = text;
      cssCamel(e, { display: at && text ? 'block' : 'none', left: `${side.toFixed(2)}px`, width: `${room.toFixed(2)}px`, top: `${(y - size / 2 + rise).toFixed(2)}px`,
        fontFamily: family, fontWeight: '600', fontSize: `${size.toFixed(2)}px`, letterSpacing: `${p.spacing}em`, color: p.textColor, textAlign: p.align, opacity: String(a) });
    };
    // the title no taller than a third of the room it has (the bar on a wide frame, the bar below the safe line on a tall one)
    const want = at ? Math.min(p.size * k, at.room * (H > W ? 0.34 : 0.45)) : 0;
    place(s.title, String(p.title ?? ''), want, at?.titleY ?? 0);
    place(s.sub, String(p.sub ?? ''), want * 0.45, at?.subY ?? 0);
  },
};
