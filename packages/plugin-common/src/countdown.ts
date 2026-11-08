// common.countdown — a big number counting down (3, 2, 1… or 10 to 0) over the item, each step popping in, a ring running out
// around it; the last step can say a word instead (GO!). Quizzes, challenges, "guess before it ends", ranking reveals.
// Look slant (2026-11-06, the Single Color pilot film's fx.count): heavy slanted Anton numbers, each step its own colour, an outlined copy
// set off behind, an arc sweeping open on the right instead of the ring (`ring` off hides it). The arc and the numbers take the step's
// colour, so `accent` and `ink` (the ring's colour and the number's outline) belong to the ring look only.
import { clamp, cssCamel, eBack, h, prog, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P { look: 'ring' | 'slant'; colors: string; from: number; to: number; end: string; label: string; size: number; y: number; color: string; accent: string; ink: string; ring: boolean; font: string }
interface S { box: HTMLElement; svg: SVGSVGElement; track: SVGCircleElement; arc: SVGCircleElement; num: HTMLElement; ghost: HTMLElement; label: HTMLElement }

/** step `step`'s colour: the comma-separated colours in turn, `color` when there are none */
export function stepColor(colors: string, step: number, color: string): string {
  const list = String(colors || '').split(',').map((c) => c.trim()).filter(Boolean);
  return list.length ? list[step % list.length] : color;
}
/** the slant look's lean (Anton has no italic), as CSS */
const LEAN = 'skewX(-11.31deg)';

/** the step showing at `local` of a `dur`-long item counting from `from` to `to` (each step an equal share), and how far into it */
export function countAt(from: number, to: number, dur: number, local: number, end = ''): { text: string; step: number; into: number } {
  const n = Math.max(1, Math.abs(Math.round(from) - Math.round(to)) + 1), len = dur / n;
  const step = Math.min(n - 1, Math.max(0, Math.floor(local / len))), into = Math.round(clamp((local - step * len) / len) * 1e6) / 1e6;
  const dir = from >= to ? -1 : 1, v = Math.round(from) + dir * step;
  return { text: step === n - 1 && end ? end : String(v), step, into };
}

const NS = 'http://www.w3.org/2000/svg';

export const countdown: ItemType<P, S> = {
  type: 'common.countdown', label: '倒數計時', category: 'number', kind: 'overlay',
  doc: '大數字從 from 倒數到 to（整個項目平均分），每一下彈一下、外圈一條環跟著跑完；最後一下可以換成字（GO!）；look slant 是粗窄斜體大字（Anton）、斜後方一個空心的影子、右側一道弧線跟著每一下掃開，colors 每一下輪流換色（運動、單色快剪的 3-2-1 開場，配 common.grade）；測驗、挑戰、猜猜看、排行揭曉',
  params: [
    { key: 'look', label: '樣式（ring 環、slant 斜體大字＋弧線）', type: 'enum', options: ['ring', 'slant'], default: 'ring' },
    { key: 'colors', label: '每一下的顏色（逗號分隔輪流；空＝數字顏色）', type: 'string', default: '' },
    { key: 'from', label: '從', type: 'number', min: 0, max: 99, step: 1, default: 3 },
    { key: 'to', label: '到', type: 'number', min: 0, max: 99, step: 1, default: 0 },
    { key: 'end', label: '最後一下改成這幾個字（空＝照數字）', type: 'string', default: 'GO!' },
    { key: 'label', label: '數字上方的小字（空＝沒有）', type: 'string', default: '' },
    { key: 'size', label: '大小（畫面短邊 %）', type: 'number', min: 10, max: 90, step: 1, default: 42 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.45 },
    { key: 'color', label: '數字顏色', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '環的顏色（ring 樣式；slant 的弧線用每一下的顏色）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'ink', label: '數字描邊（ring 樣式；slant 沒有描邊）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'ring', label: '外圈的環（slant 樣式是右側的弧線）', type: 'bool', default: true },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute' });
    const svg = document.createElementNS(NS, 'svg'), track = document.createElementNS(NS, 'circle'), arc = document.createElementNS(NS, 'circle');
    svg.setAttribute('viewBox', '0 0 100 100');
    for (const c of [track, arc]) { c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '45'); c.setAttribute('fill', 'none'); svg.appendChild(c); }
    arc.setAttribute('transform', 'rotate(-90 50 50)');
    arc.setAttribute('stroke-linecap', 'round');
    cssCamel(svg as unknown as HTMLElement, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible' });
    box.appendChild(svg);
    const ghost = h('div', null, null, box), num = h('div', null, null, box), label = h('div', null, null, box);
    for (const el of [ghost, num, label]) cssCamel(el, { position: 'absolute', left: '50%', whiteSpace: 'pre', lineHeight: '1', fontWeight: '900' });
    return { box, svg, track, arc, num, ghost, label };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, d = (p.size / 100) * Math.min(W, H);
    if (p.look === 'slant') return drawSlant(ctx, s);
    const c = countAt(p.from, p.to, dur, local, p.end), pop = eBack(clamp(c.into / 0.35), 2.4), fade = 1 - prog(local, dur - 0.2, dur);
    cssCamel(s.box, { left: `${W / 2 - d / 2}px`, top: `${p.y * H - d / 2}px`, width: `${d}px`, height: `${d}px`, opacity: String(fade) });
    const sw = 7, left = 1 - clamp(local / dur), circ = 2 * Math.PI * 45;
    s.track.setAttribute('stroke', withAlpha(p.accent, 0.25)); s.track.setAttribute('stroke-width', String(sw));
    s.arc.setAttribute('stroke', p.accent); s.arc.setAttribute('stroke-width', String(sw));
    s.arc.setAttribute('stroke-dasharray', `${(circ * left).toFixed(2)} ${circ.toFixed(2)}`);
    cssCamel(s.svg as unknown as HTMLElement, { display: p.ring ? 'block' : 'none', transform: 'none' });
    cssCamel(s.ghost, { display: 'none' });
    s.arc.setAttribute('transform', 'rotate(-90 50 50)'); s.track.style.display = '';
    s.num.textContent = c.text;
    const word = [...c.text].length > 2, px = d * (word ? 0.32 : 0.52);
    cssCamel(s.num, { top: '50%', transform: `translate(-50%, -50%) scale(${pop})`, fontSize: `${px}px`, fontWeight: '900', color: p.color, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`,
      webkitTextStroke: `${theme.stroke * k}px ${p.ink}`, paintOrder: 'stroke fill', opacity: String(clamp(c.into / 0.08)) });
    s.label.textContent = p.label;
    cssCamel(s.label, { display: p.label ? 'block' : 'none', top: `${-d * 0.08}px`, transform: 'translate(-50%, -100%)', fontSize: `${d * 0.12}px`, color: p.color,
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, webkitTextStroke: `${theme.stroke * 0.6 * k}px ${p.ink}`, paintOrder: 'stroke fill' });
  },
};

/** look slant: the number slanted and huge, an outlined copy behind, an arc on the right sweeping open over each step */
function drawSlant(ctx: Parameters<typeof countdown.draw>[0], s: S) {
  const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, d = (p.size / 100) * Math.min(W, H);
  const c = countAt(p.from, p.to, dur, local, p.end), col = stepColor(p.colors, c.step, p.color), fade = 1 - prog(local, dur - 0.12, dur);
  cssCamel(s.box, { left: `${W / 2 - d / 2}px`, top: `${p.y * H - d / 2}px`, width: `${d}px`, height: `${d}px`, opacity: String(fade) });
  const word = [...c.text].length > 2, px = d * (word ? 0.42 : 0.82) * (1 + 0.18 * (1 - eOutC(c.into / 0.35))), font = `'Anton', 'Noto Sans TC', sans-serif`;
  s.num.textContent = c.text; s.ghost.textContent = c.text;
  cssCamel(s.num, { top: '50%', transform: `translate(-50%, -50%) ${LEAN}`, fontSize: `${px}px`, fontWeight: '400', color: col, fontFamily: font, webkitTextStroke: '0', opacity: '1' });
  cssCamel(s.ghost, { display: 'block', top: '50%', transform: `translate(-50%, -50%) translate(${0.06 * px}px, ${0.05 * px}px) ${LEAN}`, fontSize: `${px}px`, fontWeight: '400',
    color: 'transparent', fontFamily: font, webkitTextStroke: `${4 * k}px ${col === '#ffffff' ? 'rgba(255,255,255,0.85)' : col}` });
  // the arc: from about 76° above the right to as far below, opening over each step
  const circ = 2 * Math.PI * 45, open = 0.42 * eOutC(c.into / 0.8);
  cssCamel(s.svg as unknown as HTMLElement, { display: p.ring ? 'block' : 'none', transform: 'translateX(12%)' });
  s.track.style.display = 'none';
  s.arc.setAttribute('transform', 'rotate(-75.6 50 50)');
  s.arc.setAttribute('stroke', col); s.arc.setAttribute('stroke-width', String(((6 * k) / d) * 100));
  s.arc.setAttribute('stroke-dasharray', `${(circ * open).toFixed(2)} ${circ.toFixed(2)}`);
  s.label.textContent = p.label;
  cssCamel(s.label, { display: p.label ? 'block' : 'none', top: `${-d * 0.08}px`, transform: `translate(-50%, -100%) ${LEAN}`, fontSize: `${d * 0.12}px`, color: col, fontFamily: font, webkitTextStroke: '0' });
}
const eOutC = (q: number) => 1 - Math.pow(1 - clamp(q), 3);
