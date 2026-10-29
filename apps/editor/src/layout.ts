// Editor layout: stacked puts the preview over the timeline; side puts a full-height preview beside it (a 9:16 video is
// height-bound: above the timeline it would be tiny however wide the window). Auto picks stacked for landscape projects and
// side for portrait ones; the choice and the sizes are kept per project orientation (spec 2026-10-28-timeline-refresh A0).
import { MEDIA_SORTS, MEDIA_TABS, type MediaSort, type MediaTab } from './media-order.ts';

export type Orientation = 'landscape' | 'portrait';
export type Arrange = 'auto' | 'stacked' | 'side';
export type Arrangement = 'stacked' | 'side';
export type PerOrientation<T> = Record<Orientation, T>;
export interface Layout {
  /** stacked: share of the height for the top row (preview); null = default */
  split: PerOrientation<number | null>;
  /** side: preview column width in px; null = the default width */
  previewW: PerOrientation<number | null>;
  /** stacked or side, chosen per project orientation */
  arrange: PerOrientation<Arrange>;
  libClosed: boolean;
  propsClosed: boolean;
  /** side: which panel the side column shows */
  sideTab: 'library' | 'props' | 'chat';
  trackSize: 'compact' | 'standard';
  /** stacked: the timeline shrinks to its ruler (F) */
  maxPreview: boolean;
  /** snapping while dragging (Ctrl still suspends it) */
  snap: boolean;
  /** the left panel's width in px (素材／屬性／對話), dragged by its edge; null = the default for the orientation */
  sideW: number | null;
  /** the Media panel's order, and the page it shows */
  mediaSort: MediaSort;
  mediaTab: MediaTab;
}
export const DEFAULT_SPLIT = 0.62;
/** previewW meaning "as wide as the timeline allows" (gridFor clamps it) */
export const WIDEST_PREVIEW = 10000;
const NONE = { landscape: null, portrait: null };
export const DEFAULT_LAYOUT: Layout = { split: NONE, previewW: NONE, arrange: { landscape: 'auto', portrait: 'auto' }, libClosed: false, propsClosed: false, sideTab: 'library', trackSize: 'compact', maxPreview: false, snap: true, sideW: null, mediaSort: 'timeline', mediaTab: 'video' };
/** F leaves the timeline's tool tray and its ruler (with borders) */
const TRAY_H = 30, RULER_ROW = 26;
const TOOLBAR_H = 40, TRANSPORT_H = 36, SPLITTER = 6, CLOSED = 24, SIDE_W = 260, LIB_W = 220, MIN_TIMELINE = 360;
/** the left panel can be dragged between these (and to at most half the window) */
export const SIDE_MIN = 200, SIDE_MAX = 720;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const orientationOf = (m: { width: number; height: number }): Orientation => (m.height > m.width ? 'portrait' : 'landscape');

/** Stacked or side for this project: its orientation's choice, auto following the orientation. */
export function arrangementOf(l: Pick<Layout, 'arrange'>, meta: { width: number; height: number }): Arrangement {
  const o = orientationOf(meta), a = l.arrange[o];
  return a === 'auto' ? (o === 'portrait' ? 'side' : 'stacked') : a;
}
/** The Layout button's cycle. */
export const nextArrange = (a: Arrange): Arrange => (a === 'auto' ? 'stacked' : a === 'stacked' ? 'side' : 'auto');
export const splitOf = (l: Layout, meta: { width: number; height: number }) => l.split[orientationOf(meta)];
export const previewWOf = (l: Layout, meta: { width: number; height: number }) => l.previewW[orientationOf(meta)];
/** A setLayout patch changing only this project's orientation's sizes. */
export function sizePatch(l: Layout, meta: { width: number; height: number }, patch: { split?: number | null; previewW?: number | null }): Partial<Layout> {
  const o = orientationOf(meta), out: Partial<Layout> = {};
  if ('split' in patch) out.split = { ...l.split, [o]: patch.split ?? null };
  if ('previewW' in patch) out.previewW = { ...l.previewW, [o]: patch.previewW ?? null };
  return out;
}

/** Width of a column that shows the whole video at full height (plus a little margin). */
export const portraitPreviewWidth = (viewH: number, aspect: number) => Math.round((viewH - TOOLBAR_H - TRANSPORT_H) * aspect) + 16;
/** Portrait side column width (a closed side leaves a strip). */
export const sideWidth = (l: Pick<Layout, 'libClosed' | 'sideW'>) => (l.libClosed ? CLOSED : l.sideW ?? SIDE_W);
/** The preview may grow only while the timeline keeps MIN_TIMELINE px; on narrow windows the 200 px minimum wins. */
const maxPreviewW = (viewW: number, side: number) => Math.max(200, viewW - side - SPLITTER - MIN_TIMELINE);
/** Side layout's default preview column: the video at full height, but at most 45% of the room beside the side panel
 *  (a 16:9 video at full height would squeeze the timeline to its minimum). */
export const sidePreviewWidth = (viewW: number, viewH: number, aspect: number, side: number) =>
  clamp(Math.min(portraitPreviewWidth(viewH, aspect), Math.round((viewW - side - SPLITTER) * 0.45)), 200, maxPreviewW(viewW, side));

export function gridFor(l: Layout, meta: { width: number; height: number }, view: { w: number; h: number }) {
  if (arrangementOf(l, meta) === 'side') {
    const side = sideWidth(l), aspect = meta.width / meta.height, saved = previewWOf(l, meta);
    const pw = saved !== null ? clamp(saved, 200, maxPreviewW(view.w, side))
      : orientationOf(meta) === 'portrait' ? clamp(portraitPreviewWidth(view.h, aspect), 200, maxPreviewW(view.w, side)) : sidePreviewWidth(view.w, view.h, aspect, side);
    return { areas: '"tb tb tb tb" "sd tl sp pv"', columns: `${side}px minmax(0, 1fr) ${SPLITTER}px ${pw}px`, rows: `${TOOLBAR_H}px minmax(0, 1fr)` };
  }
  const split = splitOf(l, meta) ?? DEFAULT_SPLIT, r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    areas: '"tb tb tb" "lib pv pr" "sp sp sp" "tl tl tl"',
    columns: `${l.libClosed ? CLOSED : l.sideW ?? LIB_W}px minmax(0, 1fr) ${l.propsClosed ? CLOSED : 300}px`,
    rows: l.maxPreview ? `${TOOLBAR_H}px minmax(0, 1fr) ${SPLITTER}px ${TRAY_H + RULER_ROW}px` : `${TOOLBAR_H}px minmax(160px, ${r2(split)}fr) ${SPLITTER}px minmax(80px, ${r2(1 - split)}fr)`,
  };
}

/** Stacked splitter: pointer y (editor top / height) → share of the height for the preview. */
export const splitFromY = (y: number, top: number, height: number) => clamp((y - top - TOOLBAR_H) / (height - TOOLBAR_H - SPLITTER), 0.3, 0.85);
/** The left panel's edge: pointer x (editor left edge) → panel width, within SIDE_MIN–SIDE_MAX and half the window. */
export const sideWFromX = (x: number, left: number, viewW: number) => clamp(Math.round(x - left), SIDE_MIN, Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.round(viewW / 2))));
/** Side splitter: pointer x (editor right edge / width) → preview column width. */
export const previewWFromX = (x: number, right: number, width: number, side: number) => clamp(Math.round(right - x), 200, maxPreviewW(width, side));

/** A layout read back from storage: each field kept only if it is a sane value (an old or garbled one would break the grid). */
export function sanitizeLayout(raw: unknown): Layout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const bool = (v: unknown) => v === true;
  // per orientation; an older single number goes where it was used: the split by landscape projects, the preview column by
  // portrait ones (a portrait F saved the widest column, which must not squeeze a landscape project's side layout)
  const per = (v: unknown, lo: number, hi: number, was: Orientation): PerOrientation<number | null> => {
    if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return { landscape: num(o.landscape, lo, hi), portrait: num(o.portrait, lo, hi) }; }
    return { landscape: null, portrait: null, [was]: num(v, lo, hi) };
  };
  const arr = (v: unknown): Arrange => (v === 'stacked' || v === 'side' ? v : 'auto');
  const a = (r.arrange && typeof r.arrange === 'object' ? r.arrange : {}) as Record<string, unknown>;
  return { ...DEFAULT_LAYOUT, split: per(r.split, 0.3, 0.85, 'landscape'), previewW: per(r.previewW, 200, WIDEST_PREVIEW, 'portrait'), arrange: { landscape: arr(a.landscape), portrait: arr(a.portrait) }, libClosed: bool(r.libClosed), propsClosed: bool(r.propsClosed),
    trackSize: r.trackSize === 'standard' ? 'standard' : 'compact', snap: r.snap !== false, sideW: num(r.sideW, SIDE_MIN, SIDE_MAX),
    mediaSort: MEDIA_SORTS.includes(r.mediaSort as MediaSort) ? r.mediaSort as MediaSort : 'timeline',
    mediaTab: MEDIA_TABS.includes(r.mediaTab as MediaTab) ? r.mediaTab as MediaTab : 'video' };
}
