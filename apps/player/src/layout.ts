// Where the words on screen are (toolkit phase 1, `npm run check`): every visible text run inside an item layer
// ([data-id]), as boxes in project pixels. Hidden text (display none, visibility hidden, fully transparent) is left out. Words
// drawn on a canvas come from the items' own reports (ctx.reportText, engine report.ts), marked `canvas`, with their words and type size;
// DOM words carry their type size too (typeSize).
import { reportedBoxes, type ReportedText } from '@tellcut/engine';
// the boxes are what __tellcut.layout() hands to Node, so their shape is the render API's
import type { TextBox, TextRect as Rect } from '@tellcut/protocol';

function shown(el: Element, stop: Element): boolean {
  let alpha = 1;
  for (let e: Element | null = el; e && e !== stop; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    alpha *= Number(cs.opacity || 1);
  }
  return alpha > 0.05;
}

/**
 * The type size of an element's words in project pixels: its CSS font size times the scale its ancestors' transforms give it
 * (a caption popping in, the stage fitted to the window), found as its drawn box over its layout box. check judges words
 * by it: a line box is 1.45 times the type size only for Noto Sans TC (Huninn's is 1.12–1.33), so height alone misjudged them.
 * Undefined when the element has no layout box (an SVG text, display: contents).
 */
function typeSize(el: Element, k: number): number | undefined {
  if (!(el instanceof HTMLElement) || !el.offsetWidth || !el.offsetHeight) return undefined;
  const r = el.getBoundingClientRect(), px = parseFloat(getComputedStyle(el).fontSize);
  // the smaller ratio: a rotation widens the drawn box, a scale widens both
  const scale = Math.min(r.width / el.offsetWidth, r.height / el.offsetHeight);
  return Number.isFinite(px) && scale > 0 ? (px * scale) / k : undefined;
}

export function textBoxes(stage: HTMLElement, W: number): TextBox[] {
  const box = stage.getBoundingClientRect(), k = box.width / W || 1, by = new Map<string, Rect[]>(), sizes = new Map<Element, number | undefined>();
  const walk = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent?.trim() || /^(STYLE|SCRIPT|TITLE|DEFS)$/i.test(el.tagName)) continue;
    const item = el.closest<HTMLElement>('[data-id]');
    if (!item?.dataset.id || !shown(el, stage)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      if (!by.has(item.dataset.id)) by.set(item.dataset.id, []);
      if (!sizes.has(el)) sizes.set(el, typeSize(el, k));
      const size = sizes.get(el);
      by.get(item.dataset.id)!.push({ x: (r.left - box.left) / k, y: (r.top - box.top) / k, w: r.width / k, h: r.height / k, ...(size ? { size } : {}) });
    }
  }
  return [...by].map(([id, rects]) => ({ id, rects }));
}

/** textBoxes plus what the items reported drawing on a canvas this frame (Stage.textReports()), shown by the same rule */
export function layoutBoxes(stage: HTMLElement, W: number, reports: ReportedText[]): TextBox[] {
  return [...textBoxes(stage, W), ...reportedBoxes(stage, W, reports, (el) => shown(el, stage)).map((b) => ({ ...b, canvas: true as const }))];
}
