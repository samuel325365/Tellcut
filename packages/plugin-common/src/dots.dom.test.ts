// @vitest-environment jsdom
// dots.ts: the VFD's 5×7 font has only what a till needs; a character outside it was drawn as a blank cell.
import { F57, vfdText } from './dots.ts';

// jsdom has no 2D context: a raster canvas whose every pixel is lit, and a context that records the cells drawn
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const c = this;
    return { font: '', fillStyle: '', textBaseline: '', measureText: (s: string) => ({ width: [...s].length * 6 }), fillText() {},
      getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4).fill(255) }) };
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const recorder = () => {
  const calls: Array<[string, number, number, number, number]> = [];
  const g: any = { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) { calls.push([g.fillStyle, x, y, w, h]); } };
  return { g, calls };
};

test('vfdText: the till characters are drawn cell by cell from the 5×7 font, right-aligned, as they always were', () => {
  const { g, calls } = recorder(), text = 'NT$  1,234', pitch = 7, cell = 6 * pitch, right = 700;
  vfdText(g, text, right, 10, pitch, 5.2, 'on', 'off');
  const want: typeof calls = [];
  let x = right - text.length * cell + pitch;
  for (const ch of text) {
    const rows = F57[ch];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) want.push([rows[j][i] === '1' ? 'on' : 'off', x + i * pitch, 10 + j * pitch, 5.2, 5.2]);
    x += cell;
  }
  expect(calls).toEqual(want);
});

test('vfdText: a character outside the 5×7 font lights dots from the font raster instead of a blank cell', () => {
  for (const ch of ['¥', '€', '個', 'a']) {
    const { g, calls } = recorder();
    vfdText(g, `${ch}12`, 700, 10, 7, 5.2, 'on', 'off');
    // the digits are still the 5×7 font, right-aligned where they always were
    const digitsLit = calls.filter(([c, x]) => c === 'on' && x >= 700 - 2 * 42 + 7).length;
    expect(digitsLit, ch).toBe([...'12'].reduce((n, d) => n + F57[d].join('').split('1').length - 1, 0));
    // and the character itself lights something to their left
    expect(calls.some(([c, x]) => c === 'on' && x < 700 - 2 * 42 + 7), ch).toBe(true);
  }
});
