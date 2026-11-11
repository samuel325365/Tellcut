// A one-colour beat kit, promoted 2026-11-06 from the Single Color pilot film's fx.grade / fx.deepen / fx.hud / fx.echo / fx.page /
// fx.tape (after the user's own Single Color style film). This file holds what its blocks share (the faces, the steps, the slanted
// display words, the corner brackets, grade's and wash's fill):
//   common.grade       (grade.ts) the footage under it in black-and-white, in one colour, or as it is, switched on the beat (a flat fill
//                      blended 'color': grey takes the colour out, a colour gives every pixel its hue at the pixel's own lightness); deep
//                      also multiplies a light colour over the mono steps: with the one colour alone a bright sky stays nearly white
//   common.wash        (wash.ts) that multiplied colour as an item of its own after a grade: an old block now (OLD_BLOCKS), for older
//                      projects
//   common.viewfinder  (viewfinder.ts) corner brackets, a title and chapter line, a route and a shot counter, a tick ruler with a
//                      needle walking down
//   common.echo        (echo.ts) a heavy slanted word with outlined copies stacked above and below it, a small number over its left end
//   common.poster      (poster.ts) a one-colour page: a slanted word over and under a bracketed photo card with a hard shadow, a faint
//                      giant word behind, a line of side text, a barcode
//   common.band        (band.ts) a diagonal band of repeated words, scrolling
// The 3-2-1 is common.countdown's look slant, the caption the template color-boxes (look boxes). Pure functions of time.

export const DISPLAY = 'Anton', SANS = 'Inter', TC = 'Noto Sans TC';
export const disp = (px: number) => `400 ${px}px "${DISPLAY}", "${TC}", sans-serif`;
export const sans = (px: number, w = 700) => `${w} ${px}px "${SANS}", "${TC}", sans-serif`;
/** the faux italic of the display words (Anton has no italic) */
export const SLANT = -0.2;
export type G = CanvasRenderingContext2D;

// a face that fails to load draws with the fallback, as in the other blocks, rather than failing the item's ready
export const fontsReady = (text: string) => Promise.all([document.fonts.load(`400 80px "${DISPLAY}"`, text || 'AZ09'), document.fonts.load(`700 30px "${SANS}"`, 'AZ09'),
  document.fonts.load(`600 30px "${SANS}"`, 'AZ09'), document.fonts.load(`900 50px "${TC}"`, text || '字')].map((l) => l.catch(() => []))).then(() => undefined);
export const spaced = (g: G, px: number) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = `${px.toFixed(1)}px`; } catch { /* older canvases */ } };

/** "seconds|value" lines, in time order: one string a step (phone.ts parseSteps keeps every | field) */
export function parseValueSteps(text: string): Array<{ t: number; v: string }> {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { const [a, ...b] = l.split('|'); return { t: Number(a) || 0, v: b.join('|').trim() }; }).sort((a, b) => a.t - b.t);
}
/** a steps param parsed once per value and kept on the item's state: draw runs every frame */
export interface StepsMemo { text?: string; list: Array<{ t: number; v: string }> }
export function stepsOf(m: StepsMemo, text: string): Array<{ t: number; v: string }> {
  if (m.text !== text) { m.text = text; m.list = parseValueSteps(text); }
  return m.list;
}
export const noSteps = (): StepsMemo => ({ list: [] });
/** the step's value in force at `t` (`dflt` before the first); phone.ts stepAt returns the steps themselves */
export function valueAt(steps: Array<{ t: number; v: string }>, t: number, dflt = 'none'): string {
  let v = dflt;
  for (const s of steps) if (s.t <= t + 1e-6) v = s.v;
  return v;
}

/** an L at each corner of the box */
export function brackets(g: G, x: number, y: number, w: number, h: number, arm: number, lw: number, color: string) {
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'butt';
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    g.beginPath(); g.moveTo(cx + dx * arm, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * arm); g.stroke();
  }
}
/** a slanted display word centred on (x, y): filled and/or outlined */
export function slanted(g: G, text: string, x: number, y: number, px: number, fill: string | null, stroke?: string, lw = 0) {
  g.save(); g.translate(x, y); g.transform(1, 0, SLANT, 1, 0, 0);
  g.font = disp(px); g.textAlign = 'center'; g.textBaseline = 'middle';
  if (fill) { g.fillStyle = fill; g.fillText(text, 0, 0); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.strokeText(text, 0, 0); }
  g.restore();
}
/** the slanted word reported to check with the font and alignment it was drawn with */
export function said(ctx: { reportText: (g: G, text: string, x: number, y: number) => void }, g: G, text: string, x: number, y: number, px: number) {
  g.save(); g.font = disp(px); g.textAlign = 'center'; g.textBaseline = 'middle'; ctx.reportText(g, text, x, y); g.restore();
}
/** the size that keeps `text` within `share` of the width */
export function fitted(g: G, text: string, px: number, maxW: number) {
  g.font = disp(px);
  return Math.min(px, (px * maxW) / Math.max(1, g.measureText(text).width));
}

// the full-frame fill common.grade and common.wash colour
export interface FS { d: HTMLElement; steps: StepsMemo }
export const FILL_CSS = 'position:absolute;inset:0;pointer-events:none';
export const fill = (root: HTMLElement): FS => { const d = document.createElement('div'); d.style.cssText = FILL_CSS; root.appendChild(d); return { d, steps: noSteps() }; };
/** grade's steps out of the box: wash's default is the same, as its doc says */
export const GRADE_STEPS = '0|bw\n0.4|mono\n0.8|none';
/** the multiplied colour of deep (and of the old wash): the tone on the mono steps, nothing on the others */
export const deepFill = (v: string, tone: string) => (v === 'mono' ? tone : 'transparent');
