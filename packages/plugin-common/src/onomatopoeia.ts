// common.onomatopoeia — a comic's sound word (哈哈哈！, SNIFF, Zzz…): coloured letters with a heavy ink outline, set at a slant
// anywhere in the frame, popping in one letter after another with a springy overshoot, each letter tipped a little the other way
// from its neighbour and twitching while it stays. Promoted 2026-11-05 from the comic pilot film's fx.comicsfx. DOM text, so check
// measures it; a pure function of time (the twitch comes from a seeded generator keyed to the frame's twelfth of a second).
import { clamp, cssCamel, h, rng, type ItemType } from '@tellcut/engine';
import { graphemes } from './text.ts';

interface P { text: string; x: number; y: number; size: number; color: string; ink: string; stroke: number; depth: number; tilt: number; rise: number; spacing: number; gap: number; shake: number; font: string; weight: number; outDur: number }
interface S { box: HTMLElement; chars: HTMLElement[]; text: string }

/** letter i's pop (0 → past 1 → 1) at `local`: a spring started `gap` s after the one before */
export function letterPop(spring: (t: number) => number, i: number, gap: number, local: number): number {
  const t = local - i * gap;
  return t < 0 ? 0 : spring(t);
}

export const onomatopoeia: ItemType<P, S> = {
  type: 'common.onomatopoeia', label: '狀聲詞', category: 'text', kind: 'overlay',
  doc: '漫畫的狀聲詞（哈哈哈！、嗅嗅、SNIFF、Zzz…）：彩色填色、粗黑描邊的大字，放在畫面任何地方、斜斜的，一個字一個字彈出（每個字往左右各歪一點）、停著時輕輕抖；rise 讓字一個比一個高（往上爬的笑聲）；depth 加一層黑色立體陰影；英文換 font（Bangers）並把 spacing 調大一點；一個畫面可以放一大一小兩個（中文大字＋英文小字）；配 common.comic 漫畫頁、common.speedlines、common.pop 音效',
  params: [
    { key: 'text', label: '字', type: 'string', default: '哈哈哈！' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'size', label: '字高（畫面短邊 %）', type: 'number', min: 3, max: 40, step: 0.5, default: 16 },
    { key: 'color', label: '填色', type: 'color', default: '#ff7a1a', theme: 'palette.accent' },
    { key: 'ink', label: '描邊顏色', type: 'color', default: '#111111', theme: 'palette.ink' },
    { key: 'stroke', label: '描邊粗細（px，短邊 1080）', type: 'number', min: 0, max: 40, step: 1, default: 14 },
    { key: 'depth', label: '立體陰影（px，0＝不要）', type: 'number', min: 0, max: 40, step: 1, default: 0 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -45, max: 45, step: 1, default: -8 },
    { key: 'rise', label: '每個字往上爬（字高比例，負的往下）', type: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: 'spacing', label: '字距（字寬倍數；英文約 1.1）', type: 'number', min: 0.6, max: 1.6, step: 0.02, default: 0.96 },
    { key: 'gap', label: '逐字間隔（秒）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.07 },
    { key: 'shake', label: '抖動（px）', type: 'number', min: 0, max: 20, step: 0.5, default: 3 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'weight', label: '字重', type: 'number', min: 100, max: 900, step: 100, default: 900 },
    { key: 'outDur', label: '出場（秒，放大淡出）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.15 },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '0', top: '0', display: 'flex', alignItems: 'center', whiteSpace: 'pre', lineHeight: '1', pointerEvents: 'none' });
    return { box, chars: [], text: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur, motion } = ctx, S = Math.min(W, H), u = S / 1080, px = (p.size / 100) * S;
    if (s.text !== p.text) {
      s.box.replaceChildren();
      s.chars = graphemes(p.text).map((ch) => { const el = h('span', null, null, s.box); el.textContent = ch; cssCamel(el, { display: 'inline-block', paintOrder: 'stroke fill' }); return el; });
      s.text = p.text;
    }
    const out = p.outDur > 0 ? clamp((dur - local) / p.outDur) : 1, n = s.chars.length, spring = motion.spring({ duration: 0.38, bounce: 0.55 });
    cssCamel(s.box, { fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontWeight: String(p.weight), fontSize: `${px.toFixed(1)}px`, opacity: String(out),
      transform: `translate(${(p.x * W).toFixed(1)}px, ${(p.y * H).toFixed(1)}px) translate(-50%, -50%) rotate(${p.tilt}deg) scale(${(1 + (1 - out) * 0.15).toFixed(4)})` });
    s.chars.forEach((el, i) => {
      const k = letterPop(spring, i, p.gap, local), r = rng(Math.floor(local * 12) * 31 + i * 7 + 3);
      const jx = (r() - 0.5) * 2 * p.shake * u, jy = (r() - 0.5) * 2 * p.shake * u, lift = -(i - (n - 1) / 2) * p.rise * px;
      const d = p.depth * u;
      cssCamel(el, { color: p.color, margin: `0 ${(((p.spacing - 1) / 2) * px).toFixed(1)}px`, webkitTextStroke: `${(p.stroke * 2 * u).toFixed(1)}px ${p.ink}`,
        textShadow: d > 0 ? `${d.toFixed(1)}px ${d.toFixed(1)}px 0 ${p.ink}` : 'none', visibility: k > 0 ? 'visible' : 'hidden',
        transform: `translate(${jx.toFixed(1)}px, ${(lift + jy).toFixed(1)}px) rotate(${i % 2 ? 4 : -4}deg) scale(${Math.max(0, k).toFixed(4)})` });
    });
  },
};
