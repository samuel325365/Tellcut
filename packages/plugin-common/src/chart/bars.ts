// common.chart's bars: horizontal or vertical bars growing, their numbers counting up, a ratio or a gap between two, a baseline, a stat line.
import { clamp, eIO3, eOut3, prog } from '@tellcut/engine';
import { WORDS } from '../words.ts';
import { fmtNum, chartRows, valued, hlIndex, countText, ratioText, textW, fitSize, type Env, T, M, pop, circled, circlePad, loopWob, baseOf, boxAround, boxReach } from './shared.ts';

/** the stat line (a number counting up, drawn big in the accent colour) at the top of the body; returns its height */
function statLine(e: Env, text: string, y: number, maxSize: number, t0: number, dur: number): number {
  const { F, C, local } = e, b = F.body, size = fitSize(text, maxSize, b.w, 1.7), f = eOut3(prog(local, t0, t0 + dur)), land = prog(local, t0 + dur, t0 + dur + 0.25);
  T(e, { id: 'stat', text: countText(text, f), x: b.x + b.w / 2, y: y + size * 1.7 * 0.5, size, align: 'c', color: C.ink, weight: 900, em: { color: C.accent, scale: 1.7 },
    a: clamp((local - t0) / 0.15), sc: 1 + 0.06 * Math.sin(Math.PI * land) });
  return size * 1.7 * 1.25;
}

export function planBars(e: Env) {
  const { p, F, C, local } = e, u = F.u, rows = valued(chartRows(p.data)), n = rows.length, b = F.body;
  if (!n) return;
  const vals = rows.map((r) => r.value), base = baseOf(p.base), dec = Math.max(0, ...rows.map((r) => r.dec)), group = rows.some((r) => r.group);
  const hi = Math.max(0, ...vals, base?.v ?? 0), lo = Math.min(0, ...vals, base?.v ?? 0), span = hi - lo || 1;
  const step = Math.min(0.15, 0.6 / n), grow = Math.max(0.1, p.grow), ih = hlIndex(p.hl, vals);
  const final = (i: number) => rows[i].show || `${fmtNum(vals[i], dec, group)}${p.unit}`;
  const shown = (i: number, f: number) => (rows[i].show ? (f >= 1 ? rows[i].show : fmtNum(vals[i] * f, dec, group) + p.unit) : `${fmtNum(vals[i] * f, dec, group)}${p.unit}`);
  const fOf = (i: number) => eIO3(prog(local, p.at + i * step, p.at + i * step + grow));
  const tEnd = p.at + grow + (n - 1) * step + 0.05;
  const statH = p.stat ? statLine(e, p.stat, b.y, 100 * u, p.at, grow + 0.3) : 0;
  // which two bars a ratio or a gap compares: the lit one (else the biggest) and the first other one
  const ia = ih >= 0 ? ih : hlIndex('max', vals), ib = n > 1 ? (ia === 0 ? 1 : 0) : -1;
  const cmp = p.compare !== 'none' && ib >= 0 ? p.compare : 'none';
  const noteText = cmp === 'ratio' ? p.note || ratioText(vals[ia], vals[ib]) : cmp === 'gap' ? p.note || WORDS.gap[e.lang](`${fmtNum(Math.abs(vals[ia] - vals[ib]), dec, group)}${p.unit}`) : p.note;
  const colorOf = (i: number) => (i === ih ? C.accent : C.color);
  if (p.dir === 'v') {
    const noteW = noteText ? b.w * 0.28 : base?.label ? Math.min(b.w * 0.26, textW(base.label, 40 * u) + 24 * u) : 0, plotX = b.x, plotW = b.w - noteW, colW = plotW / n, bw = Math.min(colW * 0.56, 180 * u);
    const ls = Math.min(46 * u, ...rows.map((r) => fitSize(r.label, 46 * u, colW * 0.94))), vs = Math.min(46 * u, ...rows.map((_, i) => fitSize(final(i), 46 * u, colW * 0.98)));
    const labelH = ls * 1.6, valueH = vs * 1.5, neg = lo < 0;
    const pad = circlePad(p, rows, u), top = b.y + statH + valueH + pad, bot = b.y + b.h - labelH - (neg ? valueH : 0) - pad, Y = (v: number) => bot - ((v - lo) / span) * (bot - top), y0 = Y(0);
    // circled: a box loop round the lit bar alone (clear of the label under it: the room `pad` made), its number moved out past the loop
    const loop = pad ? boxAround(bw / 2, Math.abs(Y(vals[ih]) - y0) / 2, 14 * u) : null;
    const valOff = (i: number) => (loop && i === ih ? loop.ry - Math.abs(Y(vals[ih]) - y0) / 2 + boxReach(loopWob(p, u), 6 * u) + 6 * u + vs * 0.6 : vs * 0.8);
    M(e, { t: 'path', pts: [[plotX, y0], [plotX + plotW, y0]], line: C.ink, lw: 3 * u, prog: eOut3(prog(local, p.at - 0.25, p.at + 0.2)), seed: 3 });
    if (base) {
      const yb = Y(base.v);
      M(e, { t: 'path', pts: [[plotX, yb], [plotX + plotW, yb]], line: C.ink, lw: 3 * u, dash: true, a: 0.8, prog: eOut3(prog(local, p.at - 0.1, p.at + 0.4)), seed: 5 });
      if (base.label) T(e, { id: 'base', text: base.label, x: plotX + plotW + 12 * u, y: noteText ? yb - ls * 0.75 : yb, size: fitSize(base.label, ls * 0.9, noteText ? plotW * 0.5 : noteW - 14 * u), align: noteText ? 'r' : 'l', color: C.dim, weight: 500, a: clamp((local - p.at - 0.2) / 0.3) });
    }
    rows.forEach((r, i) => {
      const cx = plotX + colW * (i + 0.5), y1 = Y(vals[i]), f = fOf(i);
      M(e, { t: 'rect', x: cx - bw / 2, y: Math.min(y0, y1), w: bw, h: Math.abs(y1 - y0), fill: colorOf(i), line: C.ink, reveal: f, from: vals[i] >= 0 ? 'b' : 't', seed: 11 + i * 7 });
      T(e, { id: `l${i}`, text: r.label, x: cx, y: b.y + b.h - labelH * 0.5, size: ls, align: 'c', color: i === ih ? C.accent : C.ink, weight: i === ih ? 900 : 700, a: clamp((local - p.at + 0.2 - i * step * 0.5) / 0.25) });
      const vy = y0 + (y1 - y0) * f + (vals[i] >= 0 ? -1 : 1) * valOff(i);
      T(e, { id: `v${i}`, text: shown(i, f), x: cx, y: vy, size: vs, align: 'c', color: i === ih ? C.accent : C.ink, weight: 900, a: clamp(f * 5) });
    });
    if (cmp !== 'none') {
      const xa = plotX + colW * (ia + 0.5), xb = plotX + colW * (ib + 0.5), ya = Y(vals[ia]), yb = Y(vals[ib]), bx = plotX + plotW + 14 * u;
      if (cmp === 'gap') {
        // the other bar's leg runs over the lit column when that bar is to its left; a circled bar's number, moved up past its loop,
        // can sit on that leg, so the leg breaks round it
        const pg = eOut3(prog(local, tEnd - 0.1, tEnd + 0.35)), tw = textW(final(ia), vs) / 2 + 8 * u, vy = ya + (vals[ia] >= 0 ? -1 : 1) * valOff(ia);
        const cut = loop && ia === ih && xb < xa && Math.abs(yb - vy) < vs * 0.6 + 6 * u;
        M(e, { t: 'path', pts: [[xa + bw / 2 + 6 * u, ya], [bx, ya], [bx, yb], [cut ? xa + tw : xb + bw / 2 + 6 * u, yb]], line: C.accent, lw: 4.5 * u, prog: pg, seed: 21 });
        if (cut && xa - tw > xb + bw / 2 + 6 * u) M(e, { t: 'path', pts: [[xa - tw, yb], [xb + bw / 2 + 6 * u, yb]], line: C.accent, lw: 4.5 * u, prog: pg, seed: 22 });
      }
      const size = fitSize(noteText, 76 * u, noteW - 32 * u);
      T(e, { id: 'note', text: noteText, x: bx + 18 * u, y: (ya + yb) / 2, size, align: 'l', color: C.accent, weight: 900, a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd) });
    } else if (noteText && ih >= 0) {
      T(e, { id: 'note', text: noteText, x: plotX + plotW + 18 * u, y: Y(vals[ih]), size: fitSize(noteText, 64 * u, noteW - 24 * u), align: 'l', color: C.accent, weight: 900, a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd) });
    }
    if (loop) M(e, { t: 'loop', cx: plotX + colW * (ih + 0.5), cy: (Y(vals[ih]) + y0) / 2, rx: loop.rx, ry: loop.ry, box: loopWob(p, u), line: C.accent, lw: 6 * u, prog: eOut3(prog(local, tEnd + 0.1, tEnd + 0.6)), seed: 31 });
    return;
  }
  // horizontal: a label line over each bar, the number at the bar's end
  // circled: every row `pad` taller (between its label and its bar), the bar thin enough to leave the loop room under it, and `ext`
  // kept at the right for the lit bar's number, which moves out past the loop
  const circ = circled(p, rows), pad = circlePad(p, rows, u), ext = circ ? 44 * u : 0;
  const baseRoom = base?.label ? 50 * u : 0, rowsH = b.h - statH - baseRoom, rowH = Math.min(rowsH / n, 230 * u + pad), y0 = b.y + statH + (rowsH - rowH * n) / 2, rh = rowH - pad;
  const ls = Math.min(46 * u, rh * 0.28), bt = Math.max(4 * u, Math.min(rh * 0.42, 100 * u, circ ? rh - 1.25 * ls - 34 * u : Infinity)), vs0 = Math.min(46 * u, bt * 0.72);
  const valW = Math.max(...rows.map((_, i) => textW(final(i), vs0))) + 20 * u, neg = lo < 0;
  const vs = valW > b.w * 0.45 ? vs0 * ((b.w * 0.45) / valW) : vs0, vW = Math.min(valW, b.w * 0.45 + 20 * u);
  const plotX = b.x + (neg ? vW + ext : 0), plotW = b.w - vW - ext - (neg ? vW + ext : 0), X = (v: number) => plotX + ((v - lo) / span) * plotW, x0 = X(0);
  const barY = (i: number) => y0 + i * rowH + ls * 1.35 + pad;
  // the loop round the lit bar (a box loop hugging it) and how far past the bar's end its number then sits
  const loop = circ ? boxAround(Math.abs(X(vals[ih]) - x0) / 2, bt / 2, 14 * u) : null;
  const valOff = (i: number) => (loop && i === ih ? loop.rx - Math.abs(X(vals[ih]) - x0) / 2 + boxReach(loopWob(p, u), 6 * u) + 12 * u : 14 * u);
  rows.forEach((r, i) => {
    const x1 = X(vals[i]), f = fOf(i), by = barY(i);
    M(e, { t: 'rect', x: Math.min(x0, x1), y: by, w: Math.abs(x1 - x0), h: bt, fill: colorOf(i), line: C.ink, reveal: f, from: vals[i] >= 0 ? 'l' : 'r', seed: 11 + i * 7 });
    T(e, { id: `l${i}`, text: r.label, x: b.x, y: y0 + i * rowH + ls * 0.6, size: fitSize(r.label, ls, b.w), align: 'l', color: i === ih ? C.accent : C.ink, weight: i === ih ? 900 : 700, a: clamp((local - p.at + 0.2 - i * step * 0.5) / 0.25) });
    const end = x0 + (x1 - x0) * f, pos = vals[i] >= 0;
    T(e, { id: `v${i}`, text: shown(i, f), x: end + (pos ? 1 : -1) * valOff(i), y: by + bt / 2, size: vs, align: pos ? 'l' : 'r', color: i === ih ? C.accent : C.ink, weight: 900, a: clamp(f * 5) });
  });
  if (neg || base) M(e, { t: 'path', pts: [[x0, y0 + ls * 1.1], [x0, y0 + (n - 1) * rowH + ls * 1.35 + bt + 10 * u]], line: C.ink, lw: 3 * u, prog: eOut3(prog(local, p.at - 0.25, p.at + 0.2)), seed: 3 });
  if (base) {
    const xb = X(base.v), yTop = y0 + ls * 1.1, yBot = y0 + (n - 1) * rowH + ls * 1.35 + bt + 12 * u;
    M(e, { t: 'path', pts: [[xb, yTop], [xb, yBot]], line: C.ink, lw: 3 * u, dash: true, a: 0.8, prog: eOut3(prog(local, p.at - 0.1, p.at + 0.4)), seed: 5 });
    if (base.label) { const s = fitSize(base.label, 40 * u, b.w * 0.6), w = textW(base.label, s); T(e, { id: 'base', text: base.label, x: clamp(xb, b.x + w / 2, b.x + b.w - w / 2), y: yBot + s * 0.9, size: s, align: 'c', color: C.dim, weight: 500, a: clamp((local - p.at - 0.2) / 0.3) }); }
  }
  // the note: right of the shorter bar's number if there is room, else over the longer bar at the right
  const anchor = cmp !== 'none' ? (Math.abs(vals[ia]) <= Math.abs(vals[ib]) ? ia : ib) : ih;
  if (noteText && anchor >= 0) {
    if (cmp === 'gap') {
      const other = anchor === ia ? ib : ia, xs = X(vals[anchor]), xl = X(vals[other]), yL = barY(other) - 12 * u, ys = barY(anchor);
      const pg = eOut3(prog(local, tEnd - 0.1, tEnd + 0.35));
      M(e, { t: 'path', pts: [[xs, Math.min(ys, yL)], [xs, Math.max(ys + bt, yL + 12 * u + bt)]], line: C.accent, lw: 3 * u, dash: true, prog: pg, seed: 23 });
      M(e, { t: 'path', pts: [[xs, yL + 10 * u], [xs, yL], [xl, yL], [xl, yL + 10 * u]], line: C.accent, lw: 4.5 * u, prog: pg, seed: 21 });
    }
    const nx = X(vals[anchor]) + valOff(anchor) + textW(final(anchor), vs) + 30 * u, room = b.x + b.w - nx, big = fitSize(noteText, 84 * u, room);
    const side = big >= 34 * u, size = side ? big : fitSize(noteText, 60 * u, b.w * 0.5);
    const other = cmp !== 'none' ? (anchor === ia ? ib : ia) : anchor;
    T(e, { id: 'note', text: noteText, x: side ? nx : b.x + b.w, y: side ? barY(anchor) + bt / 2 : y0 + other * rowH + ls * 0.6, size, align: side ? 'l' : 'r', color: C.accent, weight: 900,
      a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd), rot: side ? -3 : 0 });
  }
  if (loop) M(e, { t: 'loop', cx: (x0 + X(vals[ih])) / 2, cy: barY(ih) + bt / 2, rx: loop.rx, ry: loop.ry, box: loopWob(p, u), line: C.accent, lw: 6 * u, prog: eOut3(prog(local, tEnd + 0.1, tEnd + 0.6)), seed: 31 });
}
