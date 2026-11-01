// common.printer — a thermal receipt printer at the bottom of the frame (promoted from the food-receipt short's fx.receipt): every
// line is printed in dot-matrix lettering, the paper feeds out of the slot in stepper-motor jerks and slides up behind whatever sits
// above `clip` (a video window), a black shop bar prints in reverse, the head is worn in streaks; a VFD on the body shows the running
// subtotal. At the end a rubber stamp lands, a red pen strikes a line, the receipt is torn off and laid out whole in the middle.
// The look is a real POS printer on a counter (2026-11-01): cool thermal paper with grain, fibres, a serrated tear and a curl, the
// print dark grey with the head's density streaks; a satin body with a top face the paper rises from, a metal tear bar, a VFD behind
// smoked glass, a power LED and a feed key; under the video window (`clip`) a lit countertop (`surface`).
// Drawn from the item's local time only; the paper, its shadow, the body, the counter and the stamp bitmaps are pure caches.
// Transparent copies of the printed lines ride with the paper, so check can measure them.
import { abs, clamp, cssCamel, eBack, eIO3 as eIO, eOut3 as eOut, h, rng, textEm, type ItemType } from '@tellcut/engine';
import { ghostLine } from './text.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { dots, drawDots, loadDots, softCanvas, type Dots } from './dots.ts';
import { paintVfd, parseSteps, digitsAt, type Step } from './digits.ts';
import { shade } from './color.ts';

interface P {
  lines: string; adds: string; totalAt: number; stamp: string; stampAt: number; stampLine: number; strikeLine: number; strikeAt: number; tearAt: number;
  display: boolean; prefix: string; label: string; totalLabel: string; model: string; clip: number; slot: number; w: number; size: number; wear: boolean;
  font: string; paper: string; ink: string; red: string; vfd: string; body: string; surface: string; table: string;
}
interface Ghost { el: HTMLElement }
interface S {
  cv: HTMLCanvasElement; off: HTMLCanvasElement; ghosts: HTMLElement; rows: Ghost[]; stampG: HTMLElement; modelG: HTMLElement; key: string; want: string;
  paperC: HTMLCanvasElement | null; shadowC: HTMLCanvasElement | null; stampC: HTMLCanvasElement | null; stampKey: string;
  bodyC: HTMLCanvasElement | null; barC: HTMLCanvasElement | null; glassC: HTMLCanvasElement | null; bodyKey: string; counterC: HTMLCanvasElement | null; counterKey: string;
}

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
/** the body, in units from the slot line: a top face TOPF above it, the front BODYH below, the VFD window VFD_Y down, the controls
 *  row at CTRL_Y; by default the slot sits SLOT_UP above the bottom safe line, so the VFD's recess rests on it */
const BW = 920, TOPF = 46, BODYH = 640, BPAD = 70, VFD_W = 720, VFD_H = 78, VFD_Y = 44, CTRL_Y = 200, SLOT_UP = 134;
/** the shadow round the paper bitmap, in units */
const SP = 48;

/** a kind of line with its lettering `z` times as big: the dots (pitch and dot) and the line's height grow, the raster stays */
export function kindAt(kind: string, z = 1): (typeof KIND)[string] {
  const k = KIND[kind];
  return z === 1 || !k.px ? k : { ...k, h: k.h * z, pitch: k.pitch! * z, dot: k.dot! * z };
}

export interface PLine { t: number; kind: string; text: string; amt: string; y: number; h: number }
/** "秒|樣式|文字|金額" a line (樣式 title small center item shop rule dbl total note thanks sign gap), laid out down the paper.
 *  `stampRoom`: with no sign line, a blank strip for the stamp is fed right under the total, so the stamp never covers it.
 *  `z`: the lettering's size (1 = as printed before; the lines get taller with it). */
export function printerLines(text: string, stampRoom = false, z = 1): { lines: PLine[]; len: number } {
  const lines: PLine[] = [];
  for (const l of String(text ?? '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    const [t, kind = 'item', tx = '', amt = ''] = l.split('|').map((x) => x.trim());
    const k = KIND[kind] && kind !== 'stamp' ? kind : 'item';
    lines.push({ t: Number(t) || 0, kind: k, text: tx, amt, y: 0, h: kindAt(k, z).h });
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
    const k = kindAt(l.kind, p.size ?? 1), shade = 0.86 + 0.14 * (((n * 7919 + l.text.length * 31) % 100) / 100);
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
      gi.fillStyle = p.ink; for (let x = PAD + 150 * (p.size ?? 1); x < PW - PAD; x += 9) gi.fillRect(x, l.y + l.h - 26, 4, 2);
      continue;
    }
    if (l.kind === 'shop') {   // a black bar, the shop's name in reverse
      gi.fillStyle = p.ink; gi.fillRect(PAD - 10, l.y + 9, PW - 2 * PAD + 20, l.h - 18);
      gi.globalCompositeOperation = 'destination-out';   // the letters are where the head left the paper unheated
      gi.globalAlpha = 1; drawDots(gi, d, PAD + 6, ty, k.pitch!, k.pitch! + 0.2, '#000');   // whole cells: no ink grid left inside the letters
      if (l.amt) { const A = D(l.amt, k); drawDots(gi, A, PW - PAD - 6 - A.w * k.pitch!, ty, k.pitch!, k.pitch! + 0.2, '#000'); }
      gi.globalCompositeOperation = 'source-over';
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
  // thermal print is never even: the head's heating elements leave faint columns, the coating takes less heat in specks
  const r = rng(16);
  gi.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < PW; x += 2) {
    const a = 0.03 + 0.1 * (0.5 + 0.5 * Math.sin(x * 0.031 + 1.3) * Math.sin(x * 0.0071 + 0.4)) + r() * 0.05;
    gi.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`; gi.fillRect(x, 0, 2, len);
  }
  for (let n = 0; n < (PW * len) / 160; n++) { gi.fillStyle = `rgba(0,0,0,${(0.12 + r() * 0.3).toFixed(2)})`; gi.fillRect(r() * PW, r() * len, 0.8 + r() * 1.2, 0.8 + r() * 1.2); }
  if (p.wear) {   // a worn print head: a lighter column down the paper and faint bands
    const wear = gi.createLinearGradient(0, 0, PW, 0);
    wear.addColorStop(0, 'rgba(0,0,0,0)'); wear.addColorStop(0.58, 'rgba(0,0,0,0)'); wear.addColorStop(0.64, 'rgba(0,0,0,0.16)'); wear.addColorStop(0.7, 'rgba(0,0,0,0)'); wear.addColorStop(1, 'rgba(0,0,0,0.1)');
    gi.fillStyle = wear; gi.fillRect(0, 0, PW, len);
    for (let y = 0; y < len; y += 9 * 2) { gi.fillStyle = 'rgba(0,0,0,0.1)'; gi.fillRect(0, y, PW, 1.4); }
  }
  gi.globalCompositeOperation = 'source-over';

  const c = softCanvas(PW, len), g = c.getContext('2d')!;
  g.fillStyle = p.paper; g.fillRect(0, 0, PW, len);
  grain(g, PW, len, 7, 16);
  // the coating's cloudiness and a few fibres
  for (let n = 0; n < Math.max(6, len / 60); n++) {
    const x = r() * PW, y = r() * len, rad = 40 + r() * 120, dark = r() < 0.5, m = g.createRadialGradient(x, y, 0, x, y, rad);
    m.addColorStop(0, dark ? 'rgba(90,95,100,0.035)' : 'rgba(255,255,255,0.05)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.lineCap = 'round';
  for (let n = 0; n < (PW * len) / 2600; n++) {
    const x = r() * PW, y = r() * len, a = r() * Math.PI * 2, l = 5 + r() * 16;
    g.strokeStyle = `rgba(${r() < 0.7 ? '110,115,120' : '255,255,255'},${(0.05 + r() * 0.07).toFixed(3)})`; g.lineWidth = 0.6 + r() * 0.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // the print: a soft bleed under the sharp dots, multiplied into the paper (dark grey, not vector black)
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.5; g.filter = 'blur(0.9px)'; g.drawImage(ink, 0, 0);
  g.globalAlpha = 0.88; g.filter = 'none'; g.drawImage(ink, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // the curl: a strip off a roll bows across its width and its free ends lift
  const across = g.createLinearGradient(0, 0, PW, 0);
  across.addColorStop(0, 'rgba(40,46,54,0.13)'); across.addColorStop(0.03, 'rgba(40,46,54,0)'); across.addColorStop(0.3, 'rgba(255,255,255,0.04)');
  across.addColorStop(0.75, 'rgba(255,255,255,0)'); across.addColorStop(0.975, 'rgba(40,46,54,0)'); across.addColorStop(1, 'rgba(40,46,54,0.16)');
  g.fillStyle = across; g.fillRect(0, 0, PW, len);
  for (const [y0, dir] of [[0, 1], [len, -1]] as const) {
    const e = g.createLinearGradient(0, y0, 0, y0 + dir * 70);
    e.addColorStop(0, 'rgba(40,46,54,0.2)'); e.addColorStop(0.12, 'rgba(40,46,54,0.06)'); e.addColorStop(0.35, 'rgba(255,255,255,0.08)'); e.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = e; g.fillRect(0, Math.min(y0, y0 + dir * 70), PW, 70);
  }
  // torn top and bottom: an uneven serration from the tear bar, its fibres a little darker
  tornEdge(g, PW, len, rng(73));
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; g.fill(); g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = 'rgba(70,74,80,0.22)'; g.lineWidth = 1.6; g.stroke(); g.globalCompositeOperation = 'source-over';
  return c;
}

/** the paper's outline traced on `g`: straight sides, a serrated tear at top and bottom (teeth 6–12 units apart, up to 6 deep) */
function tornEdge(g: CanvasRenderingContext2D, PW: number, len: number, r: () => number) {
  const row = (y: number, dir: number) => {
    const pts: Array<[number, number]> = [];
    for (let x = 0, up = true; x < PW; x += 3 + r() * 3, up = !up) pts.push([x, y + dir * (up ? r() * 1.5 : 3.5 + r() * 2.5)]);
    pts.push([PW, y + dir * 3]);
    return pts;
  };
  const pts = [...row(0, 1), ...row(len, -1).reverse()];
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.closePath();
}

/** fine noise on everything already drawn on `g` (amplitude in 0–255 levels, the same for r, g and b) */
function grain(g: CanvasRenderingContext2D, w: number, hh: number, amp: number, seed: number) {
  const W = Math.ceil(w), H = Math.ceil(hh), img = g.getImageData(0, 0, W, H), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

/** the paper's shadow, the paper bitmap's size plus SP all round: a wide soft one and a tight contact one under it */
function renderShadow(paper: HTMLCanvasElement): HTMLCanvasElement {
  const w = paper.width, hh = paper.height, m = softCanvas(w, hh), mg = m.getContext('2d')!;
  mg.drawImage(paper, 0, 0); mg.globalCompositeOperation = 'source-in'; mg.fillStyle = '#0a0c10'; mg.fillRect(0, 0, w, hh);
  const c = softCanvas(w + 2 * SP, hh + 2 * SP), g = c.getContext('2d')!;
  g.globalAlpha = 0.5; g.filter = 'blur(14px)'; g.drawImage(m, SP + 7, SP + 16);
  g.globalAlpha = 0.35; g.filter = 'blur(2.5px)'; g.drawImage(m, SP + 1.5, SP + 3);
  g.filter = 'none'; g.globalAlpha = 1;
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

/** the body's width in units: BW, or wider for a wide paper so the slot and its tear bar stay inside it */
export const bodyWidth = (PW: number) => Math.max(BW, PW + 150);

/** the printer body, bodyWidth(PW) wide plus BPAD of shadow all round, the slot line at y = BPAD + TOPF: a satin box with a foreshortened top
 *  face (behind the paper) and the slot in it, a rounded front edge, the VFD's recess, a seam, a door, the power LED, the feed key and
 *  the model name pressed into the plastic; its soft shadow on the counter */
function renderBody(PW: number, p: P): HTMLCanvasElement {
  const bw = bodyWidth(PW), W0 = bw + 2 * BPAD, H0 = TOPF + BODYH + 2 * BPAD, x0 = BPAD, S = BPAD + TOPF, top = S - TOPF, bot = S + BODYH, cx = x0 + bw / 2, base = p.body;
  const b = softCanvas(W0, H0), g = b.getContext('2d')!;
  const box = (c: CanvasRenderingContext2D) => { c.beginPath(); c.roundRect(x0, top, bw, bot - top, [46, 46, 30, 30]); };
  box(g); g.save(); g.clip();
  // the front: lit from above, falling off downwards
  const front = g.createLinearGradient(0, S, 0, bot);
  front.addColorStop(0, shade(base, 1.12)); front.addColorStop(0.3, base); front.addColorStop(1, shade(base, 0.6));
  g.fillStyle = front; g.fillRect(x0, top, bw, bot - top);
  const fall = g.createRadialGradient(x0 + bw * 0.38, S + 60, 40, x0 + bw * 0.38, S + 60, bw * 0.95);
  fall.addColorStop(0, 'rgba(255,255,255,0.05)'); fall.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = fall; g.fillRect(x0, S, bw, bot - S);
  const sheen = g.createLinearGradient(x0, 0, x0 + bw, 0);   // the satin finish: a broad soft reflection of the light
  sheen.addColorStop(0.16, 'rgba(255,255,255,0)'); sheen.addColorStop(0.3, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.46, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fillRect(x0, S, bw, bot - S);
  // the top face, seen at a steep angle: lighter, brightest under the light
  const tf = g.createLinearGradient(0, top, 0, S + 12);
  tf.addColorStop(0, shade(base, 1.08)); tf.addColorStop(1, shade(base, 1.3));
  g.fillStyle = tf; g.fillRect(x0, top, bw, TOPF + 12);
  const spec = g.createRadialGradient(x0 + bw * 0.42, S - 16, 8, x0 + bw * 0.42, S - 16, bw * 0.5);
  spec.addColorStop(0, 'rgba(255,255,255,0.12)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spec; g.fillRect(x0, top, bw, TOPF + 12);
  // the rounded front edge: a bright line where it turns, a soft shade into the front
  const edge = g.createLinearGradient(0, S + 8, 0, S + 32);
  edge.addColorStop(0, 'rgba(255,255,255,0)'); edge.addColorStop(0.25, 'rgba(255,255,255,0.2)'); edge.addColorStop(0.5, 'rgba(255,255,255,0.04)'); edge.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = edge; g.fillRect(x0, S + 8, bw, 24);
  // the rounded sides: a highlight a little in, dark at the very edge
  const sides = g.createLinearGradient(x0, 0, x0 + bw, 0);
  sides.addColorStop(0, 'rgba(0,0,0,0.4)'); sides.addColorStop(0.012, 'rgba(255,255,255,0.08)'); sides.addColorStop(0.035, 'rgba(255,255,255,0)');
  sides.addColorStop(0.965, 'rgba(0,0,0,0)'); sides.addColorStop(0.988, 'rgba(0,0,0,0.14)'); sides.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = sides; g.fillRect(x0, top, bw, bot - top);
  // the slot: a recessed plate round a dark slit, its back lip catching the light
  const sw = PW + 48;
  g.fillStyle = shade(base, 0.82); g.beginPath(); g.roundRect(cx - sw / 2 - 20, S - 22, sw + 40, 34, 12); g.fill();
  const plate = g.createLinearGradient(0, S - 22, 0, S + 12);
  plate.addColorStop(0, 'rgba(0,0,0,0.3)'); plate.addColorStop(0.3, 'rgba(0,0,0,0)'); plate.addColorStop(1, 'rgba(255,255,255,0.06)');
  g.fillStyle = plate; g.beginPath(); g.roundRect(cx - sw / 2 - 20, S - 22, sw + 40, 34, 12); g.fill();
  const slit = g.createLinearGradient(0, S - 9, 0, S + 4);
  slit.addColorStop(0, '#020304'); slit.addColorStop(1, '#16191d');
  g.fillStyle = slit; g.beginPath(); g.roundRect(cx - sw / 2, S - 9, sw, 13, 4); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - sw / 2 + 4, S - 10.5, sw - 8, 1.2);
  // the VFD's recess: a dark well with a shaded top and a lit bottom lip
  const vx = cx - VFD_W / 2 - 22, vy = S + VFD_Y - 22, vw = VFD_W + 44, vh = VFD_H + 44;
  const well = g.createLinearGradient(0, vy, 0, vy + vh);
  well.addColorStop(0, shade(base, 0.45)); well.addColorStop(1, shade(base, 0.72));
  g.fillStyle = well; g.beginPath(); g.roundRect(vx, vy, vw, vh, 22); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.roundRect(vx + 1, vy + 1, vw - 2, vh - 2, 21); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(vx + 20, vy + vh + 1); g.lineTo(vx + vw - 20, vy + vh + 1); g.stroke();
  // seams: under the display, and the front door with a finger notch
  const seam = (draw: () => void) => {
    g.save(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; draw(); g.stroke();
    g.translate(0, 1.6); g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1.2; draw(); g.stroke(); g.restore();
  };
  seam(() => { g.beginPath(); g.moveTo(x0 + 16, S + 160); g.lineTo(x0 + bw - 16, S + 160); });
  seam(() => { g.beginPath(); g.roundRect(x0 + 56, S + 258, bw - 112, 340, 20); });
  const notch = g.createLinearGradient(0, S + 252, 0, S + 270);
  notch.addColorStop(0, 'rgba(0,0,0,0.5)'); notch.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = notch; g.beginPath(); g.ellipse(cx, S + 258, 54, 13, 0, 0, Math.PI); g.fill();
  // the controls: the power LED lit, the paper LED off, the feed key
  const ly = S + CTRL_Y;
  for (const [lx, lit] of [[x0 + 104, true], [x0 + 146, false]] as const) {
    g.fillStyle = shade(base, 0.5); g.beginPath(); g.arc(lx, ly, 9.5, 0, Math.PI * 2); g.fill();
    if (lit) {
      const glow = g.createRadialGradient(lx, ly, 2, lx, ly, 30);
      glow.addColorStop(0, 'rgba(90,255,150,0.4)'); glow.addColorStop(1, 'rgba(90,255,150,0)');
      g.fillStyle = glow; g.fillRect(lx - 30, ly - 30, 60, 60);
    }
    const dome = g.createRadialGradient(lx - 2, ly - 2.5, 0.5, lx, ly, 7);
    dome.addColorStop(0, lit ? '#eaffef' : '#8a6a3a'); dome.addColorStop(0.45, lit ? '#43e07a' : '#4a3214'); dome.addColorStop(1, lit ? '#138a3c' : '#22170a');
    g.fillStyle = dome; g.beginPath(); g.arc(lx, ly, 6.5, 0, Math.PI * 2); g.fill();
  }
  const kx = x0 + 196, ky = ly - 19, kw = 104, kh = 38;
  g.fillStyle = shade(base, 0.5); g.beginPath(); g.roundRect(kx - 3, ky - 3, kw + 6, kh + 6, 14); g.fill();
  const key = g.createLinearGradient(0, ky, 0, ky + kh);
  key.addColorStop(0, shade(base, 1.32)); key.addColorStop(0.5, shade(base, 1.1)); key.addColorStop(1, shade(base, 0.9));
  g.fillStyle = key; g.beginPath(); g.roundRect(kx, ky, kw, kh, 11); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(kx + 10, ky + 1.5, kw - 20, 1.2);
  // the feed mark pressed into the key: a sheet with an arrow out of it
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(kx + kw / 2 - 9, ky + 26); g.lineTo(kx + kw / 2 + 9, ky + 26); g.moveTo(kx + kw / 2, ky + 24); g.lineTo(kx + kw / 2, ky + 11);
  g.moveTo(kx + kw / 2 - 5, ky + 15); g.lineTo(kx + kw / 2, ky + 10); g.lineTo(kx + kw / 2 + 5, ky + 15); g.stroke();
  if (p.model) {   // the model name moulded into the plastic: a dark top edge, a light bottom edge
    g.font = `700 26px '${p.font}', 'Noto Sans TC', sans-serif`; g.textAlign = 'right';
    const mx = x0 + bw - 64, my = S + CTRL_Y + 10;
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillText(p.model, mx, my + 1.2);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(p.model, mx, my - 1);
    g.fillStyle = shade(base, 0.92); g.fillText(p.model, mx, my);
  }
  g.restore();
  grain(g, W0, H0, 6, 31);
  // its shadow on the counter, wide and soft, darker where it stands
  const c = softCanvas(W0, H0), cg = c.getContext('2d')!;
  cg.fillStyle = '#000';
  cg.globalAlpha = 0.5; cg.filter = 'blur(26px)'; cg.translate(0, 10); box(cg); cg.fill(); cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.globalAlpha = 0.45; cg.filter = 'blur(5px)'; box(cg); cg.fill();
  cg.globalAlpha = 1; cg.filter = 'none'; cg.drawImage(b, 0, 0);
  return c;
}

/** the metal tear bar in front of the slot (drawn over the paper), PW + 80 by 30 units, its teeth along y = 10 */
function renderBar(PW: number): HTMLCanvasElement {
  const w = PW + 80, c = softCanvas(w, 30), g = c.getContext('2d')!, x0 = 10, x1 = w - 10, r = rng(5);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.filter = 'blur(2px)'; g.fillRect(x0 + 2, 19, x1 - x0 - 4, 5); g.filter = 'none';
  const steel = g.createLinearGradient(0, 5, 0, 20);
  steel.addColorStop(0, '#dfe3e7'); steel.addColorStop(0.3, '#a9b0b6'); steel.addColorStop(0.7, '#787f86'); steel.addColorStop(1, '#4b5157');
  g.fillStyle = steel; g.beginPath(); g.moveTo(x0, 20); g.lineTo(x0, 10);
  for (let x = x0; x < x1; x += 5) { g.lineTo(x + 2.5, 5); g.lineTo(Math.min(x1, x + 5), 10); }
  g.lineTo(x1, 20); g.closePath(); g.fill();
  for (let n = 0; n < 60; n++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${(0.04 + r() * 0.08).toFixed(3)})`; g.fillRect(x0 + r() * (x1 - x0) * 0.8, 11 + r() * 8, 20 + r() * 120, 0.6); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, 10.5, x1 - x0, 0.8);
  return c;
}

/** what lies over the VFD's glowing dots, VFD_W × VFD_H: the control grid's fine mesh, the filament wires, the smoked glass's
 *  inner shadow and its reflection */
function renderGlass(): HTMLCanvasElement {
  const c = softCanvas(VFD_W, VFD_H), g = c.getContext('2d')!;
  g.beginPath(); g.roundRect(0, 0, VFD_W, VFD_H, 10); g.clip();
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (let x = 0; x < VFD_W; x += 3.2) g.fillRect(x, 0, 0.7, VFD_H);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < VFD_H; y += 3.2) g.fillRect(0, y, VFD_W, 0.6);
  g.fillStyle = 'rgba(190,255,235,0.06)';
  for (const y of [15, 39, 63]) g.fillRect(0, y, VFD_W, 0.6);
  const inner = g.createLinearGradient(0, 0, 0, VFD_H);
  inner.addColorStop(0, 'rgba(0,0,0,0.6)'); inner.addColorStop(0.2, 'rgba(0,0,0,0)'); inner.addColorStop(0.85, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = inner; g.fillRect(0, 0, VFD_W, VFD_H);
  const sideS = g.createLinearGradient(0, 0, VFD_W, 0);
  sideS.addColorStop(0, 'rgba(0,0,0,0.45)'); sideS.addColorStop(0.025, 'rgba(0,0,0,0)'); sideS.addColorStop(0.975, 'rgba(0,0,0,0)'); sideS.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = sideS; g.fillRect(0, 0, VFD_W, VFD_H);
  g.fillStyle = 'rgba(255,255,255,0.045)'; g.beginPath(); g.moveTo(70, 0); g.lineTo(300, 0); g.lineTo(230, VFD_H); g.lineTo(0, VFD_H); g.lineTo(0, 46); g.closePath(); g.fill();
  const top = g.createLinearGradient(0, 0, 0, 22);
  top.addColorStop(0, 'rgba(255,255,255,0.08)'); top.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = top; g.fillRect(0, 2, VFD_W, 20);
  return c;
}

/** the countertop under the video window, in device pixels (W × H − y0): a matte stone-grey surface in a pool of light round the
 *  printer, falling off to the corners, the window's soft shadow along its top edge, fine grain and specks */
function renderCounter(W: number, H: number, y0: number, lx: number, ly: number, k: number, color: string): HTMLCanvasElement {
  const hh = Math.max(1, H - y0), c = softCanvas(W, hh), g = c.getContext('2d')!, R = Math.max(W, hh), r = rng(9);
  g.fillStyle = color; g.fillRect(0, 0, W, hh);
  const pool = g.createRadialGradient(lx, ly, 0, lx, ly, R * 0.85);
  pool.addColorStop(0, 'rgba(255,250,240,0.2)'); pool.addColorStop(0.45, 'rgba(255,250,240,0.06)'); pool.addColorStop(1, 'rgba(255,250,240,0)');
  g.fillStyle = pool; g.fillRect(0, 0, W, hh);
  const fall = g.createRadialGradient(lx, ly, R * 0.25, lx, ly, R * 1.05);
  fall.addColorStop(0, 'rgba(0,0,0,0)'); fall.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = fall; g.fillRect(0, 0, W, hh);
  const ao = g.createLinearGradient(0, 0, 0, 70 * k);
  ao.addColorStop(0, 'rgba(0,0,0,0.55)'); ao.addColorStop(0.35, 'rgba(0,0,0,0.18)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ao; g.fillRect(0, 0, W, 70 * k);
  for (let n = 0; n < (W * hh) / 1400; n++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${(0.03 + r() * 0.05).toFixed(3)})` : `rgba(0,0,0,${(0.04 + r() * 0.06).toFixed(3)})`;
    const s = (0.8 + r() * 1.8) * k; g.fillRect(r() * W, r() * hh, s, s);
  }
  grain(g, W, hh, 8, 12);
  return c;
}

export const printer: ItemType<P, S> = {
  type: 'common.printer', label: '收據機', category: 'card', kind: 'overlay',
  doc: '熱感應收據機（畫面下方）：每行「秒|樣式|文字|金額」用點陣字印出來、步進馬達一頓一頓送紙，紙往上長、鑽到 clip 以上（影片窗）後面；shop 是黑底反白店名條、印字頭有磨損條紋；機身 VFD 小計自動往上跳、閃「+40」；最後蓋章、紅筆劃掉一行、tearAt 撕下整條收據攤開在畫面中央；美食記帳、一路吃一路算、購物清單；size 放大收據上的字（9:16 看得清楚，紙跟著變長）；寫實的 POS 收據機：感熱紙有紙紋、微微捲曲、鋸齒撕邊和影子，霧面機身、金屬撕紙刀、VFD 在煙燻玻璃後面；surface counter 在 clip（影片窗下緣）以下鋪一塊打光的檯面，片子自己有底就設 none',
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
    { key: 'size', label: '收據字的大小（倍數，1＝原本；點陣點跟著變大、每行變高；字太長請把紙寬 w 調大）', type: 'number', min: 0.6, max: 2.5, step: 0.05, default: 1 },
    { key: 'wear', label: '印字頭磨損條紋', type: 'bool', default: true },
    { key: 'font', label: '點陣字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '紙色（感熱紙微冷的米白）', type: 'color', default: '#f0f1ec' },
    { key: 'ink', label: '墨色', type: 'color', default: '#262422', theme: 'palette.ink' },
    { key: 'red', label: '印章與紅筆', type: 'color', default: '#d4213a', theme: 'palette.accent' },
    { key: 'vfd', label: '顯示器的顏色', type: 'color', default: '#8dffd9' },
    { key: 'body', label: '機身顏色', type: 'color', default: '#2e3034' },
    { key: 'surface', label: '機器下面的檯面（counter 影片窗 clip 以下鋪一塊打了光的檯面；none 不鋪，透出底下自己的背景；clip -1 時不鋪）', type: 'enum', options: ['counter', 'none'], default: 'counter' },
    { key: 'table', label: '檯面顏色', type: 'color', default: '#6c6862' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), ghosts = h('div', null, null, ctx.root), p = ctx.params;
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(ghosts, { position: 'absolute', transformOrigin: '50% 50%', color: 'transparent' });
    return { cv, off: softCanvas(4, 4), ghosts, rows: [], stampG: abs(ghosts), modelG: abs(ctx.root), key: '', paperC: null, shadowC: null, stampC: null, stampKey: '',
      bodyC: null, barC: null, glassC: null, bodyKey: '', counterC: null, counterKey: '', want: `${p.lines}${p.label}${p.totalLabel}${p.adds}+0123456789${p.model}` };
  },
  async ready(s) {
    await loadDots('Noto Sans TC', s.want, [500, 700, 900]);
    if (typeof document !== 'undefined' && document.fonts) await document.fonts.load("900 74px 'Noto Serif TC'", '章').catch(() => []);
  },
  hide(s) {
    freeCanvas(s.cv);
    s.paperC = s.shadowC = s.bodyC = s.barC = s.glassC = s.stampC = s.counterC = null; s.key = s.bodyKey = s.stampKey = s.counterKey = '';
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t } = ctx, k = Math.min(W, H) / 1080, CW = W / k, CH = H / k;
    const PW = Math.round(p.w * 1080), PX = (CW - PW) / 2;
    const z = p.size ?? 1, L = printerLines(p.lines, !!p.stamp && p.stampLine < 0, z), fontOk = typeof document === 'undefined' || !document.fonts || document.fonts.check(`700 20px '${p.font}'`, L.lines.map((l) => l.text).join('') || 'A');
    const key = JSON.stringify([p.lines, !!p.stamp && p.stampLine < 0, PW, z, p.font, p.paper, p.ink, p.wear, fontOk]);
    if (s.key !== key) {
      s.key = key; s.paperC = renderPaper(L, PW, p); s.shadowC = renderShadow(s.paperC);
      for (const r of s.rows) r.el.remove();
      s.rows = L.lines.map((l) => {
        const el = h('div', null, null, s.ghosts), kd = KIND[l.kind];
        el.textContent = l.text + (l.amt ? `  ${l.amt}` : '');
        cssCamel(el, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700', fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`,
          display: kd.px && l.text ? 'block' : 'none', textAlign: l.kind === 'title' || l.kind === 'center' || l.kind === 'thanks' ? 'center' : 'left' });
        return { el };
      });
    }
    // where things are, in 1080-wide units: the VFD's recess rests on the bottom safe line, the slot SLOT_UP units above it
    const slotY = p.slot >= 0 ? p.slot * CH : (1 - theme.safe.bottom) * CH - SLOT_UP, clipY = p.clip >= 0 ? p.clip * CH : theme.safe.top * CH;
    const bw = bodyWidth(PW), BX = (CW - bw) / 2, VY = slotY + VFD_Y;
    const bodyKey = JSON.stringify([PW, p.body, p.model, p.font, fontOk]);
    if (s.bodyKey !== bodyKey) { s.bodyKey = bodyKey; s.bodyC = renderBody(PW, p); s.barC = renderBar(PW); s.glassC ??= renderGlass(); }
    const stampKey = `${p.stamp}|${p.red}`;
    if (s.stampKey !== stampKey) { s.stampKey = stampKey; s.stampC = p.stamp ? renderStamp(p.stamp, p.red) : null; }
    const g = canvasAt(s.cv, W, H);

    // the countertop under the video window, drawn in device pixels
    if (p.surface !== 'none' && p.clip >= 0) {
      const y0 = Math.round(clipY * k), counterKey = JSON.stringify([W, H, y0, Math.round(slotY), p.table]);
      if (s.counterKey !== counterKey) { s.counterKey = counterKey; s.counterC = renderCounter(W, H, y0, W / 2, (slotY - 120) * k - y0, k, p.table); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(s.counterC!, 0, y0);
    }
    g.setTransform(k, 0, 0, k, 0, 0);

    const F = fedAt(L.lines, t), torn = p.tearAt >= 0 && t >= p.tearAt, rt = torn ? t - p.tearAt : 0;
    const dyPrn = torn ? 620 * eIO(clamp((rt - 0.2) / 0.85)) : 0, len = L.len;
    // the paper: out of the slot; once torn, a jerk and a glide to the middle of the safe area, scaled to fit between its lines
    let cx = PX + PW / 2, cy = slotY - F + len / 2, sc = 1, rot = 0, lift = 0;
    if (torn) {
      const top = theme.safe.top * CH, room = (1 - theme.safe.bottom) * CH - top, fit = Math.min(1, room / len), jerk = eBack(clamp(rt / 0.25), 1.9) * 28, glide = eIO(clamp((rt - 0.32) / 1.05));
      const cy0 = slotY - len / 2 - jerk;
      cy = cy0 + (top + room / 2 - cy0) * glide;   // laid out in the middle of the safe area
      sc = 1 + (fit - 1) * glide;
      rot = (-1.4 * clamp(rt / 0.25) - 0.9 * glide) * Math.PI / 180;
      lift = Math.sin(Math.PI * clamp((rt - 0.05) / 1.35));   // held up in the air on the way, then laid down
    }

    // the body (its top face behind the paper), the VFD behind its glass; the tear bar goes over the paper while it is in the slot
    const bar = () => g.drawImage(s.barC!, CW / 2 - PW / 2 - 40, slotY - 10);
    g.save(); g.translate(0, dyPrn);
    g.drawImage(s.bodyC!, BX - BPAD, slotY - TOPF - BPAD);
    if (p.display) {
      const totalAt = p.totalAt >= 0 ? p.totalAt : (() => { const tl = L.lines.find((l) => l.kind === 'total'); return tl ? tl.t + 0.3 : -1; })(), steps = printerAdds(p.adds, L.lines, totalAt);
      const st = digitsAt(steps, t, 5, ' ');
      paintVfd(g, s.off, (CW - VFD_W) / 2, VY, VFD_W, VFD_H, 1, { steps, local: t, n: 5, text: st.text, prefix: p.prefix, label: p.label, totalLabel: p.totalLabel, totalAt, on: p.vfd, flash: '#ffe28a' });
      g.drawImage(s.glassC!, (CW - VFD_W) / 2, VY);
    }
    if (torn) bar();
    g.restore();

    const clipTop = torn ? -1e4 : clipY;
    g.save();
    g.beginPath(); g.rect(0, clipTop, CW, (torn ? CH + 1e4 : slotY - clipY)); g.clip();
    g.translate(cx, cy); g.rotate(rot); g.scale(sc, sc); g.translate(-PW / 2, -len / 2);
    g.drawImage(s.shadowC!, -SP + lift * 16, -SP + lift * 26);
    g.drawImage(s.paperC!, 0, 0);
    if (!torn) {   // where it comes out of the slot the paper bends over: a soft highlight on the bend, then shadow into the slot
      const y0 = Math.max(10, F - 84), bend = g.createLinearGradient(0, y0, 0, F);
      bend.addColorStop(0, 'rgba(255,255,255,0)'); bend.addColorStop(0.45, 'rgba(255,255,255,0.08)'); bend.addColorStop(0.7, 'rgba(30,34,40,0)'); bend.addColorStop(1, 'rgba(30,34,40,0.38)');
      g.fillStyle = bend; g.fillRect(0, y0, PW, F - y0);
    }
    // the red pen strike
    const sl = userLine(L.lines, p.strikeLine);
    if (p.strikeLine >= 0 && sl && t >= p.strikeAt && sl.text) {
      const kd = kindAt(sl.kind, z), d = kd.px ? dots(sl.text, kd.px, kd.w, p.font) : null, q = eOut(clamp((t - p.strikeAt) / 0.35));
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
    if (!torn) bar();

    // the printed lines for check: transparent copies moving with the paper (hidden behind the clip and before they print)
    cssCamel(s.ghosts, { left: `${(cx - PW / 2) * k}px`, top: `${(cy - len / 2) * k}px`, width: `${PW * k}px`, height: `${len * k}px`, transform: `rotate(${rot}rad) scale(${sc})` });
    L.lines.forEach((l, i) => {
      const r = s.rows[i], kd = kindAt(l.kind, z);
      if (!r || !kd.px || !l.text) return;
      const fs = kd.px * kd.pitch!, yScreen = cy - len / 2 + l.y + l.h / 2, out = !torn && (yScreen - fs / 2 < clipY || yScreen + fs / 2 > slotY);
      const fsFit = Math.min(fs, (PW - 2 * PAD) / Math.max(1, textEm(r.el.textContent ?? '')));
      cssCamel(r.el, { display: t >= l.t && !out ? 'block' : 'none', left: `${PAD * k}px`, width: `${(PW - 2 * PAD) * k}px`, top: `${(l.y + (l.h - fsFit) / 2) * k}px`, fontSize: `${fsFit * k}px` });
    });
    // the stamp, on the paper (behind the clip like the lines), and the model name embossed on the body
    const sq = (t - p.stampAt) / 0.2, sy = spot ? cy - len / 2 + spot.y : 0;
    ghostLine(s.stampG, s.stampC && spot && t >= p.stampAt && (torn || (sy > clipY && sy < slotY)) ? { text: p.stamp, x: (PW / 2 + 60) * k, y: (spot.y + 4) * k, size: 74 * k, family: "'Noto Serif TC', serif",
      weight: 900, align: 'center', base: 'middle', alpha: clamp(sq * 2) * 0.9, turn: `rotate(-9deg) scale(${(1 + 0.9 * (1 - eOut(clamp(sq)))).toFixed(4)})` } : null);
    ghostLine(s.modelG, p.model ? { text: p.model, x: (BX + bw - 64) * k, y: (slotY + CTRL_Y + 11 + dyPrn) * k, size: 26 * k, family: `'${p.font}', 'Noto Sans TC', sans-serif`, weight: 700, align: 'right' } : null);
  },
};
