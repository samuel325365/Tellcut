// common.progress rocket (spec 2026-11-22, progress more modes): the one upright mode. A rocket (🚀 by default, `runner`; DOM) climbs
// a thin vertical track up the side of the safe area (`align` left, else right) towards a goal at the top (🌙 by default, `goal`;
// `none` for none); the track below it is filled in `color`, the rest is `track`. It sways a little from side to side and, when it
// is the 🚀, a flickering flame (canvas) burns under it. On arrival the goal pops and a ring of firework rays bursts out round it and
// fades within 0.8 s. Room for all of it is kept inside the safe area first: half a goal above the goal (the pop, the fireworks), a
// flame's length under the rocket at the start, the sway at the side; the run is what is left. Every flicker is a sum of sines of
// the item's time: no randomness.
import { abs, clamp, cssCamel, eOut3 } from '@tellcut/engine';
import { canvasAt } from '../inkline.ts';
import { bare, glyphOf, isPicture, piece, showPiece, standing } from './runner.ts';
import { arrived, fadeOut, travel, type Draw } from './shared.ts';

const RUNNER = '🚀', GOAL = '🌙';
/** the rocket's (and goal's) height, in thicknesses (times iconSize), like runner's character */
const SIZE = 6;
/** shares of the rocket's size: the sway's amplitude, the room kept for it at the side, the flame's longest */
const SWAY = 0.05, ROOM = 0.06, FLAME = 0.7;
/** the goal's pop on arrival: up to 1 + POP within 0.4 s, grown from its centre (POP / 2 of a goal each side: inside ROOM) */
const POP = 0.12;
/** the turned 🚀's font size (a share of its box: Segoe UI Emoji draws the rocket along the em box's diagonal, so upright it is
 *  about 0.92 of the box tall and a third of it wide) and how far up from the box's bottom its nozzle is (looked at on Windows) */
const TURNED_FONT = 0.9, NOZZLE = 0.12;

/** the lane a rocket `size` px tall flies in: its centre x (against the right safe edge, or the left), the goal's top (half a goal
 *  below the top safe edge), and the rocket's bottom y at progress 0 (a flame's length above the bottom safe edge) and at 1 (its top
 *  touching the goal's bottom); to ≤ from, and to === from when there is no room */
export function rocketLane(W: number, H: number, safe: { top: number; bottom: number; side: number }, size: number, right: boolean): { cx: number; goalTop: number; from: number; to: number } {
  const s = Math.max(0, Number.isFinite(size) ? size : 0), side = safe.side * W, edge = (0.5 + ROOM) * s;
  const cx = right ? W - side - edge : side + edge, goalTop = safe.top * H + s / 2;
  const from = Math.max(0, H * (1 - safe.bottom) - FLAME * s), to = Math.min(from, goalTop + 2 * s);
  return { cx, goalTop, from, to };
}

/** degrees to turn the runner so it points up: −45 for 🚀 (drawn pointing up-right), 0 for anything else */
export const uprightTurn = (v: string): number => (!isPicture(v) && bare(glyphOf(v, RUNNER)) === RUNNER ? -45 : 0);

/** the firework's rays `since` seconds after arriving: none before 0 or from 0.8 on. Each ray reaches from r0 to r1 goal sizes out from
 *  the goal's rim (r1 ≤ 0.5: the half goal kept above it), the odd ones a little shorter; they shoot out and fade */
export function fireworks(since: number, n = 10): Array<{ angle: number; r0: number; r1: number; alpha: number }> {
  if (!(since >= 0) || since >= 0.8) return [];
  const u = since / 0.8, head = eOut3(clamp(u * 1.4)), tailEnd = eOut3(clamp((u - 0.12) / 0.88));
  return Array.from({ length: Math.max(0, Math.round(n)) }, (_, i) => {
    const reach = i % 2 ? 0.78 : 1, r1 = 0.5 * reach * (0.15 + 0.85 * head), r0 = Math.min(r1, 0.5 * reach * 0.92 * tailEnd);
    return { angle: -Math.PI / 2 + (i / n) * Math.PI * 2, r0, r1, alpha: clamp(1 - u * u) };
  });
}

type G = CanvasRenderingContext2D;

/** a flame hanging from (x, y): `hw` half wide at the top, `len` long, its tip off to the side by `lean` */
function flame(g: G, x: number, y: number, hw: number, len: number, lean: number) {
  g.beginPath();
  g.moveTo(x - hw, y);
  g.bezierCurveTo(x - hw, y + len * 0.45, x + lean - hw * 0.3, y + len * 0.78, x + lean, y + len);
  g.bezierCurveTo(x + lean + hw * 0.3, y + len * 0.78, x + hw, y + len * 0.45, x + hw, y);
  g.closePath();
  g.fill();
}

export const drawRocket: Draw = (ctx, p, m, cv) => {
  const { W, H, local, dur, theme } = ctx, safe = theme.safe, k = Math.min(W, H) / 1080, right = p.align !== 'left';
  if (!m.el.track) {
    m.el.track = abs(m.root); m.el.fill = abs(m.root);
    const goal = String(p.goal ?? '').trim();
    if (goal.toLowerCase() !== 'none') piece(m, 'goal', goal, GOAL, (f) => ctx.media.fileUrl(f));
    piece(m, 'runner', String(p.runner ?? ''), RUNNER, (f) => ctx.media.fileUrl(f));
  }
  // the rocket's size, never so big that the goal, the rocket and the room kept for them leave the safe area
  const safeH = H * (1 - safe.top - safe.bottom), safeW = W * (1 - 2 * safe.side);
  const s = Math.max(1, Math.min(p.thickness * SIZE * Math.max(0.1, p.iconSize) * k, safeH / (0.5 + 2 + FLAME), safeW / (1 + 2 * ROOM)));
  const lane = rocketLane(W, H, safe, s, right), goalBottom = lane.goalTop + s;
  // with no goal the run ends where the goal's top would be
  const end = m.el.goal ? lane.to : Math.min(lane.from, lane.goalTop + s), u = travel(p.step, p.dots, local, dur), since = arrived(p.step, p.dots, local, dur);
  const bottom = lane.from + (end - lane.from) * u, sway = SWAY * s * Math.sin(local * 2.3) * Math.cos(local * 0.9), rx = lane.cx + sway;
  const { failed } = showPiece(m, 'runner'), who = failed ? RUNNER : String(p.runner ?? ''), turn = uprightTurn(who), fire = turn !== 0;
  // the flame: a sum of sines, never longer than the room kept for it; it dies down to a glow once arrived
  const settle = since >= 0 ? 1 - 0.45 * clamp(since / 0.4) : 1;
  const flick = clamp(0.8 + 0.1 * Math.sin(local * 31) + 0.09 * Math.sin(local * 47.3 + 1.3) + 0.05 * Math.sin(local * 71.9 + 2.1)) * settle;
  const fy = bottom - NOZZLE * s, flen = FLAME * s * flick;
  // the track from the start up to the goal (or the run's end); filled below the flame's shortest tip, plain above the rocket's middle
  const tw = Math.max(2, p.thickness * 0.5 * k), tx = lane.cx - tw / 2, trackTop = m.el.goal ? goalBottom : end - s;
  const fillTop = Math.min(lane.from, fire ? fy + FLAME * s * 0.6 : bottom), restBottom = Math.max(trackTop, bottom - s / 2);
  cssCamel(m.el.track, { left: `${tx.toFixed(2)}px`, top: `${trackTop.toFixed(2)}px`, width: `${tw.toFixed(2)}px`, height: `${Math.max(0, restBottom - trackTop).toFixed(2)}px`,
    borderRadius: `${(tw / 2).toFixed(2)}px`, background: p.track });
  cssCamel(m.el.fill, { left: `${tx.toFixed(2)}px`, top: `${fillTop.toFixed(2)}px`, width: `${tw.toFixed(2)}px`, height: `${Math.max(0, lane.from - fillTop).toFixed(2)}px`,
    borderRadius: `${(tw / 2).toFixed(2)}px`, background: p.color });
  if (m.el.goal) {
    showPiece(m, 'goal');
    standing(m.el.goalText, s);
    const pop = since >= 0 ? 1 + POP * Math.sin(Math.PI * clamp(since / 0.4)) : 1;
    cssCamel(m.el.goal, { left: `${(lane.cx - s / 2).toFixed(2)}px`, top: `${lane.goalTop.toFixed(2)}px`, width: `${s.toFixed(2)}px`, height: `${s.toFixed(2)}px`,
      transformOrigin: '50% 50%', transform: `scale(${pop.toFixed(4)})` });
  }
  // the rocket: 🚀 turned upright about its middle; anything else stands on the box's bottom as drawn. `flip` mirrors either.
  const text = m.el.runnerText;
  if (fire) {
    const fs = s * TURNED_FONT;
    cssCamel(text, { top: '50%', bottom: 'auto', left: '-50%', width: '200%', textAlign: 'center', fontSize: `${fs.toFixed(2)}px`, marginTop: `${(-fs / 2).toFixed(2)}px`,
      transformOrigin: '50% 50%', transform: `rotate(${turn}deg)` });
  } else {
    standing(text, s);
    cssCamel(text, { marginTop: '0px', transform: 'none' });
  }
  cssCamel(m.el.runner, { left: `${(rx - s / 2).toFixed(2)}px`, top: `${(bottom - s).toFixed(2)}px`, width: `${s.toFixed(2)}px`, height: `${s.toFixed(2)}px`,
    transform: p.flip ? 'scale(-1, 1)' : 'none' });
  const rays = m.el.goal ? fireworks(since) : [];
  if (!fire && !rays.length) return;
  cssCamel(cv, { display: 'block', opacity: fadeOut(local, dur).toFixed(3) });
  const g = canvasAt(cv, W, H);
  if (fire && flen > 0.5) {
    const hw = 0.15 * s * (0.92 + 0.08 * Math.sin(local * 23 + 0.4)), lean = hw * 0.35 * Math.sin(local * 17.3) * Math.sin(local * 5.1 + 0.7);
    // a warm glow round the flame's top half, kept above its tip
    const gr = flen * 0.55, gy = fy + flen * 0.4, glow = g.createRadialGradient(rx, gy, 0, rx, gy, gr);
    glow.addColorStop(0, 'rgba(255,170,60,0.45)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(rx, gy, gr, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.92; g.fillStyle = '#ff5a1f'; flame(g, rx, fy, hw, flen, lean);
    g.globalAlpha = 1; g.fillStyle = '#ffb020'; flame(g, rx, fy, hw * 0.68, flen * 0.72, lean * 0.7);
    g.fillStyle = '#fff4c8'; flame(g, rx, fy, hw * 0.36, flen * 0.42, lean * 0.4);
  }
  if (rays.length) {
    // the rays out from the goal's rim, each cut short where it would leave the safe area (on the side against the edge, most)
    const gx = lane.cx, gy = lane.goalTop + s / 2, lw = Math.max(1.5, 0.045 * s);
    const box = { l: safe.side * W, r: W - safe.side * W, t: safe.top * H, b: H * (1 - safe.bottom) };
    g.lineCap = 'round';
    g.lineWidth = lw;
    rays.forEach((ray, i) => {
      const c = Math.cos(ray.angle), sn = Math.sin(ray.angle);
      const room = Math.min(c > 1e-9 ? (box.r - gx) / c : c < -1e-9 ? (box.l - gx) / c : Infinity, sn > 1e-9 ? (box.b - gy) / sn : sn < -1e-9 ? (box.t - gy) / sn : Infinity) - lw / 2;
      const d1 = Math.min((0.5 + ray.r1) * s, room), d0 = Math.min((0.5 + ray.r0) * s, d1);
      if (!(d1 - d0 > 1)) return;
      g.globalAlpha = ray.alpha;
      g.strokeStyle = i % 2 ? p.color : p.done;
      g.beginPath(); g.moveTo(gx + c * d0, gy + sn * d0); g.lineTo(gx + c * d1, gy + sn * d1); g.stroke();
    });
  }
  g.globalAlpha = 1;
};
