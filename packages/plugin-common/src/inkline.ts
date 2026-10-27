// Hand-drawn lines on a canvas (from the zhongli-food short): a felt-pen stroke drawn twice with a fixed-seed wobble, and a
// Catmull-Rom curve through points. Pure functions of their inputs, so a frame draws the same however it is reached.
// `boil` (off unless given) redraws a line with a new wobble that many times a second, as hand-drawn animation does; the
// other pens (crayon, pencil, marker) and the shapes they draw are in sketch.ts.

/** a fixed wobble in −1…1 for point i (k picks another sequence) */
export const wob = (i: number, k = 1) => Math.sin(i * 12.9898 + k * 78.233) * 0.5 + Math.sin(i * 3.17 + k) * 0.5;

/** the seed a hand-drawn line uses at time `t`: `seed` itself, or with boil > 0 a new one `boil` times a second (a function of t) */
export const boiled = (seed: number, t = 0, boil = 0) => (boil > 0 ? seed + Math.floor(Math.max(0, t) * boil + 1e-6) * 97 : seed);

export interface PenOpts { boil?: number; t?: number; alpha?: number }
/** a slightly irregular line through `pts`, width `w`; only the first `upto` (0–1) of its length is drawn; `o.alpha` scales it */
export function penPath(g: CanvasRenderingContext2D, pts: Array<[number, number]>, w: number, color: string, seed = 1, upto = 1, o: PenOpts = {}) {
  const n = pts.length; if (n < 2) return;
  seed = boiled(seed, o.t, o.boil);
  const a = o.alpha ?? 1;
  let total = 0; const seg: number[] = [];
  for (let i = 1; i < n; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  const stop = total * upto;
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath(); g.strokeStyle = color; g.lineWidth = w * (pass ? 0.55 : 1); g.globalAlpha = a * (pass ? 0.45 : 1); g.lineCap = 'round'; g.lineJoin = 'round';
    let acc = 0;
    g.moveTo(pts[0][0] + wob(seed, pass) * w * 0.3, pts[0][1] + wob(seed + 1, pass) * w * 0.3);
    for (let i = 1; i < n; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (acc + seg[i - 1] > stop) { const f = (stop - acc) / seg[i - 1]; g.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f); break; }
      g.lineTo(x1 + wob(seed + i, pass + 2) * w * 0.35, y1 + wob(seed + i * 1.7, pass + 3) * w * 0.35);
      acc += seg[i - 1];
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** a Catmull-Rom curve through the control points, `per` samples between each two */
export function spline(ctrl: Array<[number, number]>, per = 16): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const at = (d: 0 | 1) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  if (ctrl.length) out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** the canvas sized to w×h device pixels (cleared either way) and its context */
export function canvasAt(cv: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d')!; g.clearRect(0, 0, W, H);
  return g;
}

/** ItemType.hide: give back the canvases' pixels (0×0) until canvasAt, or the block's own size check, sizes them again */
export function freeCanvas(...cvs: Array<HTMLCanvasElement | null | undefined>) {
  for (const c of cvs) if (c) { c.width = 0; c.height = 0; }
}

/** "1|條商圈, 10|分鐘走完" → [["1","條商圈"], ["10","分鐘走完"]]; blank pieces dropped */
export const parsePairs = (s: string): Array<[string, string]> => String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean)
  .map((x) => { const [a, b] = x.split('|').map((y) => y.trim()); return [a ?? '', b ?? ''] as [string, string]; });

/** the start point and the stops of a route as fractions of its map: a snake, left to right along the top, back along the bottom */
export function snake(points: number, roomy = false): Array<[number, number]> {
  const n = Math.max(2, Math.round(points)), m = Math.ceil(n / 2), b = n - m, out: Array<[number, number]> = [];
  const [t0, t1, b0, b1] = roomy ? [0.36, 0.44, 0.72, 0.78] : [0.42, 0.5, 0.84, 0.9];
  for (let i = 0; i < m; i++) out.push([m > 1 ? 0.14 + (i * 0.7) / (m - 1) : 0.5, i % 2 ? t1 : t0]);
  for (let j = 0; j < b; j++) out.push([b > 1 ? 0.72 - (j * 0.48) / (b - 1) : 0.72, j % 2 ? b1 : b0]);
  return out;
}
