// Editor layout: landscape projects stack the preview over the timeline; portrait projects put a full-height preview
// beside it (a 9:16 video is height-bound: above the timeline it would be tiny however wide the window).
export interface Layout {
  /** landscape: share of the height for the top row (preview); null = default */
  split: number | null;
  /** portrait: preview column width in px; null = as wide as the video at full height */
  previewW: number | null;
  libClosed: boolean;
  propsClosed: boolean;
  /** portrait: which panel the side column shows */
  sideTab: 'library' | 'props' | 'chat';
  trackSize: 'compact' | 'standard';
  /** landscape: the timeline shrinks to its ruler (F) */
  maxPreview: boolean;
  /** snapping while dragging (Ctrl still suspends it) */
  snap: boolean;
  /** the left panel's width in px (素材／屬性／對話), dragged by its edge; null = the default for the orientation */
  sideW: number | null;
}
export const DEFAULT_SPLIT = 0.62;
/** previewW meaning "as wide as the timeline allows" (gridFor clamps it) */
export const WIDEST_PREVIEW = 10000;
export const DEFAULT_LAYOUT: Layout = { split: null, previewW: null, libClosed: false, propsClosed: false, sideTab: 'library', trackSize: 'compact', maxPreview: false, snap: true, sideW: null };
const TOOLBAR_H = 40, TRANSPORT_H = 36, SPLITTER = 6, CLOSED = 24, SIDE_W = 260, LIB_W = 220, MIN_TIMELINE = 360;
/** the left panel can be dragged between these (and to at most half the window) */
export const SIDE_MIN = 200, SIDE_MAX = 720;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Orientation = 'landscape' | 'portrait';
export const orientationOf = (m: { width: number; height: number }): Orientation => (m.height > m.width ? 'portrait' : 'landscape');

/** Width of a column that shows the whole video at full height (plus a little margin). */
export const portraitPreviewWidth = (viewH: number, aspect: number) => Math.round((viewH - TOOLBAR_H - TRANSPORT_H) * aspect) + 16;
/** Portrait side column width (a closed side leaves a strip). */
export const sideWidth = (l: Pick<Layout, 'libClosed' | 'sideW'>) => (l.libClosed ? CLOSED : l.sideW ?? SIDE_W);
/** The preview may grow only while the timeline keeps MIN_TIMELINE px; on narrow windows the 200 px minimum wins. */
const maxPreviewW = (viewW: number, side: number) => Math.max(200, viewW - side - SPLITTER - MIN_TIMELINE);

export function gridFor(l: Layout, meta: { width: number; height: number }, view: { w: number; h: number }) {
  if (orientationOf(meta) === 'portrait') {
    const side = sideWidth(l);
    const pw = clamp(l.previewW ?? portraitPreviewWidth(view.h, meta.width / meta.height), 200, maxPreviewW(view.w, side));
    return { areas: '"tb tb tb tb" "sd tl sp pv"', columns: `${side}px minmax(0, 1fr) ${SPLITTER}px ${pw}px`, rows: `${TOOLBAR_H}px minmax(0, 1fr)` };
  }
  const split = l.split ?? DEFAULT_SPLIT, r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    areas: '"tb tb tb" "lib pv pr" "sp sp sp" "tl tl tl"',
    columns: `${l.libClosed ? CLOSED : l.sideW ?? LIB_W}px minmax(0, 1fr) ${l.propsClosed ? CLOSED : 300}px`,
    rows: l.maxPreview ? `${TOOLBAR_H}px minmax(0, 1fr) ${SPLITTER}px 32px` : `${TOOLBAR_H}px minmax(160px, ${r2(split)}fr) ${SPLITTER}px minmax(80px, ${r2(1 - split)}fr)`,
  };
}

/** Landscape splitter: pointer y (editor top / height) → share of the height for the preview. */
export const splitFromY = (y: number, top: number, height: number) => clamp((y - top - TOOLBAR_H) / (height - TOOLBAR_H - SPLITTER), 0.3, 0.85);
/** The left panel's edge: pointer x (editor left edge) → panel width, within SIDE_MIN–SIDE_MAX and half the window. */
export const sideWFromX = (x: number, left: number, viewW: number) => clamp(Math.round(x - left), SIDE_MIN, Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.round(viewW / 2))));
/** Portrait splitter: pointer x (editor right edge / width) → preview column width. */
export const previewWFromX = (x: number, right: number, width: number, side: number) => clamp(Math.round(right - x), 200, maxPreviewW(width, side));

/** A layout read back from storage: each field kept only if it is a sane value (an old or garbled one would break the grid). */
export function sanitizeLayout(raw: unknown): Layout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const bool = (v: unknown) => v === true;
  return { ...DEFAULT_LAYOUT, split: num(r.split, 0.3, 0.85), previewW: num(r.previewW, 200, WIDEST_PREVIEW), libClosed: bool(r.libClosed), propsClosed: bool(r.propsClosed),
    trackSize: r.trackSize === 'standard' ? 'standard' : 'compact', snap: r.snap !== false, sideW: num(r.sideW, SIDE_MIN, SIDE_MAX) };
}
