// @vitest-environment jsdom
// The small `head` line over a stamp's word was left out of the shrink-to-fit: a long head ran off the frame. jsdom has no layout:
// the tests read what cssCamel last wrote (`_c`).
import { resolveTheme, textEm, withDefaults } from '@tellcut/engine';
import { headEm, stamp, stampPx } from './stamp.ts';

function run(params: Record<string, unknown>, W = 1080, H = 1920) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const ctx: any = { t: 1, local: 1, dur: 3, item: { id: 'x', type: stamp.type, start: 0, end: 3, params }, params: withDefaults(stamp.params, params, theme), root, top: root, project: {}, media: {}, W, H, fps: 30, theme, grades: {}, motion: {} };
  const s = stamp.build(ctx);
  stamp.draw(ctx, s);
  return { s: s as any, theme };
}
const fontPx = (s: any) => parseFloat((s.box as any)._c.fontSize);

test('headEm: 0.53 em letters, half their em of spacing after each, the half-em indent', () => {
  expect(headEm('')).toBe(0);
  expect(headEm('AB')).toBeCloseTo(0.53 * (1.1 + 1 + 0.5));
  expect(headEm('判決')).toBeCloseTo(0.53 * (2 + 1 + 0.5));
});

test('stampPx: a head wider than the word decides the size; a short head changes nothing', () => {
  expect(stampPx(['已驗證'], 134.4, 800, 1, 'OK')).toBe(stampPx(['已驗證'], 134.4, 800, 1));
  const long = 'CHECKED BY THE KITCHEN';
  expect(stampPx(['已驗證'], 134.4, 800, 1, long)).toBeCloseTo(800 / (headEm(long) + 1));
});

describe.each(['box', 'circle', 'double', 'ember'])('shape %s with a long head', (shape) => {
  const head = 'CHECKED BY THE KITCHEN', text = '已驗證';
  test('the head fits the safe width (its padding and borders inside)', () => {
    const { s, theme } = run({ shape, head, text });
    const f = fontPx(s), room = shape === 'ember' ? 0.9 * 1080 : 1080 * (1 - 2 * theme.safe.side);
    expect(f * headEm(head)).toBeLessThan(room);
    expect(f).toBeLessThan((7 / 100) * 1920);
  });
  test('a short head keeps the size of the word alone', () => {
    const plain = fontPx(run({ shape, text }).s), short = fontPx(run({ shape, text, head: '判決' }).s);
    expect(short).toBe(plain);
  });
});

test('circle: the ring is as wide as the head when the head is the wider line', () => {
  const head = 'QUALITY CHECKED', { s } = run({ shape: 'circle', head, text: '成品' });
  expect(parseFloat((s.box as any)._c.width)).toBeCloseTo(headEm(head) + 1.1);
  expect(parseFloat(run({ shape: 'circle', text: '成品' }).s.box._c.width)).toBeCloseTo(textEm('成品') + 1.1);
});

test('ember: a long word in 9:16 shrinks to the plate instead of running off both edges', () => {
  const { s } = run({ shape: 'ember', text: 'Worth the whole queue', size: 9 });
  expect(fontPx(s) * (textEm('Worth the whole queue') + 0.68)).toBeLessThanOrEqual(0.9 * 1080 + 1e-6);
});
