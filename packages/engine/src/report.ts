// Words an item draws itself (on a canvas, in WebGL) are pixels to the DOM: `__tellcut.layout()` (npm run check's text boxes)
// only sees DOM text. An item tells where it drew words with ctx.reportText; the stage keeps those reports only while check measures
// (Stage opts.measure), and they do not change what is drawn: draw(t) stays a pure function of t.

/** A box of words an item drew, in the item's own frame pixels (ctx.W × ctx.H, before its layer's transform; a block hosted
 *  inside another, like common.card's picture window, uses its own ctx.W × ctx.H). `size`: the type size in px. */
export interface TextReport { text: string; x: number; y: number; w: number; h: number; size: number }

/** ctx.reportText: tell check where words were drawn on a canvas. A no-op unless check is measuring the frame. */
export interface ReportText {
  /** right after `g.fillText(text, x, y[, maxWidth])` (or strokeText) with the same arguments: the box comes from g's font,
   *  textAlign, textBaseline, transform and globalAlpha (nearly transparent words are left out). A canvas in the page is placed
   *  through its own on-screen box; an offscreen one is taken as drawn 1:1 over the item's frame (ctx.W × ctx.H). */
  (g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number): void;
  /** a box of your own (3D words, dot lettering), in the item's frame pixels */
  (box: TextReport): void;
}

/** what the stage keeps of one report: a box in `el`'s own coordinates, whose full extent is pw × ph */
export interface ReportedText { id: string; text: string; size: number; x: number; y: number; w: number; h: number; el: Element; pw: number; ph: number }

export const NO_REPORT: ReportText = () => {};

/** the canvas calls canvasTextBox reads */
export type TextCanvas = Pick<CanvasRenderingContext2D, 'font' | 'globalAlpha' | 'measureText' | 'textAlign' | 'textBaseline' | 'getTransform'>;

/** the type size of a canvas font ('700 48px "Noto Sans TC"'; the browser keeps it in px) */
const fontPx = (font: string) => Number(/(\d*\.?\d+)px/.exec(font)?.[1] ?? 10);

/**
 * Where `g.fillText(text, x, y, maxWidth)` puts its words, in the canvas's pixels: across, the letters' own extent (alignment
 * included); up and down, the font's line box (ascent + descent, as a DOM line of that face), through g's transform. Null for
 * blank or nearly transparent words.
 */
export function canvasTextBox(g: TextCanvas, text: string, x: number, y: number, maxWidth?: number): Omit<TextReport, 'text'> | null {
  if (!text.trim() || g.globalAlpha <= 0.05) return null;
  const m = g.measureText(text), px = fontPx(g.font);
  const squeeze = maxWidth !== undefined && maxWidth > 0 && m.width > maxWidth ? maxWidth / m.width : 1;
  const left = m.actualBoundingBoxLeft ?? (g.textAlign === 'center' ? m.width / 2 : g.textAlign === 'right' || g.textAlign === 'end' ? m.width : 0);
  const right = m.actualBoundingBoxRight ?? m.width - left;
  const up = m.fontBoundingBoxAscent ?? (g.textBaseline === 'top' ? 0 : g.textBaseline === 'middle' ? px * 0.72 : px * 1.16);
  const down = m.fontBoundingBoxDescent ?? px * 1.45 - up;
  const x0 = x - left * squeeze, x1 = x + right * squeeze, y0 = y - up, y1 = y + down;
  const t = g.getTransform();
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([a, b]) => [t.a * a + t.c * b + t.e, t.b * a + t.d * b + t.f]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  // the letters' height follows the transform's y axis (a squashed or rotated line keeps its type size along it)
  return { x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by, size: px * Math.hypot(t.c, t.d) };
}

/** A reporter for one item's draw: records into `out`. Read through `this` when called as ctx.reportText(…), so a block hosted
 *  in another (whose ctx is a copy with its own root, W, H) reports in its own frame. */
export function textReporter(id: string, out: ReportedText[], root: Element, W: number, H: number): ReportText {
  return function (this: unknown, a: CanvasRenderingContext2D | TextReport, text?: string, x?: number, y?: number, maxWidth?: number) {
    try {
      const self = this as { root?: Element; W?: number; H?: number } | undefined;
      const r = self?.root ?? root, w = self?.W ?? W, hh = self?.H ?? H;
      if (typeof text === 'string') {
        const g = a as CanvasRenderingContext2D, b = canvasTextBox(g, text, x ?? 0, y ?? 0, maxWidth);
        if (!b) return;
        const cv = g.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
        // a canvas in the page: through its own box; an offscreen one: 1:1 over the item's frame
        const on = cv && 'isConnected' in cv && cv.isConnected;
        out.push({ id, text, ...b, ...(on ? { el: cv as HTMLCanvasElement, pw: cv.width, ph: cv.height } : { el: r, pw: w, ph: hh }) });
        return;
      }
      const b = a as TextReport;
      if (!b || typeof b.text !== 'string' || !b.text.trim() || ![b.x, b.y, b.w, b.h, b.size].every(Number.isFinite)) return;
      out.push({ id, text: b.text, x: b.x, y: b.y, w: b.w, h: b.h, size: b.size, el: r, pw: w, ph: hh });
    } catch { /* a report must never break a draw */ }
  } as ReportText;
}

/** a reported box in project pixels, with its words and type size */
export interface ReportedBox { x: number; y: number; w: number; h: number; size: number; text: string }

/**
 * The reports in project pixels (`W`: the project width; the stage may be shown scaled), per item, through each element's
 * on-screen box: an item's layer transform, a CSS-sized canvas and a hosted block's window all come along. `visible`: false for
 * an element hidden or faded out (the player's own rule for DOM text); reports on it are left out.
 */
export function reportedBoxes(stage: Element, W: number, reports: ReportedText[], visible: (el: Element) => boolean = () => true): Array<{ id: string; rects: ReportedBox[] }> {
  const s = stage.getBoundingClientRect(), k = s.width / W || 1, by = new Map<string, ReportedBox[]>();
  for (const r of reports) {
    if (!r.el.isConnected || !visible(r.el)) continue;
    const e = r.el.getBoundingClientRect();
    if (e.width <= 0 || e.height <= 0 || r.pw <= 0 || r.ph <= 0) continue;
    const sx = e.width / r.pw / k, sy = e.height / r.ph / k;
    const box = { x: (e.left - s.left) / k + r.x * sx, y: (e.top - s.top) / k + r.y * sy, w: r.w * sx, h: r.h * sy, size: r.size * sy, text: r.text };
    if (box.w <= 0 || box.h <= 0) continue;
    if (!by.has(r.id)) by.set(r.id, []);
    by.get(r.id)!.push(box);
  }
  return [...by].map(([id, rects]) => ({ id, rects }));
}
