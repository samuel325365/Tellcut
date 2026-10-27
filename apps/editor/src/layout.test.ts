import { DEFAULT_LAYOUT, gridFor, sanitizeLayout, orientationOf, portraitPreviewWidth, previewWFromX, sideWFromX, splitFromY } from './layout.ts';

const wedding = { width: 1920, height: 1080 }, kyoto = { width: 1080, height: 1920 };
const view = { w: 1536, h: 864 };

test('portrait projects (taller than wide) get the portrait layout', () => {
  expect([orientationOf(wedding), orientationOf(kyoto)]).toEqual(['landscape', 'portrait']);
});

test('landscape: library | preview | properties on top, a splitter, then the timeline; the preview takes 62% by default', () => {
  const g = gridFor(DEFAULT_LAYOUT, wedding, view);
  expect(g.areas).toBe('"tb tb tb" "lib pv pr" "sp sp sp" "tl tl tl"');
  expect(g.columns).toBe('220px minmax(0, 1fr) 300px');
  expect(g.rows).toBe('40px minmax(160px, 0.62fr) 6px minmax(80px, 0.38fr)');
});

test('landscape: closed side panels shrink to a narrow strip; the maximised preview leaves only the ruler', () => {
  const g = gridFor({ ...DEFAULT_LAYOUT, libClosed: true, propsClosed: true, maxPreview: true }, wedding, view);
  expect(g.columns).toBe('24px minmax(0, 1fr) 24px');
  expect(g.rows).toBe('40px minmax(0, 1fr) 6px 32px');
});

test('portrait: side tabs | timeline | splitter | a full-height preview as wide as the video needs', () => {
  const g = gridFor(DEFAULT_LAYOUT, kyoto, view);
  expect(g.areas).toBe('"tb tb tb tb" "sd tl sp pv"');
  expect(g.rows).toBe('40px minmax(0, 1fr)');
  expect(g.columns).toBe(`260px minmax(0, 1fr) 6px ${portraitPreviewWidth(864, 1080 / 1920)}px`);
  expect(portraitPreviewWidth(864, 1080 / 1920)).toBe(459);   // round((864 - 40 - 36) × 9/16) + 16
  // the preview may grow only as far as it leaves the timeline usable (side 260 + splitter 6 + 360 px of timeline)
  expect(gridFor({ ...DEFAULT_LAYOUT, previewW: 5000 }, kyoto, view).columns.endsWith(`${1536 - 260 - 6 - 360}px`)).toBe(true);
  expect(gridFor(DEFAULT_LAYOUT, kyoto, { w: 800, h: 864 }).columns.endsWith('200px')).toBe(true);   // narrow window: the minimum wins
});

test('dragging the splitters maps the pointer to a clamped size', () => {
  expect(splitFromY(40 + 460, 0, 864)).toBeCloseTo(460 / (864 - 46), 3);
  expect(splitFromY(50, 0, 864)).toBe(0.3);
  expect(splitFromY(860, 0, 864)).toBe(0.85);
  expect(previewWFromX(1536 - 500, 1536, 1536, 260)).toBe(500);
  expect(previewWFromX(1500, 1536, 1536, 260)).toBe(200);
  expect(previewWFromX(0, 1536, 1536, 260)).toBe(1536 - 260 - 6 - 360);
});

test('a saved layout is checked field by field; anything odd falls back to the default', () => {
  expect(sanitizeLayout({ split: 5, previewW: 'x', trackSize: 'huge', libClosed: 'yes', sideTab: 'props', maxPreview: true })).toEqual(DEFAULT_LAYOUT);
  expect(sanitizeLayout({ split: 0.7, previewW: 520, libClosed: true, propsClosed: false, trackSize: 'standard' }))
    .toEqual({ ...DEFAULT_LAYOUT, split: 0.7, previewW: 520, libClosed: true, trackSize: 'standard' });
  expect(sanitizeLayout(null)).toEqual(DEFAULT_LAYOUT);
});
test('the snap switch is kept; anything but false means on', () => {
  expect([sanitizeLayout({ snap: false }).snap, sanitizeLayout({}).snap, sanitizeLayout({ snap: 'x' }).snap]).toEqual([false, true, true]);
});

test('the left panel is as wide as it was dragged (both orientations), within 200–720 px and half the window; a saved odd width is dropped', () => {
  const portrait = { width: 1080, height: 1920 }, landscape = { width: 1920, height: 1080 }, view = { w: 1600, h: 900 };
  expect(gridFor({ ...DEFAULT_LAYOUT, sideW: 420 }, portrait, view).columns.startsWith('420px ')).toBe(true);
  expect(gridFor({ ...DEFAULT_LAYOUT, sideW: 420 }, landscape, view).columns.startsWith('420px ')).toBe(true);
  expect(gridFor(DEFAULT_LAYOUT, portrait, view).columns.startsWith('260px ')).toBe(true);           // the defaults
  expect(gridFor(DEFAULT_LAYOUT, landscape, view).columns.startsWith('220px ')).toBe(true);
  expect(gridFor({ ...DEFAULT_LAYOUT, sideW: 420, libClosed: true }, landscape, view).columns.startsWith('24px ')).toBe(true);   // closed stays a strip
  expect([sideWFromX(350, 10, 1600), sideWFromX(50, 10, 1600), sideWFromX(1500, 10, 1600), sideWFromX(1500, 10, 1000)]).toEqual([340, 200, 720, 500]);
  expect([sanitizeLayout({ sideW: 333 }).sideW, sanitizeLayout({ sideW: 5000 }).sideW, sanitizeLayout({}).sideW]).toEqual([333, null, null]);
});
