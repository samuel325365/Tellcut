// Where the words on screen are (toolkit phase 1, `npm run check`): every visible text run inside an item layer
// ([data-id]), as boxes in project pixels. Hidden text (display none, visibility hidden, fully transparent) is left out. Words
// drawn on a canvas come from the items' own reports (ctx.reportText, engine report.ts), marked `canvas`, with their words and type size.
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

export function textBoxes(stage: HTMLElement, W: number): TextBox[] {
  const box = stage.getBoundingClientRect(), k = box.width / W || 1, by = new Map<string, Rect[]>();
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
      by.get(item.dataset.id)!.push({ x: (r.left - box.left) / k, y: (r.top - box.top) / k, w: r.width / k, h: r.height / k });
    }
  }
  return [...by].map(([id, rects]) => ({ id, rects }));
}

/** textBoxes plus what the items reported drawing on a canvas this frame (Stage.textReports()), shown by the same rule */
export function layoutBoxes(stage: HTMLElement, W: number, reports: ReportedText[]): TextBox[] {
  return [...textBoxes(stage, W), ...reportedBoxes(stage, W, reports, (el) => shown(el, stage)).map((b) => ({ ...b, canvas: true as const }))];
}
