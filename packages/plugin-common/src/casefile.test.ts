// common.casefile (group E): the evidence lines, the layout on tall, square and wide frames, the window as the clip's frame.
import { defaultSafe } from '@tellcut/engine';
import { casefileLayout, casefileWindow, parseSlots, slotBoxes } from './casefile.ts';

test('slots: "秒|標籤" lines sorted by time, at most ten', () => {
  expect(parseSlots('1.7|有證人\n1.0|有照片')).toEqual([{ at: 1, label: '有照片' }, { at: 1.7, label: '有證人' }]);
  expect(parseSlots('')).toEqual([]);
  expect(parseSlots(Array.from({ length: 12 }, (_, i) => `${i}|x`).join('\n'))).toHaveLength(10);
});

test('slot boxes share the row with 16 px gaps', () => {
  const b = slotBoxes(3, 880, 1);
  expect(b[0]).toEqual([0, (880 - 32) / 3]);
  expect(b[2][0] + b[2][1]).toBeCloseTo(880);
  expect(slotBoxes(0, 880, 1)).toEqual([]);
});

test('layout: the header in the safe area above the window on 9:16 and 1:1, beside it on 16:9; the window inside the safe area', () => {
  for (const [W, H] of [[1080, 1920], [1080, 1080], [1920, 1080]]) {
    const safe = defaultSafe(W, H), L = casefileLayout({ win: '', aspect: 1 }, W, H, safe), [wx, wy, ww, wh] = L.win, [hx, hy, hw, hh] = L.head;
    expect(ww).toBeCloseTo(wh);
    expect(wy + wh).toBeLessThanOrEqual(H * (1 - safe.bottom) + 1e-6);
    expect(hy).toBeGreaterThanOrEqual(safe.top * H - 1e-6);
    expect(hx + hw).toBeLessThanOrEqual(W - safe.side * W + 1e-6);
    if (L.wide) expect(hx).toBeGreaterThan(wx + ww);
    else expect(wy).toBeGreaterThan(hy + hh);
  }
  const tall = casefileLayout({ win: '', aspect: 1 }, 1080, 1920);
  expect(tall.wide).toBe(false);
  expect(tall.win[2]).toBeGreaterThan(850);       // about the fact-check short's 900 px window
  expect(casefileLayout({ win: '', aspect: 1 }, 1920, 1080).wide).toBe(true);
  expect(casefileLayout({ win: '0.1,0.2,0.8,0.4', aspect: 1 }, 1080, 1920).win).toEqual([108, 384, 864, 768]);
});

test('the window as the clip frame (fractions)', () => {
  const f = casefileWindow({}, 1080, 1920), L = casefileLayout({ win: '', aspect: 1 }, 1080, 1920);
  expect(f[0]).toBeCloseTo(L.win[0] / 1080, 4);
  expect(f[3]).toBeCloseTo(L.win[3] / 1920, 4);
  expect(casefileWindow({ win: '0.1,0.2,0.8,0.4' })).toEqual([0.1, 0.2, 0.8, 0.4]);
  expect(casefileWindow({ aspect: 16 / 9 }, 1920, 1080)[2] * 1920 / (casefileWindow({ aspect: 16 / 9 }, 1920, 1080)[3] * 1080)).toBeCloseTo(16 / 9, 2);
});
