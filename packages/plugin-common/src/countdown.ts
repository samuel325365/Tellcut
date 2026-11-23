// common.countdown — a big number counting down (3, 2, 1… or 10 to 0) over the item, each step popping in, a ring running out
// around it; the last step can say a word instead (GO!). Quizzes, challenges, "guess before it ends", ranking reveals.
// Look slant (2026-11-06, the Single Color pilot film's fx.count): heavy slanted Anton numbers, each step its own colour, an outlined copy
// set off behind, an arc sweeping open on the right instead of the ring (`ring` off hides it). The arc and the numbers take the step's
// colour, so `accent` and `ink` (the ring's colour and the number's outline) belong to the ring look only.
// Looks flip and leader (2026-11-15) draw on a canvas of the item's and keep the number as DOM text over it, so check still measures it:
// flip is a split-flap card (the number on an `ink` card split in two halves, the top half flipping down at each tick, the number a
// transparent copy); leader is an old film leader (a `color` disc, crosshair lines, a hand sweeping one turn a tick, the number in
// `ink`, flickering by frame number).
import { clamp, cssCamel, eBack, eOut3Clamped, eSmooth, frameOf, h, prog, rng, textEm, type ItemType } from '@tellcut/engine';
import { shade, withAlpha } from './color.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { SVG_NS } from './shapes.ts';

type Look = 'ring' | 'slant' | 'flip' | 'leader';
interface P { look: Look; colors: string; from: number; to: number; end: string; label: string; size: number; y: number; color: string; accent: string; ink: string; ring: boolean; font: string }
interface S { box: HTMLElement; svg: SVGSVGElement; track: SVGCircleElement; arc: SVGCircleElement; num: HTMLElement; ghost: HTMLElement; label: HTMLElement; cv: HTMLCanvasElement; font: string }

/** step `step`'s colour: the comma-separated colours in turn, `color` when there are none */
export function stepColor(colors: string, step: number, color: string): string {
  const list = String(colors || '').split(',').map((c) => c.trim()).filter(Boolean);
  return list.length ? list[step % list.length] : color;
}
/** the slant look's lean (Anton has no italic), as CSS */
const LEAN = 'skewX(-11.31deg)';

/** the step showing at `local` of a `dur`-long item counting from `from` to `to` (each step an equal share), and how far into it */
export function countStepAt(from: number, to: number, dur: number, local: number, end = ''): { text: string; step: number; into: number } {
  const n = Math.max(1, Math.abs(Math.round(from) - Math.round(to)) + 1), len = dur / n;
  const step = Math.min(n - 1, Math.max(0, Math.floor(local / len))), into = Math.round(clamp((local - step * len) / len) * 1e6) / 1e6;
  const dir = from >= to ? -1 : 1, v = Math.round(from) + dir * step;
  return { text: step === n - 1 && end ? end : String(v), step, into };
}

/** the flip look at `local`: the step's text, the one before it ('' on the first step) and how far the flap has turned (0 = the old top
 *  half still up, π = the new bottom half down); a flap takes 0.42 s, or 60 % of a shorter step */
export function flipAt(from: number, to: number, dur: number, local: number, end = ''): { text: string; prev: string; turn: number; step: number } {
  const c = countStepAt(from, to, dur, local, end), n = Math.max(1, Math.abs(Math.round(from) - Math.round(to)) + 1), len = dur / n;
  if (c.step === 0) return { text: c.text, prev: '', turn: Math.PI, step: 0 };
  const prev = countStepAt(from, to, dur, (c.step - 0.5) * len, end).text, F = Math.min(0.42, 0.6 * len);
  return { text: c.text, prev, turn: Math.PI * eSmooth((c.into * len) / F), step: c.step };
}

/** the leader look's flicker for frame `frame`: the disc's brightness, a gate weave in px (×`unit`) and up to three specks of dirt
 *  (frame fractions of the disc's radius, -1…1) */
export function leaderFlicker(frame: number, unit: number): { light: number; dx: number; dy: number; specks: Array<{ x: number; y: number; r: number; hair: boolean }> } {
  const r = rng(frame * 7919 + 31), light = 0.86 + 0.12 * r(), dx = (r() - 0.5) * 4 * unit, dy = (r() - 0.5) * 4 * unit, n = Math.floor(r() * 4);
  return { light, dx, dy, specks: Array.from({ length: n }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, r: (1.5 + 3 * r()) * unit, hair: r() < 0.3 })) };
}

export const countdown: ItemType<P, S> = {
  type: 'common.countdown', label: '倒數計時', category: 'number', kind: 'overlay',
  doc: '大數字從 from 倒數到 to（整個項目平均分）；最後一下可以換成字（GO!）；測驗、挑戰、猜猜看、排行揭曉',
  variants: { param: 'look', list: [
    { value: 'ring', label: '環形倒數', doc: '大數字每一下彈一下、外圈一條環跟著跑完（accent 是環的顏色、ink 是數字描邊，ring 關掉環）；問答、限時任務' },
    { value: 'slant', label: '斜體大字', doc: '粗窄斜體大字（Anton）、斜後方一個空心的影子、右側一道弧線跟著每一下掃開，colors 每一下輪流換色；運動、單色快剪的 3-2-1 開場，配 common.grade' },
    { value: 'flip', label: '翻牌鐘', doc: '數字印在一張上下兩半的卡片上（卡片 ink 色、數字 color 色），每一下上半片往下翻、露出下一個數字；復古、倒數到開幕、跨年、發表會、「還剩幾天」' },
    { value: 'leader', label: '老片頭', doc: '老電影片頭的倒數：一個圓盤（color）、十字線、一根指針每一下轉一整圈掃過、中間是數字（ink），整個微微閃、有灰塵，預設黑白；復古片頭、懷舊、家庭錄影、「電影開始」' },
  ] },
  params: [
    { key: 'look', label: '樣式（ring 環、slant 斜體大字＋弧線、flip 翻牌鐘、leader 老電影片頭）', type: 'enum', options: ['ring', 'slant', 'flip', 'leader'], default: 'ring' },
    { key: 'colors', label: '每一下的顏色（slant 樣式；逗號分隔輪流；空＝數字顏色；ring 只用數字顏色）', type: 'string', default: '' },
    { key: 'from', label: '從', type: 'number', min: 0, max: 99, step: 1, default: 3 },
    { key: 'to', label: '到', type: 'number', min: 0, max: 99, step: 1, default: 0 },
    { key: 'end', label: '最後一下改成這幾個字（空＝照數字）', type: 'string', default: 'GO!' },
    { key: 'label', label: '數字上方的小字（空＝沒有）', type: 'string', default: '' },
    { key: 'size', label: '大小（畫面短邊 %）', type: 'number', min: 10, max: 90, step: 1, default: 42 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.45 },
    { key: 'color', label: '數字顏色（leader 是圓盤的顏色）', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '環的顏色（ring 樣式；slant 的弧線用每一下的顏色）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'ink', label: '數字描邊（ring 樣式；slant 沒有描邊；flip 是卡片的顏色；leader 是線和數字的顏色）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'ring', label: '外圈的環（slant 樣式是右側的弧線；flip、leader 不用）', type: 'bool', default: true },
    { key: 'font', label: '字型（ring、flip、leader 樣式；slant 固定用 Anton）', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  // named sets of these params (engine templates.ts); their golden samples are countdown-tpl-<id>
  templates: [
    { id: 'flip-clock', label: '翻牌倒數', doc: '新品發表的倒數、跨年：翻牌鐘一格一格翻下來，最後一下也是數字', params: { look: 'flip', end: '' } },
    { id: 'film-leader', label: '老電影片頭', doc: '復古片頭、老電影的開場：佔滿畫面寬的大圓盤，指針一秒轉一圈，從 5 數到 0，最後一下也是數字', params: { look: 'leader', from: 5, end: '', size: 80 } },
    { id: 'slant-go', label: '斜體大字倒數', doc: '運動、挑戰開始：很大的斜體數字加右側的弧線，最後喊 GO!', params: { look: 'slant', size: 60 } },
    { id: 'ring-corner', label: '角落小計時', doc: '問答、限時任務：小小的環形計時停在畫面上方，不擋主畫面，最後一下也是數字', params: { size: 22, y: 0.15, end: '' } },
  ],
  build(ctx) {
    // the flip and leader looks' canvas, under the number (hidden in the other looks)
    const cv = h('canvas', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none' });
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute' });
    const svg = document.createElementNS(SVG_NS, 'svg'), track = document.createElementNS(SVG_NS, 'circle'), arc = document.createElementNS(SVG_NS, 'circle');
    svg.setAttribute('viewBox', '0 0 100 100');
    for (const c of [track, arc]) { c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '45'); c.setAttribute('fill', 'none'); svg.appendChild(c); }
    arc.setAttribute('transform', 'rotate(-90 50 50)');
    arc.setAttribute('stroke-linecap', 'round');
    cssCamel(svg as unknown as HTMLElement, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible' });
    box.appendChild(svg);
    const ghost = h('div', null, null, box), num = h('div', null, null, box), label = h('div', null, null, box);
    for (const el of [ghost, num, label]) cssCamel(el, { position: 'absolute', left: '50%', whiteSpace: 'pre', lineHeight: '1', fontWeight: '900' });
    // the flip look draws the number's halves on its canvas: wait for the face before the first frame
    return { box, svg, track, arc, num, ghost, label, cv, font: ctx.params.look === 'flip' ? String(ctx.params.font || 'Noto Sans TC') : '' };
  },
  ready: (s) => (s.font ? document.fonts.load(`900 100px '${s.font}'`, '0123456789GO!').then(() => undefined) : Promise.resolve()),
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, d = (p.size / 100) * Math.min(W, H);
    if (p.look === 'slant') return drawSlant(ctx, s);
    if (p.look === 'flip') return drawFlip(ctx, s);
    if (p.look === 'leader') return drawLeader(ctx, s);
    cssCamel(s.cv, { display: 'none' });
    const c = countStepAt(p.from, p.to, dur, local, p.end), pop = eBack(clamp(c.into / 0.35), 2.4), fade = 1 - prog(local, dur - 0.2, dur);
    cssCamel(s.box, { left: `${W / 2 - d / 2}px`, top: `${p.y * H - d / 2}px`, width: `${d}px`, height: `${d}px`, opacity: String(fade) });
    const sw = 7, left = 1 - clamp(local / dur), circ = 2 * Math.PI * 45;
    s.track.setAttribute('stroke', withAlpha(p.accent, 0.25)); s.track.setAttribute('stroke-width', String(sw));
    s.arc.setAttribute('stroke', p.accent); s.arc.setAttribute('stroke-width', String(sw));
    s.arc.setAttribute('stroke-dasharray', `${(circ * left).toFixed(2)} ${circ.toFixed(2)}`);
    cssCamel(s.svg as unknown as HTMLElement, { display: p.ring ? 'block' : 'none', transform: 'none' });
    cssCamel(s.ghost, { display: 'none' });
    s.arc.setAttribute('transform', 'rotate(-90 50 50)'); s.track.style.display = '';
    s.num.textContent = c.text;
    // a word the ring cannot hold (START NOW, 開始) shrinks to 80 % of its width; GO! and the numbers keep their size
    const word = [...c.text].length > 2, px = Math.min(d * (word ? 0.32 : 0.52), (0.8 * d) / Math.max(0.5, textEm(c.text)));
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
  cssCamel(s.cv, { display: 'none' });
  const c = countStepAt(p.from, p.to, dur, local, p.end), col = stepColor(p.colors, c.step, p.color), fade = 1 - prog(local, dur - 0.12, dur);
  cssCamel(s.box, { left: `${W / 2 - d / 2}px`, top: `${p.y * H - d / 2}px`, width: `${d}px`, height: `${d}px`, opacity: String(fade) });
  const word = [...c.text].length > 2, px = d * (word ? 0.42 : 0.82) * (1 + 0.18 * (1 - eOut3Clamped(c.into / 0.35))), font = `'Anton', 'Noto Sans TC', sans-serif`;
  s.num.textContent = c.text; s.ghost.textContent = c.text;
  cssCamel(s.num, { top: '50%', transform: `translate(-50%, -50%) ${LEAN}`, fontSize: `${px}px`, fontWeight: '400', color: col, fontFamily: font, webkitTextStroke: '0', opacity: '1' });
  cssCamel(s.ghost, { display: 'block', top: '50%', transform: `translate(-50%, -50%) translate(${0.06 * px}px, ${0.05 * px}px) ${LEAN}`, fontSize: `${px}px`, fontWeight: '400',
    color: 'transparent', fontFamily: font, webkitTextStroke: `${4 * k}px ${col === '#ffffff' ? 'rgba(255,255,255,0.85)' : col}` });
  // the arc: from about 76° above the right to as far below, opening over each step
  const circ = 2 * Math.PI * 45, open = 0.42 * eOut3Clamped(c.into / 0.8);
  cssCamel(s.svg as unknown as HTMLElement, { display: p.ring ? 'block' : 'none', transform: 'translateX(12%)' });
  s.track.style.display = 'none';
  s.arc.setAttribute('transform', 'rotate(-75.6 50 50)');
  s.arc.setAttribute('stroke', col); s.arc.setAttribute('stroke-width', String(((6 * k) / d) * 100));
  s.arc.setAttribute('stroke-dasharray', `${(circ * open).toFixed(2)} ${circ.toFixed(2)}`);
  s.label.textContent = p.label;
  cssCamel(s.label, { display: p.label ? 'block' : 'none', top: `${-d * 0.08}px`, transform: `translate(-50%, -100%) ${LEAN}`, fontSize: `${d * 0.12}px`, color: col, fontFamily: font, webkitTextStroke: '0' });
}

/** the flip and leader looks' DOM: the box over the number's place, no ring, no ghost, the small label above as the ring look has it */
function plainBox(ctx: Parameters<typeof countdown.draw>[0], s: S, d: number, top: number, fade: number) {
  const p = ctx.params, { W, theme } = ctx, k = Math.min(W, ctx.H) / 1080;
  cssCamel(s.box, { left: `${W / 2 - d / 2}px`, top: `${top}px`, width: `${d}px`, height: `${d}px`, opacity: String(fade) });
  cssCamel(s.svg as unknown as HTMLElement, { display: 'none', transform: 'none' });
  cssCamel(s.ghost, { display: 'none' });
  s.label.textContent = p.label;
  cssCamel(s.label, { display: p.label ? 'block' : 'none', top: `${-d * 0.08}px`, transform: 'translate(-50%, -100%)', fontSize: `${d * 0.12}px`, color: p.color,
    fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, webkitTextStroke: `${theme.stroke * 0.6 * k}px ${p.ink}`, paintOrder: 'stroke fill' });
}

/** look flip: a split-flap card. The halves and the flap are drawn on the canvas; the number in the DOM is a transparent copy of the
 *  step's text at the drawn size, for check and the editor */
function drawFlip(ctx: Parameters<typeof countdown.draw>[0], s: S) {
  const p = ctx.params, { W, H, local, dur } = ctx, ch = (p.size / 100) * Math.min(W, H), cx = W / 2, cy = p.y * H;
  const f = flipAt(p.from, p.to, dur, local, p.end), fade = 1 - prog(local, dur - 0.2, dur), arrive = eOut3Clamped(local / 0.25);
  cssCamel(s.cv, { display: 'block' });
  const g = canvasAt(s.cv, W, H), family = `'${p.font}', 'Noto Sans TC', sans-serif`;
  // the card is as wide as the widest number; a longer word (GO!, 開始) shrinks to fit it
  const digits = Math.max(String(Math.round(p.from)).length, String(Math.round(p.to)).length), cw = ch * (0.78 + 0.42 * (digits - 1));
  const base = ch * 0.74;
  const sizeOf = (t: string) => { g.font = `900 ${base}px ${family}`; return Math.min(base, (base * (cw * 0.84)) / Math.max(1, g.measureText(t).width)); };
  const px = sizeOf(f.text), r = ch * 0.07, gap = Math.max(1, ch * 0.012), face = p.ink, light = shade(p.ink, 1.12);
  g.globalAlpha = clamp(fade * arrive);
  g.translate(cx, cy + (1 - arrive) * ch * 0.06);
  // the card's shadow and its two halves
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = ch * 0.06; g.shadowOffsetY = ch * 0.03;
  g.fillStyle = face; g.beginPath(); g.roundRect(-cw / 2, -ch / 2, cw, ch, r); g.fill();
  g.restore();
  const half = (top: boolean, text: string, squash: number, dark: number) => {
    if (squash <= 0.002) return;
    g.save();
    g.scale(1, squash);
    g.beginPath();
    if (top) g.roundRect(-cw / 2, -ch / 2, cw, ch / 2 - gap / 2, [r, r, 0, 0]);
    else g.roundRect(-cw / 2, gap / 2, cw, ch / 2 - gap / 2, [0, 0, r, r]);
    g.fillStyle = top ? light : face; g.fill();
    g.clip();
    if (text) {
      const sz = sizeOf(text);
      g.font = `900 ${sz}px ${family}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = p.color;
      // the digits' middle on the hinge: the baseline 0.36 em below it
      g.fillText(text, 0, sz * 0.36);
    }
    if (dark > 0) { g.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`; g.fillRect(-cw / 2, -ch / 2, cw, ch); }
    g.restore();
  };
  const t = f.turn, settled = t >= Math.PI - 1e-6;
  half(true, f.text, 1, 0);
  half(false, settled ? f.text : f.prev, 1, settled ? 0 : 0.18 * Math.sin(t));
  // the flap: the old top half falling to the hinge, then the new bottom half coming down from it
  if (!settled) {
    if (t < Math.PI / 2) half(true, f.prev, Math.cos(t), 0.5 * Math.sin(t));
    else half(false, f.text, -Math.cos(t), 0.4 * Math.sin(t));
  }
  // the hinge: a dark line across with a pin at each side
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(-cw / 2, -gap / 2, cw, gap);
  g.fillStyle = shade(p.ink, 0.6);
  for (const sx of [-1, 1]) g.fillRect(sx * cw / 2 - (sx > 0 ? ch * 0.03 : 0), -ch * 0.04, ch * 0.03, ch * 0.08);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  plainBox(ctx, s, ch, cy - ch / 2, fade * arrive);
  s.num.textContent = f.text;
  cssCamel(s.num, { top: '50%', transform: 'translate(-50%, -50%)', fontSize: `${px}px`, fontWeight: '900', color: 'transparent', fontFamily: family,
    webkitTextStroke: '0', paintOrder: 'stroke fill', opacity: '1' });
}

/** look leader: an old film leader. The disc, the swept sector, the rings, the crosshair, the hand and the dirt are on the canvas; the
 *  number is the DOM's, in ink */
function drawLeader(ctx: Parameters<typeof countdown.draw>[0], s: S) {
  const p = ctx.params, { W, H, local, dur } = ctx, m = Math.min(W, H), k = m / 1080, d = (p.size / 100) * m, R = d / 2;
  const c = countStepAt(p.from, p.to, dur, local, p.end), fade = 1 - prog(local, dur - 0.2, dur), fl = leaderFlicker(frameOf(local, ctx.fps), k);
  const cx = W / 2 + fl.dx, cy = p.y * H + fl.dy;
  cssCamel(s.cv, { display: 'block' });
  const g = canvasAt(s.cv, W, H);
  g.globalAlpha = clamp(fade);
  // the disc, then the part the hand has swept a shade darker
  g.fillStyle = shade(p.color, fl.light); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  const hand = -Math.PI / 2 + c.into * Math.PI * 2;
  g.fillStyle = withAlpha(p.ink, 0.28); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, -Math.PI / 2, hand); g.closePath(); g.fill();
  // the crosshair across the whole frame, the two rings, the hand
  g.strokeStyle = p.ink; g.lineCap = 'butt';
  g.globalAlpha = clamp(fade * 0.7); g.lineWidth = Math.max(1, d * 0.007);
  g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();
  g.globalAlpha = clamp(fade);
  g.lineWidth = d * 0.026; g.beginPath(); g.arc(cx, cy, R * 0.97, 0, Math.PI * 2); g.stroke();
  g.lineWidth = d * 0.013; g.beginPath(); g.arc(cx, cy, R * 0.8, 0, Math.PI * 2); g.stroke();
  g.lineWidth = d * 0.018; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(hand) * R * 0.97, cy + Math.sin(hand) * R * 0.97); g.stroke();
  // this frame's dirt: specks and now and then a hair
  g.fillStyle = p.ink; g.lineWidth = Math.max(1, 1.5 * k);
  for (const sp of fl.specks) {
    const x = cx + sp.x * R, y = cy + sp.y * R;
    g.beginPath();
    if (sp.hair) { g.moveTo(x, y); g.quadraticCurveTo(x + sp.r * 4, y - sp.r * 2, x + sp.r * 7, y + sp.r * 3); g.stroke(); }
    else { g.arc(x, y, sp.r, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
  plainBox(ctx, s, d, cy - d / 2, fade);
  cssCamel(s.box, { left: `${cx - d / 2}px` });
  s.num.textContent = c.text;
  const word = [...c.text].length > 2, px = Math.min(d * (word ? 0.3 : 0.56), (0.7 * d) / Math.max(0.5, textEm(c.text)));
  cssCamel(s.num, { top: '50%', transform: 'translate(-50%, -50%)', fontSize: `${px}px`, fontWeight: '900', color: p.ink, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`,
    webkitTextStroke: '0', paintOrder: 'stroke fill', opacity: String(0.85 + 0.15 * fl.light) });
}
