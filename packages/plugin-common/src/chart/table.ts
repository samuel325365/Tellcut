// common.chart's table: the rules drawn, the cells rising in diagonal order, one cell or row lit.
import { clamp, eOut3, prog, textEm } from '@tellcut/engine';
import { chartRows, fitSize, type Env, T, M } from './shared.ts';

/** table cells: one row a line, cells split by |; the first row is the header */
export const tableCells = (text: string) => chartRows(text).map((r) => r.cells);
/** the lit cell: "row,col" (body rows and columns counted from 1) or "row" for a whole row; [-1, -1] for none */
export function tableHl(spec: string, rows: number, cols: number): [number, number] {
  const m = /^\s*(\d+)\s*(?:[,，]\s*(\d+))?\s*$/.exec(String(spec ?? ''));
  if (!m) return [-1, -1];
  const r = Number(m[1]), c = m[2] ? Number(m[2]) - 1 : -1;
  return r >= 1 && r < rows && c < cols ? [r, c] : [-1, -1];
}

export function planTable(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, cells = tableCells(p.data), R = cells.length, Cn = Math.max(0, ...cells.map((r) => r.length));
  if (!R || !Cn) return;
  const em = Array.from({ length: Cn }, (_, c) => Math.max(1.5, ...cells.map((r) => textEm(r[c] ?? '')))), wts = em.map((x) => x + 1.2), sum = wts.reduce((a, x) => a + x, 0);
  const fs = Math.min(46 * u, (b.h / R) * 0.42, (b.w / sum) * 0.95), colW = wts.map((x) => (x / sum) * b.w), colX = colW.map((_, c) => b.x + colW.slice(0, c).reduce((a, x) => a + x, 0));
  const rowH = Math.min(b.h / R, fs * 2.5), th = rowH * R, ty = b.y + (b.h - th) / 2, [hr, hc] = tableHl(p.hl, R, Cn);
  const step = Math.min(0.13, 1.4 / Math.max(1, R - 1 + Cn));
  for (let c = 1; c < Cn; c++) M(e, { t: 'path', pts: [[colX[c], ty + rowH * 0.15], [colX[c], ty + th - rowH * 0.15]], line: C.ink, lw: 2 * u, a: 0.45, prog: eOut3(prog(local, p.at + c * 0.05, p.at + c * 0.05 + 0.5)), seed: 141 + c });
  M(e, { t: 'path', pts: [[b.x, ty + rowH], [b.x + b.w, ty + rowH]], line: C.ink, lw: 3.5 * u, prog: eOut3(prog(local, p.at + 0.1, p.at + 0.55)), seed: 151 });
  for (let r = 2; r < R; r++) M(e, { t: 'path', pts: [[b.x, ty + rowH * r], [b.x + b.w, ty + rowH * r]], line: C.ink, lw: 1.5 * u, a: 0.35, prog: eOut3(prog(local, p.at + 0.2 + r * 0.06, p.at + 0.65 + r * 0.06)), seed: 161 + r });
  let tLast = p.at;
  cells.forEach((row, r) => {
    for (let c = 0; c < Cn; c++) {
      const text = row[c] ?? '';
      const t0 = r === 0 ? p.at + 0.1 + c * 0.06 : p.at + 0.35 + (r - 1 + c) * step, a = prog(local, t0, t0 + 0.3), lit = r === hr && (hc < 0 || hc === c);
      tLast = Math.max(tLast, t0 + 0.3);
      const x = colX[c] + colW[c] / 2, y = ty + rowH * (r + 0.5) + (1 - eOut3(a)) * 18 * u;
      if (lit) M(e, { t: 'rect', x: colX[c] + 6 * u, y: ty + rowH * r + 6 * u, w: colW[c] - 12 * u, h: rowH - 12 * u, fill: C.tag, soft: true, reveal: eOut3(a), from: 'l', seed: 171 + c });
      if (!text) continue;
      T(e, { id: `c${r}_${c}`, text, x, y, size: fitSize(text, fs * (r === 0 ? 1.02 : 1), colW[c] * 0.92), align: 'c', color: lit ? C.accent : r === 0 ? C.ink : c === 0 && Cn > 2 ? C.dim : C.ink,
        weight: r === 0 || lit ? 900 : c === 0 && Cn > 2 ? 500 : 700, a: clamp(a * 2), sc: lit ? 1 + 0.12 * Math.sin(Math.PI * prog(local, t0 + 0.2, t0 + 0.5)) : 1 });
    }
  });
  if (p.mark === 'circle' && hr >= 1) {
    const c0 = hc < 0 ? 0 : hc, c1 = hc < 0 ? Cn - 1 : hc, x0 = colX[c0], x1 = colX[c1] + colW[c1];
    M(e, { t: 'loop', cx: (x0 + x1) / 2, cy: ty + rowH * (hr + 0.5), rx: (x1 - x0) / 2 + 12 * u, ry: rowH * 0.62, line: C.accent, lw: 5 * u, prog: eOut3(prog(local, tLast + 0.05, tLast + 0.55)), seed: 37 });
  }
}
