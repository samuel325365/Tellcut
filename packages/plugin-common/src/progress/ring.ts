// common.progress ring (spec 2026-11-22, progress more modes): a ring in a corner of the safe area (`align` left, else right — center
// counts as right; up and down by `position` / `y`). Its track is a full circle in `track`, the arc gone round is `color`, from twelve
// o'clock clockwise with round ends (the track 70% white unless the item gives one: MODE_DEFAULTS), all over a dark ground a little wider than the ring with a soft shadow (canvas, so it lies
// under the line: over bright footage the see-through track and a light `done` were lost without it); the percentage in the middle
// is DOM text with a tight dark edge, so check measures it (at most 99 until full, as battery counts). A `runner` (an emoji or a picture of the project's) stands in the middle instead of
// the percentage. When full the whole ring turns the `done` colour, pops to 1.12 times and back within 0.4 s, and a thin ring
// spreads out from it and fades within 0.6 s. The box it keeps in the corner is 1.25 diameters across, so the pop and the ripple
// stay inside it, and so inside the safe area. The ring is `size × 2.6` across in frame-height %.
import { abs, clamp, cssCamel, eOut3, h } from '@tellcut/engine';
import { canvasAt } from '../inkline.ts';
import { piece, showPiece } from './runner.ts';
import { arrived, corner, fadeOut, landscape, travel, type Draw } from './shared.ts';

/** the box kept round the ring, in diameters: room for the pop and the ripple */
const ROOM = 1.25;
/** the pop when full: up to 1 + POP over POP_S seconds; the ripple: out to ROOM ring radii over RIPPLE_S */
const POP = 0.12, POP_S = 0.4, RIPPLE_S = 0.6;
/** the ground under the ring and how far past the ring's outer edge it reaches, in line widths. 30% black: at 45% it read as a heavy
 *  mid-grey disc on a white picture, while the track (then 25% white) all but vanished on it over a dark building */
export const BACKING = 'rgba(0,0,0,0.3)';
const GROUND = 0.5;
/** the per cent sign's size beside the number (em), and how wide "100%" is then (em, Noto Sans TC 700, looked at in Chrome) */
const PCT = 0.6, WIDE = 2.4;

/** the ring at progress p (0…1), `since` = arrived(): the arc's sweep in radians (0…2π), the percentage (99 at most until full),
 *  the pop's scale (1 → 1.12 → 1 over 0.4 s after full) and the ripple (null outside its 0.6 s; r in ring radii, ≤ 1.25: the
 *  ripple's outer edge, from the ring's own out to the box kept for it) */
export function ringState(p: number, since: number): { sweep: number; percent: number; full: boolean; scale: number; ripple: { r: number; alpha: number } | null } {
  const q = clamp(Number.isFinite(p) ? p : 0), full = q >= 1, percent = full ? 100 : Math.min(99, Math.floor(q * 100 + 1e-9));
  const on = full && since >= 0, scale = on && since < POP_S ? 1 + POP * Math.sin((Math.PI * since) / POP_S) : 1;
  // the ripple runs a little ahead of the pop, so the two read as two rings
  const u = since / RIPPLE_S, ripple = on && since < RIPPLE_S ? { r: 1 + (ROOM - 1) * eOut3(clamp(u * 1.3)), alpha: 0.85 * Math.pow(1 - u, 1.5) } : null;
  return { sweep: 2 * Math.PI * q, percent, full, scale, ripple };
}

/** the ground's radius under a ring of radius R and line lw at scale sc: GROUND lines past the ring, at most just inside the box
 *  ROOM keeps (radius R × ROOM) */
export const ringGround = (R: number, lw: number, sc: number): number => Math.max(0, Math.min((R + GROUND * lw) * sc, R * ROOM * 0.98));

export const drawRing: Draw = (ctx, p, m, cv) => {
  const { W, H, local, dur, theme } = ctx, k = Math.min(W, H) / 1080, runner = String(p.runner ?? '').trim();
  if (!m.el.text) {
    m.el.text = abs(m.root, { whiteSpace: 'pre', lineHeight: '1', textAlign: 'center', fontWeight: '700', fontFamily: "'Noto Sans TC', sans-serif", fontVariantNumeric: 'tabular-nums' }, 'span');
    // the number, then a smaller per cent sign on its baseline: "100%" at one size ran into the ring
    m.el.num = h('span', null, null, m.el.text);
    m.el.pct = h('span', null, null, m.el.text);
    cssCamel(m.el.pct, { fontSize: `${PCT}em` });
    if (runner) {
      piece(m, 'runner', runner, '', (f) => ctx.media.fileUrl(f));
      cssCamel(m.el.runner, { transformOrigin: '50% 50%' });
      if (m.el.runnerImg) cssCamel(m.el.runnerImg, { objectPosition: '50% 50%' });
    }
  }
  // the ring's diameter (`size` of the frame height, times landscape(): on 16:9 as big as on 9:16), never so big that the box kept
  // round it leaves the safe area; its line, never more than half its radius
  const safeW = W * (1 - 2 * theme.safe.side), safeH = H * (1 - theme.safe.top - theme.safe.bottom), sizePx = (Math.max(0.1, p.size) / 100) * H * landscape(W, H);
  const d = Math.max(1, Math.min(sizePx * 2.6, Math.min(safeW, safeH) / ROOM)), R = d / 2;
  const lw = Math.min(Math.max(2, p.thickness * 0.5 * k), R * 0.5), box = d * ROOM, at = corner(ctx, p, box, box);
  const cx = at.left + box / 2, cy = at.top + box / 2;
  const st = ringState(travel(p.step, p.dots, local, dur), arrived(p.step, p.dots, local, dur)), sc = st.scale;
  const inner = Math.max(0, R - lw) * sc;
  // the middle: the runner (an emoji or a picture), or the percentage when there is none or its picture failed
  const failed = runner ? showPiece(m, 'runner').failed : false, percent = !runner || failed;
  if (m.el.runner) {
    const ph = 2 * inner * 0.55;
    cssCamel(m.el.runner, { display: percent ? 'none' : 'block', left: `${(cx - ph / 2).toFixed(2)}px`, top: `${(cy - ph / 2).toFixed(2)}px`, width: `${ph.toFixed(2)}px`, height: `${ph.toFixed(2)}px` });
    cssCamel(m.el.runnerText, { top: '50%', bottom: 'auto', left: '-50%', width: '200%', textAlign: 'center', fontSize: `${ph.toFixed(2)}px`, marginTop: `${(-ph / 2).toFixed(2)}px` });
  }
  // "100%" (the sign smaller) is about WIDE em across: kept inside the ring's middle with a little room each side
  const fs = Math.min(sizePx * 0.8 * sc, (2 * inner * 0.86) / WIDE), text = m.el.text, num = percent ? String(st.percent) : '', pct = percent ? '%' : '';
  if (m.el.num.textContent !== num) m.el.num.textContent = num;
  if (m.el.pct.textContent !== pct) m.el.pct.textContent = pct;
  cssCamel(text, { display: percent ? 'block' : 'none', left: `${(cx - inner).toFixed(2)}px`, top: `${(cy - fs / 2).toFixed(2)}px`, width: `${(2 * inner).toFixed(2)}px`,
    // a tight dark edge as well as the soft shadow: a light `done` colour (the default yellow) held too little contrast over the
    // ground with a bright picture showing through it
    fontSize: `${fs.toFixed(2)}px`, color: st.full ? p.done : p.paper,
    textShadow: `0 0 ${(2 * k).toFixed(2)}px rgba(0,0,0,0.85), 0 ${(2 * k).toFixed(2)}px ${(6 * k).toFixed(2)}px rgba(0,0,0,0.55)` });
  // the ring on the canvas: the ground (inside the box: a thick line's stops short of the ripple's room), the track's circle (all
  // `done` once full), the arc gone round over it, the ripple outside
  cssCamel(cv, { display: 'block', opacity: fadeOut(local, dur).toFixed(3) });
  const g = canvasAt(cv, W, H), rc = (R - lw / 2) * sc, ground = ringGround(R, lw, sc);
  g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 6 * k; g.shadowOffsetY = k;
  g.fillStyle = BACKING; g.beginPath(); g.arc(cx, cy, ground, 0, Math.PI * 2); g.fill();
  // (the canvas keeps its pen between frames of one size)
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.lineCap = 'round';
  g.lineWidth = lw * sc;
  if (rc > 0) {
    g.strokeStyle = st.full ? p.done : p.track;
    g.beginPath(); g.arc(cx, cy, rc, 0, Math.PI * 2); g.stroke();
    if (!st.full && st.sweep > 1e-6) {
      g.strokeStyle = p.color;
      g.beginPath(); g.arc(cx, cy, rc, -Math.PI / 2, -Math.PI / 2 + st.sweep); g.stroke();
    }
  }
  if (st.ripple) {
    const rw = Math.max(1.5, lw * 0.45), rr = R * st.ripple.r - rw / 2;
    if (rr > 0 && st.ripple.alpha > 0) {
      g.globalAlpha = st.ripple.alpha;
      g.lineWidth = rw;
      g.strokeStyle = p.done;
      g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
    }
  }
  g.globalAlpha = 1;
};
