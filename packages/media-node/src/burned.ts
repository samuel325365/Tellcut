// Text burned into a video (toolkit phase 2d): where on the picture, and when, the footage carries its own captions.
// No text recognition — a caption line is found from its shape: strokes (strong bright/dark edges) packed into a few rows near the
// bottom, centred, over and over at the same height. A busy texture has as many strokes but spread over every row.
// Text elsewhere in the picture (place-name labels, a title, "DAY 3", a watermark: 2026-11-06, a travel vlog full of them was
// reported clean) is found from the same frames by another trait: lettering laid over the footage stays put while the picture
// under it moves, so its edges are the ones still in place half a second later.
import { abortError, ffmpegProcess } from './ffmpeg.ts';

export const BURN_W = 480, BURN_H = 270;
/** the bottom band that is searched, as rows of the 270-row frame */
const BAND0 = 205, BAND1 = 266;

export interface CaptionProfile {
  /** strokes per 1000 pixels of the band */
  dens: number;
  /** share of the strokes that sit in the busiest 16 rows */
  peak: number;
  /** height of that busiest stretch, 0–1 down the frame */
  at: number;
  /** where the strokes sit across the width (centre 0.5) and how far they spread */
  cx: number; sd: number;
}

/** The stroke profile of the bottom band of a BURN_W×BURN_H gray frame. Black pillar-box bars are not picture and are skipped. */
export function captionProfile(g: ArrayLike<number>): CaptionProfile {
  const W = BURN_W, rowsN = BAND1 - BAND0;
  const near = new Uint8Array(W);
  for (let x = 0; x < W; x++) {
    let dark = 0;
    for (let y = BAND0; y < BAND1; y++) if (g[y * W + x] < 14) dark++;
    if (dark > rowsN * 0.9) for (let k = -5; k <= 5; k++) if (x + k >= 0 && x + k < W) near[x + k] = 1;
  }
  let valid = 0;
  for (let x = 3; x < W - 3; x++) if (!near[x]) valid++;
  const rows = new Float64Array(rowsN);
  let sx = 0, sx2 = 0, total = 0;
  for (let y = BAND0; y < BAND1; y++) for (let x = 3; x < W - 3; x++) {
    if (near[x]) continue;
    const i = y * W + x;
    if (Math.abs(g[i + 2] - g[i - 2]) <= 90) continue;
    let mx = 0, mn = 255;
    for (let k = -3; k <= 3; k++) { const v = g[i + k]; if (v > mx) mx = v; if (v < mn) mn = v; }
    if (mx > 200 && mn < 90) { rows[y - BAND0]++; sx += x; sx2 += x * x; total++; }
  }
  let best = 0, bi = 0;
  for (let y = 0; y + 16 <= rowsN; y++) { let s = 0; for (let k = 0; k < 16; k++) s += rows[y + k]; if (s > best) { best = s; bi = y; } }
  const mean = total ? sx / total : W / 2;
  return {
    dens: (total / (rowsN * Math.max(1, valid))) * 1000, peak: total ? best / total : 0, at: (BAND0 + bi + 8) / BURN_H,
    cx: mean / W, sd: total ? Math.sqrt(Math.max(0, sx2 / total - mean * mean)) / W : 0,
  };
}

/**
 * A caption line: enough strokes, packed into a few rows, centred. (Thresholds found on a captioned 20-minute video and 51 clean
 * frames.) Or a short one — a word or two ("no!", "the sunset!") has a third of the strokes of a sentence and a narrow spread, and
 * both thresholds missed it: nearly every stroke in one line, right in the middle, and wider than a single mark.
 */
export const isCaption = (p: CaptionProfile) =>
  (p.dens >= 10 && p.peak >= 0.55 && Math.abs(p.cx - 0.5) <= 0.2 && p.sd >= 0.05)
  || (p.dens >= 1.5 && p.peak >= 0.9 && Math.abs(p.cx - 0.5) <= 0.08 && p.sd >= 0.012);

export interface BurnedCaption {
  /** share of the video's time that shows a caption line */
  share: number;
  /** the caption row as [x, y, w, h] in fractions of the picture */
  rect: [number, number, number, number];
  /** stretches of time (seconds) with a caption on screen */
  spans: Array<[number, number]>;
}
/** where a piece of the footage's own text sits: a third of the picture's height, or most of it (a screen recording, a card) */
export type TextBand = 'top' | 'middle' | 'bottom' | 'full';
/** text the footage carries outside its caption row (or there, outside the caption's times): a label, a title, a watermark */
export interface BurnedText {
  /** when (seconds of the source), roughly: lettering that slides or fades in is found once it holds still */
  span: [number, number];
  /** where, as [x, y, w, h] in fractions of the picture (16 px cells of a 480×270 frame: a little larger than the letters) */
  rect: [number, number, number, number];
  band: TextBand;
  /** what text recognition read in that box (burned-read.ts); none: nothing read, or not read at all (see `Burned.ocr`) */
  words?: string;
}
/**
 * `text`: other text in the picture (2026-11-06); a result saved before that has none, which says nothing either way.
 * `ocr`: whether `text` was read with text recognition — `ok`: a piece with no `words` is one nothing could be read in (a still
 * shot's railing, a building; or display lettering OCR cannot read), not `ok`: this PC could not read (`why`), every piece is a
 * guess. Missing (burned-v3, before the reading): every piece is a guess.
 */
export interface Burned { version: 1; step: number; frames: number; caption: BurnedCaption | null; text?: BurnedText[]; ocr?: { ok: boolean; why?: string } }

/** text cells: CELL px squares of the BURN_W×BURN_H frame, numbered row by row */
const CELL = 16, GW = BURN_W / CELL, GH = Math.ceil(BURN_H / CELL);
/** an edge: this much brightness across 2 px; unmoved: each neighbour within SAME of the frame before; a cell with lettering:
 *  CELL_MIN unmoved edge pixels over at least 3 rows and 5 columns (a lone line, the border of a bar, is one or two) */
const EDGE = 40, SAME = 14, CELL_MIN = 10;
/** a frame whose edges mostly all stayed put is a still shot (a tripod, a freeze), and one with lettering in over a third of its
 *  cells a frame repeated or a dissolve caught halfway: nothing on it can be told from the picture */
const STILL = 0.5, MOST = 1 / 3;
const popcount = (n: number) => { let c = 0; for (; n; n &= n - 1) c++; return c; };

/**
 * The cells of gray frame `g` (BURN_W×BURN_H) whose strong edges are where they were in `prev`, the frame a moment before, with
 * the same brightness around them: lettering laid over the footage, while the picture under it moved. Null for a still shot.
 */
export function stillCells(g: ArrayLike<number>, prev: ArrayLike<number>): number[] | null {
  const W = BURN_W, n = GW * GH, count = new Int32Array(n), rows = new Int32Array(n), cols = new Int32Array(n);
  let edges = 0, kept = 0;
  for (let y = 1; y < BURN_H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (Math.abs(g[i + 1] - g[i - 1]) < EDGE && Math.abs(g[i + W] - g[i - W]) < EDGE) continue;
    edges++;
    if (Math.abs(prev[i + 1] - prev[i - 1]) < EDGE && Math.abs(prev[i + W] - prev[i - W]) < EDGE) continue;
    if (Math.abs(g[i - 1] - prev[i - 1]) > SAME || Math.abs(g[i + 1] - prev[i + 1]) > SAME || Math.abs(g[i - W] - prev[i - W]) > SAME || Math.abs(g[i + W] - prev[i + W]) > SAME) continue;
    kept++;
    const c = Math.floor(y / CELL) * GW + Math.floor(x / CELL);
    count[c]++; rows[c] |= 1 << (y % CELL); cols[c] |= 1 << (x % CELL);
  }
  if (kept > edges * STILL) return null;
  const out: number[] = [];
  for (let c = 0; c < n; c++) if (count[c] >= CELL_MIN && popcount(rows[c]) >= 3 && popcount(cols[c]) >= 5) out.push(c);
  return out.length > n * MOST ? null : out;
}

type Box = [number, number, number, number];   // cells: x0, y0, x1, y1 (end exclusive)
/** the cells in groups: neighbours, and cells in a row up to one empty cell apart (the gap between two words) */
function cellGroups(cells: number[]): Array<{ box: Box; cells: number[] }> {
  const all = new Set(cells), seen = new Set<number>(), out: Array<{ box: Box; cells: number[] }> = [];
  for (const c0 of cells) {
    if (seen.has(c0)) continue;
    const todo = [c0], box: Box = [GW, GH, 0, 0], group: number[] = [];
    seen.add(c0);
    while (todo.length) {
      const c = todo.pop()!, x = c % GW, y = Math.floor(c / GW);
      group.push(c); box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x + 1); box[3] = Math.max(box[3], y + 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy, k = ny * GW + nx;
        if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && all.has(k) && !seen.has(k)) { seen.add(k); todo.push(k); }
      }
    }
    out.push({ box, cells: group });
  }
  return out;
}
const meets = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** a piece of text is followed across frames this far apart (s); it is kept when seen in at least TEXT_SEEN s of frames, with
 *  TEXT_CELLS cells a frame on average (a speck that stayed put for a moment is not lettering) */
const TEXT_GAP = 1.5, TEXT_SEEN = 1.5, TEXT_CELLS = 1.5, TEXT_MAX = 300;

/**
 * The footage's own text from `stillCells` of each frame (`step` s apart; frame i compared with frame i − 1): cells near each
 * other in a frame are one piece, a piece meeting one seen up to TEXT_GAP s before is the same text, and pieces that meet in place
 * and time at the end are one.
 */
export function summarizeText(cells: Array<number[] | null>, step: number): BurnedText[] {
  // last: where it was at `to`; before: where it was before that (what the other words of the frame at `to` are matched with);
  // hits: in how many frames each cell was part of it
  type Piece = { from: number; to: number; last: Box; before: Box; seen: number; hits: Map<number, number> };
  const open: Piece[] = [], done: Piece[] = [];
  const count = (p: Piece, cs: number[]) => { for (const c of cs) p.hits.set(c, (p.hits.get(c) ?? 0) + 1); };
  cells.forEach((frame, i) => {
    const t = i * step;
    for (const g of cellGroups(frame ?? [])) {
      // followed by where it was last seen, not by everywhere it has been: that grew with every speck that met it
      const m = open.find((p) => t - p.to <= TEXT_GAP + 1e-6 && meets(p.to === t ? p.before : p.last, g.box));
      if (m && m.to === t) m.last = union(m.last, g.box);
      else if (m) { m.before = m.last; m.last = g.box; m.to = t; m.seen++; }
      else open.push({ from: Math.max(0, t - step), to: t, last: g.box, before: g.box, seen: 1, hits: new Map() });
      count(m ?? open.at(-1)!, g.cells);
    }
    for (let k = open.length - 1; k >= 0; k--) if (t - open[k].to > TEXT_GAP + 1e-6) done.push(...open.splice(k, 1));
  });
  /** where it was: the cells it held in a quarter of its frames (a speck that met it once is not part of it) */
  const where = (p: Piece): Box | null => {
    const need = Math.max(2, Math.ceil(p.seen / 4));
    let box: Box | null = null;
    for (const [c, n] of p.hits) if (n >= need) { const x = c % GW, y = Math.floor(c / GW), one: Box = [x, y, x + 1, y + 1]; box = box ? union(box, one) : one; }
    return box;
  };
  const total = (p: Piece) => [...p.hits.values()].reduce((x, y) => x + y, 0);
  // seen long enough, big enough, and there most of its time: lettering stays on screen, specks that happen to stay put come and go
  let kept = [...done, ...open].filter((p) => p.seen * step >= TEXT_SEEN - 1e-6 && total(p) / p.seen >= TEXT_CELLS && p.seen * step >= (p.to - p.from) / 2)
    .map((p) => ({ p, box: where(p) })).filter((x): x is { p: Piece; box: Box } => !!x.box);
  // one label tracked as two pieces (it grew a word, a frame missed it): one
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < kept.length && !merged; i++) for (let j = i + 1; j < kept.length && !merged; j++) {
      const { p, box } = kept[i], q = kept[j];
      if (!meets(box, q.box) || p.from > q.p.to + TEXT_GAP || q.p.from > p.to + TEXT_GAP) continue;
      kept[i] = { p: { ...p, from: Math.min(p.from, q.p.from), to: Math.max(p.to, q.p.to), seen: p.seen + q.p.seen }, box: union(box, q.box) };
      kept = kept.filter((_, k) => k !== j);
      merged = true;
    }
  }
  const r3 = (x: number) => +x.toFixed(3), r2 = (x: number) => +x.toFixed(2);
  const out: BurnedText[] = kept.sort((a, b) => a.p.from - b.p.from || a.box[1] - b.box[1]).map(({ p, box }) => {
    const x = (box[0] * CELL) / BURN_W, y = (box[1] * CELL) / BURN_H, w = Math.min(1, (box[2] * CELL) / BURN_W) - x, h = Math.min(1, (box[3] * CELL) / BURN_H) - y;
    const mid = y + h / 2, band: TextBand = h > 0.6 ? 'full' : mid < 1 / 3 ? 'top' : mid > 2 / 3 ? 'bottom' : 'middle';
    return { span: [r2(p.from), r2(p.to + step)] as [number, number], rect: [r3(x), r3(y), r3(w), r3(h)] as [number, number, number, number], band };
  });
  return out.slice(0, TEXT_MAX);
}

/** a piece of text on the caption row: its line, one line high, not off at a side (a place-name label in a corner stays text) */
const onRow = (t: BurnedText, c: BurnedCaption) => {
  const [, cy, , ch] = c.rect, mid = t.rect[1] + t.rect[3] / 2, cx = t.rect[0] + t.rect[2] / 2;
  return mid >= cy - 0.03 && mid <= cy + ch + 0.03 && t.rect[3] <= 0.2 && cx >= 0.2 && cx <= 0.8;
};
/** spans in order, those that overlap or come within `gap` s of each other as one */
const mergeSpans = (spans: Array<[number, number]>, gap: number) => [...spans].sort((a, b) => a[0] - b[0]).reduce<Array<[number, number]>>((out, [a, b]) => {
  const last = out.at(-1);
  if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b); else out.push([a, b]);
  return out;
}, []);

/** worth taking for text: two CJK characters, or three letters or digits ("6:00 AM"); OCR reads a speck of texture as "l" or "。" */
const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
export const readableWords = (s: string) => (s.match(CJK)?.length ?? 0) >= 2 || (s.match(/[A-Za-z0-9]/g)?.length ?? 0) >= 3;

/**
 * What text recognition read in each piece of `b.text` (`words[i]`, '' for nothing), or null with `why` when it could not read.
 * Words worth taking are kept on their piece. Pieces read as words on the caption row are the caption's too: a word or two the
 * stroke profile missed (white letters on a bright pool, busy ground beside them), so their times join the caption's spans and
 * cropping it away (avoidBurned) covers them — only those read, so a railing standing still beside a caption never widens them.
 */
export function settleText(b: Burned, words: string[] | null, why = ''): Burned {
  const text = b.text ?? [];
  if (!words) return { ...b, text, ocr: { ok: false, why } };
  const read = text.map((t, i) => {
    const w = (words[i] ?? '').replace(/\s+/g, ' ').trim();
    return readableWords(w) ? { ...t, words: w.slice(0, 80) } : t;
  });
  const c = b.caption, row = c ? read.filter((t) => t.words && onRow(t, c)) : [];
  if (!c || !row.length) return { ...b, text: read, ocr: { ok: true } };
  const spans = mergeSpans([...c.spans, ...row.map((t) => t.span)], 0).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)] as [number, number]);
  return { ...b, caption: { ...c, spans }, text: read.filter((t) => !row.includes(t)), ocr: { ok: true } };
}

const MIN_SHARE = 0.08, MIN_SECONDS = 3, GAP_SECONDS = 2;
/**
 * The caption zone and its time spans from one profile per `step` seconds. A few lone hits (under MIN_SECONDS of the whole video)
 * are noise, not a caption; misses up to GAP_SECONDS apart are bridged. `cells`: each frame's stillCells, for the other text.
 */
export function summarizeBurned(profiles: CaptionProfile[], step: number, cells?: Array<number[] | null>): Burned {
  const flags = profiles.map(isCaption), hits = flags.filter(Boolean).length;
  const base: Burned = { version: 1, step, frames: profiles.length, caption: null };
  // the pieces are only candidates until text recognition has looked at them (settleText)
  const withText = (b: Burned): Burned => (cells ? { ...b, text: summarizeText(cells, step) } : b);
  if (hits * step < MIN_SECONDS - 1e-6 || hits / Math.max(1, profiles.length) < MIN_SHARE) return withText(base);
  const gap = Math.round(GAP_SECONDS / step), spans: Array<[number, number]> = [];
  let start = -1, last = -1;
  flags.forEach((f, i) => {
    if (!f) return;
    if (start >= 0 && i - last <= gap) { last = i; return; }
    if (start >= 0) spans.push([start * step, (last + 1) * step]);
    start = last = i;
  });
  if (start >= 0) spans.push([start * step, (last + 1) * step]);
  const ats = profiles.filter((_, i) => flags[i]).map((p) => p.at).sort((a, b) => a - b), at = ats[Math.floor(ats.length / 2)];
  // `at` (the busiest rows) is the text line's middle: measured against Windows OCR's line boxes (toolkit phase 5) it was within
  // 0.002 and 0.009 of it on two videos, whose lines are ~0.05 high. The box is that line with ~0.02 to spare above and below
  // (it was at − 0.07 … + 0.05 before: a whole line too high on top, half a line short below).
  const y = Math.max(0, at - 0.045);
  return withText({ ...base, caption: { share: +(hits / profiles.length).toFixed(3), rect: [0.08, +y.toFixed(3), 0.84, +Math.min(0.09, 1 - y).toFixed(3)], spans: spans.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]) } });
}

/**
 * Decode `video` at one frame per `step` seconds and summarize: the caption row, and the other text from the same frames. Two a
 * second: a word or two of caption is on screen for half a second ("no!"), and a label that slides in holds still only that long.
 * Streams the frames, so a long video never sits in memory.
 */
export function detectBurned(video: string, o: { step?: number; signal?: AbortSignal } = {}): Promise<Burned> {
  const step = o.step ?? 0.5, size = BURN_W * BURN_H;
  if (o.signal?.aborted) return Promise.reject(abortError());
  const profiles: CaptionProfile[] = [], cells: Array<number[] | null> = [];
  let buf = Buffer.alloc(0), prev: Uint8Array | null = null;
  const { done } = ffmpegProcess(['-i', video, '-an', '-vf', `fps=${1 / step},scale=${BURN_W}:${BURN_H},format=gray`, '-f', 'rawvideo', '-'], {
    signal: o.signal, label: 'burned-in captions',
    onStdout: (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= size) {
        const g = new Uint8Array(buf.subarray(0, size));   // a copy: kept as the next frame's prev
        profiles.push(captionProfile(g));
        cells.push(prev ? stillCells(g, prev) : []);
        prev = g; buf = buf.subarray(size);
      }
    },
  });
  return done.then(() => summarizeBurned(profiles, step, cells));
}
