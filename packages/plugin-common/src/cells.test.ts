// cells.ts: the shots, timing and slide-out shared by the cell frames (common.grid, common.slant, common.postage).
import { cellDirs, cellMedia, cellProgress, cropOf, offscreen, parseCellShots, revealTimes } from './cells.ts';

describe('cells', () => {
  test('parseCellShots keeps the slot of a missing cell', () => {
    expect(parseCellShots('a|2|0.5,0.4,1.5\n-\n\nb|0||still\n')).toEqual([
      { source: 'a', from: 2, crop: { x: 0.5, y: 0.4, zoom: 1.5 }, still: false }, null, null,
      { source: 'b', from: 0, crop: { x: 0.5, y: 0.5, zoom: 1 }, still: true }]);
  });
  test('a crop keeps every part written right: two numbers keep x and y, a lone zoom keeps its zoom', () => {
    expect(parseCellShots('a|0|0.5,0.3')[0]!.crop).toEqual({ x: 0.5, y: 0.3, zoom: 1 });
    expect(parseCellShots('a|0|,0.3,2')[0]!.crop).toEqual({ x: 0.5, y: 0.3, zoom: 2 });
    expect(cropOf({ zoom: 1.5 })).toEqual({ x: 0.5, y: 0.5, zoom: 1.5 });
    expect(cropOf({ x: 'left', y: 0.2, zoom: -1 })).toEqual({ x: 0.5, y: 0.2, zoom: 1 });
    expect(cropOf(null)).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  });
  test('revealTimes fills the gaps step apart, in place', () => {
    expect(revealTimes('0, ,1.2', 4, 0.4)).toEqual([0, 0.4, 1.2, 1.2]);
    expect(revealTimes('', 3, 0.35)).toEqual([0, 0.35, 0.7]);
  });
  test('cellDirs: one value for all, else left and right in turn', () => {
    expect(cellDirs('top', 3)).toEqual(['top', 'top', 'top']);
    expect(cellDirs('', 3)).toEqual(['left', 'right', 'left']);
    expect(cellDirs('bottom,x', 3)).toEqual(['bottom', 'right', 'left']);
  });
  test('cellProgress: 0 before, 1 settled, an early exit goes down from where it was', () => {
    expect(cellProgress(0.9, 1, 0.5, -1)).toBe(0);
    expect(cellProgress(5, 1, 0.5, -1)).toBe(1);
    const mid = cellProgress(1.2, 1, 0.5, -1);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
    expect(cellProgress(1.2, 1, 0.5, 1.2)).toBeCloseTo(mid, 6);
    expect(cellProgress(1.8, 1, 0.5, 1.2)).toBe(0);
  });
  test('an exit while the cell is still coming in turns it back at once, never further in first', () => {
    const at = cellProgress(1.2, 1, 0.5, 1.2);
    let last = at;
    for (let t = 1.2; t <= 1.75; t += 0.01) { const q = cellProgress(t, 1, 0.5, 1.2); expect(q).toBeLessThanOrEqual(last + 1e-12); last = q; }
    expect(last).toBe(0);
  });
  test('offscreen moves the box just out of the frame', () => {
    expect(offscreen('left', [24, 24, 510, 930], 1080, 1920)).toEqual([-534, 0]);
    expect(offscreen('right', [546, 24, 510, 930], 1080, 1920)).toEqual([534, 0]);
    expect(offscreen('top', [24, 24, 510, 930], 1080, 1920)).toEqual([0, -954]);
    expect(offscreen('bottom', [24, 966, 510, 930], 1080, 1920)).toEqual([0, 954]);
  });
  test("cellMedia: a clip from the cell's time to the end, none for a cell that never shows", () => {
    const shots = parseCellShots('a|2\nb|5||still\nc|1');
    expect(cellMedia(shots, [0, 0.4, 3], 3)).toEqual({
      videos: [{ source: 'a', in: 2, out: 5, speed: 1, interp: 'none' }],
      stills: [{ source: 'b', t: 5, w: 1080 }] });
  });
});
