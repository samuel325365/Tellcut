// common.chart's people: little people flipping over, the first k in colour and circled, a line "10 人中有 4 人" under them.
import { clamp, eOut3, prog } from '@tellcut/engine';
import { WORDS } from '../words.ts';
import { countText, fitSize, type Env, T, M, pop } from './shared.ts';

/** the best grid for n cells in a w × h box (the cell as large as it can be; a cell is 1.15 times as tall as wide) */
export function peopleGrid(n: number, w: number, hh: number): { cols: number; rows: number; cell: number } {
  const all = Array.from({ length: n }, (_, i) => { const cols = i + 1, rows = Math.ceil(n / cols); return { cols, rows, cell: Math.min(w / cols, hh / rows / 1.15) }; });
  const top = Math.max(...all.map((g) => g.cell));
  // full rows (10 as 5 × 2, not 4 + 4 + 2) when that costs at most 15 % of the size
  return all.find((g) => n % g.cols === 0 && g.cell >= top * 0.85 - 1e-9 && g.cols > 1 === n > 1) ?? all.find((g) => g.cell >= top - 1e-9)!;
}

export function planPeople(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, n = clamp(Math.round(p.n), 1, 200), k = clamp(Math.round(p.k), 0, n);
  const stat = p.stat || WORDS.people[e.lang](n, k), statSize = fitSize(stat, 84 * u, b.w, 1.5), statRoom = statSize * 1.5 * 1.45;
  const G = peopleGrid(n, b.w, b.h - statRoom), gw = G.cols * G.cell, gh = G.rows * G.cell * 1.15, gx = b.x + (b.w - gw) / 2, gy = b.y + (b.h - statRoom - gh) / 2;
  const fs = Math.min(0.2, 1.3 / n), tEnd = p.at + (n - 1) * fs + 0.3;
  const at = (i: number) => [gx + G.cell * ((i % G.cols) + 0.5), gy + G.cell * 1.15 * (Math.floor(i / G.cols) + 0.5)] as const;
  for (let i = 0; i < n; i++) {
    const t0 = p.at + i * fs, fp = prog(local, t0, t0 + 0.22), [x, y] = at(i), after = fp > 0.5;
    M(e, { t: 'person', x, y, s: G.cell * 0.92, fill: after ? (i < k ? C.accent : C.mute) : C.paper, line: C.ink, sx: Math.max(0.05, Math.abs(Math.cos(fp * Math.PI))), seed: 71 + i * 3 });
  }
  if (p.mark === 'circle' && k > 0 && k < n) {
    const last = Math.min(k, n) - 1, rowsK = Math.floor(last / G.cols) + 1, colsK = rowsK > 1 ? G.cols : last + 1;
    const x0 = gx, x1 = gx + colsK * G.cell, y0 = gy, y1 = gy + rowsK * G.cell * 1.15;
    M(e, { t: 'loop', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2 + G.cell * 0.18, ry: (y1 - y0) / 2 + G.cell * 0.14, line: C.accent, lw: 6 * u, prog: eOut3(prog(local, tEnd, tEnd + 0.5)), seed: 33 });
  }
  const t1 = tEnd + 0.1, f = eOut3(prog(local, t1, t1 + 0.4));
  T(e, { id: 'stat', text: countText(stat, f), x: b.x + b.w / 2, y: b.y + b.h - statRoom * 0.5, size: statSize, align: 'c', color: C.ink, weight: 900, em: { color: C.accent, scale: 1.5 },
    a: clamp((local - t1) / 0.12), sc: 1.25 - 0.25 * pop(local, t1, 0.3) });
}
