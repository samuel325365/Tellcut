// common.dotmatrix — any line (Chinese too) lettered in dots: the glyphs are rasterised small and redrawn dot by dot, on a dark LED
// sign (lit dots glowing over a grid of dark ones) or as printed ink. Still, a scrolling marquee, or typed out one character at a time.
// From the food-receipt short's thermal-printer lettering. A transparent copy of the text sits over the dots, so check can measure it.
import { clamp, cssCamel, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { canvasAt } from './inkline.ts';
import { dotFont, dots, drawDots, drawGrid, loadDots } from './dots.ts';
import { isClear, withAlpha } from './color.ts';

interface P {
  text: string; mode: 'still' | 'marquee' | 'type'; look: 'led' | 'print'; cells: number; pitch: number; x: number; y: number; w: number;
  speed: number; typeDur: number; font: string; color: string; panel: string; frame: string;
}
interface S { cv: HTMLCanvasElement; ghost: HTMLElement; want: [string, string] }

/** how many characters of `n` are typed at `local` (all of them by `dur`) */
export const typedChars = (n: number, local: number, dur: number) => (dur <= 0 ? n : Math.max(0, Math.min(n, Math.floor((local / dur) * n + 1e-9) + (local > 0 ? 1 : 0))));
/** the marquee's offset in px at `local`: the text enters from the right edge of a `boxW` window and wraps once it has left on the left */
export const marqueeX = (local: number, speed: number, boxW: number, textW: number) => boxW - ((local * speed) % (boxW + textW));

export const dotmatrix: ItemType<P, S> = {
  type: 'common.dotmatrix', label: '點陣字', category: 'text', kind: 'overlay',
  doc: '點陣字：任何字（中文也行）縮小點陣化再一點一點畫回來；look led 是黑底跑馬燈招牌（亮點發光、暗點格子），print 是熱感應紙上的墨點；mode still 靜止、marquee 從右往左捲動、type 逐字打出來；招牌、跑馬燈、LED 看板、收據、叫號機',
  params: [
    { key: 'text', label: '文字', type: 'string', default: '歡迎光臨・今日營業' },
    { key: 'mode', label: '動態（still 靜止、marquee 跑馬燈、type 逐字打出）', type: 'enum', options: ['still', 'marquee', 'type'], default: 'marquee' },
    { key: 'look', label: '樣子（led 黑底發光招牌、print 墨點）', type: 'enum', options: ['led', 'print'], default: 'led' },
    { key: 'cells', label: '字高（點數；越大越細緻）', type: 'number', min: 7, max: 40, step: 1, default: 16 },
    { key: 'pitch', label: '點距（以 1080 短邊計的 px）', type: 'number', min: 1, max: 20, step: 0.1, default: 6.5 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.3 },
    { key: 'w', label: '看板寬（畫面寬比例；still／type 依字寬，最多這麼寬）', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.76 },
    { key: 'speed', label: '跑馬燈速度（以 1080 短邊計的 px／秒）', type: 'number', min: 20, max: 2000, step: 10, default: 420 },
    { key: 'typeDur', label: '逐字打完的時間 (s)', type: 'number', min: 0.1, max: 10, step: 0.1, default: 1.2 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'color', label: '點的顏色', type: 'color', default: '#ff4a2e' },
    { key: 'panel', label: '看板底色（led）', type: 'color', default: '#0b0807' },
    { key: 'frame', label: '看板外框（led；透明＝沒有）', type: 'color', default: '#3b1712' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), ghost = h('div', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute' });
    cssCamel(ghost, { position: 'absolute', color: 'transparent', whiteSpace: 'pre', lineHeight: '1', textAlign: 'center', overflow: 'hidden' });
    return { cv, ghost, want: [ctx.params.font, String(ctx.params.text ?? '')] as [string, string] };
  },
  ready: (s) => loadDots(s.want[0], s.want[1]),
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, pitch = p.pitch * k, led = p.look === 'led';
    const all = String(p.text ?? ''), chars = [...all];
    const shown = p.mode === 'type' ? chars.slice(0, typedChars(chars.length, local, p.typeDur)).join('') : all;
    const cells = Math.round(p.cells), full = dots(all, cells, 700, p.font), D = shown === all ? full : dots(shown, cells, 700, p.font);
    const pad = led ? Math.round(cells * 0.35) : 0, maxW = Math.min(p.w, 1 - 2 * theme.safe.side) * W;
    // a still sign shrinks its dots to fit; a marquee keeps them and scrolls through a window of its width
    const fit = p.mode === 'marquee' ? pitch : Math.min(pitch, maxW / (full.w + 2 * pad)), cols = p.mode === 'marquee' ? Math.floor(maxW / fit) - 2 * pad : full.w;
    const bw = (cols + 2 * pad) * fit, bh = (full.h + 2 * pad) * fit, bx = p.x * W - bw / 2, by = p.y * H - bh / 2, m = led ? 14 * k : 0;
    const out = 1 - prog(local, dur - 0.2, dur), inn = clamp(local / 0.12);
    const g = canvasAt(s.cv, bw + 2 * m, bh + 2 * m);
    cssCamel(s.cv, { left: `${bx - m}px`, top: `${by - m}px`, width: `${bw + 2 * m}px`, height: `${bh + 2 * m}px`, opacity: String(inn * out) });
    if (led) {
      g.fillStyle = p.panel; g.beginPath(); g.roundRect(m, m, bw, bh, 12 * k); g.fill();
      if (!isClear(p.frame)) { g.strokeStyle = p.frame; g.lineWidth = 3 * k; g.stroke(); }
      drawGrid(g, m + pad * fit, m + pad * fit, cols, full.h, fit, fit * 0.62, withAlpha(p.color, 0.1), true);
    }
    g.save();
    g.beginPath(); g.rect(m + pad * fit, m, cols * fit, bh); g.clip();
    const ox = p.mode === 'marquee' ? Math.round(marqueeX(local, (p.speed * k) / fit, cols, full.w)) : 0;
    if (led) { g.shadowColor = p.color; g.shadowBlur = fit * 1.6; }
    drawDots(g, D, m + (pad + ox) * fit, m + pad * fit, fit, fit * (led ? 0.72 : 0.82), p.color, led);
    g.restore();
    // the words for check: transparent, over the dots (a marquee's over its window)
    const fs = Math.min(cells * fit, (cols * fit) / Math.max(1, textEm(shown || ' ')));
    s.ghost.textContent = shown;
    cssCamel(s.ghost, { left: `${bx + pad * fit}px`, top: `${by + pad * fit}px`, width: `${cols * fit}px`, height: `${full.h * fit}px`, fontSize: `${fs}px`, fontFamily: dotFont(1, 700, p.font).replace(/^700 1px /, ''),
      fontWeight: '700', opacity: String(inn * out) });
  },
};
