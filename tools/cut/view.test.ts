import { viewCrop, viewHits, viewRect, type Rect } from './view.ts';

// podcast-versus's crop(): a window of a 1280×720 source (centre cx, cy as fractions) at zoom z, for a 1080×760 panel
function versusCrop(cx: number, cy: number, z: number) {
  const axis = (frame: number, src: number, other: number, otherSrc: number, want: number) => {
    const base = Math.max(frame / src, other / otherSrc), b = src * base;
    const centre = (x: number) => { const bl = Math.min(0, Math.max(frame - b, frame / 2 - x * b)), ax = bl + x * b; return x + (frame / 2 - ax) / (b * z); };
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (centre(m) < want) lo = m; else hi = m; }
    return { f: (lo + hi) / 2, win: frame / (b * z) };
  };
  const wx = axis(1080, 1280, 760, 720, 0.5).win, wy = axis(760, 720, 1080, 1280, 0.5).win;
  cx = Math.min(1 - wx / 2, Math.max(wx / 2, cx)); cy = Math.min(1 - wy / 2, Math.max(wy / 2, cy));
  return { x: axis(1080, 1280, 760, 720, cx).f, y: axis(760, 720, 1080, 1280, cy).f, zoom: z };
}

test('viewCrop: the view is centred where asked at the zoom asked, the same crop podcast-versus worked out by hand', () => {
  for (const [cx, cy, z] of [[0.78, 0.385, 1.3], [0.27, 0.393, 1.8], [0.8, 0.413, 1.9], [0.31, 0.409, 1.7 * 1.07]]) {
    const c = viewCrop(1280, 720, 1080, 760, cx, cy, z), r = viewRect(1280, 720, 1080, 760, c), o = versusCrop(cx, cy, z);
    // centred where asked, unless that runs off the picture (0.78 at 1.3×: the view is 0.62 wide, so it stops at the right edge)
    expect((r[0] + r[2]) / 2).toBeCloseTo(Math.min(cx, 1 - (r[2] - r[0]) / 2), 4);
    expect((r[1] + r[3]) / 2).toBeCloseTo(cy, 4);
    expect(c.x).toBeCloseTo(o.x, 4);
    expect(c.y).toBeCloseTo(o.y, 4);
    expect(c.zoom).toBe(z);
  }
});

test('viewCrop: a view that would run off the picture is moved in; a zoom below 1 is 1', () => {
  const c = viewCrop(1280, 720, 1080, 760, 0.99, 0.02, 2), r = viewRect(1280, 720, 1080, 760, c);
  expect(r[2]).toBeCloseTo(1, 4);
  expect(r[1]).toBeCloseTo(0, 4);
  expect(viewCrop(1920, 1080, 1080, 1920, 0.5, 0.5, 0.5).zoom).toBe(1);
  // a tall frame on a wide source: the zoom-1 view is a full-height slice, centred sideways where asked
  const t = viewRect(1920, 1080, 1080, 1920, viewCrop(1920, 1080, 1080, 1920, 0.3, 0.5, 1));
  expect(t[1]).toBeCloseTo(0, 4); expect(t[3]).toBeCloseTo(1, 4);
  expect((t[0] + t[2]) / 2).toBeCloseTo(0.3, 4);
});

test('viewHits: the keep-out rectangles a view overlaps; touching is not overlapping', () => {
  const view: Rect = [0.4, 0.1, 0.9, 0.8], mark: Rect = [0, 0, 0.3, 0.108], caption: Rect = [0.08, 0.805, 0.92, 0.9];
  expect(viewHits(view, [mark, caption])).toEqual([]);
  expect(viewHits([0.2, 0.05, 0.7, 0.75], [mark, caption])).toEqual([mark]);
  expect(viewHits([0.4, 0.3, 0.9, 0.85], [mark, caption])).toEqual([caption]);
});
