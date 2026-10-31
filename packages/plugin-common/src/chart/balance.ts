// common.chart's balance: weights drop into the two pans and the beam tips to the heavier side.
import { clamp, eOut3, prog } from '@tellcut/engine';
import { quadPts, type Pt } from '../sketch.ts';
import { chartRows, valued, fitSize, type Env, T, M, pop } from './shared.ts';

/** how many blocks each pan gets: the numbers themselves when they are small whole numbers, else up to 5 by share */
export function blockCounts(a: number, b: number): [number, number] {
  const va = Math.max(0, a), vb = Math.max(0, b), mx = Math.max(va, vb);
  if (mx <= 0) return [0, 0];
  if (Number.isInteger(va) && Number.isInteger(vb) && mx <= 8) return [va, vb];
  const k = (v: number) => (v > 0 ? Math.max(1, Math.round((v / mx) * 5)) : 0);
  return [k(va), k(vb)];
}
/** the beam's angle (radians, + = the right side down) for weights a and b, t s after the weights are in: it swings and settles */
export function tipAngle(a: number, b: number, t: number): number {
  const va = Math.max(0, a), vb = Math.max(0, b), target = clamp(((vb - va) / (va + vb || 1)) * 0.6, -0.26, 0.26);
  return t <= 0 ? 0 : target * (1 - Math.exp(-3 * t) * Math.cos(7 * t));
}

export function planBalance(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, rows = valued(chartRows(p.data)).slice(0, 2);
  while (rows.length < 2) rows.push({ label: '', value: 0, dec: 0, group: false, show: '', gap: false, cells: [] });
  const [A, B] = rows, [na, nb] = blockCounts(A.value, B.value), noteRoom = p.note ? 100 * u : 0;
  const S = Math.min(b.w / 3.1, (b.h - noteRoom) / 2.05), cx = b.x + b.w / 2, py = b.y + noteRoom + S * 0.28, L = S, pw = S * 0.5, hang = S * 0.66, sag = S * 0.16;
  const draw = eOut3(prog(local, p.at - 0.3, p.at + 0.2)), tS = p.at + Math.max(na, nb) * 0.08 + 0.4, ang = tipAngle(A.value, B.value, local - tS);
  const footY = py + S * 1.3;
  M(e, { t: 'path', pts: [[cx, py], [cx, footY]], line: C.ink, lw: 8 * u, prog: draw, seed: 101 });
  M(e, { t: 'path', pts: [[cx - S * 0.42, footY], [cx + S * 0.42, footY]], line: C.ink, lw: 10 * u, prog: draw, seed: 103 });
  const E = (sd: number): Pt => [cx + sd * L * Math.cos(ang), py + sd * L * Math.sin(ang)];
  M(e, { t: 'path', pts: [E(-1), E(1)], line: C.ink, lw: 7 * u, prog: draw, seed: 105 });
  const ls = Math.min(52 * u, S * 0.26);
  ([[-1, A, na, C.color], [1, B, nb, C.accent]] as const).forEach(([sd, row, cnt, col], j) => {
    const [ex, ey] = E(sd), rim = ey + hang;
    M(e, { t: 'path', pts: [[ex, ey], [ex - pw * 0.86, rim]], line: C.ink, lw: 2.5 * u, a: 0.75, prog: draw, seed: 107 + j * 5 });
    M(e, { t: 'path', pts: [[ex, ey], [ex + pw * 0.86, rim]], line: C.ink, lw: 2.5 * u, a: 0.75, prog: draw, seed: 109 + j * 5 });
    const bs = pw * 0.42;
    for (let q = 0; q < cnt; q++) {
      const row3 = Math.floor(q / 3), inRow = Math.min(3, cnt - row3 * 3), col3 = q % 3, t0 = p.at + q * 0.08, f = eOut3(prog(local, t0, t0 + 0.35));
      if (f <= 0) continue;
      const bx = ex + (col3 - (inRow - 1) / 2) * bs * 1.06 - bs / 2, by = rim + sag * 0.6 - (row3 + 1) * bs * 0.98 - (1 - f) * 260 * u;
      M(e, { t: 'rect', x: bx, y: by, w: bs, h: bs * 0.9, fill: col, line: C.ink, seed: 121 + j * 31 + q * 3 });
    }
    M(e, { t: 'path', pts: quadPts([ex - pw, rim], [ex, rim + sag * 2], [ex + pw, rim]).concat([[ex - pw, rim]]), fill: C.tag, line: C.ink, lw: 5 * u, prog: draw, seed: 111 + j * 5 });
    const la = clamp((local - p.at - 0.1) / 0.3);
    T(e, { id: `l${j}`, text: row.label, x: ex, y: rim + sag + ls * 0.95, size: fitSize(row.label, ls, pw * 2.2), align: 'c', color: sd > 0 ? C.accent : C.ink, weight: 900, a: la });
    if (row.show) T(e, { id: `s${j}`, text: row.show, x: ex, y: rim + sag + ls * 2.05, size: fitSize(row.show, ls * 0.72, pw * 2.2), align: 'c', color: C.dim, weight: 700, a: la });
  });
  M(e, { t: 'dot', x: cx, y: py, r: 13 * u, fill: C.tag, line: C.ink, seed: 131 });
  if (p.note) T(e, { id: 'note', text: p.note, x: cx, y: b.y + noteRoom * 0.45, size: fitSize(p.note, 64 * u, b.w), align: 'c', color: C.accent, weight: 900, a: clamp((local - tS - 0.5) / 0.1), sc: pop(local, tS + 0.5) });
}
