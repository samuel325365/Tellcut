// @vitest-environment jsdom
// 2026-11-01: the acceptance films' text too small in 9:16 with no way to change it. Each block gets a size param whose default
// keeps today's numbers; the header's kicker look no longer runs off the right edge. jsdom has no layout and no 2D context: the
// tests read what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { card, cardLayout, cardText } from './card.ts';
import { header, kickerPx } from './header.ts';
import { itemTimes, list, listBox } from './list.ts';
import { LIST_MAX, listLayout, listSlot, notecard } from './notecard.ts';
import { RULE, RULE0 } from './hand.ts';
import { pencilCounter, progress } from './progress.ts';
import { scoreboard, scoreValues } from './scoreboard.ts';
import { kindAt, printer, printerLines } from './printer.ts';
import { markDatePx, markInk, postmark } from './postmark.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' ? 10 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext, toDataURL: HTMLCanvasElement.prototype.toDataURL };
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); };
  HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
});
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
/** build and draw a block alone on a W×H frame at item time `local`; its state (the elements) and the theme */
function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 4) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const item: any = { id: 'x', type: type.type, start: 0, end: dur, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: dur, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media, W, H, fps: 30, theme, grades: {}, motion: {} };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, theme, ctx };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;
const px = (v: string | undefined) => parseFloat(String(v));

describe('common.list: a time per line, x and w', () => {
  test('itemTimes: no `at` is lead + i × stagger; given times win, the ones left out follow the one before', () => {
    expect(itemTimes(3, '', 0.35, 0.45)).toEqual([0.35, 0.35 + 0.45, 0.35 + 2 * 0.45]);
    expect(itemTimes(4, '1, 2.5', 0.35, 0.5)).toEqual([1, 2.5, 3, 3.5]);
    expect(itemTimes(3, ',2', 0, 0.5)).toEqual([0, 2, 2.5]);
  });
  test('a line with its own time stays hidden until then (card and stack)', () => {
    const items = 'a\nb\nc';
    for (const look of ['card', 'stack']) {
      const early = run(list, { items, look, at: '0.5,2,3' }, 1.5).s, late = run(list, { items, look, at: '0.5,2,3' }, 2.5).s;
      expect(css(early.rows[1].row).opacity).toBe('0');
      expect(Number(css(late.rows[1].row).opacity)).toBeGreaterThan(0);
      expect(css(late.rows[2].row).opacity).toBe('0');
    }
  });
  test('x and w place the card; by default it spans the side safe margins as before', () => {
    const { s, theme } = run(list, {}, 1);
    expect(px(css(s.card).left)).toBeCloseTo(theme.safe.side * 1080);
    expect(px(css(s.card).width)).toBeCloseTo(1080 - 2 * theme.safe.side * 1080);
    const moved = run(list, { x: 0.1, w: 0.5 }, 1).s;
    expect([px(css(moved.card).left), px(css(moved.card).width)]).toEqual([108, 540]);
    expect(listBox(0.2, -1, 1000, 0.05)).toEqual({ left: 200, width: 750 });   // to the right safe margin
  });
});

describe('common.card: detail and tip sizes', () => {
  test('defaults are the card-scaled 50 / 38 px (cover subtitle 38) and the window keeps its height', () => {
    const k = 0.76 * 1080 / 768, t = cardText({ no: '1', detail: '1 杯', tip: 'x', detailSize: 0, tipSize: 0 }, k, 1080);
    expect([t.d, t.t, t.dGrow, t.tGrow]).toEqual([50 * k, 38 * k, 0, 0]);
    expect(cardText({ no: '', detail: 'SUB', tip: 'x', detailSize: 0, tipSize: 0 }, k, 1080).d).toBe(38 * k);
    expect(cardLayout(800, 900).extra).toBe(0);
  });
  test('bigger detail and tip: their font sizes in % of the short side, the picture window gives up the room', () => {
    const base = run(card, { w: 0.5 }, 3).s, big = run(card, { w: 0.5, detailSize: 6, tipSize: 4.5 }, 3).s;
    expect(px(css(big.detail).fontSize)).toBeCloseTo(64.8);
    expect(px(css(big.tip).fontSize)).toBeCloseTo(48.6);
    expect(px(css(big.win).height)).toBeLessThan(px(css(base.win).height));
    // the rows stay apart: the tip's top is below the detail's bottom
    const dB = px(css(big.detail).top) + 64.8 / 2, tT = px(css(big.tip).top) - 48.6 / 2;
    expect(tT).toBeGreaterThan(dB);
  });
});

describe('common.notecard: list size and a layout that follows the items', () => {
  const eight = 'a|b|c|d|e|f|g|h'.split('|');
  test('size 1 with up to eight items is the layout it always had', () => {
    const L = listLayout(eight, 1, 540);
    expect([L.pitch, L.cols, L.rows, L.ch, L.noteY, L.px]).toEqual([RULE, 2, 4, 540, RULE0 + RULE * 5 - 16, 44]);
    expect(listLayout(['a', 'b', 'c'], 1, 540).noteY).toBe(RULE0 + RULE * 5 - 16);
    for (let i = 0; i < 8; i++) expect(listSlot(i, 8, L.cols)).toEqual(listSlot(i, 8));
  });
  test('more items than four rows: the card grows; bigger lettering: two rules a row, one column when a half is too narrow', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `項目${i}`);
    const L = listLayout(twelve, 1, 540);
    expect([L.cols, L.rows]).toEqual([2, 6]);
    expect(L.ch).toBeGreaterThanOrEqual(RULE0 + 6 * RULE + RULE);
    const big = listLayout(['手指餅乾很長的', 'b', 'c', 'd', 'e'], 2, 540);
    expect([big.pitch, big.cols, big.px]).toEqual([2 * RULE, 1, 88]);
    expect(big.ch).toBeGreaterThan(540);
    expect(LIST_MAX).toBeGreaterThan(8);
  });
  test('the drawn card grows upwards for a long list and its words get the size', () => {
    const short = run(notecard, { mode: 'list' }, 3).s, long = run(notecard, { mode: 'list', items: Array.from({ length: 14 }, (_, i) => `x${i}`).join('|') }, 3).s;
    expect(px(css(long.wrap).height)).toBeGreaterThan(px(css(short.wrap).height));
    expect(px(css(long.wrap).top) + px(css(long.wrap).height)).toBeCloseTo(px(css(short.wrap).top) + px(css(short.wrap).height));
  });
});

describe('common.progress pencil: the counter size', () => {
  test('0 is the 34-unit counter where it was; a size of its own keeps its bottom above the circles', () => {
    expect(pencilCounter(0, 1.2, 1920, 500)).toEqual({ px: 34 * 1.2, top: 500 - 78 * 1.2 });
    const c = pencilCounter(3, 1, 1920, 500);
    expect(c.px).toBeCloseTo(57.6);
    expect(c.top + c.px * 1.3).toBeCloseTo(500 - 78 + 34 * 1.3);
    const { s } = run(progress, { mode: 'pencil', counterSize: 3 }, 1);
    expect(px(css(s.count).fontSize)).toBeCloseTo(57.6);
  });
});

describe('common.scoreboard: valueSize enlarges only the numbers', () => {
  test('default: the values as before, no growth', () => {
    const v = scoreValues(['3', '1'], 1, 250, 1, 200);
    expect(v).toEqual({ px: [60, 60], grow: 0 });
  });
  test('valueSize 2: the values double, icons and names keep their size, the card grows by the extra', () => {
    const p = { names: '勝|敗', icons: '🏆|💥', values: '3|1' };
    const a = run(scoreboard, p, 2).s, b = run(scoreboard, { ...p, valueSize: 2 }, 2).s;
    expect(px(css(b.cells[0].value).fontSize)).toBeCloseTo(2 * px(css(a.cells[0].value).fontSize));
    expect(css(b.cells[0].name).fontSize).toBe(css(a.cells[0].name).fontSize);
    expect(css(b.cells[0].icon).fontSize).toBe(css(a.cells[0].icon).fontSize);
    expect(px(css(b.card).height) - px(css(a.card).height)).toBeCloseTo(px(css(a.cells[0].value).fontSize));
  });
  test('a value too wide for its cell still fits it', () => {
    const v = scoreValues(['12:40'], 3, 250, 1, 200);
    expect(v.px[0] * 5 * 0.55).toBeLessThanOrEqual(180 + 1e-6);
  });
});

describe('common.printer: the receipt size', () => {
  test('size 1 is the paper as before; a bigger size makes the lettered lines taller, not the rules', () => {
    const text = '0|title|T\n0.2|item|x|1\n0.3|rule\n0.4|total|合計|1';
    const a = printerLines(text), b = printerLines(text, false, 1.5);
    expect(kindAt('item', 1)).toBe(kindAt('item'));
    expect(b.lines.map((l) => l.h)).toEqual([150, 84, 30, 162]);
    expect(b.len - a.len).toBeCloseTo((100 + 56 + 108) * 0.5);
    expect(kindAt('item', 1.5).pitch).toBeCloseTo(1.95 * 1.5);
  });
  test('the transparent copies check reads get the bigger size', () => {
    const lines = '0|item|招牌大湯圓|95';
    const a = run(printer, { lines, stamp: '' }, 2).s, b = run(printer, { lines, stamp: '', size: 1.5 }, 2).s;
    expect(px(css(b.rows[0].el).fontSize)).toBeCloseTo(1.5 * px(css(a.rows[0].el).fontSize));
  });
});

describe('common.postmark: ink strength and date size', () => {
  test('defaults as before', () => {
    expect(markInk(1, 0.82)).toEqual({ alpha: 0.82, line: 1, specks: 1 });
    expect(markDatePx('2022.05.26', 140)).toBe(Math.round(140 * 0.19));
    expect(markDatePx('05.26', 140)).toBe(Math.round(140 * 0.3));
  });
  test('stronger ink is opaque with heavier lines; a bigger date stays inside the inner ring', () => {
    expect(markInk(2, 0.82)).toEqual({ alpha: 1, line: Math.SQRT2, specks: 2 });
    const d = markDatePx('2022.05.26', 140, 3);
    expect(d).toBeGreaterThan(Math.round(140 * 0.19));
    expect(d * 5.5).toBeLessThanOrEqual(140 * 1.2 + 0.5 * 5.5);   // rounded to whole px
    const { s } = run(postmark, { ink: 2, dateSize: 2 }, 1.5);
    expect(css(s.mark.el).opacity).toBe('1');
    expect(px(css(s.mark.date).fontSize)).toBe(markDatePx('2022.05.26', 140.4, 2));
  });
});

describe('common.header kicker: its own size and kept inside the frame', () => {
  test('kickerSize 0 is 0.44 × the title; a size of its own is % of the frame height', () => {
    expect(kickerPx('PODCAST', 0, 60, 1920, 1, 950)).toBeCloseTo(26.4);
    expect(kickerPx('PODCAST', 3, 60, 1920, 1, 950)).toBeCloseTo(57.6);
    const { s } = run(header, { look: 'kicker', kicker: 'PODCAST', kickerSize: 3 }, 1);
    expect(px(css(s.kick).fontSize)).toBeCloseTo(57.6);
  });
  test('BUG: a long title and kicker no longer run off the right edge: the box stays between the side margins and wraps', () => {
    const long = '這是一個非常非常非常非常長的題目【真的很長】到底要怎麼辦才好呢？';
    const { s, theme } = run(header, { look: 'kicker', text: long, kicker: 'THE VERY LONG NAME OF A SHOW THAT GOES ON AND ON AND ON', size: 4, kickerSize: 3 }, 1);
    const left = px(css(s.box).left), room = 1080 - 2 * theme.safe.side * 1080;
    expect(px(css(s.box).maxWidth)).toBeCloseTo(room);
    expect(left + px(css(s.box).maxWidth)).toBeLessThanOrEqual(1080 - theme.safe.side * 1080 + 1e-6);
    expect(css(s.box).whiteSpace).toBe('pre-wrap');
    expect(css(s.kick).whiteSpace).toBe('pre-wrap');
    expect(px(css(s.kick).fontSize)).toBeLessThan(57.6);   // shrunk first
  });
  test('the chip look is as before (one line, no width limit)', () => {
    const { s } = run(header, { no: '02', text: '醬香雞腿' }, 1);
    expect([css(s.box).whiteSpace, css(s.box).maxWidth]).toEqual(['pre', 'none']);
  });
});
