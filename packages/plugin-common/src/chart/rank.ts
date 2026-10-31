// common.chart's rank: a ranking revealed row by row (down, or up from the last place), one row lit and tagged, ties bracketed.
import { clamp, eOut3, prog } from '@tellcut/engine';
import { withAlpha } from '../color.ts';
import { WORDS } from '../words.ts';
import { parseNum, fmtNum, type Row, chartRows, hlIndex, textW, fitSize, type Env, T, M, pop, onColor } from './shared.ts';

/** each ranking row's rank: counted on from 1, a third field resets the count ("照顧孩子|3.86|12"), a gap row has none */
export function ranks(rows: Row[]): number[] {
  let k = 1;
  return rows.map((r) => { if (r.gap) return 0; const own = parseNum(r.show).v; if (Number.isInteger(own)) k = own; return k++; });
}

/** the runs of rows that share a rank (ties), as [first, last] row indices; gaps and single rows are not runs */
export function tieRuns(rk: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < rk.length;) {
    let j = i;
    while (j + 1 < rk.length && rk[i] > 0 && rk[j + 1] === rk[i]) j++;
    if (j > i) out.push([i, j]);
    i = j + 1;
  }
  return out;
}
/** when each ranking row starts to show. down: top to bottom, `step` apart (as always). up (the seoul-bbq short's podium): the last
 *  place first and the winner last, rows that share a rank (and a ⋯ gap) together, a half step more before the top group; the top
 *  group lands at at + grow */
export function rankStarts(rk: number[], reveal: 'down' | 'up', at: number, grow: number): number[] {
  const m = rk.length;
  if (reveal !== 'up') { const step = Math.min(0.12, 1 / Math.max(1, m)); return rk.map((_, i) => at + i * step); }
  const group: number[] = [];
  rk.forEach((r, i) => group.push(i === 0 ? 0 : group[i - 1] + (r > 0 && r === rk[i - 1] ? 0 : 1)));
  const n = (group[m - 1] ?? 0) + 1, step = n > 1 ? Math.max(0, grow) / (n - 0.5) : 0;
  return group.map((g) => at + (n - 1 - g) * step + (g === 0 && n > 1 ? step * 0.5 : 0));
}

export function planRank(e: Env) {
  const { p, F, C, local } = e, u = F.u, b = F.body, rows = chartRows(p.data).filter((r) => r.gap || r.label), m = rows.length;
  if (!m) return;
  const up = p.reveal === 'up', rk = ranks(rows), runs = String(p.tie ?? '').trim() ? tieRuns(rk) : [], starts = rankStarts(rk, up ? 'up' : 'down', p.at, p.grow), hasV = rows.some((r) => !r.gap && Number.isFinite(r.value)), dec = Math.max(0, ...rows.map((r) => r.dec)), group = rows.some((r) => r.group);
  const rowH = Math.min(b.h / m, 118 * u), y0 = b.y + (b.h - rowH * m) / 2, ls = Math.min(44 * u, rowH * 0.46), br = Math.min(rowH * 0.36, 30 * u);
  const hlRow = (() => { const s = String(p.hl ?? '').trim(); if (s === 'max' || s === 'min') { const vi = hlIndex(s, rows.map((r) => (r.gap || !Number.isFinite(r.value) ? (s === 'max' ? -Infinity : Infinity) : r.value))); return vi; } return hlIndex(s, rows.map(() => 0)); })();
  const vals = rows.map((r) => r.value), fin = vals.filter(Number.isFinite), hi = Math.max(...fin, 0), mn = Math.min(...fin, hi);
  const lo = mn >= 0 && hi > 0 && mn / hi < 0.5 ? 0 : hi === mn ? mn - 1 : mn - (hi - mn) * 0.35;
  // the tie brackets (a bracket on the right of the rows that share a rank, the `tie` word left of it) take a column of their own
  const tieS = Math.min(ls * 0.8, 36 * u), tieW = runs.length ? Math.min(textW(p.tie, tieS) + 50 * u, b.w * 0.3) : 0, tieX = b.x + b.w - 4 * u;
  const labelX = b.x + 2 * br + 18 * u, valStr = (i: number, f: number) => `${fmtNum(vals[i] * f, dec, group)}${p.unit}`;
  const valW = hasV ? Math.max(...rows.map((r, i) => (Number.isFinite(vals[i]) ? textW(valStr(i, 1), ls) : 0))) + 18 * u : 0;
  const labelW = Math.min(Math.max(...rows.map((r) => (r.gap ? 0 : textW(r.label, ls)))), (b.w - 2 * br - 18 * u - tieW) * (hasV ? 0.42 : 1));
  const barX = labelX + labelW + 20 * u, barW = Math.max(0, b.x + b.w - tieW - valW - barX), bt = rowH * 0.5;
  const tEnd = Math.max(...starts) + 0.7;
  rows.forEach((r, i) => {
    const t0 = starts[i], a = eOut3(prog(local, t0, t0 + 0.35)), dx = -(1 - a) * 60 * u, cy = y0 + rowH * (i + 0.5), lit = i === hlRow;
    if (r.gap) { T(e, { id: `l${i}`, text: '⋯', x: labelX + labelW / 2 + dx, y: cy, size: ls, align: 'c', color: C.dim, weight: 700, a }); return; }
    // revealed upward, each rank badge pops in as its row arrives
    M(e, { t: 'dot', x: b.x + br + dx, y: cy, r: br * (up ? pop(local, t0, 0.3) : 1), fill: lit ? C.accent : C.color, seed: 81 + i, a });
    T(e, { id: `n${i}`, text: String(rk[i]), x: b.x + br + dx, y: cy, size: fitSize(String(rk[i]), br * 1.15, br * 1.7), align: 'c', color: onColor(lit ? C.accent : C.color, C), weight: 900, a });
    T(e, { id: `l${i}`, text: r.label, x: labelX + dx, y: cy, size: fitSize(r.label, ls, labelW), align: 'l', color: lit ? C.accent : C.ink, weight: lit ? 900 : 700, a });
    if (!Number.isFinite(vals[i])) return;
    const f = eOut3(prog(local, t0 + 0.1, t0 + 0.7)), len = Math.max(2 * u, ((vals[i] - lo) / (hi - lo || 1)) * barW);
    M(e, { t: 'rect', x: barX, y: cy - bt / 2, w: len, h: bt, fill: lit ? C.accent : withAlpha(C.color, 0.55), reveal: f * a, from: 'l', seed: 91 + i * 7, dx });
    T(e, { id: `v${i}`, text: valStr(i, f), x: barX + len * f + 12 * u + dx, y: cy, size: ls * 0.9, align: 'l', color: lit ? C.accent : C.dim, weight: 900, a: clamp(f * 5) });
  });
  if (hlRow >= 0 && !rows[hlRow].gap) {
    const note = p.note || WORDS.rank[e.lang](rk[hlRow]), cy = y0 + rowH * (hlRow + 0.5), size = fitSize(note, Math.min(54 * u, rowH * 0.62), b.w * 0.42);
    const tw = textW(note, size) + size * 0.9, endX = Number.isFinite(vals[hlRow]) ? barX + ((vals[hlRow] - lo) / (hi - lo || 1)) * barW + valW + 24 * u : labelX + textW(rows[hlRow].label, ls) + 30 * u;
    T(e, { id: 'note', text: note, x: Math.min(endX + tw / 2, b.x + b.w - tieW - tw / 2), y: cy, size, align: 'c', color: onColor(C.tag, C), weight: 900, bg: C.tag, a: clamp((local - tEnd) / 0.1), sc: pop(local, tEnd), rot: -3 });
    if (p.mark === 'circle') M(e, { t: 'loop', cx: labelX + labelW / 2 - 10 * u, cy, rx: labelW / 2 + br + 30 * u, ry: rowH * 0.62, line: C.accent, lw: 5 * u, prog: eOut3(prog(local, tEnd + 0.1, tEnd + 0.5)), seed: 35 });
  }
  runs.forEach(([i, j], k) => {
    const t0 = starts[i] + 0.2, f = eOut3(prog(local, t0, t0 + 0.35)), y1 = y0 + rowH * (i + 0.18), y2 = y0 + rowH * (j + 0.82), arm = Math.min(22 * u, tieW * 0.25);
    if (f > 0) M(e, { t: 'path', pts: [[tieX - arm, y1], [tieX, y1], [tieX, y2], [tieX - arm, y2]], line: C.color, lw: 5 * u, prog: f, seed: 61 + k });
    T(e, { id: `tie${k}`, text: p.tie, x: tieX - arm - 10 * u, y: (y1 + y2) / 2, size: fitSize(p.tie, tieS, tieW - arm - 14 * u), align: 'r', color: C.ink, weight: 900, a: f });
  });
}
