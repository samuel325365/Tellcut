import { peakSlice } from './waveform.ts';
import { thumbTiles } from './thumbs.ts';

const info = { interval: 1, width: 160, height: 90, cols: 10, count: 30, url: '/t.jpg' };

test('thumbnail tiles step through the source at the clip speed', () => {
  const tiles = thumbTiles({ in: 12, speed: 2, len: 2, pps: 80, rowH: 45, info });
  expect(tiles.length).toBe(2);
  expect(tiles[0]).toEqual({ x: 0, w: 80, bg: '-160px -45px', size: '800px auto' });
  expect(tiles[1].bg).toBe('-320px -45px');   // x = 80 px → source 12 + 1 s × 2 = 14 → column 4, row 1
});

test('peak slices keep the loudest sample of each column', () => {
  const p = { rate: 10, peaks: [0.1, 0.5, 0.2, 0.9, 0.3, 0, 0, 0.4, 0, 0] };
  expect(peakSlice(p, 0, 1, 2)).toEqual([0.9, 0.4]);
  expect(peakSlice(p, 0.3, 0.2, 1)).toEqual([0.9]);
  expect(peakSlice({ rate: 10, peaks: [] }, 0, 1, 3)).toEqual([0, 0, 0]);
});
