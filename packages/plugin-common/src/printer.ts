// common.printer — a thermal receipt printer at the bottom of the frame (promoted from the food-receipt short's fx.receipt): every
// line is printed in dot-matrix lettering, the paper feeds out of the slot in stepper-motor jerks and slides up behind whatever sits
// above `clip` (a video window), a black shop bar prints in reverse, the head is worn in streaks; a VFD on the body shows the running
// subtotal. At the end a rubber stamp lands, a red pen strikes a line, the receipt is torn off and laid out whole in the middle.
// Drawn from the item's local time only; the paper and stamp bitmaps are pure caches. Transparent copies of the printed lines ride
// with the paper, so check can measure them.
import { abs, clamp, cssCamel, eBack, eIO3 as eIO, eOut3 as eOut, h, rng, textEm, type ItemType } from '@tellcut/engine';
import { ghostLine } from './text.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { dots, drawDots, loadDots, softCanvas, type Dots } from './dots.ts';
import { paintVfd, parseSteps, digitsAt, type Step } from './digits.ts';

interface P {
  lines: string; adds: string; totalAt: number; stamp: string; stampAt: number; stampLine: number; strikeLine: number; strikeAt: number; tearAt: number;
  display: boolean; prefix: string; label: string; totalLabel: string; model: string; clip: number; slot: number; w: number; wear: boolean;
  font: string; paper: string; ink: string; red: string; vfd: string; body: string;
}
interface Ghost { el: HTMLElement }
interface S { cv: HTMLCanvasElement; off: HTMLCanvasElement; ghosts: HTMLElement; rows: Ghost[]; stampG: HTMLElement; modelG: HTMLElement; key: string; paperC: HTMLCanvasElement | null; stampC: HTMLCanvasElement | null; stampKey: string; bodyC: HTMLCanvasElement | null; bodyKey: string; want: string }

/** how a line of each kind is set: its height, the dot raster (font px, pitch, dot size, round dots, weight) and its motor feed time */
const KIND: Record<string, { h: number; px?: number; pitch?: number; dot?: number; round?: boolean; w?: number; feed: number }> = {
  gap: { h: 34, feed: 0.25 }, title: { h: 100, px: 22, pitch: 3.0, dot: 2.55, round: true, w: 500, feed: 0.4 }, small: { h: 50, px: 18, pitch: 1.85, dot: 1.5, w: 500, feed: 0.3 },
  center: { h: 50, px: 18, pitch: 1.85, dot: 1.5, w: 500, feed: 0.3 }, item: { h: 56, px: 20, pitch: 1.95, dot: 1.6, w: 500, feed: 0.32 },
  shop: { h: 70, px: 20, pitch: 1.95, dot: 1.6, w: 700, feed: 0.4 }, rule: { h: 30, feed: 0.16 }, dbl: { h: 34, feed: 0.18 },
  sign: { h: 160, px: 18, pitch: 1.85, dot: 1.5, w: 500, feed: 0.45 }, total: { h: 108, px: 22, pitch: 3.0, dot: 2.55, round: true, w: 500, feed: 0.6 },
  note: { h: 42, px: 17, pitch: 1.7, dot: 1.4, w: 500, feed: 0.26 }, thanks: { h: 58, px: 20, pitch: 1.95, dot: 1.6, w: 700, feed: 0.32 },
  stamp: { h: 150, feed: 0.45 },
};
const TOP = 30, PAD = 40;

export interface PLine { t: number; kind: string; text: string; amt: string; y: number; h: number }
/** "秒|樣式|文字|金額" a line (樣式 title small center item shop rule dbl total note thanks sign gap), laid out down the paper.
 *  `stampRoom`: with no sign line, a blank strip for the stamp is fed right under the total, so the stamp never covers it. */
export function printerLines(text: string, stampRoom = false): { lines: PLine[]; len: number } {
  const lines: PLine[] = [];
  for (const l of String(text ?? '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    const [t, kind = 'item', tx = '', amt = ''] = l.split('|').map((x) => x.trim());
    const k = KIND[kind] && kind !== 'stamp' ? kind : 'item';
    lines.push({ t: Number(t) || 0, kind: k, text: tx, amt, y: 0, h: KIND[k].h });
  }
  const ti = lines.findIndex((l) => l.kind === 'total');
  if (stampRoom && ti >= 0 && !lines.some((l) => l.kind === 'sign')) lines.splice(ti + 1, 0, { t: lines[ti].t, kind: 'stamp', text: '', amt: '', y: 0, h: KIND.stamp.h });
  let y = TOP;
  for (const l of lines) { l.y = y; y += l.h; }
  return { lines, len: y };
}

/** line i as written in `lines` (the strip left for the stamp is not counted) */
export const userLine = (lines: PLine[], i: number): PLine | undefined => (i >= 0 ? lines.filter((l) => l.kind !== 'stamp')[i] : undefined);

/** where the stamp lands: line `stampLine`, else the signature line, else the strip left under the total (null: nowhere) */
export function stampSpot(lines: PLine[], stampLine: number): { line: PLine; y: number } | null {
  const l = stampLine >= 0 ? userLine(lines, stampLine) : lines.find((x) => x.kind === 'sign') ?? lines.find((x) => x.kind === 'stamp');
  return l ? { line: l, y: l.y + l.h * (l.kind === 'stamp' ? 0.5 : 0.56) } : null;
}

/** the number on the total line ("NT$355起" → 355), or null */
export const totalNumber = (lines: PLine[]) => { const m = /\d[\d,]*(\.\d+)?/.exec(lines.find((l) => l.kind === 'total')?.amt ?? ''); return m ? Number(m[0].replace(/,/g, '')) : null; };

/** a stepper motor: n quick moves with a pause after each */
export const stair = (p: number, n = 5) => { p = clamp(p); if (p >= 1) return 1; const s = p * n, k = Math.floor(s), q = clamp((s - k) * 1.7); return (k + q * q * (3 - 2 * q)) / n; };
/** how much paper (units) has come out of the slot at `t` */
export const fedAt = (lines: PLine[], t: number) => lines.reduce((F, l) => F + l.h * stair((t - l.t) / KIND[l.kind].feed), TOP);

/** the VFD steps: the given ones, or one "+amount" for every item whose amount is a number (0.2 s after it prints); from `totalAt`
 *  the display settles on the total line's own number, so the receipt and the display agree at the end */
export function printerAdds(adds: string, lines: PLine[], totalAt = -1): Step[] {
  const n = totalNumber(lines), end: Step[] = totalAt >= 0 && n !== null ? [{ t: totalAt, v: String(n), add: false, n, label: '' }] : [];
  return [...addSteps(adds, lines), ...end].sort((a, b) => a.t - b.t);
}
function addSteps(adds: string, lines: PLine[]): Step[] {
  if (String(adds ?? '').trim()) return parseSteps(adds);
  return parseSteps(lines.filter((l) => l.kind === 'item' && /^\d+(\.\d+)?$/.test(l.amt.replace(/,/g, ''))).map((l) => `${+(l.t + 0.2).toFixed(3)}|+${l.amt.replace(/,/g, '')}`).join(','));
}

/** the whole printed paper as one bitmap, in units (paper colour, fibres, ink with head wear, torn top and bottom) */
function renderPaper(L: { lines: PLine[]; len: number }, PW: number, p: P): HTMLCanvasElement {
  const len = Math.ceil(L.len), ink = softCanvas(PW, len), gi = ink.getContext('2d')!;
  const D = (s: string, kd: (typeof KIND)[string]) => dots(s, kd.px!, kd.w, p.font);
  const centre = (d: Dots, pitch: number) => (PW - d.w * pitch) / 2;
  for (const [n, l] of L.lines.entries()) {
    const k = KIND[l.kind], shade = 0.86 + 0.14 * (((n * 7919 + l.text.length * 31) % 100) / 100);
    gi.globalAlpha = shade;
    if (l.kind === 'rule' || l.kind === 'dbl') {
      gi.fillStyle = p.ink;
      for (const ry of l.kind === 'dbl' ? [l.y + 11, l.y + 19] : [l.y + 14]) for (let x = PAD - 8; x < PW - PAD + 8; x += 14) gi.fillRect(x, ry, 8, 3);
      continue;
    }
    if (!l.text || !k.px) continue;
    const d = D(l.text, k), th = d.h * k.pitch!, ty = l.y + (l.h - th) / 2 + 2;
    if (l.kind === 'sign') {
      drawDots(gi, d, PAD, l.y + 10, k.pitch!, k.dot!, p.ink);
      gi.fillStyle = p.ink; for (let x = PAD + 150; x < PW - PAD; x += 9) gi.fillRect(x, l.y + l.h - 26, 4, 2);
      continue;
    }
    if (l.kind === 'shop') {   // a black bar, the shop's name in reverse
      gi.fillStyle = p.ink; gi.fillRect(PAD - 10, l.y + 9, PW - 2 * PAD + 20, l.h - 18);
      drawDots(gi, d, PAD + 6, ty, k.pitch!, k.dot!, p.paper);
      if (l.amt) { const A = D(l.amt, k); drawDots(gi, A, PW - PAD - 6 - A.w * k.pitch!, ty, k.pitch!, k.dot!, p.paper); }
      continue;
    }
    if (l.kind === 'title' || l.kind === 'thanks' || l.kind === 'center') { drawDots(gi, d, centre(d, k.pitch!), ty, k.pitch!, k.dot!, p.ink, k.round); continue; }
    // left text, a dotted leader, the amount on the right
    drawDots(gi, d, PAD, ty, k.pitch!, k.dot!, p.ink, k.round);
    if (l.amt) {
      const A = D(l.amt, k), ax = PW - PAD - A.w * k.pitch!;
      drawDots(gi, A, ax, ty, k.pitch!, k.dot!, p.ink, k.round);
      if (l.kind === 'item') {
        gi.globalAlpha = shade * 0.5; gi.fillStyle = p.ink;
        for (let x = PAD + d.w * k.pitch! + 14; x < ax - 12; x += 10) gi.fillRect(x, ty + th * 0.72, 3, 3);
      }
    }
  }
  gi.globalAlpha = 1;
  if (p.wear) {   // a worn print head: a lighter column down the paper
    gi.globalCompositeOperation = 'destination-out';
    const wear = gi.createLinearGradient(0, 0, PW, 0);
    wear.addColorStop(0, 'rgba(0,0,0,0)'); wear.addColorStop(0.58, 'rgba(0,0,0,0)'); wear.addColorStop(0.64, 'rgba(0,0,0,0.1)'); wear.addColorStop(0.7, 'rgba(0,0,0,0)'); wear.addColorStop(1, 'rgba(0,0,0,0.08)');
    gi.fillStyle = wear; gi.fillRect(0, 0, PW, len);
    for (let y = 0; y < len; y += 9 * 2) { gi.fillStyle = 'rgba(0,0,0,0.12)'; gi.fillRect(0, y, PW, 1.4); }
    gi.globalCompositeOperation = 'source-over';
  }
  const c = softCanvas(PW, len), g = c.getContext('2d')!;
  // torn edges: zigzag top and bottom
  const tooth = 14, amp = 7;
  g.beginPath(); g.moveTo(0, amp);
  for (let x = 0; x <= PW; x += tooth) g.lineTo(x, (x / tooth) % 2 ? 0 : amp);
  g.lineTo(PW, len - amp);
  for (let x = PW; x >= 0; x -= tooth) g.lineTo(x, (x / tooth) % 2 ? len : len - amp);
  g.closePath(); g.save(); g.clip();
  g.fillStyle = p.paper; g.fillRect(0, 0, PW, len);
  const r = rng(16);
  for (let n = 0; n < (PW * len) / 200; n++) { g.fillStyle = `rgba(90,80,70,${0.025 + r() * 0.04})`; g.fillRect(r() * PW, r() * len, 1 + r() * 2, 1); }
  for (let y = 0; y < len; y += 5 + Math.floor(r() * 6)) { g.fillStyle = 'rgba(120,110,95,0.025)'; g.fillRect(0, y, PW, 1); }
  const edge = g.createLinearGradient(0, 0, PW, 0);
  edge.addColorStop(0, 'rgba(70,60,45,0.12)'); edge.addColorStop(0.06, 'rgba(70,60,45,0)'); edge.addColorStop(0.94, 'rgba(70,60,45,0)'); edge.addColorStop(1, 'rgba(70,60,45,0.14)');
  g.fillStyle = edge; g.fillRect(0, 0, PW, len);
  g.globalCompositeOperation = 'multiply'; g.drawImage(ink, 0, 0); g.globalCompositeOperation = 'source-over';
  g.restore();
  return c;
}

/** a rubber stamp with ink gaps */
function renderStamp(text: string, color: string): HTMLCanvasElement {
  const px = 74, pad = 26, m = softCanvas(4, 4).getContext('2d')!, font = `900 ${px}px 'Noto Serif TC', serif`;
  m.font = font;
  const w = Math.ceil(m.measureText(text).width) + pad * 2 + 20, hh = px + pad * 2 + 14, c = softCanvas(w, hh), g = c.getContext('2d')!;
  g.strokeStyle = color; g.fillStyle = color;
  g.lineWidth = 9; g.beginPath(); g.roundRect(6, 6, w - 12, hh - 12, 18); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.roundRect(17, 17, w - 34, hh - 34, 11); g.stroke();
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, hh / 2 + 4);
  g.globalCompositeOperation = 'destination-out';
  const r = rng(text.length * 977 + 13);
  for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`; const s = 1 + r() * 3.2; g.fillRect(r() * w, r() * hh, s, s * (0.6 + r())); }
  for (let n = 0; n < 7; n++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(r() * w, r() * hh, 6 + r() * 18, 2 + r() * 5, r() * 3, 0, Math.PI * 2); g.fill(); }
  return c;
}

/** the printer body (920 × 560 units) without the display content: slot and tear bar at `slotY` units from its top */
function renderBody(PW: number, slotY: number, vfdY: number, p: P): HTMLCanvasElement {
  const BW = 920, BH = 560, c = softCanvas(BW + 40, BH + 60), g = c.getContext('2d')!, ox = 20, oy = 10;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40; g.shadowOffsetY = -6;
  const body = g.createLinearGradient(0, oy, 0, oy + BH);
  body.addColorStop(0, '#3a4048'); body.addColorStop(0.08, p.body); body.addColorStop(1, '#16191c');
  g.fillStyle = body; g.beginPath(); g.roundRect(ox, oy, BW, BH, 34); g.fill(); g.restore();
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.roundRect(ox + 14, oy + 4, BW - 28, 6, 3); g.fill();
  const sx = ox + (BW - PW) / 2 - 26, sw = PW + 52, sy = oy + slotY;
  g.fillStyle = '#07080a'; g.beginPath(); g.roundRect(sx, sy - 6, sw, 13, 5); g.fill();
  g.fillStyle = '#8b939c'; g.beginPath(); g.moveTo(sx + 6, sy - 6);
  for (let x = sx + 6; x <= sx + sw - 6; x += 10) { g.lineTo(x + 5, sy - 12); g.lineTo(x + 10, sy - 6); }
  g.closePath(); g.fill();
  // buttons and the embossed model name (below the display: decoration under the platform's own buttons)
  const by = oy + vfdY + 78 + 70;
  [['#c0392b', '#ff6b5e'], ['#3d4a55', '#6c7a86'], ['#3d4a55', '#6c7a86']].forEach(([col, hi], n) => {
    const cx = ox + 200 + n * 110;
    g.fillStyle = '#0b0d0f'; g.beginPath(); g.arc(cx, by, 32, 0, Math.PI * 2); g.fill();
    const bg = g.createRadialGradient(cx - 8, by - 10, 4, cx, by, 28); bg.addColorStop(0, hi); bg.addColorStop(1, col);
    g.fillStyle = bg; g.beginPath(); g.arc(cx, by, 26, 0, Math.PI * 2); g.fill();
  });
  if (p.model) {
    g.font = `900 34px '${p.font}', 'Noto Sans TC', sans-serif`; g.textAlign = 'right';
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillText(p.model, ox + BW - 70, by + 12);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(p.model, ox + BW - 70, by + 14);
  }
  return c;
}

export const printer: ItemType<P, S> = {
  type: 'common.printer', label: '收據機', category: 'card', kind: 'overlay',
  doc: '熱感應收據機（畫面下方）：每行「秒|樣式|文字|金額」用點陣字印出來、步進馬達一頓一頓送紙，紙往上長、鑽到 clip 以上（影片窗）後面；shop 是黑底反白店名條、印字頭有磨損條紋；機身 VFD 小計自動往上跳、閃「+40」；最後蓋章、紅筆劃掉一行、tearAt 撕下整條收據攤開在畫面中央；美食記帳、一路吃一路算、購物清單',
  params: [
    { key: 'lines', label: '收據行（每行：秒|樣式|文字|金額；樣式 title small center item shop rule dbl total note thanks sign gap）', type: 'text',
      default: '0|title|這一圈花多少？\n0.35|center|中壢站前・徒步小吃\n0.6|shop|01 阿桃的店\n0.95|item|招牌大湯圓|95\n1.3|item|湯粄條|60\n1.65|dbl\n1.8|total|合計|NT$155' },
    { key: 'adds', label: '小計變化（秒|+數值|閃出的字，逗號分隔；空＝每個數字金額自動加上去）', type: 'text', default: '' },
    { key: 'totalAt', label: '顯示器換成合計的時間（秒；-1＝印出 total 那行時）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'stamp', label: '印章字（空＝不蓋）', type: 'string', default: '吃飽了' },
    { key: 'stampAt', label: '蓋章時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 2.3 },
    { key: 'stampLine', label: '蓋在第幾行（0 起；-1＝簽章 sign 那行，沒有就蓋在合計下面留的空白）', type: 'number', min: -1, max: 200, step: 1, default: -1 },
    { key: 'strikeLine', label: '紅筆劃掉第幾行（0 起；-1＝不劃）', type: 'number', min: -1, max: 200, step: 1, default: -1 },
    { key: 'strikeAt', label: '劃線時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 0 },
    { key: 'tearAt', label: '撕下攤開的時間（秒；-1＝不撕）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'display', label: '機身 VFD 小計', type: 'bool', default: true },
    { key: 'prefix', label: '小計數字前的字', type: 'string', default: 'NT$' },
    { key: 'label', label: '小計的點陣小標', type: 'string', default: '小計' },
    { key: 'totalLabel', label: '合計的點陣小標', type: 'string', default: '合計' },
    { key: 'model', label: '機身上的型號（空＝沒有）', type: 'string', default: 'TP-16 THERMAL' },
    { key: 'clip', label: '紙鑽進去的高度（畫面高比例，例如影片窗下緣；-1＝安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'slot', label: '出紙口高度（畫面高比例；-1＝顯示器貼齊下方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '紙寬（畫面短邊的比例）', type: 'number', min: 0.3, max: 0.85, step: 0.005, default: 0.685 },
    { key: 'wear', label: '印字頭磨損條紋', type: 'bool', default: true },
    { key: 'font', label: '點陣字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '紙色', type: 'color', default: '#f5f2ea' },
    { key: 'ink', label: '墨色', type: 'color', default: '#262422', theme: 'palette.ink' },
    { key: 'red', label: '印章與紅筆', type: 'color', default: '#d4213a', theme: 'palette.accent' },
    { key: 'vfd', label: '顯示器的顏色', type: 'color', default: '#8dffd9' },
    { key: 'body', label: '機身顏色', type: 'color', default: '#2c3137' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), ghosts = h('div', null, null, ctx.root), p = ctx.params;
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(ghosts, { position: 'absolute', transformOrigin: '50% 50%', color: 'transparent' });
    return { cv, off: softCanvas(4, 4), ghosts, rows: [], stampG: abs(ghosts), modelG: abs(ctx.root), key: '', paperC: null, stampC: null, stampKey: '', bodyC: null, bodyKey: '',
      want: `${p.lines}${p.label}${p.totalLabel}${p.adds}+0123456789${p.model}` };
  },
  async ready(s) {
    await loadDots('Noto Sans TC', s.want, [500, 700, 900]);
    if (typeof document !== 'undefined' && document.fonts) await document.fonts.load("900 74px 'Noto Serif TC'", '章').catch(() => []);
  },
  hide(s) { freeCanvas(s.cv); s.paperC = s.bodyC = s.stampC = null; s.key = s.bodyKey = s.stampKey = ''; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t } = ctx, k = Math.min(W, H) / 1080, CW = W / k, CH = H / k;
    const PW = Math.round(p.w * 1080), PX = (CW - PW) / 2;
    const L = printerLines(p.lines, !!p.stamp && p.stampLine < 0), fontOk = typeof document === 'undefined' || !document.fonts || document.fonts.check(`700 20px '${p.font}'`, L.lines.map((l) => l.text).join('') || 'A');
    const key = JSON.stringify([p.lines, !!p.stamp && p.stampLine < 0, PW, p.font, p.paper, p.ink, p.wear, fontOk]);
    if (s.key !== key) {
      s.key = key; s.paperC = renderPaper(L, PW, p);
      for (const r of s.rows) r.el.remove();
      s.rows = L.lines.map((l) => {
        const el = h('div', null, null, s.ghosts), kd = KIND[l.kind];
        el.textContent = l.text + (l.amt ? `  ${l.amt}` : '');
        cssCamel(el, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700', fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`,
          display: kd.px && l.text ? 'block' : 'none', textAlign: l.kind === 'title' || l.kind === 'center' || l.kind === 'thanks' ? 'center' : 'left' });
        return { el };
      });
    }
    // where things are, in 1080-wide units: the display rests on the bottom safe line, the slot 103 units above it
    const slotY = p.slot >= 0 ? p.slot * CH : (1 - theme.safe.bottom) * CH - 103, clipY = p.clip >= 0 ? p.clip * CH : theme.safe.top * CH;
    const BX = (CW - 920) / 2, BY = slotY - 17, VY = slotY + 21;
    const bodyKey = JSON.stringify([PW, p.body, p.model, p.font, fontOk]);
    if (s.bodyKey !== bodyKey) { s.bodyKey = bodyKey; s.bodyC = renderBody(PW, 17, 38, p); }
    const stampKey = `${p.stamp}|${p.red}`;
    if (s.stampKey !== stampKey) { s.stampKey = stampKey; s.stampC = p.stamp ? renderStamp(p.stamp, p.red) : null; }
    const g = canvasAt(s.cv, W, H);
    g.setTransform(k, 0, 0, k, 0, 0);

    const F = fedAt(L.lines, t), torn = p.tearAt >= 0 && t >= p.tearAt, rt = torn ? t - p.tearAt : 0;
    const dyPrn = torn ? 620 * eIO(clamp((rt - 0.2) / 0.85)) : 0, len = L.len;
    // the paper: out of the slot; once torn, a jerk and a glide to the middle of the safe area, scaled to fit between its lines
    let cx = PX + PW / 2, cy = slotY - F + len / 2, sc = 1, rot = 0;
    if (torn) {
      const top = theme.safe.top * CH, room = (1 - theme.safe.bottom) * CH - top, fit = Math.min(1, room / len), jerk = eBack(clamp(rt / 0.25), 1.9) * 28, glide = eIO(clamp((rt - 0.32) / 1.05));
      const cy0 = slotY - len / 2 - jerk;
      cy = cy0 + (top + room / 2 - cy0) * glide;   // laid out in the middle of the safe area
      sc = 1 + (fit - 1) * glide;
      rot = (-1.4 * clamp(rt / 0.25) - 0.9 * glide) * Math.PI / 180;
    }
    const clipTop = torn ? -1e4 : clipY;
    g.save();
    g.beginPath(); g.rect(0, clipTop, CW, (torn ? CH + 1e4 : slotY - clipY)); g.clip();
    g.translate(cx, cy); g.rotate(rot); g.scale(sc, sc); g.translate(-PW / 2, -len / 2);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 26; g.shadowOffsetY = 12; g.drawImage(s.paperC!, 0, 0); g.restore();
    if (!torn) {   // where it comes out of the printer the paper is still curved and in shadow
      const sh = g.createLinearGradient(0, F - 46, 0, F);
      sh.addColorStop(0, 'rgba(30,25,20,0)'); sh.addColorStop(1, 'rgba(30,25,20,0.22)');
      g.fillStyle = sh; g.fillRect(0, F - 46, PW, 46);
    }
    // the red pen strike
    const sl = userLine(L.lines, p.strikeLine);
    if (p.strikeLine >= 0 && sl && t >= p.strikeAt && sl.text) {
      const kd = KIND[sl.kind], d = kd.px ? dots(sl.text, kd.px, kd.w, p.font) : null, q = eOut(clamp((t - p.strikeAt) / 0.35));
      const x0 = PAD - 10, x1 = PAD + (d ? d.w * kd.pitch! : PW - 2 * PAD) + 12, y = sl.y + sl.h / 2 + 2;
      g.strokeStyle = p.red; g.lineWidth = 6; g.lineCap = 'round'; g.globalAlpha = 0.88;
      g.beginPath(); g.moveTo(x0, y + 3); g.lineTo(x0 + (x1 - x0) * q, y - 3); g.stroke(); g.globalAlpha = 1;
    }
    // the rubber stamp
    const spot = stampSpot(L.lines, p.stampLine);
    if (s.stampC && spot && t >= p.stampAt) {
      const q = (t - p.stampAt) / 0.2, z = 1 + 0.9 * (1 - eOut(clamp(q)));
      g.save(); g.translate(PW / 2 + 60, spot.y); g.rotate(-9 * Math.PI / 180); g.scale(z, z);
      g.globalAlpha = clamp(q * 2) * 0.9; g.globalCompositeOperation = 'multiply';
      g.drawImage(s.stampC, -s.stampC.width / 2, -s.stampC.height / 2); g.restore();
    }
    g.restore();

    // the body and its display
    if (dyPrn < 700) {
      g.save(); g.translate(0, dyPrn);
      g.drawImage(s.bodyC!, BX - 20, BY - 10);
      if (p.display) {
        const totalAt = p.totalAt >= 0 ? p.totalAt : (() => { const tl = L.lines.find((l) => l.kind === 'total'); return tl ? tl.t + 0.3 : -1; })(), steps = printerAdds(p.adds, L.lines, totalAt);
        const st = digitsAt(steps, t, 5, ' ');
        paintVfd(g, s.off, (CW - 720) / 2, VY, 720, 78, 1, { steps, local: t, n: 5, text: st.text, prefix: p.prefix, label: p.label, totalLabel: p.totalLabel, totalAt, on: p.vfd, flash: '#ffe28a' });
      }
      g.restore();
    }

    // the printed lines for check: transparent copies moving with the paper (hidden behind the clip and before they print)
    cssCamel(s.ghosts, { left: `${(cx - PW / 2) * k}px`, top: `${(cy - len / 2) * k}px`, width: `${PW * k}px`, height: `${len * k}px`, transform: `rotate(${rot}rad) scale(${sc})` });
    L.lines.forEach((l, i) => {
      const r = s.rows[i], kd = KIND[l.kind];
      if (!r || !kd.px || !l.text) return;
      const fs = kd.px * kd.pitch!, yScreen = cy - len / 2 + l.y + l.h / 2, out = !torn && (yScreen - fs / 2 < clipY || yScreen + fs / 2 > slotY);
      const fsFit = Math.min(fs, (PW - 2 * PAD) / Math.max(1, textEm(r.el.textContent ?? '')));
      cssCamel(r.el, { display: t >= l.t && !out ? 'block' : 'none', left: `${PAD * k}px`, width: `${(PW - 2 * PAD) * k}px`, top: `${(l.y + (l.h - fsFit) / 2) * k}px`, fontSize: `${fsFit * k}px` });
    });
    // the stamp, on the paper (behind the clip like the lines), and the model name embossed on the body
    const sq = (t - p.stampAt) / 0.2, sy = spot ? cy - len / 2 + spot.y : 0;
    ghostLine(s.stampG, s.stampC && spot && t >= p.stampAt && (torn || (sy > clipY && sy < slotY)) ? { text: p.stamp, x: (PW / 2 + 60) * k, y: (spot.y + 4) * k, size: 74 * k, family: "'Noto Serif TC', serif",
      weight: 900, align: 'center', base: 'middle', alpha: clamp(sq * 2) * 0.9, turn: `rotate(-9deg) scale(${(1 + 0.9 * (1 - eOut(clamp(sq)))).toFixed(4)})` } : null);
    ghostLine(s.modelG, p.model && dyPrn < 700 ? { text: p.model, x: (BX + 850) * k, y: (BY + 199 + dyPrn) * k, size: 34 * k, family: `'${p.font}', 'Noto Sans TC', sans-serif`, weight: 900, align: 'right' } : null);
  },
};
