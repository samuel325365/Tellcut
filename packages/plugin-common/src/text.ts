// Text helpers the blocks share: fitting a line into its room, 【】 emphasis, typed line breaks, an absolutely placed text line.
import { abs, cssCamel, textEm } from '@tellcut/engine';

/** The font size that fits `text` into `room` px, from `px` down to 40% of it */
export const fitPx = (text: string, px: number, room: number) => Math.max(px * 0.4, Math.min(px, room / Math.max(0.5, textEm(text))));
/** 【word】 pieces of a text: [text, emphasised] */
export const emParts = (text: string): Array<[string, boolean]> => {
  const out: Array<[string, boolean]> = [], re = /【([^】]*)】/g;
  let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) { if (m.index > i) out.push([text.slice(i, m.index), false]); out.push([m[1], true]); i = m.index + m[0].length; }
  if (i < text.length) out.push([text.slice(i), false]);
  return out;
};
/** a block's text param with a typed "\n" read as a line break */
export const nl = (s: unknown) => String(s ?? '').replace(/\\n/g, '\n');
/** an absolutely placed line of text: no wrapping, line height 1 (the phone UIs place every line themselves) */
export const lineAbs = <K extends 'div' | 'span' = 'div'>(parent: Element, css: Record<string, string> = {}, tag: K = 'div' as K) =>
  abs(parent, { whiteSpace: 'pre', lineHeight: '1', ...css }, tag);

/** a line of text drawn on a canvas: at x (by `align`), its baseline at y (or its middle, `base: 'middle'`), `size` px; `width`
 *  stretches its copy to that many px from its left edge (3D letters; align left); `alpha` how far it shows; `turn` more CSS transform (about its own box) */
export interface GhostLine {
  text: string; x: number; y: number; size: number; family: string; weight?: number; align?: CanvasTextAlign; spacing?: number;
  base?: 'alphabetic' | 'middle'; width?: number; alpha?: number; turn?: string;
}
/** The transparent DOM copy of a canvas-drawn line (the way dotmatrix, digits and printer show their words): line height 1, the
 *  baseline about 0.88 em down, colour transparent, so `__tellcut.layout()` and the editor's double-click find the words while
 *  the picture stays the canvas's. Faded with the line, so a line not in yet is left out. */
export function ghostLine(el: HTMLElement, l: GhostLine | null | undefined) {
  const a = l ? (l.alpha ?? 1) : 0;
  if (!l || !l.text || a <= 0.003) { cssCamel(el, { display: 'none' }); return; }
  if (el.textContent !== l.text) el.textContent = l.text;
  const tx = l.align === 'center' ? '-50%' : l.align === 'right' || l.align === 'end' ? '-100%' : '0%', ty = l.base === 'middle' ? '-50%' : '-88%';
  const sx = l.width ? l.width / Math.max(1, textEm(l.text) * l.size + [...l.text].length * (l.spacing ?? 0)) : 1;
  cssCamel(el, { display: 'block', position: 'absolute', left: `${l.x}px`, top: `${l.y}px`, fontSize: `${l.size}px`, fontFamily: l.family, fontWeight: String(l.weight ?? 400),
    letterSpacing: `${l.spacing ?? 0}px`, whiteSpace: 'pre', lineHeight: '1', color: 'transparent', pointerEvents: 'none', opacity: String(a), transformOrigin: l.width ? '0 0' : '50% 50%',
    transform: `translate(${tx}, ${ty})${sx !== 1 ? ` scaleX(${sx.toFixed(4)})` : ''}${l.turn ? ` ${l.turn}` : ''}` });
}
/** a block's layer of copies over its canvas: child i copies lines[i] (made as needed, the extra ones hidden) */
export const ghostLayer = (root: Element) => abs(root, { left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', color: 'transparent' });
export function ghostLines(layer: HTMLElement, lines: Array<GhostLine | null>) {
  while (layer.children.length < lines.length) abs(layer);
  [...layer.children].forEach((el, i) => ghostLine(el as HTMLElement, lines[i]));
}
