// common.album (group B3): the photo list, the tile pattern, the scroll keys, the blanked tiles, the tabs and the flight between boxes.
import { coverPlacement } from '@tellcut/engine';
import { album, albumLayout, albumMaxY, albumScroll, albumTile, cardRect, clipLen, flyPose, hiddenAt, parseAlbum, parseTabs, poseImg, poseOf, standIn, ALBUM_TOP } from './album.ts';

const TEXT = '# 海邊|7月12日|第 1 天\nbeach|1.5||0.3,0.7\n-\n-||0:12\n# 老街|7月13日|第 2 天\n-\n-\n-\n# |7月15日\n-\n-\n# 山上|7月16日||1\n-\n-\n-\n-\n-';

test('photos: groups start at #, a photo line is source|seconds|corner|focus, - is a stand-in, lines before any # get a group of their own', () => {
  const A = parseAlbum(TEXT);
  expect(A.groups.map((g) => [g.place, g.date, g.day, g.layout, g.photos.length])).toEqual([
    ['海邊', '7月12日', '第 1 天', '', 3], ['老街', '7月13日', '第 2 天', '', 3], ['', '7月15日', '', '', 2], ['山上', '7月16日', '', '1', 5]]);
  expect(A.photos[0]).toEqual({ source: 'beach', t: 1.5, label: '', fx: 0.3, fy: 0.7 });
  expect(A.photos[1]).toEqual({ source: '', t: 0, label: '', fx: 0.5, fy: 0.5 });
  expect(A.photos[2].label).toBe('0:12');
  expect(parseAlbum('a|2\\nb').groups).toEqual([{ place: '', date: '', day: '', layout: '', photos: [0, 1] }]);
  expect(parseAlbum('').photos).toEqual([]);
});

test('layout: three alternate big-left and big-right, two side by side, one full width, the rest in rows of three', () => {
  const A = parseAlbum(TEXT), L = albumLayout(A.groups, A.photos.length), col = (1080 - 8) / 3, big = 2 * col + 4;
  expect(L.groupY[0]).toBe(0);
  expect(L.tiles[0]).toEqual([0, 170, big, big]);                       // L: the big one at the left
  expect(L.tiles[1]).toEqual([big + 4, 170, col, col]);
  expect(L.tiles[2]).toEqual([big + 4, 170 + col + 4, col, col]);
  const y1 = L.groupY[1];
  expect(y1).toBeCloseTo(170 + big + 4);
  expect(L.tiles[3]).toEqual([col + 4, y1 + 170, big, big]);             // R: the big one at the right
  expect(L.tiles[4][0]).toBe(0);
  const y2 = L.groupY[2];
  expect(L.tiles[6]).toEqual([0, y2 + 170, 538, 716]);
  expect(L.tiles[7]).toEqual([542, y2 + 170, 538, 716]);
  const y3 = L.groupY[3];
  expect(L.tiles[8]).toEqual([0, y3 + 170, 1080, 900]);                 // layout 1, then rows of three
  expect(L.tiles[9]).toEqual([0, y3 + 170 + 904, col, col]);
  expect(L.tiles[12]).toEqual([0, y3 + 170 + 904 + col + 4, col, col]);
  expect(L.height).toBeCloseTo(y3 + 170 + 904 + 2 * (col + 4) + 260);
  // a pattern that does not fit the count falls back to the automatic one
  const B = parseAlbum('# a|b|c|L\n-\n-');
  expect(albumLayout(B.groups, 2).tiles[1]).toEqual([542, 170, 538, 716]);
  expect(albumMaxY(1000, 1920)).toBe(0);
  expect(albumMaxY(3000, 1920)).toBe(3000 - (1920 - ALBUM_TOP));
});

test('scroll: a group from 0 (40 px above its header), fractions between, end, px, eased into each key, clamped to the content', () => {
  const gy = [0, 900, 1800], max = 1500;
  expect(albumScroll('0|0\n1|1|linear', 0.5, gy, max)).toBeCloseTo(430);  // 0 → 860, half way
  expect(albumScroll('0|0\n1|1|out', 0.5, gy, max)).toBeGreaterThan(430);
  expect(albumScroll('0|1.5', 0, gy, max)).toBe(1310);
  expect(albumScroll('0|2', 0, gy, max)).toBe(max);
  expect(albumScroll('0|end', 0, gy, max)).toBe(max);
  expect(albumScroll('0|300px', 0, gy, max)).toBe(300);
  expect(albumScroll('1|1\n2|0', 0, gy, max)).toBe(860);                 // before the first key: its value
  expect(albumScroll('1|1\n2|0', 9, gy, max)).toBe(0);
  expect(albumScroll('', 1, gy, max)).toBe(0);
});

test('hidden tiles, tabs and a clip length', () => {
  expect([...hiddenAt('0-0.7|3\n2|1, 4', 0.5)]).toEqual([3]);
  expect([...hiddenAt('0-0.7|3\n2|1, 4', 2.5)].sort()).toEqual([1, 4]);
  expect(hiddenAt('0-0.7|3', 0.7).size).toBe(0);
  expect(parseTabs('image|照片, heart|回憶\n搜尋')).toEqual([{ icon: 'image', name: '照片' }, { icon: 'heart', name: '回憶' }, { icon: 'app', name: '搜尋' }]);
  expect(parseTabs('')).toEqual([]);
  expect([clipLen(7.4), clipLen(59.6), clipLen(62)]).toEqual(['0:07', '1:00', '1:02']);
  expect(standIn(3)).toBe(standIn(11));
  expect(standIn(3)).not.toBe(standIn(4));
});

test('the flight: a cover pose places the picture as the engine places a clip; fit shrinks the box round it; poses meet at both ends', () => {
  const crop = { x: 0.3, y: 0.6, zoom: 1.2 }, r: [number, number, number, number] = [10, 20, 540, 960];
  const q = poseOf(1920, 1080, r, 'cover', crop), b = coverPlacement(1920, 1080, 540, 960, crop), im = poseImg(q, 1920, 1080);
  for (const k of ['left', 'top', 'width', 'height'] as const) expect(im[k]).toBeCloseTo(b[k]);
  const f = poseOf(1920, 1080, [0, 0, 1080, 1920], 'fit', crop);
  expect(f.r).toEqual([0, 656.25, 1080, 607.5]);
  const a = flyPose(q, f, 0), z = flyPose(q, f, 1), m = flyPose(q, f, 0.5);
  expect(a).toEqual(q);
  expect(z.s).toBeCloseTo(f.s);
  expect(m.s).toBeCloseTo(Math.sqrt(q.s * f.s));                           // the scale moves evenly in log
  expect(cardRect(1920)).toEqual([60, 440, 960, 1150]);
});

test('albumTile: where a tile is on the frame at a time, on a tall frame and on the phone of a wide one', () => {
  const params = { photos: '# a|b\n-\n-\n-', scroll: '0|0' };
  const col = (1080 - 8) / 3, big = 2 * col + 4;
  const t0 = albumTile(params, 0)!;
  expect(t0.rect[0]).toBe(0);
  expect(t0.rect[1]).toBeCloseTo((ALBUM_TOP + 170) / 1920, 4);
  expect(t0.x).toBeCloseTo(big / 2 / 1080, 3);
  expect(albumTile(params, 9)).toBeNull();
  const w = albumTile(params, 0, 0, 1920, 1080)!;
  expect(w.rect[2]).toBeLessThan(0.3);                                       // on the phone in the middle
  expect(w.x).toBeGreaterThan(0.35);
  expect(w.x).toBeLessThan(0.5);
});

test('media lists the stills the mode shows: every photo on the grid, one picture for a zoom, two for a swipe, none for the viewer', () => {
  const item = (params: Record<string, unknown>) => ({ id: 'x', type: 'common.album', start: 0, end: 3, params }) as any;
  const photos = '# a\nbeach|1\n-\nhill|2';
  expect(album.media!(item({ photos }), {} as any).stills.map((s) => `${s.source}@${s.t}`)).toEqual(['beach@1', 'hill@2']);
  expect(album.media!(item({ photos, mode: 'zoom', pick: 2 }), {} as any).stills.map((s) => s.source)).toEqual(['hill']);
  expect(album.media!(item({ photos, mode: 'swipe', pick: 0, source2: 'sea', t2: 3 }), {} as any).stills.map((s) => `${s.source}@${s.t}`)).toEqual(['beach@1', 'sea@3']);
  expect(album.media!(item({ photos, mode: 'viewer' }), {} as any).stills).toEqual([]);
  expect(album.media!(item({}), {} as any).stills).toEqual([]);              // the default photos are all stand-ins
});
