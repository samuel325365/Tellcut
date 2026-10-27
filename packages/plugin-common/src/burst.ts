// common.burst — a jagged explosion shape with a word in it: the sticker version of a slam. common.speedlines goes well behind it.
// mode 'blast' is the whole-frame version (from the baking-sin short's fx.sinBoom): a white flash, a turning fan of rays, a pulsing
// red vignette and a giant word with a double outline, bouncing.
// mode 'rays' (the food-deep short's fx.crunch, the bite): thin rays shooting out from the point (x, y) and the word (咔滋！) popping
// down from big at (tx, ty), tilted, in the highlight colour with a hard ink outline.
import { clamp, cssCamel, eBack, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { layoutMarkup } from './markup.ts';
import { polygonSvg, setPolygon, spikePoints } from './shapes.ts';
import { runBox, setRuns, type RunBox } from './runs.ts';
import { withAlpha } from './color.ts';

interface P { tx: number; ty: number; mode: 'sticker' | 'blast' | 'rays'; text: string; points: number; x: number; y: number; size: number; fill: string; ink: string; textColor: string; hl: string; tilt: number; font: string; seed: number; outDur: number }
interface S { box: HTMLElement; svg: SVGSVGElement; poly: SVGPolygonElement; text: RunBox; flash: HTMLElement; rays: HTMLElement; vig: HTMLElement; back: RunBox; lines: SVGSVGElement }
const NS = 'http://www.w3.org/2000/svg';

/** ray i of n (mode rays) at `local`: its angle and inner / outer radius as shares of the burst's radius */
export function rayAt(i: number, n: number, local: number) {
  const g = eOut3(clamp(local / 0.3)), k = 0.8 + (i % 3) * 0.25, r0 = 0.24 + 0.8 * g * k;
  return { a: (i / n) * Math.PI * 2 + 0.2, r0, r1: r0 + (0.36 * (1 - g) + 0.12) * k, alpha: clamp(1 - local / 0.55) };
}

export const burst: ItemType<P, S> = {
  type: 'common.burst', label: '爆炸字卡', category: 'text', kind: 'overlay',
  doc: '鋸齒爆炸形裡一個大字（彈入、微傾）；「出發！」「超好吃」這種貼紙感的爆字；【詞】變強調色；背後可加 common.speedlines；mode: blast 是整個畫面爆開：白閃、旋轉的放射光、脈動紅色暗角、雙層描邊的巨大字（爆表、破紀錄、大揭曉）；rays 是咬下去的瞬間：從 (x,y) 射出一圈細放射線、大字（咔滋！）在 (tx,ty) 從大縮回彈出、斜斜的（咬、敲、碎、爆汁）',
  params: [
    { key: 'mode', label: '樣式（sticker 鋸齒貼紙、blast 整個畫面爆開、rays 放射線＋爆字）', type: 'enum', options: ['sticker', 'blast', 'rays'], default: 'sticker' },
    { key: 'text', label: '文字（【強調】）', type: 'text', default: '出發！' },
    { key: 'points', label: '鋸齒數', type: 'number', min: 6, max: 30, step: 1, default: 14 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'size', label: '直徑（畫面短邊 %）', type: 'number', min: 10, max: 120, step: 1, default: 62 },
    { key: 'fill', label: '填色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'ink', label: '外框顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'textColor', label: '字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'hl', label: '強調顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -30, max: 30, step: 0.5, default: -6 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'outDur', label: '出場時間 (s)（縮小並淡出）', type: 'number', min: 0, max: 2, step: 0.05, default: 0.2 },
    { key: 'seed', label: '鋸齒亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 4 },
    { key: 'tx', label: '字的中心 x（rays；畫面寬比例，-1＝放射中心右上方）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'ty', label: '字的中心 y（rays；畫面高比例，-1＝放射中心上方）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root), { svg, poly } = polygonSvg();
    box.appendChild(svg);
    cssCamel(box, { position: 'absolute' });
    const t = h('div', null, null, box);
    cssCamel(t, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', whiteSpace: 'pre', lineHeight: '1.1', fontWeight: '900' });
    const flash = h('div', null, null, ctx.root), rays = h('div', null, null, ctx.root), vig = h('div', null, null, ctx.root), bk = h('div', null, null, ctx.root);
    for (const el of [flash, vig]) cssCamel(el, { position: 'absolute', inset: '0', display: 'none' });
    cssCamel(rays, { position: 'absolute', borderRadius: '50%', display: 'none' });
    cssCamel(bk, { position: 'absolute', textAlign: 'center', whiteSpace: 'pre', lineHeight: '1.1', fontWeight: '900', display: 'none' });
    const lines = document.createElementNS(NS, 'svg') as SVGSVGElement;
    ctx.root.appendChild(lines);
    cssCamel(lines as unknown as HTMLElement, { position: 'absolute', left: '0', top: '0', overflow: 'visible', display: 'none' });
    for (let i = 0; i < 14; i++) { const l = document.createElementNS(NS, 'line'); l.setAttribute('stroke-linecap', 'round'); lines.appendChild(l); }
    ctx.root.appendChild(box);   // the word stays on top of the blast layers
    return { box, svg, poly, text: runBox(t), flash, rays, vig, back: runBox(bk), lines };
  },
  draw(ctx, s) {
    cssCamel(s.lines as unknown as HTMLElement, { display: ctx.params.mode === 'rays' ? 'block' : 'none' });
    if (ctx.params.mode === 'blast') { drawBlast(ctx, s); return; }
    if (ctx.params.mode === 'rays') { drawRays(ctx, s); return; }
    if (s.flash.style.display !== 'none') { for (const el of [s.flash, s.rays, s.vig, s.back.el.parentElement!]) cssCamel(el, { display: 'none' }); cssCamel(s.svg as unknown as HTMLElement, { display: '' }); cssCamel(s.text.el.parentElement!, { position: 'absolute', inset: '0', webkitTextStroke: '0' }); }
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, size = (p.size / 100) * Math.min(W, H), r = size / 2, stroke = theme.stroke * k;
    cssCamel(s.text.el.parentElement!, { position: 'absolute', inset: '0', textShadow: 'none' });   // back from rays
    setPolygon(s.svg, s.poly, size, spikePoints(p.points, r - stroke, (r - stroke) * 0.68, 0, 1, p.seed), p.fill, p.ink, stroke);
    const px = size * 0.2, fit = layoutMarkup(p.text, (size * 0.62) / px, 3);
    setRuns(s.text, fit.lines, p.hl);
    const pop = eBack(prog(ctx.local, 0, 0.28), 2.4), out = p.outDur > 0 ? 1 - prog(ctx.local, ctx.dur - p.outDur, ctx.dur) : 1;
    cssCamel(s.text.el.parentElement!, { color: p.textColor, fontSize: `${px * fit.scale}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif` });
    cssCamel(s.box, { left: `${p.x * W - r}px`, top: `${p.y * H - r}px`, width: `${size}px`, height: `${size}px`, opacity: String(Math.min(1, pop * 4) * out), transform: `rotate(${p.tilt}deg) scale(${pop * (0.7 + 0.3 * out)})` });
  },
};

/** blast: the flash, the fan of rays from the centre (18 of them, turning), the pulsing vignette, the word twice (a thick outer outline under it) */
function drawBlast(ctx: Parameters<typeof burst.draw>[0], s: S) {
  const p = ctx.params, { W, H, local: t, dur } = ctx, S = Math.min(W, H), cx = p.x * W, cy = p.y * H, out = prog(t, dur - 0.2, dur);
  cssCamel(s.svg as unknown as HTMLElement, { display: 'none' });
  cssCamel(s.flash, { display: 'block', background: '#fff8e6', opacity: String(0.85 * (1 - prog(t, 0, 0.18))) });
  const R = 1.5 * Math.max(W, H) * eOut3(prog(t, 0, 0.5)), rot = (t * 0.6 * 180) / Math.PI;
  cssCamel(s.rays, { display: R > 0 ? 'block' : 'none', left: `${cx - R}px`, top: `${cy - R}px`, width: `${2 * R}px`, height: `${2 * R}px`,
    background: `repeating-conic-gradient(from ${rot - 4}deg, ${p.fill} 0deg 8deg, transparent 8deg 20deg, ${p.hl} 20deg 28deg, transparent 28deg 40deg)`,
    opacity: String((1 - out) * (0.55 + 0.25 * Math.sin(t * 12))) });
  cssCamel(s.vig, { display: 'block', background: `radial-gradient(circle at 50% 50%, transparent ${0.3 * Math.max(W, H)}px, ${withAlpha(p.hl, 0.85)} ${0.75 * Math.max(W, H)}px)`,
    opacity: String(clamp((0.35 + 0.25 * Math.sin(t * 10)) * (1 - out) * 1.6)) });
  const px = (p.size / 100) * S * 0.4, fit = layoutMarkup(p.text, (W * 0.9) / px, 2), q = prog(t, 0.04, 0.3);
  setRuns(s.text, fit.lines, p.hl);
  setRuns(s.back, fit.lines, p.fill);
  const sc = (0.3 + 0.7 * eBack(q, 2.2)) * (1 + 0.04 * Math.sin(t * 20)) * (1 + out * 0.3), tilt = p.tilt + Math.sin(t * 25) * 0.86;
  const font = `'${p.font}', 'Noto Sans TC', sans-serif`, fs = `${px * fit.scale}px`, tf = `translate(-50%, -50%) rotate(${tilt}deg) scale(${Math.max(0.01, sc)})`;
  cssCamel(s.box, { left: `${cx}px`, top: `${cy}px`, width: 'auto', height: 'auto', opacity: String(q > 0 ? 1 - out : 0), transform: tf });
  cssCamel(s.text.el.parentElement!, { position: 'relative', inset: 'auto', color: p.hl, fontSize: fs, fontFamily: font, webkitTextStroke: `${px * 0.056}px ${ctx.theme.palette.paper}`, paintOrder: 'stroke fill' });
  cssCamel(s.back.el.parentElement!, { display: q > 0 ? 'block' : 'none', left: `${cx}px`, top: `${cy}px`, color: p.fill, fontSize: fs, fontFamily: font, opacity: String(1 - out), transform: tf,
    webkitTextStroke: `${px * 0.184}px ${p.ink}`, paintOrder: 'stroke fill', textShadow: `${px * 0.056}px ${px * 0.072}px 0 rgba(0,0,0,0.5)` });
}

/** rays: 14 thin rays (fill and paper colours in turn) from (x, y), and the word popping down from 1.6× at (tx, ty), tilted */
function drawRays(ctx: Parameters<typeof burst.draw>[0], s: S) {
  const p = ctx.params, { W, H, theme, local: t, dur } = ctx, k = Math.min(W, H) / 1080, R = (p.size / 100) * Math.min(W, H) / 2, X = p.x * W, Y = p.y * H;
  const out = p.outDur > 0 ? 1 - prog(t, dur - p.outDur, dur) : 1;
  for (const el of [s.flash, s.rays, s.vig, s.back.el.parentElement!]) cssCamel(el, { display: 'none' });
  cssCamel(s.svg as unknown as HTMLElement, { display: 'none' });
  s.lines.setAttribute('width', String(W)); s.lines.setAttribute('height', String(H));
  [...s.lines.children].forEach((l, i, all) => {
    const r = rayAt(i, all.length, t), at = (q: number) => [X + Math.cos(r.a) * q * R, Y + Math.sin(r.a) * q * R].map((v) => v.toFixed(1));
    const [x1, y1] = at(r.r0), [x2, y2] = at(r.r1);
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', i % 2 ? theme.palette.paper : p.fill); l.setAttribute('stroke-width', String((i % 2 ? 6 : 10) * k)); l.setAttribute('opacity', String(r.alpha * out));
  });
  const px = R * 0.45, fit = layoutMarkup(p.text, (W * 0.8) / px, 2), q = eBack(prog(t, 0, 0.2), 2.2);
  setRuns(s.text, fit.lines, p.hl);
  const tx = p.tx >= 0 ? p.tx * W : X + R * 0.9, ty = p.ty >= 0 ? p.ty * H : Y - R * 0.48, o = 3 * k;
  cssCamel(s.box, { left: `${tx}px`, top: `${ty}px`, width: 'auto', height: 'auto', opacity: String(clamp(t / 0.05) * out), transform: `translate(-50%, -50%) rotate(${p.tilt}deg) scale(${(1.6 - 0.6 * q).toFixed(4)})` });
  cssCamel(s.text.el.parentElement!, { position: 'relative', inset: 'auto', color: p.fill, fontSize: `${px * fit.scale}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, webkitTextStroke: '0',
    textShadow: `${6 * k}px ${6 * k}px 0 ${p.ink}, -${o}px -${o}px 0 ${p.ink}, ${o}px -${o}px 0 ${p.ink}, -${o}px ${o}px 0 ${p.ink}, ${o}px ${o}px 0 ${p.ink}, 0 0 ${30 * k}px rgba(0,0,0,.6)` });
}
