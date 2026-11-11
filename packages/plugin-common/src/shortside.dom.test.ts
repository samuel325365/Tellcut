// @vitest-environment jsdom
// Nine blocks sized by the frame's short side (min(W, H) / 1080, the common blocks' rule) instead of its width: in a 16:9 frame a
// sticker, a print, a scrap, the film strips, the word frame's border, the speed lines, the sparkles' spread, the dachshund and the
// retro dialog were 1.78 times their 9:16 size (a dialog stretched into a strip across the frame). 9:16 is unchanged: the numbers
// pinned here are the ones drawn before the change.
import { resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { sticker } from './dopamine.ts';
import { prints, scraps } from './scrapbook.ts';
import { filmstrip, monoframe, monoWindow } from './mono.ts';
import { speedlines } from './speedlines.ts';
import { sparkle } from './sparkle.ts';
import { dachshund } from './dachshund-block.ts';
import { popup, popupButton } from './popup.ts';

type Call = [string, unknown[]];
let calls: Call[] = [];
// jsdom has no 2D context: a stand-in that records every call with its arguments
const fake = () => {
  const g: any = { font: '10px sans-serif', globalAlpha: 1, measureText: (t: string) => ({ width: [...String(t)].length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
  return new Proxy(g, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : (...a: unknown[]) => { calls.push([k as string, a]); }), set: (t, k, v) => { t[k] = v; return true; } });
};
const real = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = fake;
  (globalThis as any).Path2D ??= class { constructor(public d?: string) {} };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

const TALL: [number, number] = [1080, 1920], WIDE: [number, number] = [1920, 1080];
function run(type: ItemType<any, any>, params: Record<string, unknown>, [W, H]: [number, number], local = 2) {
  calls = [];
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const ctx: any = { t: local, local, dur: 4, W, H, fps: 30, root, theme, params: withDefaults(type.params, params, theme), motion: { spring: () => () => 1 },
    media: { stillUrl: () => 'x.jpg', place() {}, video: () => document.createElement('video') }, project: { sources: {} }, reportText() {} };
  type.draw(ctx, type.build(ctx));
  return { root, calls: [...calls] };
}
const args = (cs: Call[], name: string) => cs.filter(([n]) => n === name).map(([, a]) => a as number[]);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

test('common.sticker: its size is a share of the short side', () => {
  const radius = (wh: [number, number]) => args(run(sticker, { shape: 'smile', size: 0.12, popAt: 0 }, wh).calls, 'arc')[0][2];
  expect(radius(TALL)).toBeCloseTo(64.8, 9);
  expect(radius(WIDE)).toBeCloseTo(64.8, 9);
  expect(sticker.params.find((d) => d.key === 'size')!.label).toMatch(/短邊/);
});

test('common.prints: a print\'s width is a share of the short side, its place still a share of the frame', () => {
  const box = (wh: [number, number]) => {
    const wrap = run(prints, { source: 'v', prints: '0|0|0.3,0.4,0.5|0|4:3' }, wh).root.firstElementChild as HTMLElement;
    return [parseFloat(wrap.style.width) * wh[0] / 100, parseFloat(wrap.style.height) * wh[1] / 100, (parseFloat(wrap.style.left) * wh[0] / 100) + parseFloat(wrap.style.width) * wh[0] / 200].map(r4);
  };
  expect(box(TALL)).toEqual([540, 405, 324]);
  expect(box(WIDE)).toEqual([540, 405, 576]);
});

test('common.scraps: a scrap\'s width and height are shares of the short side', () => {
  const pin = (wh: [number, number]) => args(run(scraps, { scraps: '0|pin|0.5,0.5,0.04,0.04|0|#e00' }, wh).calls, 'arc')[0][2];
  expect(pin(TALL)).toBeCloseTo(21.6, 9);
  expect(pin(WIDE)).toBeCloseTo(21.6, 9);
});

test('common.filmstrip: the strips and their frames are sized by the short side', () => {
  const strip = (wh: [number, number]) => args(run(filmstrip, {}, wh).calls, 'fillRect').filter((a) => a[1] === 0 && a[3] === wh[1] && a[2] !== wh[0]).map((a) => r4(a[2]));
  expect(strip(TALL)).toEqual([475.2, 475.2]);
  expect(strip(WIDE)).toEqual([475.2, 475.2]);
});

test('common.monoframe: the border is a share of the short side on all four sides', () => {
  expect(monoWindow('', 0, 1080, 1920, 0.045)).toEqual([0.045, 0.045 * (1080 / 1920), 1 - 2 * 0.045, 1 - 2 * 0.045 * (1080 / 1920)]);
  const [x, y, w, h] = monoWindow('', 0, 1920, 1080, 0.045);
  expect([x * 1920, y * 1080, (1 - x - w) * 1920, (1 - y - h) * 1080].map(r4)).toEqual([48.6, 48.6, 48.6, 48.6]);
  expect(monoframe.params.find((d) => d.key === 'border')!.label).toMatch(/短邊/);
});

test('common.speedlines: where the lines start and how long they run go by the short side', () => {
  const tips = (wh: [number, number]) => {
    const cs = run(speedlines, { x: 0.5, y: 0.5, flicker: false, count: 6 }, wh).calls, [cx, cy] = [wh[0] / 2, wh[1] / 2];
    return args(cs, 'moveTo').map((m, i) => [r4(Math.hypot(m[0] - cx, m[1] - cy)), r4(Math.hypot(args(cs, 'lineTo')[2 * i][0] - cx, args(cs, 'lineTo')[2 * i][1] - cy))]);
  };
  const tall = tips(TALL);
  expect(tall).toEqual(TALL_LINES);
  expect(tips(WIDE)).toEqual(tall);
});

test('common.sparkle: the spread goes by the short side', () => {
  const offs = (wh: [number, number]) => args(run(sparkle, { mode: 'twinkle', spread: 0.45, count: 5 }, wh).calls, 'translate').map((a) => [r4(a[0] - 0.5 * wh[0]), r4(a[1] - 0.45 * wh[1])]);
  const tall = offs(TALL);
  expect(tall).toEqual(TALL_SPARKLES);
  expect(offs(WIDE)).toEqual(tall);
});

test('common.dachshund: the dog\'s size is a share of the short side', () => {
  const width = (wh: [number, number]) => (run(dachshund, { action: 'idle' }, wh).root.querySelector('canvas') as HTMLCanvasElement).style.width;
  expect(width(TALL)).toBe('467px');
  expect(width(WIDE)).toBe('467px');
});

test('common.popup: the dialog is a share of the short side wide, so a 16:9 frame does not stretch it into a strip', () => {
  const width = (wh: [number, number]) => args(run(popup, { w: 0.84 }, wh).calls, 'fillRect').filter((a) => a[0] === 0 && a[1] === 0).map((a) => r4(a[2]))[0];
  expect(width(TALL)).toBe(907.2);
  expect(width(WIDE)).toBe(907.2);
  // the cursor's aim at a button moves with the dialog
  expect(popupButton(1)).toEqual([0.3137, 0.4932]);
  expect(popupButton(1, {}, 1920, 1080)).toEqual([r4((960 - 453.6 + 102.4 + 150) / 1920), r4((0.45 * 1080 - 150 + 50 + 140 + 43) / 1080)]);
});

// drawn at 9:16 before the change (distance from the centre to each line's start and tip; each sparkle's offset)
const TALL_LINES = [[309.527, 967.4094], [385.9882, 858.605], [331.9266, 818.1456], [322.1596, 822.8831], [298.5803, 784.4284], [309.3246, 721.5969]];
const TALL_SPARKLES = [[460.9695, 0.2063], [-194.8528, 465.52], [100.4091, -292.7298], [-128.2526, -378.1568], [343.3039, -233.9073]];
