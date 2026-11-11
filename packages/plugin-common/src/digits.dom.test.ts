// @vitest-environment jsdom
// digits' flash stopped at one 5×7 cell per character of the display, but a character outside that font (¥, 元) is drawn from the
// font raster, wider than a cell: the flash could run into the digits. vfdLeft finds where vfdText really starts.
import { F57, vfdText } from './dots.ts';
import { vfdLeft } from './digits.ts';

// jsdom has no 2D context: a raster canvas lit everywhere but its blank first and last columns (each character 6 px wide, as
// dots() leaves a column each side), and a context that records the cells
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const c = this;
    const data = () => { const d = new Uint8ClampedArray(c.width * c.height * 4); for (let i = 0; i < c.width * c.height; i++) { const x = i % c.width; if (x >= 1 && x <= c.width - 2) d[i * 4 + 3] = 255; } return d; };
    return { font: '', fillStyle: '', textBaseline: '', measureText: (s: string) => ({ width: [...s].length * 6 }), fillText() {}, getImageData: () => ({ data: data() }) };
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const leftOf = (text: string, right: number, k: number) => {
  const xs: number[] = [], g: any = { fillStyle: '', fillRect(x: number) { xs.push(x); } };
  vfdText(g, text, right, 0, 7 * k, 5.2 * k, 'on', 'off');
  return Math.min(...xs);
};

test('vfdLeft: a display of 5×7 characters starts one cell per character from the right, as the flash always assumed', () => {
  for (const ch of ['N', 'T', '$', '1', ' ']) expect(F57[ch]).toBeTruthy();
  expect(vfdLeft('NT$ 1234', 700, 1)).toBe(700 - 8 * 42 + 7);
  expect(vfdLeft('NT$ 1234', 700, 1)).toBeCloseTo(leftOf('NT$ 1234', 700, 1));
});

test('vfdLeft: a prefix outside the 5×7 font is as wide as vfdText draws it, more than a cell', () => {
  for (const text of ['¥  1,234', '元 120', '€99', '小計 12']) {
    for (const k of [1, 0.75]) expect(vfdLeft(text, 700 * k, k), `${text} @${k}`).toBeCloseTo(leftOf(text, 700 * k, k));
    expect(vfdLeft(text, 700, 1)).toBeLessThan(700 - [...text].length * 42 + 7);
  }
});
