// common.progress vine (spec 2026-11-22, progress more modes): a vine growing from the left along the band (`band`, bottom suits it
// best) to a flower at the right end. The stem is a hand-drawn line (handPath) in `color` with a dark edge, rising and falling in a
// slow S of its own (not fuse's wave: the two lie in the same place); every `thickness × 4` a leaf grows out of it, above and below
// in turn, each a pointed blade with a darker half, a midrib and veins, turned a little differently, coming out within 0.3 s of the
// tip passing it and then swaying gently. A seedling's two little leaves mark the foot from the start; the tip ends in a curled
// tendril (the colour darkened, like the midribs); what is still to grow is a thin dashed line in `track`. At the end, where the
// wave has flattened out, waits a bud (pink-tipped in green sepals); on arrival it opens within 0.5 s into a five-petalled flower
// (`done` petals, a `paper` heart) that then rocks slowly. A `goal` (an emoji or a picture of the project's) pops out there on
// arrival instead (DOM; a picture that fails gives the flower back), `none` draws neither bud nor flower. Everything stays in the
// band its size keeps (vineSize: about thickness × 14 tall, the wave, leaves and flower drawn big so it reads as a plant at a
// glance) and in the side margins: the flower's centre is half a flower in from the right edge. Every movement is a sine of the
// item's time: no randomness, nothing kept from the frame before.
import { clamp, cssCamel, eBack, eIO3, eOut3 } from '@tellcut/engine';
import { mixHex, shade } from '../color.ts';
import { handPath } from '../hand.ts';
import { canvasAt } from '../inkline.ts';
import { piece, showPiece } from './runner.ts';
import { arrived, band, fadeOut, sinceAt, travel, type Draw } from './shared.ts';

type G = CanvasRenderingContext2D;
type Pt = [number, number];

/** the wave's height and length, in thicknesses */
const AMP = 3.2, PERIOD = 40;
/** sizes in thicknesses: the stem's width, a leaf's blade, the gap between leaves, the flower's diameter, the tendril's length */
const STEM = 0.5, LEAF = 3.9, GAP = 4, FLOWER = 7.8, TENDRIL = 4.4;
/** a leaf's stalk (in blade lengths), its widest half-width (in blade lengths), its turn off the horizontal (radians, by its number
 *  between TURN0 and TURN0 + TURN1), its size (by its number, between 1 − SIZE_VAR and 1 + SIZE_VAR), its sway, and how much of the
 *  stem's slope it follows */
const PETIOLE = 0.16, WIDTH = 0.33, TURN0 = 0.45, TURN1 = 0.32, SIZE_VAR = 0.1, SWAY = 0.07, FOLLOW = 0.5;
/** the least a leaf turns away from the stem (radians): following half the stem's slope, a leaf on the outside of a steep stretch
 *  lay along the stem, half under it */
const MIN_OFF = 0.5;
/** the seedling's leaves at the foot, in blade lengths, their turns (a V leaning back and up, leaving the tip's way clear: the
 *  tendril curled into the one that pointed ahead and was lost in it at the start) and their sizes */
const SPROUT = 0.5, SPROUTS: Array<[number, number]> = [[-1.95, 0.85], [-1.15, 1]];
/** the seedling leaves' sway (radians) */
const SPROUT_SWAY = 0.04;
/** the tendril's coil: how far it turns in all (radians) and how much that breathes */
const CURL = 2.5 * Math.PI, CURL_BREATH = 0.1;

/** the stem's offset from its centre line at `x` px along, for a vine `th` px thick (thickness × k; the stem itself is STEM of it):
 *  a slow S, amplitude th × 3.2, one wave every th × 40 (a bold garland: bigger and slower than fuse's rope) */
export const vineWave = (x: number, th: number): number => {
  if (!(th > 0) || !Number.isFinite(x)) return 0;
  const a = (2 * Math.PI * x) / (th * PERIOD);
  return th * AMP * (0.8 * Math.sin(a) + 0.2 * Math.sin(2 * a + 0.7));
};
/** a leaf's turn (screen radians) on side `side` where the stem's slope is `slope` (dy/dx), `h` (0…1) its own share of the turn:
 *  FOLLOW of the stem's angle plus TURN0…TURN0 + TURN1 to its side, never nearer the stem than MIN_OFF */
export function leafAngle(slope: number, side: -1 | 1, h: number): number {
  const s = Math.atan(Number.isFinite(slope) ? slope : 0), a = FOLLOW * s + side * (TURN0 + TURN1 * clamp(h));
  return side * (a - s) < MIN_OFF ? s + side * MIN_OFF : a;
}

/** where the stem starts settling onto the centre line before the flower, px along a stem `L` long (`th` px thick): the crest or
 *  trough of its wave nearest `want` px along, and at least `least` px before the end; 0 when there is none (the whole stem
 *  settles). From a crest the settling only ever comes down to the line: fading the wave out from a fixed place, where it was still
 *  heading away from the line, left a dent just before the flower. */
export function settleAt(L: number, want: number, least: number, th: number): number {
  const last = L - Math.max(0, least);
  if (!(th > 0) || !(last > 0) || !Number.isFinite(last)) return 0;
  const step = th * 0.25;
  let best = 0, gap = Infinity;
  for (let a = 0; a < last; a += step) {
    const b = Math.min(last, a + step);
    if (Math.sign(waveSlope(a, th)) === Math.sign(waveSlope(b, th))) continue;
    let lo = a, hi = b;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (Math.sign(waveSlope(mid, th)) === Math.sign(waveSlope(lo, th))) lo = mid; else hi = mid; }
    const x = (lo + hi) / 2;
    if (Math.abs(x - want) < gap) { gap = Math.abs(x - want); best = x; }
  }
  return best;
}

/** the wave's slope (dy/dx) at `x` */
const waveSlope = (x: number, th: number): number => {
  if (!(th > 0) || !Number.isFinite(x)) return 0;
  const a = (2 * Math.PI * x) / (th * PERIOD);
  return AMP * ((2 * Math.PI) / PERIOD) * (0.8 * Math.cos(a) + 0.4 * Math.cos(2 * a + 0.7));
};

/** where the leaves sit along a stem `w` px long, one every `gap` px (none at the very start or within a flower of the end): each
 *  its fraction of the way 0…1, its side (−1 above | 1 below, alternating) */
export function vineLeaves(w: number, gap: number, flower: number): Array<{ at: number; side: -1 | 1 }> {
  if (!(w > 0) || !Number.isFinite(w) || !(gap > 0)) return [];
  const out: Array<{ at: number; side: -1 | 1 }> = [], room = w - Math.max(0, Number.isFinite(flower) ? flower : 0);
  for (let i = 1; i * gap <= room && i * gap < w; i++) out.push({ at: (i * gap) / w, side: i % 2 ? -1 : 1 });
  return out;
}

/** a leaf's size 0…1, `since` seconds after the tip passed it (0.3 s to grow; 0 before) */
export const leafGrow = (since: number): number => (since > 0 ? eOut3(Math.min(1, since / 0.3)) : 0);

/** the flower's opening 0…1, `since` = arrived() (0.5 s; 0 before) */
export const bloom = (since: number): number => (since > 0 ? Math.min(1, since / 0.5) : 0);

// ---------- shapes ----------
/** a leaf from the foot of its stalk `base`, pointing at angle `a` (screen radians: 0 right, −π/2 up), its blade `len` px long, its
 *  tip bending `curl` (±1) to one side: the outline, one half a little wider (filled darker, clipped to the outline), the midrib,
 *  the veins and the stalk */
function leafShape(base: Pt, a: number, len: number, curl: number, stalk = PETIOLE, width = WIDTH) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c, n = 10;
  const axis = (t: number): Pt => {
    const d = (stalk + t) * len, b = curl * 0.09 * len * t * t;
    return [base[0] + c * d + nx * b, base[1] + s * d + ny * b];
  };
  const hw = (t: number) => len * width * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
  const edge = (t: number, k: number): Pt => { const [x, y] = axis(t); return [x + nx * hw(t) * k, y + ny * hw(t) * k]; };
  const ts = Array.from({ length: n + 1 }, (_, i) => i / n);
  const outline: Pt[] = [...ts.map((t) => edge(t, 1)), ...ts.slice(1, -1).reverse().map((t) => edge(t, -1))];
  const half: Pt[] = [...ts.map(axis), ...ts.slice(0, -1).reverse().map((t) => edge(t, -1.15))];
  const rib = ts.filter((t) => t <= 0.86).map(axis);
  const veins = [0.28, 0.5, 0.7].flatMap((t) => [1, -1].map((k): Pt[] => [axis(t), edge(Math.min(1, t + 0.16), k * 0.72)]));
  return { outline, half, rib, veins, stalk: [base, axis(0)] as Pt[] };
}

/** the tendril from the stem's tip `at`, heading `h0`, `len` px of line coiling upwards (`breath` −1…1 loosens it a little) */
function tendrilPts(at: Pt, h0: number, len: number, breath: number): Pt[] {
  const n = 18, out: Pt[] = [at];
  let [x, y] = at;
  for (let j = 1; j <= n; j++) {
    const f = j / n, h = h0 - CURL * (1 + CURL_BREATH * breath) * Math.pow(f, 1.7), step = (len / n) * (1.3 - 0.6 * f);
    x += Math.cos(h) * step; y += Math.sin(h) * step;
    out.push([x, y]);
  }
  return out;
}

/** how far the leaves and the tendril (with the stem's own wave under them) and the flower reach above or below the centre line, and
 *  the tendril ahead of the tip, for a vine 1 px thick: worked out once from the very shapes drawn, at every place along one wave
 *  and every turn and sway they can take (the stem near the end flattens towards the flower: its wave times 0…1) */
const REACH = (() => {
  let leaf = 0, tendril = 0, ahead = 0;
  for (let i = 0; i < 96; i++) {
    const x = (i / 96) * PERIOD, y0 = vineWave(x, 1), slope = waveSlope(x, 1), angle = Math.atan(slope);
    for (const env of [0, 1]) {
      for (let j = 0; j <= 8; j++) for (const side of [-1, 1] as const) for (const sway of [-1, -0.5, 0, 0.5, 1]) {
        const L = leafShape([0, y0 * env], leafAngle(slope, side, j / 8) + SWAY * sway, LEAF * (1 + SIZE_VAR), -side);
        for (const [, y] of [...L.outline, ...L.half, ...L.rib, ...L.veins.flat(), ...L.stalk]) leaf = Math.max(leaf, Math.abs(y));
      }
      for (const b of [-1, 1]) for (const [px, y] of tendrilPts([0, y0 * env], angle, TENDRIL, b)) { tendril = Math.max(tendril, Math.abs(y)); ahead = Math.max(ahead, px); }
    }
  }
  // how far the seedling's leaves lean back past the foot
  let back = 0;
  for (const [a, size] of SPROUTS) for (const sway of [-1, 0, 1]) {
    const L = leafShape([0, 0], a + SPROUT_SWAY * sway, LEAF * SPROUT * size, a < -Math.PI / 2 ? -1 : 1);
    for (const [x] of [...L.outline, ...L.half, ...L.stalk]) back = Math.max(back, -x);
  }
  // a little over, for the turns between those looked at
  return { leaf: leaf * 1.02, tendril: tendril * 1.02, ahead: ahead * 1.02, back: back * 1.02 + 0.1 };
})();

/** the vine's sizes for a vine `th` px thick (thickness × k): the stem's width, a leaf's blade, the gap between leaves, the flower's
 *  diameter, the wave's height, the tendril's length and the band's height (the least that holds the wave with the leaves and the
 *  tendril, and the flower, which sits on the centre line) */
export function vineSize(th: number): { stem: number; leaf: number; gap: number; flower: number; amp: number; tendril: number; height: number } {
  const t = Math.max(0, Number.isFinite(th) ? th : 0);
  // the pens' edges and wobble beyond the shapes' own points
  const half = Math.max(FLOWER / 2, REACH.leaf, REACH.tendril, AMP + STEM) * t + 0.12 * t;
  return { stem: STEM * t, leaf: LEAF * t, gap: GAP * t, flower: FLOWER * t, amp: AMP * t, tendril: TENDRIL * t, height: 2 * half };
}

// ---------- pens ----------
const fillPts = (g: G, pts: Pt[]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
const strokePts = (g: G, pts: Pt[]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };

interface Ink { g: G; th: number; color: string; dark: string; deep: string }

function leaf(I: Ink, base: Pt, a: number, len: number, curl: number, seed: number) {
  const { g, th } = I, L = leafShape(base, a, len, curl), amp = 0.02 * len;
  g.strokeStyle = I.deep; g.lineWidth = Math.max(1, 0.13 * th);
  strokePts(g, L.stalk);
  handPath(g, L.outline, true, amp, seed);
  g.fillStyle = I.color; g.fill();
  // the far half a shade darker, kept inside the outline
  g.save(); g.clip();
  g.fillStyle = I.deep; fillPts(g, L.half);
  g.restore();
  handPath(g, L.outline, true, amp, seed);
  g.strokeStyle = I.dark; g.lineWidth = Math.max(0.8, 0.07 * th); g.stroke();
  g.lineWidth = Math.max(0.8, 0.075 * th); strokePts(g, L.rib);
  g.lineWidth = Math.max(0.6, 0.045 * th);
  for (const v of L.veins) strokePts(g, v);
}

/** one petal's outline: an oval from near the centre out to `r`, a little notch at its round end, turned to `a` */
function petal(cx: number, cy: number, a: number, r: number): Pt[] {
  const c = Math.cos(a), s = Math.sin(a), n = 24;
  return Array.from({ length: n }, (_, j) => {
    const f = (j / n) * Math.PI * 2, d = Math.min(f, Math.PI * 2 - f);
    const along = r * (0.52 + 0.46 * Math.cos(f) - 0.1 * Math.exp(-((d / 0.32) ** 2))), across = r * 0.37 * Math.sin(f);
    return [cx + along * c - across * s, cy + along * s + across * c] as Pt;
  });
}

/** the bud at (x, y) `r` px tall: a closed pinkish bud in a green cup of three sepals, rocking a little from its foot */
function bud(I: Ink, x: number, y: number, r: number, tint: string, rock: number) {
  const { g } = I, foot: Pt = [x, y + 0.42 * r], up = -Math.PI / 2 + rock;
  if (r < 0.5) return;
  const body = leafShape(foot, up, r * 0.92, 0, 0, 0.42);
  handPath(g, body.outline, true, 0.02 * r, 301);
  g.fillStyle = tint; g.fill();
  g.strokeStyle = I.dark; g.lineWidth = Math.max(0.8, 0.05 * r); g.stroke();
  for (const [j, da] of [-0.62, 0.62, 0].entries()) {
    const sep = leafShape(foot, up + da, r * (j === 2 ? 0.4 : 0.52), da > 0 ? -1 : 1, 0, 0.26);
    handPath(g, sep.outline, true, 0.02 * r, 311 + j);
    g.fillStyle = I.color; g.fill();
    g.strokeStyle = I.dark; g.lineWidth = Math.max(0.8, 0.05 * r); g.stroke();
  }
}

/** the open flower at (x, y), petals reaching `r`, open `e` (0…1), turned `rot` */
function flower(I: Ink, x: number, y: number, r: number, e: number, rot: number, done: string, paper: string) {
  const { g } = I, s = 0.35 + 0.65 * e, rr = r * s, twist = rot + (1 - e) * 0.8;
  // green sepals between the petals, behind them
  for (let i = 0; i < 5; i++) {
    const a = twist + ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2, sep = leafShape([x, y], a, rr * 0.82, 0, 0.1, 0.22);
    g.fillStyle = I.color; fillPts(g, sep.outline);
    g.strokeStyle = I.dark; g.lineWidth = Math.max(0.8, 0.04 * r); g.stroke();
  }
  const edge = shade(done, 0.72);
  for (let i = 0; i < 5; i++) {
    const a = twist + (i / 5) * Math.PI * 2 - Math.PI / 2, pts = petal(x, y, a, rr);
    handPath(g, pts, true, 0.012 * rr, 401 + i);
    g.fillStyle = done; g.fill();
    g.strokeStyle = edge; g.lineWidth = Math.max(0.8, 0.045 * r); g.stroke();
    // a crease down its middle
    g.lineWidth = Math.max(0.6, 0.035 * r);
    strokePts(g, [[x + Math.cos(a) * rr * 0.28, y + Math.sin(a) * rr * 0.28], [x + Math.cos(a) * rr * 0.6, y + Math.sin(a) * rr * 0.6]]);
  }
  // the heart: a paper disc ringed with little dots
  const hr = 0.25 * rr;
  if (hr > 0.3) {
    g.fillStyle = paper; g.beginPath(); g.arc(x, y, hr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = edge; g.lineWidth = Math.max(0.6, 0.035 * r); g.stroke();
    g.fillStyle = shade(done, 0.55);
    for (let i = 0; i < 7; i++) {
      const a = twist * 1.3 + (i / 7) * Math.PI * 2;
      g.beginPath(); g.arc(x + Math.cos(a) * hr * 0.55, y + Math.sin(a) * hr * 0.55, hr * 0.14, 0, Math.PI * 2); g.fill();
    }
  }
}

export const drawVine: Draw = (ctx, p, m, cv) => {
  const { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, th = Math.max(1, p.thickness * k), S = vineSize(th);
  const goal = String(p.goal ?? '').trim(), none = goal.toLowerCase() === 'none';
  if (!m.el.goal && goal && !none) {
    piece(m, 'goal', goal, '', (f) => ctx.media.fileUrl(f));
    cssCamel(m.el.goal, { transformOrigin: '50% 50%' });
    if (m.el.goalImg) cssCamel(m.el.goalImg, { objectPosition: '50% 50%' });
  }
  const { x, w, top } = band(ctx, p, S.height), cy = top + S.height / 2, R = S.flower / 2;
  // the stem runs from its foot (in from the left edge by the stem, or by the seedling's leaves leaning back a little) to the
  // flower's centre (half a flower in from the right edge), or with no flower to where its tendril still has room
  const x0 = x + Math.max(S.stem, REACH.back * th), end = none ? x + w - REACH.ahead * th - S.stem : x + w - R, L = Math.max(0, end - x0);
  // the wave settles onto the centre line from a crest about 1.6 flowers before the end (a flower at least), so the bud and the
  // flower sit on it
  const xs = none ? L : settleAt(L, L - 1.6 * S.flower, S.flower, th), ys = vineWave(xs, th);
  const yAt = (px: number) => { const d = px - x0; return cy + (d <= xs ? vineWave(d, th) : ys * (1 - eIO3(clamp((d - xs) / Math.max(1e-9, L - xs))))); };
  // the drawn line's slope (the wave's own, or the settling's)
  const slopeAt = (px: number) => (px - x0 <= xs ? waveSlope(px - x0, th) : (yAt(px + 0.5) - yAt(px - 0.5)));
  const u = travel(p.step, p.dots, local, dur), since = arrived(p.step, p.dots, local, dur), tip = x0 + L * u;
  // the goal: popping out at the end on arrival, in place of the flower; a picture that failed gives the flower back
  const shown = m.el.goal ? showPiece(m, 'goal') : null, drawn = !none && (!shown || shown.failed);
  if (m.el.goal) {
    const gw = (2 * R) / 1.12, pop = since >= 0 ? eBack(clamp(since / 0.3), 1.6) : 0, gy = yAt(end);
    cssCamel(m.el.goal, { display: since >= 0 && !drawn ? 'block' : 'none', left: `${(end - gw / 2).toFixed(2)}px`, top: `${(gy - gw / 2).toFixed(2)}px`,
      width: `${gw.toFixed(2)}px`, height: `${gw.toFixed(2)}px`, transform: `scale(${Math.max(0, pop).toFixed(4)})` });
    cssCamel(m.el.goalText, { top: '50%', bottom: 'auto', left: '-50%', width: '200%', textAlign: 'center', fontSize: `${(gw * 0.9).toFixed(2)}px`, marginTop: `${(-gw * 0.45).toFixed(2)}px` });
  }
  cssCamel(cv, { display: 'block', opacity: fadeOut(local, dur).toFixed(3) });
  const g = canvasAt(cv, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = 1;
  const I: Ink = { g, th, color: p.color, dark: shade(p.color, 0.5), deep: shade(p.color, 0.8) };
  const step = Math.max(2, 6 * k), along = (a: number, b: number): Pt[] => {
    // points on the centre line from a to b (either way), every `step` px counted from the foot, so the hand-drawn wobble stays put
    const lo = Math.min(a, b), hi = Math.max(a, b), out: Pt[] = [[lo, yAt(lo)]];
    for (let q = Math.floor((lo - x0) / step) + 1, px = x0 + q * step; px < hi; q++, px = x0 + q * step) out.push([px, yAt(px)]);
    out.push([hi, yAt(hi)]);
    return a <= b ? out : out.reverse();
  };
  // what is still to grow: a thin dashed line from the end (the dashes anchored there, so they do not crawl) back to the tip
  const goalR = none ? 0 : 0.35 * R;
  if (end - goalR - tip > th) {
    g.setLineDash([0.55 * th, 0.5 * th]);
    g.strokeStyle = p.track; g.lineWidth = Math.max(1, 0.16 * th);
    strokePts(g, along(end - goalR, tip + 0.6 * th));
    g.setLineDash([]);
  }
  // the leaves, each from where the tip passed it, under the stem
  for (const [i, lf] of vineLeaves(L, S.gap, S.flower).entries()) {
    const grow = leafGrow(sinceAt(p.step, p.dots, lf.at, local, dur));
    if (grow <= 0.01) continue;
    const lx = x0 + lf.at * L, h1 = 0.5 + 0.5 * Math.sin(i * 2.71 + 0.3);
    const a = leafAngle(slopeAt(lx), lf.side, h1) + SWAY * Math.sin(local * 1.7 + i * 1.3) * grow;
    leaf(I, [lx, yAt(lx)], a, S.leaf * (1 + SIZE_VAR * Math.sin(i * 1.93 + 0.4)) * grow, -lf.side, 200 + i);
  }
  // the seedling's two little leaves at the foot, there from the start
  for (const [j, [a, size]] of SPROUTS.entries()) leaf(I, [x0, yAt(x0)], a + SPROUT_SWAY * Math.sin(local * 1.5 + j), S.leaf * SPROUT * size, a < -Math.PI / 2 ? -1 : 1, 190 + j);
  // the stem: its dark edge, then the stem, then a light shine along its top
  if (tip - x0 > 0.5) {
    const pts = along(x0, tip), amp = 0.04 * th;
    handPath(g, pts, false, amp, 11);
    g.strokeStyle = I.dark; g.lineWidth = S.stem + Math.max(1.5, 0.14 * th); g.stroke();
    g.strokeStyle = p.color; g.lineWidth = S.stem; g.stroke();
    g.save(); g.translate(0, -S.stem * 0.22);
    handPath(g, pts, false, amp, 11);
    g.strokeStyle = shade(p.color, 1.35); g.lineWidth = Math.max(0.6, S.stem * 0.28); g.stroke();
    g.restore();
  }
  // the tendril at the tip, curling into the bud as the tip nears it; gone once the flower opens
  const room = none ? 1 : clamp((end - tip - 0.3 * R) / (0.5 * R + S.tendril));
  if (room > 0.02 && (none || since < 0)) {
    const pts = tendrilPts([tip, yAt(tip)], Math.atan(slopeAt(tip)), S.tendril * room, Math.sin(local * 2.3)), lw = Math.max(1.2, 0.2 * th);
    // a dark edge under it, as the stem has: over a leaf of the same green it was lost
    g.strokeStyle = I.dark; g.lineWidth = lw + Math.max(1, 0.1 * th);
    strokePts(g, pts);
    g.strokeStyle = I.deep; g.lineWidth = lw;
    strokePts(g, pts);
  }
  if (none) { g.globalAlpha = 1; return; }
  // the bud waits at the end; on arrival it opens into the flower, which then rocks slowly (or the goal pops out in its place)
  const fy = yAt(end), b = drawn ? bloom(since) : 0, e = eOut3(b);
  if (b < 1 && (drawn || since < 0)) bud(I, end, fy, 1.2 * R * (1 - e), mixHex(p.done, p.color, 0.15), 0.06 * Math.sin(local * 1.6));
  if (b > 0) flower(I, end, fy, R * 0.97, e, 0.07 * Math.sin(local * 1.9), p.done, p.paper);
  g.globalAlpha = 1;
};
