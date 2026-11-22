// common.progress stretch (spec 2026-11-22, progress characters): a hand-drawn animal whose body is the progress bar. Its tail and
// hind legs stay at the start (left); its head and front legs are at the front, and the body between them grows as the film goes
// on, from a normally proportioned little animal at 0 to the whole width at 1; what is still to go is a dashed line in `track`
// colour. Three looks: a dachshund (droopy ear, black nose, short legs, a wagging tail held up; its tongue out on arrival), a cat
// (pointed ears, whiskers, a long tail swaying slowly; straight up on arrival) and a caterpillar (`worm`: a segment every
// `thickness × 1.2`, two antennae, no legs, a gentle wave down its back; the antennae quiver on arrival). All on the canvas, the
// lines through hand.ts's handPath with fixed seeds (no boil), every movement a function of the item's time.
import { clamp, cssCamel, eOut3, prog } from '@tellcut/engine';
import { withAlpha, shade } from '../color.ts';
import { handPath } from '../hand.ts';
import { canvasAt } from '../inkline.ts';
import { arrived, band, fadeOut, tail, travel, type Draw } from './shared.ts';

type G = CanvasRenderingContext2D;
type Pt = [number, number];

/** the body's length (px, tail root to neck) at progress `p` across `w` px: `min` at 0 (a normally proportioned animal), growing to
 *  `w − head − rear` at 1 */
export function bodyLength(p: number, w: number, min: number, head: number, rear: number): number {
  const max = Math.max(min, w - head - rear);
  return min + (max - min) * clamp(Number.isFinite(p) ? p : 0);
}

/** the tail's swing, −1…1: two wags a second */
export const wagAt = (local: number): number => Math.sin(local * Math.PI * 4);

const BLINK_EVERY = 2.4, BLINK_SHUT = 0.12;
/** shut 0.12 s every 2.4 s (the first after 2.4 s: an item never opens with its eyes shut) */
export const blinkAt = (local: number): boolean => local >= BLINK_EVERY && local % BLINK_EVERY < BLINK_SHUT;

/** which front leg is forward at `dist` px (0 | 1) and how far (0…1) */
export function stepAt(dist: number, stride: number): { leg: 0 | 1; reach: number } {
  if (!(stride > 0) || !Number.isFinite(dist) || dist <= 0) return { leg: 0, reach: 0 };
  const f = dist / stride, n = Math.floor(f);
  return { leg: (n % 2) as 0 | 1, reach: f - n };
}

// ---------- shapes (points for handPath) ----------
/** an ellipse's outline, `n` points, turned by `rot` */
function ell(cx: number, cy: number, rx: number, ry: number, n = 28, rot = 0): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    return [cx + x * c - y * s, cy + x * s + y * c] as Pt;
  });
}
/** points every `step` px from a towards b (a included, b not): a long edge's wobble then stays put as it grows from a */
function along(a: Pt, b: Pt, step: number): Pt[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / Math.max(1, step)));
  return Array.from({ length: n }, (_, i) => { const t = Math.min(1, (i * step) / (L || 1)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Pt; });
}
/** a capsule from x0 to x1 (its round ends inside that), top `y`, `hh` tall; its long edges run left to right from x0 */
function capsule(x0: number, x1: number, y: number, hh: number, step: number): Pt[] {
  const r = hh / 2, a = x0 + r, b = Math.max(a, x1 - r), out: Pt[] = [];
  out.push(...along([a, y], [b, y], step));
  for (let i = 0; i < 9; i++) { const t = -Math.PI / 2 + (i / 9) * Math.PI; out.push([b + Math.cos(t) * r, y + r + Math.sin(t) * r]); }
  out.push(...along([b, y + hh], [a, y + hh], step));
  for (let i = 0; i < 9; i++) { const t = Math.PI / 2 + (i / 9) * Math.PI; out.push([a + Math.cos(t) * r, y + r + Math.sin(t) * r]); }
  return out;
}
/** a centreline from `base`, `len` px long, setting off at angle a0 (screen angles: 0 right, −π/2 up) and turning by `bend` */
function curve(base: Pt, len: number, a0: number, bend: number, n = 10): Pt[] {
  const out: Pt[] = [base];
  let [x, y] = base;
  for (let i = 1; i <= n; i++) { const a = a0 + bend * ((i - 0.5) / n); x += (Math.cos(a) * len) / n; y += (Math.sin(a) * len) / n; out.push([x, y]); }
  return out;
}
/** the outline of a tube along `line`, `w0` wide at its start to `w1` at its end, both ends round */
function tube(line: Pt[], w0: number, w1: number): Pt[] {
  const n = line.length, left: Pt[] = [], right: Pt[] = [];
  const dir = (i: number) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  for (let i = 0; i < n; i++) {
    const a = dir(i), r = (w0 + (w1 - w0) * (i / Math.max(1, n - 1))) / 2, [x, y] = line[i];
    left.push([x + Math.sin(a) * r, y - Math.cos(a) * r]); right.push([x - Math.sin(a) * r, y + Math.cos(a) * r]);
  }
  const cap = (c: Pt, a: number, r: number): Pt[] => Array.from({ length: 5 }, (_, i) => { const t = a - Math.PI / 2 + ((i + 1) / 6) * Math.PI; return [c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r] as Pt; });
  return [...left, ...cap(line[n - 1], dir(n - 1), w1 / 2), ...right.reverse(), ...cap(line[0], dir(0) + Math.PI, w0 / 2)];
}

// ---------- pens ----------
interface Pen { g: G; lw: number; amp: number; ink: string }
/** one outlined shape */
function shape(pen: Pen, pts: Pt[], fill: string, seed: number) {
  const { g } = pen;
  handPath(g, pts, true, pen.amp, seed);
  g.fillStyle = fill; g.fill();
  g.strokeStyle = pen.ink; g.lineWidth = pen.lw; g.stroke();
}
/** several shapes as one silhouette: every outline at twice the width, then every fill over them, so only the outer half of each
 *  line is left and the parts join without seams */
function blob(pen: Pen, parts: Pt[][], fill: string, seed: number) {
  const { g } = pen;
  g.strokeStyle = pen.ink; g.lineWidth = pen.lw * 2;
  parts.forEach((pts, i) => { handPath(g, pts, true, pen.amp, seed + i); g.stroke(); });
  g.fillStyle = fill;
  parts.forEach((pts, i) => { handPath(g, pts, true, pen.amp, seed + i); g.fill(); });
}
/** an open hand-drawn line */
function line(pen: Pen, pts: Pt[], color: string, width: number, seed: number) {
  const { g } = pen;
  handPath(g, pts, false, pen.amp * 0.5, seed);
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
const disc = (g: G, x: number, y: number, rx: number, ry: number, fill: string) => {
  g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); g.fill();
};
/** an eye: a dark oval with a white highlight, or a closed one (a little arc) while blinking */
function eye(pen: Pen, x: number, y: number, r: number, shut: boolean) {
  const { g } = pen;
  if (shut) { g.strokeStyle = pen.ink; g.lineWidth = Math.max(1, r * 0.45); g.beginPath(); g.arc(x, y - r * 0.6, r * 1.05, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); return; }
  disc(g, x, y, r * 0.9, r * 1.1, pen.ink);
  disc(g, x + r * 0.3, y - r * 0.4, r * 0.36, r * 0.36, '#ffffff');
}
const PINK = '#ff8fa3', TONGUE = '#ff6f8a';

// ---------- the looks ----------
/** each look's room in body heights (U): above the body's top, its legs under it, behind the rump for the tail, ahead of the neck
 *  for the head, and its shortest body (at progress 0) */
const ROOM = {
  dog: { above: 1.1, legs: 0.5, rear: 0.66, head: 1.92, min: 2.1 },
  cat: { above: 1.75, legs: 0.56, rear: 1.05, head: 1.7, min: 1.8 },
  worm: { above: 1.6, legs: 0, rear: 0.08, head: 1.3, min: 2.4 },
} as const;
type Look = keyof typeof ROOM;

/** what a look draws from: where the body is, how the front legs step, the time and the arrival */
interface Pose {
  pen: Pen; U: number; bx0: number; bx1: number; top: number; ground: number; local: number; since: number;
  /** the front legs' step (by the distance the head has come) and how much they move (0 standing, 1 walking) */
  step: { leg: 0 | 1; reach: number }; go: number; color: string; paper: string; th: number;
}

/** a front or hind leg, from its hip under the body to its paw; `off` moves the paw forward, `lift` off the ground */
function leg(P: Pose, x: number, off: number, lift: number, w: number): Pt[] {
  const { U, top, ground } = P, hip: Pt = [x, top + 0.55 * U], foot: Pt = [x + off, ground - 0.5 * w - lift];
  return tube([hip, [hip[0] + (foot[0] - hip[0]) * 0.5, (hip[1] + foot[1]) / 2], foot], w * 0.92, w * 1.08);
}
/** the front legs' paws: the one stepping swings from behind to ahead in the air, the other one pushes back on the ground */
function frontFeet(P: Pose, span: number, liftBy: number): Array<{ off: number; lift: number }> {
  const { leg: forward, reach } = P.step, a = span * P.go;
  return [0, 1].map((j) => (j === forward ? { off: -a + 2 * a * reach, lift: Math.sin(Math.PI * reach) * liftBy * P.go } : { off: a - 2 * a * reach, lift: 0 }));
}
/** the head's bob as the front legs step */
const bobOf = (P: Pose, by: number) => -Math.abs(Math.sin(Math.PI * P.step.reach)) * by * P.U * P.go;

function drawDog(P: Pose) {
  const { pen, U, bx0, bx1, top, local, since, color, paper } = P, g = pen.g, far = shade(color, 0.78), dark = shade(color, 0.66);
  const bob = bobOf(P, 0.05), feet = frontFeet(P, 0.2 * U, 0.16 * U), lw = 0.3 * U;
  const hx = bx1 + 0.42 * U, hy = top - 0.24 * U + bob, snout = ell(hx + 0.74 * U, hy + 0.24 * U, 0.56 * U, 0.33 * U, 24, -0.06);
  // far legs (behind the body, a shade darker), then tail, body, near legs, neck and head as one silhouette
  blob(pen, [leg(P, bx0 + 0.36 * U, -0.05 * U, 0, lw), leg(P, bx1 - 0.64 * U, feet[1].off, feet[1].lift, lw)], far, 31);
  const wag = wagAt(local) * (since >= 0 ? 1.25 : 1), tailLine = curve([bx0 + 0.34 * U, top + 0.26 * U], 1.15 * U, -2.8 + wag * 0.36, 1.55, 12);
  const body = capsule(bx0, bx1, top, U, 2 * U);
  blob(pen, [tube(tailLine, 0.36 * U, 0.13 * U), body, leg(P, bx0 + 0.62 * U, 0.04 * U, 0, lw), leg(P, bx1 - 0.4 * U, feet[0].off, feet[0].lift, lw),
    ell(bx1 - 0.02 * U, top + 0.24 * U + bob * 0.5, 0.46 * U, 0.46 * U, 20), ell(hx, hy, 0.8 * U, 0.74 * U, 30), snout], color, 41);
  // the cream belly along the bottom of the body, kept inside it
  g.save(); handPath(g, body, true, pen.amp, 42); g.clip();
  disc(g, (bx0 + bx1) / 2 + 0.2 * U, top + 1.02 * U, (bx1 - bx0) / 2 - 0.1 * U, 0.34 * U, paper);
  g.restore();
  // the muzzle: the snout's lower half in cream
  g.save(); handPath(g, snout, true, pen.amp, 47); g.clip();
  disc(g, hx + 0.82 * U, hy + 0.52 * U, 0.66 * U, 0.3 * U, paper);
  g.restore();
  // on arrival the mouth opens and the tongue hangs out of it, swinging a little
  if (since >= 0) {
    const out = eOut3(clamp(since / 0.25)), tl = 0.34 * U * out, tx = hx + 0.94 * U, ty = hy + 0.44 * U, sway = Math.sin(local * 9) * 0.05 * U;
    if (tl > 0.5) {
      g.fillStyle = shade(TONGUE, 0.45); g.beginPath(); g.ellipse(tx + 0.04 * U, ty - 0.02 * U, 0.22 * U, 0.09 * U * out, -0.1, 0, Math.PI * 2); g.fill();
      shape(pen, tube([[tx, ty - 0.04 * U], [tx + sway * 0.5, ty + tl * 0.5], [tx + sway, ty + tl]], 0.3 * U, 0.36 * U), TONGUE, 61);
      line(pen, [[tx, ty + 0.02 * U], [tx + sway * 0.6, ty + tl * 0.7]], shade(TONGUE, 0.72), pen.lw * 0.6, 62);
    }
  }
  // the nose at the snout's tip (a shine on it) and the mouth line under it
  disc(g, hx + 1.24 * U, hy + 0.12 * U, 0.17 * U, 0.13 * U, pen.ink);
  disc(g, hx + 1.2 * U, hy + 0.07 * U, 0.06 * U, 0.04 * U, '#ffffff');
  line(pen, [[hx + 1.22 * U, hy + 0.25 * U], [hx + 1.12 * U, hy + 0.38 * U], [hx + 0.9 * U, hy + 0.42 * U]], pen.ink, pen.lw * 0.8, 63);
  // the eye with a tan dot of an eyebrow over it (a dachshund's points), and a blush
  disc(g, hx + 0.3 * U, hy + 0.28 * U, 0.17 * U, 0.09 * U, withAlpha(PINK, 0.55));
  disc(g, hx + 0.3 * U, hy - 0.38 * U, 0.09 * U, 0.055 * U, paper);
  eye(pen, hx + 0.36 * U, hy - 0.1 * U, 0.14 * U, blinkAt(local));
  // the droopy ear over the back of the head, swinging a little with the walk and with joy on arrival
  const swing = Math.sin(Math.PI * 2 * P.step.reach) * 0.1 * P.go + (since >= 0 ? Math.sin(since * 14) * 0.1 * Math.max(0, 1 - since) : 0);
  shape(pen, ell(hx - 0.2 * U, hy + 0.12 * U, 0.29 * U, 0.58 * U, 26, 0.26 + swing), dark, 51);
}

function drawCat(P: Pose) {
  const { pen, U, bx0, bx1, top, local, since, color, paper } = P, g = pen.g, far = shade(color, 0.8), dark = shade(color, 0.7);
  const bob = bobOf(P, 0.04), feet = frontFeet(P, 0.22 * U, 0.18 * U), lw = 0.29 * U;
  const hx = bx1 + 0.36 * U, hy = top - 0.34 * U + bob, hrx = 0.8 * U, hry = 0.7 * U;
  blob(pen, [leg(P, bx0 + 0.36 * U, -0.05 * U, 0, lw), leg(P, bx1 - 0.62 * U, feet[1].off, feet[1].lift, lw)], far, 71);
  // the tail: a long S that sways slowly; on arrival it stands straight up with a little hook at the tip
  const sway = wagAt(local * 0.22), up = since >= 0 ? eOut3(clamp(since / 0.35)) : 0;
  const a0 = 2.75 + sway * 0.18 + (4.62 - 2.75 - sway * 0.18) * up, bend = 1.95 + sway * 0.55 + (0.55 - 1.95 - sway * 0.55) * up;
  const tailLine = curve([bx0 + 0.25 * U, top + 0.3 * U], 1.62 * U, a0, bend, 14);
  const body = capsule(bx0, bx1, top, U, 2 * U);
  // the ears: a triangle each side of the crown
  const ear = (a: number, wide: number): Pt[] => [[hx + Math.cos(a - wide) * hrx * 0.92, hy + Math.sin(a - wide) * hry * 0.92],
    [hx + Math.cos(a) * 1.22 * U, hy + Math.sin(a) * 1.16 * U], [hx + Math.cos(a + wide) * hrx * 0.92, hy + Math.sin(a + wide) * hry * 0.92]];
  const ears = [ear(-2.22, 0.36), ear(-1.0, 0.36)];
  blob(pen, [tube(tailLine, 0.26 * U, 0.22 * U), body, leg(P, bx0 + 0.6 * U, 0.04 * U, 0, lw), leg(P, bx1 - 0.38 * U, feet[0].off, feet[0].lift, lw),
    ell(bx1 - 0.06 * U, top + 0.18 * U + bob * 0.5, 0.42 * U, 0.44 * U, 20), ...ears, ell(hx, hy, hrx, hry, 30)], color, 81);
  // the ears' pink insides
  ears.forEach((e, i) => {
    const c: Pt = [(e[0][0] + e[1][0] + e[2][0]) / 3, (e[0][1] + e[1][1] + e[2][1]) / 3], pull = (p: Pt): Pt => [c[0] + (p[0] - c[0]) * 0.55, c[1] + (p[1] - c[1]) * 0.55 + 0.05 * U];
    handPath(g, e.map(pull), true, pen.amp * 0.5, 91 + i); g.fillStyle = withAlpha(PINK, 0.85); g.fill();
  });
  // a tabby's stripes along the back, kept inside the body over a cream chest and belly
  g.save(); handPath(g, body, true, pen.amp, 82); g.clip();
  disc(g, (bx0 + bx1) / 2 + 0.3 * U, top + 1.05 * U, (bx1 - bx0) / 2, 0.36 * U, paper);
  g.strokeStyle = dark; g.lineCap = 'round'; g.lineWidth = 0.13 * U;
  for (let sx = bx0 + 0.55 * U, i = 0; sx < bx1 - 0.45 * U; sx += 0.55 * U, i++) {
    g.beginPath(); g.moveTo(sx, top - 0.05 * U); g.quadraticCurveTo(sx + 0.12 * U, top + 0.2 * U, sx + 0.02 * U, top + (i % 2 ? 0.36 : 0.44) * U); g.stroke();
  }
  g.restore();
  // the face, turned three-quarters towards the way it walks: forehead stripes, a cream muzzle, two eyes, a pink nose, whiskers
  g.strokeStyle = dark; g.lineCap = 'round'; g.lineWidth = 0.1 * U;
  for (const d of [-0.18, 0, 0.18]) { g.beginPath(); g.moveTo(hx + 0.16 * U + d * U, hy - 0.66 * U); g.lineTo(hx + 0.17 * U + d * U * 0.8, hy - 0.46 * U + Math.abs(d) * U * 0.5); g.stroke(); }
  disc(g, hx + 0.32 * U, hy + 0.33 * U, 0.37 * U, 0.24 * U, paper);
  disc(g, hx - 0.14 * U, hy + 0.18 * U, 0.15 * U, 0.08 * U, withAlpha(PINK, 0.5));
  const shut = blinkAt(local);
  eye(pen, hx + 0.04 * U, hy - 0.04 * U, 0.135 * U, shut);
  eye(pen, hx + 0.54 * U, hy - 0.04 * U, 0.13 * U, shut);
  const nx = hx + 0.32 * U, ny = hy + 0.18 * U;
  g.fillStyle = PINK; g.beginPath(); g.moveTo(nx - 0.09 * U, ny - 0.045 * U); g.lineTo(nx + 0.09 * U, ny - 0.045 * U); g.lineTo(nx, ny + 0.055 * U); g.closePath(); g.fill();
  line(pen, [[nx - 0.12 * U, ny + 0.13 * U], [nx - 0.05 * U, ny + 0.16 * U], [nx, ny + 0.07 * U], [nx + 0.05 * U, ny + 0.16 * U], [nx + 0.12 * U, ny + 0.13 * U]], pen.ink, pen.lw * 0.6, 93);
  for (const [i, d] of [-0.09, 0.02, 0.13].entries()) {
    line(pen, [[hx + 0.62 * U, hy + (0.22 + d * 0.5) * U], [hx + 1.2 * U, hy + (0.12 + d * 1.6) * U]], pen.ink, pen.lw * 0.5, 94 + i);
    line(pen, [[hx - 0.1 * U, hy + (0.22 + d * 0.5) * U], [hx - 0.66 * U, hy + (0.14 + d * 1.6) * U]], pen.ink, pen.lw * 0.5, 97 + i);
  }
}

function drawWorm(P: Pose) {
  const { pen, U, bx0, bx1, ground, local, since, color, paper, th } = P, g = pen.g;
  // segments every thickness × 1.2 (at least 3), each a ball lifted by a slow hump running down the back: one silhouette, banded
  // inside in two greens, a shine on each and a pale underside
  const L = bx1 - bx0, n = Math.max(3, Math.floor(L / Math.max(1, th * 1.2))), r = 0.5 * U, c0 = bx0 + r, c1 = bx1 - 0.2 * U;
  const hump = (i: number) => Math.max(0, Math.sin(local * Math.PI * 1.4 - i * 0.75)) * 0.12 * U;
  const seg = Array.from({ length: n }, (_, i): Pt => [n > 1 ? c0 + ((c1 - c0) * i) / (n - 1) : c0, ground - r - hump(i)]);
  blob(pen, seg.map(([cx, cy]) => ell(cx, cy, r, r, 22)), color, 101);
  g.save(); g.beginPath();
  for (const [cx, cy] of seg) { g.moveTo(cx + r, cy); g.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2); }
  g.clip();
  seg.forEach(([cx, cy], i) => {
    disc(g, cx, cy, r, r, i % 2 ? shade(color, 0.88) : color);
    disc(g, cx + 0.02 * U, cy - 0.26 * U, 0.12 * U, 0.065 * U, 'rgba(255,255,255,0.35)');
  });
  disc(g, (bx0 + bx1) / 2, ground - 0.02 * U, L / 2 + r, 0.24 * U, withAlpha(paper, 0.8));
  g.restore();
  // the head, a little bigger and raised, with two antennae (a quiver on arrival) and a happy face looking ahead
  const hx = bx1 + 0.36 * U, hy = ground - 0.92 * U - hump(n) * 0.6, hr = 0.78 * U;
  const quiver = since >= 0 && since < 0.9 ? Math.sin(since * 34) * 0.4 * (1 - since / 0.9) : 0;
  [[-1.95, -0.5], [-1.25, 0.55]].forEach(([a, b], i) => {
    const base: Pt = [hx + Math.cos(a) * hr * 0.8, hy + Math.sin(a) * hr * 0.8], ang = a + (i ? quiver : -quiver) + Math.sin(local * 2.2 + i) * 0.06;
    const pts = curve(base, 0.62 * U, ang, b * 0.6, 6), [tx, ty] = pts[pts.length - 1];
    line(pen, pts, pen.ink, pen.lw * 1.1, 111 + i);
    g.beginPath(); g.ellipse(tx, ty, 0.12 * U, 0.12 * U, 0, 0, Math.PI * 2);
    g.fillStyle = shade(color, 0.8); g.fill(); g.strokeStyle = pen.ink; g.lineWidth = pen.lw; g.stroke();
  });
  shape(pen, ell(hx, hy, hr, hr * 0.94, 30), color, 115);
  disc(g, hx - 0.12 * U, hy - 0.4 * U, 0.2 * U, 0.1 * U, 'rgba(255,255,255,0.3)');
  disc(g, hx + 0.06 * U, hy + 0.34 * U, 0.15 * U, 0.08 * U, withAlpha(PINK, 0.6));
  disc(g, hx + 0.62 * U, hy + 0.32 * U, 0.1 * U, 0.07 * U, withAlpha(PINK, 0.6));
  const shut = blinkAt(local);
  eye(pen, hx + 0.12 * U, hy - 0.04 * U, 0.14 * U, shut);
  eye(pen, hx + 0.5 * U, hy - 0.04 * U, 0.13 * U, shut);
  const smile = since >= 0 ? 0.13 : 0.1;
  g.strokeStyle = pen.ink; g.lineWidth = pen.lw * 0.9; g.lineCap = 'round';
  g.beginPath(); g.arc(hx + 0.33 * U, hy + 0.16 * U, smile * U, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
}

const LOOKS: Record<Look, (P: Pose) => void> = { dog: drawDog, cat: drawCat, worm: drawWorm };

export const drawStretch: Draw = (ctx, p, _m, cv) => {
  const { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, look: Look = Object.hasOwn(ROOM, p.look) ? p.look : 'dog', R = ROOM[look];
  const th = Math.max(1, p.thickness) * k, U = th * 3;
  const height = (R.above + 1 + R.legs + 0.12) * U, { x, w, top: boxTop } = band(ctx, p, height), ground = boxTop + height - 0.06 * U, top = ground - R.legs * U - U;
  const u = travel(p.step, p.dots, local, dur), since = arrived(p.step, p.dots, local, dur);
  const minL = R.min * U, L = bodyLength(u, w, minL, R.head * U, R.rear * U), bx0 = x + R.rear * U, bx1 = bx0 + L;
  cssCamel(cv, { display: 'block', opacity: fadeOut(local, dur).toFixed(3) });
  const g = canvasAt(cv, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = 1;
  const pen: Pen = { g, lw: Math.max(1, 0.075 * U), amp: 0.012 * U, ink: p.ink };
  // what is still to go: a dashed line along the ground from just ahead of the head to the band's right end (a short post marks
  // it), the dashes anchored there so they do not crawl as the animal comes on; and a soft shadow under the animal
  const from = bx1 + R.head * U + 0.1 * U, end = x + w;
  if (end - from > 0.3 * U) {
    g.strokeStyle = p.track; g.lineWidth = 0.14 * U; g.setLineDash([0.3 * U, 0.3 * U]);
    g.beginPath(); g.moveTo(end - 0.07 * U, ground - 0.07 * U); g.lineTo(from, ground - 0.07 * U); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.moveTo(end - 0.07 * U, ground - 0.5 * U); g.lineTo(end - 0.07 * U, ground - 0.07 * U); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse((bx0 + bx1) / 2 + 0.2 * U, ground, (bx1 - bx0) / 2 + 0.8 * U, 0.1 * U, 0, 0, Math.PI * 2); g.fill();
  // the front legs step by how far the head has come; they stop once it is there, and stand still at the start
  const dist = L - minL, stride = 1.1 * U, stop = Math.max(0, dur - tail(dur)), still = prog(local, stop, stop + 0.15);
  const go = (1 - still) * clamp(dist / (stride * 0.5));
  LOOKS[look]({ pen, U, bx0, bx1, top, ground, local, since, step: stepAt(dist, stride), go, color: p.color, paper: p.paper, th });
  g.globalAlpha = 1;
};
