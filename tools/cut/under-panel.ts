// What sits under the panel of a panel layout (c.panel): rows a script or recipe reserves there (the hook's chapter dots), then
// the captions. A caption the author did not place (no `y` or `position`, no transform) hangs right under the panel and the rows,
// as long as it stays above the bottom safe margin (the platform's caption and music line on 9:16); otherwise it keeps its place
// on that margin. Pure: Cut.save() hands the items in and applies what comes back.

/** room between the panel's border (its stroke, hard shadow or print margin reach about 20 px) and what hangs under it, in px of a
 *  1080 short side */
export const UNDER_GAP = 40;

/** the lines a caption may take: common.caption and core.caption both fit their text to at most two, shrinking the font */
const LINES = 2, LINE_HEIGHT = 1.25;
/** a common.caption style's padding above and below its lines, in em (caption.ts: box, bubble, ticket…; strip: each line its own
 *  strip of paper with 0.2 em between) */
const PAD: Record<string, number> = { box: 0.36, bubble: 0.36, ticket: 0.65, crayon: 0.44, bar: 0.58, auto: 0.38, strip: 0.52 };

/**
 * The height a caption may take with two lines (a fraction of the frame height), everything it draws above and below its lines
 * included: the name and tag chips over it, the translation under it. `p` is its params with the block's defaults filled in.
 */
export function captionHeight(type: string, p: Record<string, unknown>, W: number, H: number, stroke: number): number {
  const num = (k: string, d: number) => (typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : d);
  if (type === 'core.caption') return ((num('size', 4.5) / 100) * H * (LINES * LINE_HEIGHT + 0.3)) / H;   // padding 0.15 em above and below
  const style = String(p.style ?? 'outline'), k = Math.min(W, H) / 1080;
  const em = (num('size', 4.6) / 100) * H * (style === 'big' ? 1.25 : 1);
  let h = LINES * LINE_HEIGHT * Math.max(1, num('hlScale', 1)) + (PAD[style] ?? 0);
  if (p.name && style !== 'qa' && (!p.point || p.point === 'none')) h += 0.55 * (LINE_HEIGHT + 0.2 + 0.25);   // the name chip: 0.55 em, lifted 0.25 of it
  if (p.tag) h += 0.55 * (LINE_HEIGHT + 0.2 + 0.35);
  if (p.gloss) { const gs = num('glossSize', 0.52); h += gs * LINE_HEIGHT + (style === 'strip' ? 0.3 + gs * 0.16 : 0.1); }
  return (h * em + (style === 'bubble' ? 2 * stroke * k : 0)) / H;
}

/** a caption on the timeline as placeCaptions sees it */
export interface CaptionItem { id: string; type: string; params: Record<string, unknown>; transform?: unknown }
/** where one caption goes: `y` for common.caption (its lower edge), a transform for core.caption (moved from the bottom margin) */
export type CaptionPlace = { id: string; y: number } | { id: string; transform: { x: number; y: number; scale: number } };

export const isCaption = (type: string) => type === 'common.caption' || type === 'core.caption';
/** a caption the author placed: a lower edge or a position of its own, or moved (c.effect's transform, c.update) */
export const placedByAuthor = (it: CaptionItem) => 'y' in it.params || 'position' in it.params || it.transform !== undefined;

/**
 * Where the unplaced captions go in a panel layout. `top`: where free room under the panel starts (the panel's lower edge, below the
 * reserved rows); `bottom`: the bottom safe margin (1 − theme.safe.bottom). `heightOf` gives a caption's height (captionHeight).
 * Returns the moves, and the captions left on the margin that still cover the panel's lower edge (`panelBottom`) by more than 1 %.
 */
export function placeCaptions(items: CaptionItem[], o: { top: number; bottom: number; panelBottom: number; gap: number; heightOf: (it: CaptionItem) => number }): { moves: CaptionPlace[]; covering: CaptionItem[] } {
  const moves: CaptionPlace[] = [], covering: CaptionItem[] = [];
  for (const it of items) {
    if (!isCaption(it.type) || placedByAuthor(it)) continue;
    const h = o.heightOf(it), y = Math.round((o.top + o.gap + h) * 1e4) / 1e4;
    if (y <= o.bottom + 1e-9) moves.push(it.type === 'common.caption' ? { id: it.id, y } : { id: it.id, transform: { x: 0, y: Math.round((y - o.bottom) * 1e4) / 1e4, scale: 1 } });
    else if (o.bottom - h < o.panelBottom - 0.01) covering.push(it);
  }
  return { moves, covering };
}
