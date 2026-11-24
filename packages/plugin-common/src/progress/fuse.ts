// common.progress fuse (spec 2026-11-22, progress characters): a lit fuse burning towards a bomb. A twisted rope (`track` colour,
// a gentle fixed wave, hand drawn) runs along the safe edge to the goal at its right end (💣 by default, `goal`; DOM, sitting on the
// rope's end); the spark at the progress's front is a white-hot core, flickering rays and a warm glow in `color`, throwing off a few
// sparks; behind it the burnt part is a thin grey dashed trail of ash, a few embers still glowing next to the spark. The bomb
// trembles as the spark gets near; on arrival the spark is gone and the bomb pops to 1.3 times its size and back within 0.3 s.
// Every flicker is a sum of sines of the item's time: no randomness.
import { clamp, cssCamel } from '@tellcut/engine';
import { withAlpha } from '../color.ts';
import { handPath } from '../hand.ts';
import { canvasAt } from '../inkline.ts';
import { piece, showPiece, standing } from './runner.ts';
import { arrived, band, fadeOut, landscape, travel, type Draw } from './shared.ts';

type G = CanvasRenderingContext2D;
type Pt = [number, number];

const GOAL = '💣';
/** the bomb's size, in thicknesses (times iconSize): 96 px at the default 12 on a 1080 short side */
const GOAL_SIZE = 8;
/** how far the spark's rays reach and how high the rope waves, as shares of the bomb's size */
const RAY = 0.42, WAVE = 0.1;
/** how far below the rope the bomb's foot is (a share of its size): the rope runs into its lower left, the bomb sitting on its end */
const SIT = 0.2;

/** the spark's ray lengths (0…1) at `local`: `n` rays, each a sum of sines of local with its own phase; no randomness */
export function sparkRays(local: number, n = 12): number[] {
  const t = Number.isFinite(local) ? local : 0;
  return Array.from({ length: Math.max(0, Math.round(n)) }, (_, i) =>
    clamp(0.5 + 0.24 * Math.sin(t * 23 + i * 2.39) + 0.16 * Math.sin(t * 37.3 + i * 5.71) + 0.1 * Math.sin(t * 61.7 + i * 1.13)));
}

/** the fuse's height offset (−1…1) at share `u` of its length: a gentle fixed wave, flat at both ends */
export const fuseWave = (u: number): number => {
  const v = clamp(Number.isFinite(u) ? u : 0);
  return (0.62 * Math.sin(v * Math.PI * 2.6) + 0.38 * Math.sin(v * Math.PI * 5.8 + 0.9)) * Math.sin(Math.PI * v);
};

/** sparks thrown off the spark: `n` of them, each flying out and fading on a cycle of its own; the cycle number picks its direction
 *  (a sine hash, so the same time always throws the same sparks) */
function flying(local: number, n: number): Array<{ dx: number; dy: number; life: number }> {
  return Array.from({ length: n }, (_, j) => {
    const T = 0.34 + 0.05 * j, f = local / T + j * 0.37, age = f - Math.floor(f), c = Math.floor(f);
    const a = -Math.PI / 2 + 1.25 * Math.sin(c * 12.9898 + j * 78.233), d = 0.7 + 1.0 * age;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d + 0.5 * age * age, life: 1 - age };
  });
}

/** the rope's centreline from xs to xe: points every few px, so its hand-drawn wobble stays put as the spark eats it */
function ropePoints(xs: number, xe: number, y: number, amp: number, step: number): Pt[] {
  const n = Math.max(2, Math.ceil((xe - xs) / Math.max(1, step)));
  return Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [xs + (xe - xs) * u, y + fuseWave(u) * amp] as Pt; });
}

export const drawFuse: Draw = (ctx, p, m, cv) => {
  // sized from the short side as on 9:16, but strung across a frame 1.78 times as wide on 16:9, where it read thin: there the
  // rope and the bomb are the square root of landscape() larger (the whole of it made the band a quarter of the frame tall)
  const { W, H, local, dur } = ctx, k = (Math.min(W, H) / 1080) * Math.sqrt(landscape(W, H)), th = Math.max(1, p.thickness * k);
  const goal = String(p.goal ?? '').trim();
  if (!m.el.goal && goal.toLowerCase() !== 'none') piece(m, 'goal', goal, GOAL, (f) => ctx.media.fileUrl(f));
  const gw = p.thickness * GOAL_SIZE * Math.max(0.1, p.iconSize) * k, R = RAY * gw, A = WAVE * gw, rw = Math.max(3, th * 0.75);
  // room for the spark's rays below the rope's lowest wave, and above the bomb's foot for its pop (1.3 times, grown from the foot)
  const hb = R + A - SIT * gw + 1.3 * gw, { x, w, top } = band(ctx, p, hb), ropeY = top + hb - R - A, foot = ropeY + SIT * gw;
  // the bomb's centre, far enough in for its pop; the rope runs in under it, the spark stops at its side
  const gx = x + w - 0.65 * gw, xs = x + R - rw / 2, xe = m.el.goal ? gx : x + w - R + rw / 2, x1 = m.el.goal ? gx - 0.4 * gw : x + w - R;
  const x0 = x + 1.1 * R, u = travel(p.step, p.dots, local, dur), since = arrived(p.step, p.dots, local, dur);
  const sx = x0 + (Math.max(x0, x1) - x0) * u, yAt = (px: number) => ropeY + fuseWave((px - xs) / (xe - xs || 1)) * A, sy = yAt(sx);
  if (m.el.goal) {
    showPiece(m, 'goal');
    standing(m.el.goalText, gw);
    // trembling as the spark nears, still once it is there; the pop within 0.3 s of arrival
    const near = since >= 0 ? 0 : clamp((u - 0.75) / 0.25), shake = near * 5 * Math.sin(local * 41) * Math.sin(local * 7.3 + 1);
    const pop = since >= 0 ? 1 + 0.3 * Math.sin(Math.PI * clamp(since / 0.3)) : 1;
    cssCamel(m.el.goal, { left: `${(gx - gw / 2).toFixed(2)}px`, top: `${(foot - gw).toFixed(2)}px`, width: `${gw.toFixed(2)}px`, height: `${gw.toFixed(2)}px`,
      transform: `rotate(${shake.toFixed(2)}deg) scale(${pop.toFixed(4)})` });
  }
  cssCamel(cv, { display: 'block', opacity: fadeOut(local, dur).toFixed(3) });
  const g = canvasAt(cv, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const pts = ropePoints(xs, xe, ropeY, A, 10 * k), amp = rw * 0.08;
  const clipX = (from: number, to: number) => { g.save(); g.beginPath(); g.rect(from, 0, Math.max(0, to - from), H); g.clip(); };
  // what is still to burn: a dark edge for any background, the rope, its twist (short diagonal strands every so often) and a shine
  clipX(sx, W);
  handPath(g, pts, false, amp, 7);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = rw + 3 * k; g.stroke();
  g.strokeStyle = p.track; g.lineWidth = rw; g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(1, rw * 0.22);
  g.beginPath();
  for (let d = 0, i = 0, run = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay) || 1, a = Math.atan2(by - ay, bx - ax);
    for (; d <= run + L; d += rw * 0.85) {
      const t = (d - run) / L, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, s = a + 1.05, h = rw * 0.5;
      g.moveTo(cx - Math.cos(s) * h, cy - Math.sin(s) * h); g.lineTo(cx + Math.cos(s) * h, cy + Math.sin(s) * h);
    }
    run += L;
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = Math.max(1, rw * 0.18);
  g.save(); g.translate(0, -rw * 0.22); handPath(g, pts, false, amp, 7); g.stroke(); g.restore();
  g.restore();
  // just burnt: a charred stub behind the spark
  const char = sx - rw * 2.6;
  if (since < 0) {
    clipX(char, sx);
    handPath(g, pts, false, amp, 7);
    g.strokeStyle = '#2a1d16'; g.lineWidth = rw * 0.8; g.stroke();
    g.restore();
  }
  // the burnt part: a thin dashed trail of grey ash, the dashes anchored at the start so they do not crawl
  clipX(0, since < 0 ? char : sx);
  handPath(g, pts, false, amp, 7);
  g.setLineDash([rw * 0.7, rw * 0.55]);
  g.strokeStyle = 'rgba(150,150,150,0.85)'; g.lineWidth = Math.max(1.5, rw * 0.32); g.stroke();
  g.setLineDash([]);
  g.restore();
  if (since < 0) {
    // embers just behind the spark: the rope's freshly burnt end glowing, a few dots fading out along it
    for (let j = 0; j < 4; j++) {
      const ex = sx - rw * (0.7 + 0.6 * j), on = 0.55 + 0.45 * Math.sin(local * (13 + 4 * j) + j * 2.1);
      if (ex <= xs) continue;
      g.globalAlpha = clamp((1 - j / 5) * on);
      g.fillStyle = j ? '#ff6a1a' : '#ffd27a';
      g.beginPath(); g.arc(ex, yAt(ex) + (j % 2 ? 0.12 : -0.1) * rw, rw * (0.3 - 0.04 * j), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    // the glow, breathing with the flicker, then the rays (each with a white-hot inner half), the flying sparks and the core
    const rays = sparkRays(local), mean = rays.reduce((a, b) => a + b, 0) / (rays.length || 1), gr = R * (0.95 + 0.15 * mean);
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, gr);
    glow.addColorStop(0, withAlpha(p.color, 0.95)); glow.addColorStop(0.3, withAlpha(p.color, 0.5)); glow.addColorStop(1, withAlpha(p.color, 0));
    g.fillStyle = glow; g.beginPath(); g.arc(sx, sy, gr, 0, Math.PI * 2); g.fill();
    rays.forEach((r, i) => {
      const a = (i / rays.length) * Math.PI * 2 + 0.2 * Math.sin(local * 3 + i), len = R * (0.35 + 0.65 * r), c = Math.cos(a), s = Math.sin(a);
      g.strokeStyle = p.color; g.lineWidth = Math.max(1, rw * (i % 2 ? 0.22 : 0.32));
      g.beginPath(); g.moveTo(sx + c * rw * 0.4, sy + s * rw * 0.4); g.lineTo(sx + c * len, sy + s * len); g.stroke();
      g.strokeStyle = '#fffbe8'; g.lineWidth = Math.max(1, rw * 0.15);
      g.beginPath(); g.moveTo(sx + c * rw * 0.3, sy + s * rw * 0.3); g.lineTo(sx + c * len * 0.55, sy + s * len * 0.55); g.stroke();
    });
    for (const f of flying(local, 7)) {
      const fx = clamp(sx + f.dx * R, x + 2, x + w - 2), fy = sy + f.dy * R;
      g.globalAlpha = clamp(f.life * 1.2);
      g.fillStyle = f.life > 0.5 ? '#fffbe8' : p.color;
      g.beginPath(); g.arc(fx, fy, Math.max(1, rw * 0.22 * (0.5 + f.life)), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(sx, sy, rw * 0.6, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
};
