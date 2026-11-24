// common.progress paws (spec 2026-11-22, progress characters): a trail of `dots` prints along the safe edge, walking right. Print i
// is stamped once the progress reaches (i + 0.5) / n — shrinking from 1.4 times its size and fading in over 0.2 s — left and right
// of the line in turn, each tilted a little; the newest is solid, the older ones settle at 0.6. By default the prints are drawn on
// the canvas in `color` (a pad and four toes: 🐾 differs from platform to platform and cannot be recoloured); `runner` stamps an
// emoji (DOM, as drawn, never mirrored) or a picture of the project's instead. The row fits in TOP_LANE at iconSize 1, like bar, so
// it can sit above a header.
import { clamp, cssCamel, eOut3 } from '@tellcut/engine';
import { canvasAt } from '../inkline.ts';
import { piece, showPiece, standing } from './runner.ts';
import { band, fadeOut, landscape, sinceAt, TOP_LANE, travel, type Draw } from './shared.ts';

/** seconds a print takes to land */
const LAND = 0.2;

/** for each of `n` prints: how far in it is (0 not yet, 1 landed; 0.2 s to land) and whether it is the newest */
export function pawStates(n: number, p: number, sinceEach: (i: number) => number): Array<{ in: number; newest: boolean }> {
  const m = Math.max(0, Math.round(n)), down = Array.from({ length: m }, (_, i) => p >= (i + 0.5) / m), last = down.lastIndexOf(true);
  return down.map((d, i) => {
    const since = d ? sinceEach(i) : 0;
    return { in: d ? (Number.isNaN(since) ? 1 : clamp(since / LAND)) : 0, newest: i === last };
  });
}

/** print i's offset across the line (−1 | 1, alternating) and tilt in degrees (fixed by i) */
export const pawPose = (i: number): { side: -1 | 1; tilt: number } => {
  const side: -1 | 1 = i % 2 ? 1 : -1;
  // toes turned a little outwards (the upper prints up, the lower ones down), give or take a few degrees
  return { side, tilt: side * 7 + (((i * 7) % 5) - 2) * 1.5 };
};

/** seconds since `travel` reached print i (of `dots`) at `local` (sinceAt at the print's place); Infinity when it was there before
 *  the item began (or the item has no time to go along in) */
export function pawSince(step: number, dots: number, i: number, local: number, dur: number): number {
  return sinceAt(step, dots, (i + 0.5) / Math.max(1, Math.round(dots)), local, dur);
}

/** one print facing up, `u` px long, centred on the origin: a rounded three-lobed pad behind and four toes in an arc ahead */
function paw(g: CanvasRenderingContext2D, u: number) {
  g.beginPath();
  g.moveTo(0, 0.02 * u);
  g.bezierCurveTo(0.15 * u, 0.02 * u, 0.29 * u, 0.15 * u, 0.29 * u, 0.27 * u);
  g.bezierCurveTo(0.29 * u, 0.37 * u, 0.21 * u, 0.41 * u, 0.12 * u, 0.39 * u);
  g.bezierCurveTo(0.06 * u, 0.37 * u, -0.06 * u, 0.37 * u, -0.12 * u, 0.39 * u);
  g.bezierCurveTo(-0.21 * u, 0.41 * u, -0.29 * u, 0.37 * u, -0.29 * u, 0.27 * u);
  g.bezierCurveTo(-0.29 * u, 0.15 * u, -0.15 * u, 0.02 * u, 0, 0.02 * u);
  g.fill();
  for (const [x, y, rx, ry, rot] of [[-0.3, -0.1, 0.095, 0.125, -0.45], [-0.11, -0.28, 0.105, 0.135, -0.15], [0.11, -0.28, 0.105, 0.135, 0.15], [0.3, -0.1, 0.095, 0.125, 0.45]]) {
    g.beginPath(); g.ellipse(x * u, y * u, rx * u, ry * u, rot, 0, Math.PI * 2); g.fill();
  }
}

/** the row's height over a print's length: the print's width across the line (0.8), the two sides' offset and the tilt's room */
const ROW = 1.5, OFFSET = 0.26;

export const drawPaws: Draw = (ctx, p, m, cv) => {
  const { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, n = Math.max(1, Math.round(p.dots)), stamp = String(p.runner ?? '').trim();
  if (stamp && !m.list.length) for (let i = 0; i < n; i++) { piece(m, `paw${i}`, stamp, '🐾', (f) => ctx.media.fileUrl(f)); m.list.push(m.el[`paw${i}`]); }
  // a print's length: three and a half thicknesses, but never so big that the row would leave the top lane (at iconSize 1); on a
  // landscape frame the lane is a share of its short height, and that cap left the prints at 25 px: there it is landscape() times
  // as roomy, which gives the prints their 9:16 size (and the row is taller than the lane: a header under it takes its own y)
  const ps = Math.min(p.thickness * 3.5 * k, (TOP_LANE * H * landscape(W, H)) / ROW) * Math.max(0.1, p.iconSize);
  const { x, w, top } = band(ctx, p, ps * ROW), cy = top + (ps * ROW) / 2;
  const st = pawStates(n, travel(p.step, p.dots, local, dur), (i) => pawSince(p.step, p.dots, i, local, dur));
  const at = (i: number) => {
    const { side, tilt } = pawPose(i), s = st[i], next = st[i + 1];
    // the newest fades in; an older one goes from solid to 0.6 as the next one lands
    const alpha = s.newest ? s.in : 0.6 + 0.4 * (1 - (next?.in ?? 1));
    return { cx: x + (w * (i + 0.5)) / n, cy: cy + side * OFFSET * ps, tilt, alpha, scale: 1.4 - 0.4 * eOut3(s.in) };
  };
  if (m.list.length) {
    m.list.forEach((box, i) => {
      // every print styled every frame, shown or not, so one time drawn twice is the same DOM whatever came between
      const a = at(i);
      showPiece(m, `paw${i}`);
      standing(m.el[`paw${i}Text`], ps);
      cssCamel(box, { display: st[i].in ? 'block' : 'none', left: `${(a.cx - ps / 2).toFixed(2)}px`, top: `${(a.cy - ps / 2).toFixed(2)}px`, width: `${ps.toFixed(2)}px`, height: `${ps.toFixed(2)}px`,
        transformOrigin: '50% 50%', opacity: a.alpha.toFixed(3), transform: `rotate(${a.tilt.toFixed(2)}deg) scale(${a.scale.toFixed(4)})` });
    });
    return;
  }
  cssCamel(cv, { display: 'block', opacity: fadeOut(local, dur).toFixed(3) });
  const g = canvasAt(cv, W, H);
  g.fillStyle = p.color;
  for (let i = 0; i < n; i++) {
    if (!st[i].in) continue;
    const a = at(i);
    g.globalAlpha = a.alpha;
    g.save();
    g.translate(a.cx, a.cy);
    // drawn facing up, turned to face right (and tilted)
    g.rotate(Math.PI / 2 + (a.tilt * Math.PI) / 180);
    g.scale(a.scale, a.scale);
    paw(g, ps);
    g.restore();
  }
  g.globalAlpha = 1;
};

