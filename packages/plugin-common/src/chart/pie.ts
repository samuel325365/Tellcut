// common.chart's pie: slices coloured in one after another, small slices labelled outside, a tag under it.
import { clamp, eOut3, prog } from '@tellcut/engine';
import { ellipsePts } from '../sketch.ts';
import { fmtNum, chartRows, valued, hlIndex, textW, fitSize, type Env, T, M, pop, onColor, sliceColors } from './shared.ts';

export function planPie(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, rows = valued(chartRows(p.data)), n = rows.length;
  const vals = rows.map((r) => Math.max(0, r.value)), sum = vals.reduce((a, v) => a + v, 0), fr = vals.map((v) => (sum > 0 ? v / sum : 0)), cols = sliceColors(e);
  const ls = 44 * u, ih = hlIndex(p.hl, vals), pct = (f: number) => `${fmtNum(f * 100, f > 0 && f < 0.1 ? 1 : 0)}%`;
  const noteRoom = p.note ? 120 * u : 0, small = fr.map((f) => f > 0 && f < 0.1 && n > 1);
  const outW = small.some(Boolean) ? Math.max(...rows.map((r, i) => (small[i] ? textW(`${r.label} ${pct(fr[i])}`, ls * 0.85) : 0))) + 30 * u : 0;
  const rIn = Math.min(b.w / 2, (b.h - noteRoom) / 2) * 0.94, r = Math.max(rIn * 0.62, Math.min(rIn, (b.w / 2 - outW) / 1.1, (b.h - noteRoom) / 2 - (outW ? ls : 0)));
  const cx = b.x + b.w / 2, cy = b.y + (b.h - noteRoom) / 2;
  const fs = Math.min(0.4, 1.3 / Math.max(1, n)), tEnd = p.at + 0.25 + (n - 1) * fs + 0.5;
  M(e, { t: 'path', pts: ellipsePts(cx, cy, r, r, { turns: 1.03, n: 72 }), line: e.p.look === 'clean' ? C.mute : C.ink, lw: (e.p.look === 'clean' ? 3 : 5) * u, prog: eOut3(prog(local, p.at - 0.25, p.at + 0.25)), seed: 41 });
  let a = -Math.PI / 2;
  rows.forEach((row, i) => {
    const a0 = a, a1 = a + fr[i] * Math.PI * 2, mid = (a0 + a1) / 2, t0 = p.at + 0.25 + i * fs, fp = eOut3(prog(local, t0, t0 + 0.5));
    a = a1;
    if (fr[i] <= 0) return;
    const off = i === ih ? 0.07 * r * eOut3(prog(local, tEnd, tEnd + 0.3)) : 0, ox = cx + Math.cos(mid) * off, oy = cy + Math.sin(mid) * off, fill = cols[i % cols.length];
    M(e, { t: 'wedge', cx: ox, cy: oy, r, a0, a1, fill, fp, seed: 51 + i * 5 });
    if (n > 1) {
      const arc = ellipsePts(ox, oy, r, r, { a0, turns: (a1 - a0) / (Math.PI * 2), n: Math.max(4, Math.ceil((a1 - a0) * 12)) });
      M(e, { t: 'path', pts: [[ox, oy], ...arc, [ox, oy]], line: e.p.look === 'clean' ? C.paper : C.ink, lw: (e.p.look === 'clean' ? 4 : 4.5) * u, prog: eOut3(prog(local, t0 - 0.1, t0 + 0.3)), seed: 61 + i * 3 });
    }
    const la = clamp((fp - 0.3) / 0.4), lit = i === ih;
    if (small[i]) {
      const right = Math.cos(mid) >= 0, rr = r * 1.12, tx = ox + Math.cos(mid) * rr, ty = oy + Math.sin(mid) * rr;
      const text = `${row.label} ${row.show || pct(fr[i])}`, x = tx + (right ? 8 : -8) * u, room = right ? b.x + b.w - x : x - b.x;
      T(e, { id: `l${i}`, text, x, y: ty, size: fitSize(text, ls * 0.85, room), align: right ? 'l' : 'r', color: lit ? C.accent : C.ink, weight: 700, a: la });
      return;
    }
    const lr = n === 1 ? 0 : r * 0.6, tx = ox + Math.cos(mid) * lr, ty = oy + Math.sin(mid) * lr, chord = n === 1 ? r * 1.6 : Math.min(r * 0.9, 2 * lr * Math.sin(Math.min(Math.PI / 2, (a1 - a0) / 2)) + r * 0.2);
    // on a hatched slice the words get a halo of the paper; on a flat one, whichever of ink and paper reads
    const hand = e.p.look === 'hand', ink = hand ? C.ink : onColor(fill, C), halo = hand ? C.paper : undefined;
    T(e, { id: `l${i}`, text: row.label, x: tx, y: ty - ls * 0.42, size: fitSize(row.label, ls * (lit ? 1.15 : 1), chord), align: 'c', color: ink, weight: 900, a: la, halo });
    T(e, { id: `p${i}`, text: row.show || pct(fr[i]), x: tx, y: ty + ls * 0.62, size: fitSize(row.show || pct(fr[i]), ls * 0.82, chord), align: 'c', color: ink, weight: 700, a: la, halo });
  });
  if (p.note) {
    const size = fitSize(p.note, 56 * u, b.w - 40 * u);
    T(e, { id: 'note', text: p.note, x: cx, y: b.y + b.h - noteRoom * 0.42, size, align: 'c', color: onColor(C.tag, C), weight: 900, bg: C.tag, a: clamp((local - tEnd) / 0.1), sc: 1.4 - 0.4 * pop(local, tEnd, 0.3), rot: -2 });
  }
}
