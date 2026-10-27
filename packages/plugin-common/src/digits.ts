// common.digits — a number display: a green VFD till display (5×7 dots: a running subtotal that counts up, "+40" flashing over it,
// the total blinking) or a red seven-segment LED (a queue number that blinks three times when it changes, a side tag 叫號／下一位).
// With a title it becomes a board: a shop name and a small line on the left, the display on the right.
// From the food-receipt short's VFD subtotal and the food-deep short's queue-number board.
import { abs, clamp, cssCamel, eSmooth, type ItemType, prog, textEm } from '@tellcut/engine';
import { canvasAt } from './inkline.ts';
import { dots, drawDots, drawSeg, loadDots, softCanvas, vfdText } from './dots.ts';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  style: 'vfd' | 'led'; steps: string; digits: number; prefix: string; label: string; totalAt: number; totalLabel: string; title: string; sub: string;
  x: number; y: number; w: number; font: string; vfd: string; led: string; flash: string; board: string; titleColor: string; subColor: string;
}
interface S { box: HTMLElement; cv: HTMLCanvasElement; off: HTMLCanvasElement; title: HTMLElement; sub: HTMLElement; tag: HTMLElement; ghost: HTMLElement; want: string }

/** one step: at `t` the display is set to `v` (a number or any text such as --) or, when `v` starts with + or −, `n` is added */
export interface Step { t: number; v: string; add: boolean; n: number | null; label: string }

/** "秒|值|小字" steps, comma or newline separated: "0.3|+95" adds 95, "1|02" shows 02, "2|04|下一位" also gives a label */
export function parseSteps(text: string): Step[] {
  return String(text ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [t, v = '', label = ''] = x.split('|').map((y) => y.trim());
    const add = /^[+＋−-]/.test(v) && v !== '-' && !/^-+$/.test(v), num = Number(v.replace(/^[+＋]/, '').replace('−', '-').replace(/,/g, ''));
    return { t: Number(t) || 0, v, add, n: v !== '' && Number.isFinite(num) ? num : null, label };
  }).sort((a, b) => a.t - b.t);
}


/** what the display shows at `local`: its text (null before the first step), the last step and how long ago it came */
export function digitsAt(steps: Step[], local: number, digits: number, pad: string): { text: string | null; last: Step | null; since: number } {
  let text: string | null = null, base = 0, last: Step | null = null, from = -Infinity;
  for (const s of steps) {
    if (s.t > local + 1e-9) break;
    last = s;
    if (!s.add) { text = s.v.padStart(digits, ' '); base = s.n ?? 0; from = s.t; continue; }
    // an add counts up over 0.55 s; one that is not a number (+?) only flashes
    if (s.n !== null) { base += s.n; text = null; } else if (text === null) text = '';
  }
  if (last && (last.add || text === null)) {
    // the shown sum: the full one less what the adds still counting up have not reached yet
    let shown = base, any = false;
    for (const s of steps) if (s.t <= local + 1e-9 && s.t >= from && s.add && s.n !== null) { any = true; shown -= s.n * (1 - eSmooth((local - s.t) / 0.55)); }
    if (any) text = String(Math.round(shown)).padStart(digits, pad);
  }
  return { text, last, since: last ? local - last.t : 0 };
}

export interface VfdOpts { steps: Step[]; local: number; n: number; text: string | null; prefix: string; label: string; totalLabel: string; totalAt: number; on: string; flash: string }

/** a VFD till display with its bezel at (x, y), dw × dh px (78 units tall), `off` a scratch canvas for the glow; the words it shows */
export function paintVfd(g: CanvasRenderingContext2D, off: HTMLCanvasElement, x: number, y: number, dw: number, dh: number, u: number, o: VfdOpts): string {
  const { steps, local, n } = o, total = o.totalAt >= 0 && local >= o.totalAt, m = 10 * u;
  // the VFD glass: dots drawn on their own canvas, then a blurred copy added under them for the glow
  g.fillStyle = '#0b0d0f'; g.beginPath(); g.roundRect(x - m, y - m, dw + 2 * m, dh + 2 * m, 16 * u); g.fill();
  g.fillStyle = '#031210'; g.beginPath(); g.roundRect(x, y, dw, dh, 10 * u); g.fill();
  const v = off.getContext('2d')!, k = dh / 78;
  if (off.width !== Math.ceil(dw) || off.height !== Math.ceil(dh)) { off.width = Math.ceil(dw); off.height = Math.ceil(dh); }
  v.clearRect(0, 0, off.width, off.height);
  const lab = total ? o.totalLabel : o.label;
  if (lab) { const L = dots(lab, 13); drawDots(v, L, 22 * k, (dh - L.h * 3.1 * k) / 2 + 2 * k, 3.1 * k, 2.5 * k, o.on); }
  const pre = o.prefix, body = o.text === null ? (Math.floor(local / 0.4) % 2 ? '-'.repeat(Math.min(4, n)).padStart(n, ' ') : ' '.repeat(n)) : o.text.slice(-n).padStart(n, ' ');
  const blinkOff = total && local - o.totalAt < 1.2 && Math.floor((local - o.totalAt) / 0.2) % 2 === 1;
  vfdText(v, pre + body, dw - 22 * k, (dh - 49 * k) / 2, 7 * k, 5.2 * k, blinkOff ? withAlpha(o.on, 0.25) : o.on, 'rgba(40,130,105,0.13)');
  // the latest step's small words, for 1.1 s in the middle of the glass, rising a little
  const last = [...steps].reverse().find((x) => local >= x.t && local < x.t + 1.1 && (x.label || x.add));
  let flash = '';
  if (last) {
    flash = last.label || last.v;
    const D = dots(flash, 12), q = (local - last.t) / 1.1, a = q < 0.15 ? q / 0.15 : q > 0.75 ? (1 - q) / 0.25 : 1, r = clamp(q * 3);
    v.globalAlpha = clamp(a);
    drawDots(v, D, 168 * k * (dw / dh / (720 / 78)), (dh - D.h * 3.2 * k) / 2 + 2 * k - 6 * k * r * (2 - r), 3.2 * k, 2.6 * k, o.flash);
    v.globalAlpha = 1;
  }
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7; g.filter = `blur(${6 * k}px)`; g.drawImage(off, x, y); g.restore();
  g.drawImage(off, x, y);
  const gl = g.createLinearGradient(0, y, 0, y + dh);
  gl.addColorStop(0, 'rgba(255,255,255,0.07)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.roundRect(x, y, dw, dh, 10 * u); g.fill();
  return `${lab} ${flash} ${pre}${body.trim()}`.trim();
}

export const digits: ItemType<P, S> = {
  type: 'common.digits', label: '數字顯示器', category: 'number', kind: 'overlay',
  doc: '數字顯示器：style vfd 是收銀機的綠色點陣小計（「秒|+40」數字往上跳、黃色「+40」閃出來，合計時閃爍），led 是紅色七段 LED 叫號（「秒|02」換號閃三下、旁邊直書小牌 叫號／下一位）；加 title 變成看板（左邊店名與小字、右邊顯示器）；花費、計分、叫號、倒數、樓層',
  params: [
    { key: 'style', label: '樣式（vfd 綠色點陣、led 紅色七段）', type: 'enum', options: ['vfd', 'led'], default: 'vfd' },
    { key: 'steps', label: '變化（秒|值|小字，逗號分隔；+數字＝加上去、其他＝直接顯示；小字：vfd 閃出、led 換旁邊小牌）', type: 'text', default: '0.3|+95, 1.0|+60, 1.6|+40, 2.2|+0|+0 試吃' },
    { key: 'digits', label: '位數（0＝vfd 5 位、led 2 位）', type: 'number', min: 0, max: 10, step: 1, default: 0 },
    { key: 'prefix', label: '數字前的字（vfd）', type: 'string', default: 'NT$' },
    { key: 'label', label: '小標（vfd 顯示器左邊的點陣字、led 旁邊的直書小牌）', type: 'string', default: '小計' },
    { key: 'totalAt', label: '合計時間（秒；-1＝沒有）：小標換成合計、數字閃一秒', type: 'number', min: -1, max: 600, step: 0.05, default: 2.6 },
    { key: 'totalLabel', label: '合計的小標', type: 'string', default: '合計' },
    { key: 'title', label: '看板大字（空＝只有顯示器）', type: 'string', default: '' },
    { key: 'sub', label: '看板小字', type: 'string', default: '' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '寬（畫面短邊的比例）', type: 'number', min: 0.1, max: 1.6, step: 0.01, default: 0.667 },
    { key: 'font', label: '看板字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'vfd', label: 'vfd 點的顏色', type: 'color', default: '#8dffd9' },
    { key: 'led', label: 'led 的顏色', type: 'color', default: '#ff3b2a' },
    { key: 'flash', label: 'vfd 閃出小字的顏色', type: 'color', default: '#ffe28a' },
    { key: 'board', label: '看板／機殼底色', type: 'color', default: '#0e0b09' },
    { key: 'titleColor', label: '看板大字顏色', type: 'color', default: '#f6ead2' },
    { key: 'subColor', label: '看板小字顏色', type: 'color', default: '#e6a93a', theme: 'palette.hl' },
  ],
  build(ctx) {
    const box = abs(ctx.root), cv = abs(box, {}, 'canvas'), title = abs(box), sub = abs(box), tag = abs(box), ghost = abs(box);
    for (const e of [title, sub]) cssCamel(e, { whiteSpace: 'pre', lineHeight: '1.1' });
    cssCamel(tag, { display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', fontWeight: '900', lineHeight: '1.05', textAlign: 'center' });
    cssCamel(ghost, { color: 'transparent', whiteSpace: 'pre', lineHeight: '1', overflow: 'hidden' });
    const p = ctx.params;
    return { box, cv: cv as HTMLCanvasElement, off: softCanvas(4, 4), title, sub, tag, ghost, want: `${p.label}${p.totalLabel}${parseSteps(p.steps).map((s) => s.label).join('')}` };
  },
  ready: (s) => loadDots('Noto Sans TC', s.want),
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, S = Math.min(W, H), led = p.style === 'led', boardOn = !!p.title;
    const n = Math.round(p.digits) || (led ? 2 : 5), steps = parseSteps(p.steps), st = digitsAt(steps, local, n, led ? '0' : ' ');
    const total = p.totalAt >= 0 && local >= p.totalAt, out = 1 - prog(local, dur - 0.2, dur);
    // sizes: a board is 1020 × 128 units; a display alone is the whole width (vfd 720 × 78, led 272 × 104)
    const bw = Math.min(p.w * S, W * (1 - 2 * theme.safe.side));
    const u = boardOn ? bw / 1020 : led ? bw / 272 : bw / 720;
    const bh = boardOn ? 128 * u : led ? 104 * u : 78 * u;
    const dw = led ? 272 * u : boardOn ? 470 * u : 720 * u, dh = led ? 104 * u : 78 * u;
    const dx = boardOn ? bw - 14 * u - dw : 0, dy = boardOn ? (bh - dh) / 2 : 0;
    const x0 = p.x * W - bw / 2, y0 = p.y >= 0 ? p.y * H : theme.safe.top * H;
    cssCamel(s.box, { left: `${x0}px`, top: `${y0}px`, width: `${bw}px`, height: `${bh}px`, opacity: String(clamp(local / 0.15) * out), fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`,
      borderRadius: `${18 * u}px`, background: boardOn ? `linear-gradient(${p.board}, ${withAlpha('#000000', 0.9)})` : 'none',
      boxShadow: boardOn ? `inset 0 0 0 ${2 * u}px ${withAlpha(p.subColor, 0.25)}, 0 ${6 * u}px ${18 * u}px rgba(0,0,0,.45)` : 'none' });
    s.title.textContent = p.title; s.sub.textContent = p.sub;
    const room = dx - 50 * u;
    cssCamel(s.sub, { display: boardOn && p.sub ? 'block' : 'none', left: `${30 * u}px`, top: `${16 * u}px`, color: p.subColor, fontWeight: '700', fontSize: `${fitPx(p.sub, 27 * u, room)}px`, letterSpacing: `${3 * u}px` });
    cssCamel(s.title, { display: boardOn ? 'block' : 'none', left: `${28 * u}px`, top: `${(p.sub ? 46 : 30) * u}px`, color: p.titleColor, fontWeight: '900', fontSize: `${fitPx(p.title, 60 * u, room)}px`, letterSpacing: `${2 * u}px` });
    // the display, on a canvas the size of its box
    const m = 10 * u, g = canvasAt(s.cv, dw + 2 * m, dh + 2 * m);
    cssCamel(s.cv, { left: `${dx - m}px`, top: `${dy - m}px`, width: `${dw + 2 * m}px`, height: `${dh + 2 * m}px` });
    let ghost = '';
    if (led) {
      g.fillStyle = '#070303'; g.beginPath(); g.roundRect(m, m, dw, dh, 10 * u); g.fill();
      g.strokeStyle = withAlpha(p.led, 0.25); g.lineWidth = 2 * u; g.stroke();
      // three blinks (0.1 s on, 0.1 s off) after every change
      const on = !(st.last && st.since < 0.6 && Math.floor(st.since / 0.1) % 2 === 1) && !(total && local - p.totalAt < 1.2 && Math.floor((local - p.totalAt) / 0.2) % 2 === 1);
      const txt = (st.text ?? '-'.repeat(n)).slice(-n).padStart(n, ' '), dh0 = 84 * u, step = 62 * u, left = m + dw - 30 * u - (n - 1) * step - 50 * u;
      for (let i = 0; i < n; i++) drawSeg(g, txt[i], left + i * step, m + 10 * u, dh0, on ? p.led : null, withAlpha(p.led, 0.12), -0.1);
      let tagText = total ? p.totalLabel : p.label;
      for (const x of steps) if (x.t <= local + 1e-9 && x.label) tagText = x.label;
      s.tag.textContent = tagText;
      cssCamel(s.tag, { display: tagText ? 'flex' : 'none', left: `${dx + 10 * u}px`, top: `${dy}px`, width: `${72 * u}px`, height: `${dh}px`, color: withAlpha(p.led, 0.9),
        fontSize: `${Math.min(26 * u, (dh * 0.9) / Math.max(1, [...tagText].length))}px`, letterSpacing: `${u}px` });
      ghost = txt.trim();
    } else {
      cssCamel(s.tag, { display: 'none' });
      ghost = paintVfd(g, s.off, m, m, dw, dh, u, { steps, local, n, text: st.text, prefix: p.prefix ?? '', label: p.label, totalLabel: p.totalLabel, totalAt: p.totalAt, on: p.vfd, flash: p.flash });
    }
    // the reading for check: transparent words over the glass
    const fs = Math.min(dh * 0.6, (dw * 0.9) / Math.max(1, textEm(ghost)));
    s.ghost.textContent = ghost;
    cssCamel(s.ghost, { left: `${dx + dw * 0.05}px`, top: `${dy + (dh - fs) / 2}px`, width: `${dw * 0.9}px`, fontSize: `${fs}px` });
  },
};
