// common.digits — a number display: a green VFD till display (5×7 dots: a running subtotal that counts up, "+40" flashing over it,
// the total blinking) or a red seven-segment LED (a queue number that blinks three times when it changes, a side tag 叫號／下一位).
// With a title it becomes a board: a shop name and a small line on the left, the display on the right.
// From the food-receipt short's VFD subtotal and the food-deep short's queue-number board.
import { abs, clamp, cssCamel, eSmooth, type ItemType, prog, textEm } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
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
export function parseDigitSteps(text: string): Step[] {
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

/** how many digits the display shows: `digits` when set; else the VFD's 5, and for the LED 2 or its longest value, whichever is more
 *  (a set value or a running sum: 128 on a 2-digit LED showed 28) */
export function digitsWanted(steps: Step[], digits: number, led: boolean): number {
  const n = Math.round(digits);
  if (n || !led) return n || 5;
  let most = 2, base = 0;
  for (const s of steps) {
    if (!s.add) { base = s.n ?? 0; most = Math.max(most, [...s.v].length); } else if (s.n !== null) { base += s.n; most = Math.max(most, String(Math.round(base)).length); }
  }
  return most;
}
/** the LED's width in its own units: 272 holds two digits, each one more 62 */
export const ledUnits = (n: number) => 272 + Math.max(0, n - 2) * 62;

/** Chinese, Japanese or Korean (and their full-width punctuation) in a VFD's small words */
export const hasCjk = (text: string) => /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/.test(text);

/** The matrix of a VFD's small words: `px` font pixels (one per dot), `pitch` px a dot, dots `dot` px. A many-stroke character
 *  (數, 餐) is mush at 13 dots, so words with CJK in them get a finer matrix, as a graphic VFD module has: about 1.5 times the
 *  dots at 0.65 times the pitch, the same size as before (a board has no room for wider words). Latin keeps the grid it always had. */
export function vfdMatrix(text: string, px: number, pitch: number, dot: number): { px: number; pitch: number; dot: number } {
  if (!hasCjk(text)) return { px, pitch, dot };
  const fine = Math.round(px * 20 / 13), p = pitch * px / fine;
  return { px: fine, pitch: p, dot: dot * p / pitch };
}

/** small words drawn as dots at (x, middle of the glass − its own half height + `dy`), the matrix chosen by vfdMatrix */
function vfdWords(v: CanvasRenderingContext2D, text: string, x: number, dh: number, dy: number, k: number, px: number, pitch: number, dot: number, color: string) {
  const m = vfdMatrix(text, px, pitch * k, dot * k), D = dots(text, m.px);
  drawDots(v, D, x, (dh - D.h * m.pitch) / 2 + dy, m.pitch, m.dot, color);
}
/** how wide vfdWords draws `text` */
const vfdWordsW = (text: string, k: number, px: number, pitch: number, dot: number) => {
  const m = vfdMatrix(text, px, pitch * k, dot * k);
  return dots(text, m.px).w * m.pitch;
};

/** Where the flash goes, between the small label (ending at `lo`) and the digits (from `hi`): at `x0` as it always was when that
 *  is clear of both, else centred in the gap; a board's narrow glass has no gap, so the flash takes the label's place (`over`),
 *  shrunk (`sc`) if even that is too narrow. */
export function flashSpot(x0: number, fw: number, left: number, lo: number, hi: number): { x: number; sc: number; over: boolean } {
  if (x0 >= lo && x0 + fw <= hi) return { x: x0, sc: 1, over: false };
  if (hi - lo >= fw) return { x: lo + (hi - lo - fw) / 2, sc: 1, over: false };
  return { x: left, sc: Math.min(1, Math.max(0, hi - left) / fw), over: true };
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
  const pre = o.prefix, body = o.text === null ? (Math.floor(local / 0.4) % 2 ? '-'.repeat(Math.min(4, n)).padStart(n, ' ') : ' '.repeat(n)) : o.text.slice(-n).padStart(n, ' ');
  const blinkOff = total && local - o.totalAt < 1.2 && Math.floor((local - o.totalAt) / 0.2) % 2 === 1;
  // the latest step's small words, for 1.1 s in the gap between the label and the digits, rising a little
  const last = [...steps].reverse().find((x) => local >= x.t && local < x.t + 1.1 && (x.label || x.add));
  const flash = last ? last.label || last.v : '';
  const spot = flash ? flashSpot(168 * k * (dw / dh / (720 / 78)), vfdWordsW(flash, k, 12, 3.2, 2.6), 22 * k,
    22 * k + (lab ? vfdWordsW(lab, k, 13, 3.1, 2.5) + 8 * k : 0), dw - 22 * k - (pre + body).length * 42 * k + 7 * k - 8 * k) : null;
  const q = last ? (local - last.t) / 1.1 : 0, a = clamp(q < 0.15 ? q / 0.15 : q > 0.75 ? (1 - q) / 0.25 : 1), r = clamp(q * 3);
  if (lab) {
    // a flash over the label fades it out and back in
    v.globalAlpha = spot?.over ? 1 - a : 1;
    vfdWords(v, lab, 22 * k, dh, 2 * k, k, 13, 3.1, 2.5, o.on);
    v.globalAlpha = 1;
  }
  vfdText(v, pre + body, dw - 22 * k, (dh - 49 * k) / 2, 7 * k, 5.2 * k, blinkOff ? withAlpha(o.on, 0.25) : o.on, 'rgba(40,130,105,0.13)');
  if (last && spot) {
    v.globalAlpha = a;
    vfdWords(v, flash, spot.x, dh, 2 * k - 6 * k * r * (2 - r), k * spot.sc, 12, 3.2, 2.6, o.flash);
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
    return { box, cv: cv as HTMLCanvasElement, off: softCanvas(4, 4), title, sub, tag, ghost, want: `${p.label}${p.totalLabel}${p.prefix ?? ''}${parseDigitSteps(p.steps).map((s) => s.label + s.v).join('')}` };
  },
  ready: (s) => loadDots('Noto Sans TC', s.want),
  hide(s) { freeCanvas(s.cv, s.off); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, S = Math.min(W, H), led = p.style === 'led', boardOn = !!p.title;
    const steps = parseDigitSteps(p.steps), n = digitsWanted(steps, p.digits, led), st = digitsAt(steps, local, n, led ? '0' : ' ');
    const total = p.totalAt >= 0 && local >= p.totalAt, out = 1 - prog(local, dur - 0.2, dur);
    // sizes: a board is 1020 × 128 units; a display alone is the whole width (vfd 720 × 78, led 272 × 104 for two digits, 62 more
    // for each digit after them: the digits sit right-aligned and would otherwise run into the tag on the left)
    const bw = Math.min(p.w * S, W * (1 - 2 * theme.safe.side));
    const lu = ledUnits(n), u = boardOn ? bw / 1020 : led ? bw / lu : bw / 720;
    const bh = boardOn ? 128 * u : led ? 104 * u : 78 * u;
    const dw = led ? lu * u : boardOn ? 470 * u : 720 * u, dh = led ? 104 * u : 78 * u;
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
