import { movedTransform, pickAt, rankHits, scaledTransform, textParamFor, union } from './tools-geom.ts';

test('union of rects; empty is null', () => {
  expect(union([{ left: 0, top: 5, right: 10, bottom: 8 }, { left: 4, top: 1, right: 6, bottom: 20 }])).toEqual({ left: 0, top: 1, right: 10, bottom: 20 });
  expect(union([])).toBeNull();
});

test('a click picks the topmost item; Alt+click walks down through the items under the pointer', () => {
  expect(pickAt(['top', 'mid', 'bottom'], null, false)).toBe('top');
  expect(pickAt(['top', 'mid', 'bottom'], 'top', true)).toBe('mid');
  expect(pickAt(['top', 'mid', 'bottom'], 'bottom', true)).toBe('top');
  expect(pickAt(['top', 'mid'], 'other', true)).toBe('top');
  expect(pickAt([], 'top', false)).toBeNull();
});

test('moving and scaling stay in range; the first scale takes the given origin', () => {
  expect(movedTransform(undefined, 0.1, -0.2)).toEqual({ x: 0.1, y: -0.2, scale: 1, ox: 0.5, oy: 0.5 });
  expect(movedTransform({ x: 0.9, y: 0, scale: 2, ox: 0.3, oy: 0.3 }, 0.5, 0)).toEqual({ x: 1, y: 0, scale: 2, ox: 0.3, oy: 0.3 });
  expect(scaledTransform(undefined, 2, { cx: 0.3, cy: 0.7 })).toEqual({ x: 0, y: 0, scale: 2, ox: 0.3, oy: 0.7 });
  expect(scaledTransform({ x: 0, y: 0, scale: 2, ox: 0.5, oy: 0.5 }, 100, { cx: 0.5, cy: 0.5 }).scale).toBe(10);
});

test('a moving layer scales around its own origin: the anchor seen at one key is not used for the whole path', () => {
  const keys = [{ t: 0, x: 0, y: 0, scale: 0.4 }, { t: 1, x: 0.4, y: 0, scale: 0.4 }];
  const t = scaledTransform({ x: 0, y: 0, scale: 0.4, ox: 0.1, oy: 0.55, keys }, 1.2, { cx: 0.5, cy: 0.55 });
  expect([t.x, t.y, t.ox, t.oy, t.scale]).toEqual([0, 0, 0.1, 0.55, 0.48]);
});

test('a text on screen maps to the string param it shows, even with spaces between letters', () => {
  const params = [{ key: 'num', value: 'CHAPTER ONE · 壹' }, { key: 'word', value: '迎娶' }, { key: 'script', value: '' }];
  expect(textParamFor(['迎 娶', '迎 娶CHAPTER ONE · 壹'], params)).toEqual({ key: 'word', index: 0 });
  expect(textParamFor(['', 'CHAPTER ONE · 壹'], params)).toEqual({ key: 'num', index: 1 });
  expect(textParamFor(['10:08'], params)).toBeNull();
});

test('scaling a moved item turns around what it draws, so the content stays put', () => {
  // a title drawn right of centre (0.8, 0.2), dragged to the lower left (screen centre 0.2, 0.85)
  const at = (t: any, qx: number, qy: number) => [t.ox + t.scale * (qx - t.ox) + t.x, t.oy + t.scale * (qy - t.oy) + t.y];
  const moved = movedTransform(undefined, -0.6, 0.65);
  const [cx, cy] = at(moved, 0.8, 0.2);
  const big = scaledTransform(moved, 2, { cx, cy });
  const [nx, ny] = at(big, 0.8, 0.2);
  expect([big.scale, +nx.toFixed(4), +ny.toFixed(4)]).toEqual([2, +cx.toFixed(4), +cy.toFixed(4)]);
});

test('items hit only by a full-frame layer (particles, glows) rank after items hit by their own content', () => {
  const stage = { left: 0, top: 0, right: 100, bottom: 100 };
  const hits = [{ id: 'dust', rects: [{ left: 0, top: 0, right: 100, bottom: 100 }] }, { id: 'title', rects: [{ left: 10, top: 10, right: 40, bottom: 20 }] }];
  expect(rankHits(hits, stage)).toEqual(['title', 'dust']);
});
