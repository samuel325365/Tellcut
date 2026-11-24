// @vitest-environment jsdom
// Blocks q–z sized to their room: lines that would run off the frame or the card shrink (or fit), short ones are drawn as before.
// jsdom has no layout and no 2D context: the tests read what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { resolveTheme, textEm, withDefaults, type ItemType } from '@tellcut/engine';
import { blockFit, quote, quoteChars, quoteMeasure, typeCursor, typeTimes, TYPE_START } from './quote.ts';
import { burst, readableOn, shapeEntrance } from './burst.ts';
import { cloudPath, splatShape } from './shapes.ts';
import { rating } from './rating.ts';
import { stations, stationsLayout } from './stations.ts';
import { marqueeCopies, reels } from './reels.ts';
import { strike, strikeMarks } from './strike.ts';
import { stamp } from './stamp.ts';
import { tableLayout, versus } from './versus.ts';
import tokenItems from './token.ts';
import { commonItems } from './index.ts';
import { route } from './route.ts';
import { tag } from './tag.ts';
import { ledBoard, neonLit, slam, SLAM_CYAN, splitShift } from './slam.ts';

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
const motion: any = { spring: () => (t: number) => Math.min(1, Math.max(0, t / 0.4)), interpolate: () => () => 1, ease: { in: (x: number) => x } };
/** build and draw a block alone on a W×H frame at item time `local`; its state (the elements) and the theme */
function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 4) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div');
  const item: any = { id: 'x', type: type.type, start: 0, end: dur, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: dur, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media, W, H, fps: 30, theme, grades: {}, motion, reportText() {} };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, theme, ctx };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;
const px = (v: string | undefined) => parseFloat(String(v));

describe('common.quote', () => {
  test('an English line is fitted with the spaces it is drawn with', () => {
    const text = 'every single morning I would rather stay in bed', W = 1080;
    const { s, theme } = run(quote, { text, sizes: '' }, 3, W);
    const row = s.rows[0] as HTMLElement, drawn = row.textContent!;
    expect(drawn.replace(/ /g, ' ')).toBe(text);   // the space between Latin words is a no-break one
    expect(px(css(row).fontSize) * textEm(drawn)).toBeLessThanOrEqual(W - 2 * theme.safe.side * W + 0.01);
  });
  test('a Chinese line is drawn and sized as before (no spaces between its words)', () => {
    const { s } = run(quote, {}, 3);
    expect((s.rows as HTMLElement[]).map((r) => r.textContent)).toEqual(['但如果今天', '你討厭早起，', '你又沒有理由，', '那就別起。', '去睡吧']);
  });
});

describe('common.rating', () => {
  const em = (v: string, base: number) => (v.endsWith('em') ? parseFloat(v) * base : parseFloat(v));
  test('ten stars fit the card: the stars shrink to the room left beside the label and the number', () => {
    const { s, theme, ctx } = run(rating, { max: 10 }, 3);
    const W = 1080, base = (ctx.params.size / 100) * 1080, k = 1, w = W - 2 * theme.safe.side * W;
    const inner = w - 68 * k - 2 * theme.stroke * 0.6 * k, r = s.rows[0];
    const used = em(css(r.label).width, base) + r.marks.reduce((a: number, m: HTMLElement) => a + em(css(m).width, base), 0) + 0.3 * base * (r.marks.length + 1) + 1.8 * base;
    expect(used).toBeLessThanOrEqual(inner + 0.01);
  });
  test('five stars and short labels are drawn as before', () => {
    const { s } = run(rating, {}, 3);
    for (const r of s.rows) {
      expect(r.marks.map((m: HTMLElement) => css(m).width)).toEqual(Array(5).fill('1em'));
      expect([css(r.label).width, css(r.label).fontSize ?? '']).toEqual(['4.2em', '']);
    }
  });
  test('a long label shrinks into its column', () => {
    const { s, ctx } = run(rating, { rows: 'Value for money:4' }, 3), base = (ctx.params.size / 100) * 1080, l = s.rows[0].label;
    expect(px(css(l).fontSize) * textEm('Value for money')).toBeLessThanOrEqual(4.2 * base + 0.01);
    expect(px(css(l).width)).toBeCloseTo(4.2 * base, 6);
  });
});

describe('common.stations', () => {
  test('eight stations in 16:9 start inside the safe area: the rows and their type shrink together', () => {
    const theme = resolveTheme(undefined, { width: 1920, height: 1080 }), L = stationsLayout(8, 1920, 1080, theme.safe);
    expect(L.top).toBeGreaterThanOrEqual(theme.safe.top * 1080 - 1e-6);
    expect(L.u).toBeLessThan(1);
    const { s } = run(stations, { stops: Array.from({ length: 8 }, (_, i) => `站${i}|S${i}`).join(', ') }, 1, 1920, 1080);
    expect(px(css(s.rows[0].row).top)).toBeGreaterThanOrEqual(theme.safe.top * 1080 - 1e-6);
  });
  test('three stations in 9:16 keep their layout', () => {
    const theme = resolveTheme(undefined, { width: 1080, height: 1920 }), L = stationsLayout(3, 1080, 1920, theme.safe);
    const bottom = (1 - theme.safe.bottom) * 1920;
    expect(L).toEqual({ u: 1, top: bottom - (3 * 150 + 90), left: theme.safe.side * 1080 + 20, bottom });
  });
});

describe('common.reels marquee', () => {
  test('enough copies of a short line to fill the 560-unit window while it slides', () => {
    expect(marqueeCopies(140, 560)).toBe(5);
    expect(marqueeCopies(402, 560)).toBe(3);
    expect(marqueeCopies(900, 560)).toBe(2);
    for (const mw of [90, 140, 333, 560, 1000]) expect((marqueeCopies(mw, 560) - 1) * mw).toBeGreaterThanOrEqual(560);   // the last copy starts past the window even at the largest offset
  });
  test('the feed draws that many copies', () => {
    const { s } = run(reels, { music: '♪ ok' }, 1);
    const shown = [...s.marquee.children] as HTMLElement[];
    expect(shown.length).toBe(marqueeCopies(textEm('♪ ok') * 28 + 90, 560));
    expect(shown.every((el) => el.textContent === '♪ ok')).toBe(true);
  });
});

describe('long lines fit the safe width (strike, stamp, versus)', () => {
  const W = 1080, safeW = (theme: any) => W - 2 * theme.safe.side * W;
  test('strike: the soft line, the small label and the stamp shrink; the sample keeps its sizes', () => {
    const before = 'this was meant to be a slow and gentle film', after = 'now it is a spreadsheet';
    const { s, theme } = run(strike, { before, after, label: 'the original film said, word for word, in the opening:' }, 2);
    expect(px(css(s.before).fontSize) * textEm(before)).toBeLessThanOrEqual(safeW(theme) + 0.01);
    expect(px(css(s.label).fontSize) * textEm('the original film said, word for word, in the opening:')).toBeLessThanOrEqual(safeW(theme) + 0.01);
    expect(px(css(s.after).fontSize) * textEm(after) + 70).toBeLessThanOrEqual(safeW(theme) + 0.01);
    const d = run(strike, {}, 2).s;
    expect([css(d.label).fontSize, css(d.before).fontSize, css(d.after).fontSize]).toEqual(['40px', '76px', '96px']);
  });
  test('stamp box, circle and double: the word and its padding fit; card: its longest line fits the card', () => {
    const text = 'Approved by family';
    for (const shape of ['box', 'circle', 'double']) {
      const { s, theme } = run(stamp, { text, shape }, 1), pad = shape === 'circle' ? 1.1 : shape === 'double' ? 0.84 : 1;
      expect(px(css(s.box).fontSize) * (textEm(text) + pad)).toBeLessThanOrEqual(safeW(theme) + 0.01);
    }
    const line = 'Go to bed a little earlier', c = run(stamp, { shape: 'card', text: `short\n${line}` }, 1).s;
    expect(px(css(c.box).fontSize) * (textEm(line) + 1.08) + 10).toBeLessThanOrEqual(0.86 * W + 0.01);
    expect(css(run(stamp, { text: '已驗證' }, 1).s.box).fontSize).toBe(`${(7 / 100) * 1920}px`);
    expect(css(run(stamp, { shape: 'card', text: '你只是沒睡飽，\n要先【早點上床】', size: 2.7 }, 1).s.box).fontSize).toBe(`${(2.7 / 100) * 1920}px`);
  });
  test('versus title: a long word fits across the frame; the sample keeps 210 units', () => {
    const { s, theme } = run(versus, { mode: 'title', words: 'Absolutely|Never' }, 1);
    const f = px(css(s.el.he).fontSize);
    expect(f * textEm('Absolutely') + 10 * 10).toBeLessThanOrEqual(safeW(theme) + 0.01);
    expect(css(run(versus, { mode: 'title' }, 1).s.el.he).fontSize).toBe('210px');
  });
});

describe('common.versus table', () => {
  test('many rows on a wide frame shrink until a row fits its pitch (no 70 % floor)', () => {
    const rows = Array.from({ length: 8 }, (_, i) => `Q${i}|a says\nmore|b says\nmore|A|B`).join('\n');
    const theme = resolveTheme(undefined, { width: 1920, height: 1080 }), T = tableLayout(8, 1080, 1, theme.safe);
    const { s } = run(versus, { mode: 'table', rows }, 2, 1920, 1080);
    const cell = s.rows[0].children[1].children[0] as HTMLElement;
    expect(px(css(cell).fontSize)).toBeLessThanOrEqual((42 * T.pitch) / 230 + 1e-6);
  });
  test('the 9:16 sample keeps full-size rows', () => {
    const { s } = run(versus, { mode: 'table' }, 2);
    expect(css(s.rows[0].children[1].children[0] as HTMLElement).fontSize).toBe('42px');
  });
});

describe('common.token', () => {
  const [token] = tokenItems;
  test('still exported as an array of one block, registered under its id', () => {
    expect(tokenItems.map((t) => t.type)).toEqual(['common.token']);
    expect(commonItems.filter((t) => t.type === 'common.token')).toEqual([token]);
  });
  test('the label and the number fall back to Noto Sans TC for letters the marker font has not', () => {
    const fonts: string[] = [], was = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function () {
      return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 50 }) : t[k]), set: (_t, k, v) => { if (k === 'font') fonts.push(v); return true; } });
    };
    try { run(token, { steps: '0|第一次|一|none' }, 1); } finally { (HTMLCanvasElement.prototype as any).getContext = was; }
    expect(fonts.length).toBe(2);
    for (const f of fonts) expect(f).toMatch(/^400 \d+px "Permanent Marker", 'Noto Sans TC', sans-serif$/);
  });
  test('ready loads the marker font, and Noto Sans TC for Chinese steps', async () => {
    const calls: Array<[string, string]> = [], was = (document as any).fonts;
    (document as any).fonts = { load: async (f: string, t: string) => { calls.push([f, t]); return []; } };
    try { const { s } = run(token, { steps: '0|第一次|1|none\n1|第二次|2|made' }, 0.5); await token.ready!(s); } finally { (document as any).fonts = was; }
    expect(calls.some(([f]) => f.includes('Permanent Marker'))).toBe(true);
    expect(calls.some(([f, t]) => f.includes('Noto Sans TC') && t.includes('第二次'))).toBe(true);
  });
});

describe('common.route look page', () => {
  test("ready loads the hand font the page asks for (and the default it falls back to)", async () => {
    const calls: string[] = [], was = (document as any).fonts;
    (document as any).fonts = { load: async (f: string) => { calls.push(f); return []; } };
    try { const { s } = run(route, { look: 'page', handFont: 'Huninn' }, 0.5); await route.ready!(s); } finally { (document as any).fonts = was; }
    expect(calls.filter((f) => f.includes('Huninn')).length).toBe(2);
    expect(calls.some((f) => f.includes('LXGW WenKai TC'))).toBe(true);
  });
});

describe('common.tag', () => {
  test('pill and glass: the row stops at the right safe edge and wraps; label keeps one unwrapped row', () => {
    for (const look of ['pill', 'glass']) {
      const { s, theme } = run(tag, { look, tags: 'one,two,three', x: 0.1 }, 1);
      expect(px(css(s.row).maxWidth)).toBeCloseTo((1 - theme.safe.side - 0.1) * 1080, 6);
      expect(css(s.row).flexWrap).toBe('wrap');
      expect(s.pills.map((e: HTMLElement) => css(e).whiteSpace)).toEqual(['pre-wrap', 'pre-wrap', 'pre-wrap']);
    }
    const l = run(tag, { look: 'label', tags: 'a,b' }, 1).s;
    expect([css(l.row).maxWidth, css(l.row).flexWrap, css(l.pills[0]).whiteSpace]).toEqual(['none', 'nowrap', '']);
  });
  test('tape, day and ember measure their words once, not on every frame', () => {
    const proto = HTMLElement.prototype, was = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')!;
    let reads = 0;
    Object.defineProperty(proto, 'offsetWidth', { configurable: true, get() { reads++; return 120; } });
    try {
      for (const [look, tags] of [['tape', 'one,two'], ['day', 'Day 2,rain'], ['ember', 'PORK,grill']]) {
        const { s, ctx } = run(tag, { look, tags }, 0.5);
        const first = reads;
        for (const t of [0.6, 0.7, 0.8]) tag.draw({ ...ctx, t, local: t }, s);
        expect(reads).toBe(first);
      }
    } finally { Object.defineProperty(proto, 'offsetWidth', was); }
  });
});

describe('common.slam look led', () => {
  test('the default red gives exactly the board it was made with', () => {
    expect(ledBoard('#ff3b2a')).toEqual({ bg: '#090404', rim: '#4a1a12', dot: '9,4,4' });
    const { s } = run(slam, { look: 'led', text: 'x' }, 1);
    expect(css(s.box).background).toBe('#090404');
    expect(css(s.box).boxShadow).toContain('#4a1a12');
    expect(css(s.grid).backgroundImage).toBe('radial-gradient(circle, rgba(9,4,4,0) 2.2px, rgba(9,4,4,.55) 2.6px)');
  });
  test('another LED colour tints its board and rim (a blue board for blue letters)', () => {
    const b = ledBoard('#2a6bff');
    expect(b.bg).not.toBe('#090404');
    const [r, , bl] = [1, 3, 5].map((i) => parseInt(b.rim.slice(i, i + 2), 16));
    expect(bl).toBeGreaterThan(r);
    const { s } = run(slam, { look: 'led', text: 'x', ledColor: '#2a6bff' }, 1);
    expect(css(s.box).background).toBe(b.bg);
    expect(css(s.grid).backgroundImage).toContain(`rgba(${b.dot},.55)`);
  });
});

describe('common.slam looks neon, extrude, box and split', () => {
  const text = '今晚\n【營業中】';
  /** what a draw left on the box and on each line (and each word of the lines) */
  const drawnAt = (s: any) => JSON.stringify([css(s.box), ...[...s.text.el.children].flatMap((l: Element) => [css(l), ...[...l.children].map((w) => css(w))])]);
  test('each draws a pure function of time: a fresh draw and one after another moment agree', () => {
    for (const look of ['neon', 'extrude', 'box', 'split']) for (const t of [0.1, 0.2, 0.35, 1.5]) {
      const a = run(slam, { look, text }, t), b = run(slam, { look, text }, 2.5);
      slam.draw({ ...b.ctx, t, local: t }, b.s);
      expect([look, t, drawnAt(b.s)]).toEqual([look, t, drawnAt(a.s)]);
    }
  });
  test('plain is drawn as before: the thick outline, no line or word of its own touched', () => {
    const { s, theme } = run(slam, { text }, 1.5);
    expect([css(s.box).webkitTextStroke, css(s.box).textShadow, css(s.box).fontWeight]).toEqual([`${theme.stroke * 1.4}px #1a1a1a`, 'none', '900']);
    expect([...s.text.el.children].map((l: any) => l._c)).toEqual([undefined, undefined]);
  });
  test('neon: each line a tube glowing in hl, the 【word】 a cyan one; unlit before it starts, flickering, then steady', () => {
    const { s } = run(slam, { look: 'neon', text }, 1.5), [l0, l1] = [...s.text.el.children] as HTMLElement[];
    expect([css(s.box).webkitTextStroke, css(s.box).textShadow]).toEqual(['0', 'none']);
    expect(css(l0).textShadow).toContain('rgba(255, 77, 79,');
    expect(css(l1.querySelector('span')!).textShadow).toContain('rgba(37, 216, 255,');
    expect(neonLit(-0.1, 30)).toBeLessThan(0.1);
    const early = Array.from({ length: 13 }, (_, f) => neonLit(f / 30, 30));
    expect(early.some((b) => b < 0.5) && early.some((b) => b > 0.9)).toBe(true);
    for (const t of [0.5, 1, 2.2]) expect(neonLit(t, 30)).toBeGreaterThan(0.89);
    // another look on the same state gets plain lines again
    const { s: n, ctx } = run(slam, { look: 'neon', text }, 1.5);
    slam.draw({ ...ctx, params: { ...ctx.params, look: 'plain' } }, n);
    expect([...n.text.el.children].map((l: any) => l._c)).toEqual([undefined, undefined]);
  });
  test('extrude: twelve hard steps down-right in the outline colour, or in shadow when it has one', () => {
    const side = css(run(slam, { look: 'extrude', text }, 1.5).s.box).textShadow.split(', ');
    expect(side.length).toBe(12);
    expect(side.every((l) => l.endsWith(' 0 #1a1a1a'))).toBe(true);
    expect(side[11]).toBe('0.1000em 0.1000em 0 #1a1a1a');
    expect(css(run(slam, { look: 'extrude', text, shadow: '#e63a2e' }, 1.5).s.box).textShadow).toContain('#e63a2e');
  });
  test('box: every line on an outline-coloured block, tipped and slid in from alternate sides', () => {
    const lines = (t: number) => [...run(slam, { look: 'box', text: 'a\nb\nc' }, t).s.text.el.children].map((l) => css(l));
    const set = lines(1.5);
    expect(set.map((c) => c.background)).toEqual(['#1a1a1a', '#1a1a1a', '#1a1a1a']);
    expect(set.map((c) => c.transform)).toEqual(['translateX(0.0px) rotate(-1.60deg)', 'translateX(0.0px) rotate(1.60deg)', 'translateX(0.0px) rotate(-1.60deg)']);
    const start = lines(0.05).map((c) => parseFloat(c.transform.slice('translateX('.length)));
    expect(start[0]).toBeLessThan(-200);
    expect(start[1]).toBeGreaterThan(200);
    expect(lines(0.05).map((c) => c.opacity).slice(1)).toEqual(['0', '0']);   // the later lines are not in yet
  });
  test('split: the plates jump from frame to frame while landing, then keep one small offset', () => {
    expect(splitShift(1, 30, 0.6)).toEqual(splitShift(2, 30, 0.6));
    expect(splitShift(0.1, 30, 0.6)).not.toEqual(splitShift(0.1 + 1 / 30, 30, 0.6));
    expect(splitShift(0.1, 30, 0.6)).toEqual(splitShift(0.1, 30, 0.6));
    const [a, b] = splitShift(0.2, 30, 0.6);
    expect(Math.sign(a[0])).toBe(-Math.sign(b[0]));   // thrown to opposite sides, so both show
    const sh = css(run(slam, { look: 'split', text }, 1.5).s.box);
    expect([sh.webkitTextStroke, sh.textShadow.includes(`rgba(37, 216, 255, 0.9)`)]).toEqual(['0', true]);
    expect(SLAM_CYAN).toBe('#25d8ff');
  });
});

describe('common.strike looks', () => {
  const g = [540, 500, 300, 76, 1] as const;
  test('nothing before at; scribble, cross and bar each a pure function of time that ends covering the line', () => {
    for (const look of ['scribble', 'cross', 'bar'] as const) {
      expect(strikeMarks(look, 0.99, 1, ...g)).toEqual([]);
      expect(strikeMarks(look, 1.12, 1, ...g)).toEqual(strikeMarks(look, 1.12, 1, ...g));
    }
    const sc = strikeMarks('scribble', 2, 1, ...g) as Array<{ pts: Array<[number, number]> }>, xs = sc[0].pts.map((p) => p[0]), ys = sc[0].pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(540 - 280);
    expect(Math.max(...xs)).toBeGreaterThan(540 + 280);
    expect(sc[0].pts.length).toBeGreaterThan(40);   // tight: a turn every ~0.13 em, there and back
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.6 * 76);
    expect(strikeMarks('scribble', 1.1, 1, ...g)[0]).not.toEqual(sc[0]);   // still being drawn at 0.1 s
    expect(strikeMarks('cross', 1.1, 1, ...g).length).toBe(1);
    expect(strikeMarks('cross', 2, 1, ...g).length).toBe(2);
    const bar = (t: number) => (strikeMarks('bar', t, 1, ...g)[0] as { rect: number[] }).rect;
    expect(bar(1.1)[2]).toBeLessThan(bar(2)[2]);
    expect(bar(2)).toEqual([540 - 300 + 18, 500 - 0.6 * 76, 600 - 36, 1.16 * 76]);
  });
  test('marker draws under the words as before; the other looks over them, the stamp still on top', () => {
    const m = run(strike, {}, 2).s, b = run(strike, { look: 'bar' }, 2).s;
    expect([css(m.cv).zIndex, css(m.stamp).zIndex]).toEqual(['', '']);
    expect([css(b.cv).zIndex, css(b.stamp).zIndex]).toEqual(['1', '2']);
    expect(strike.variants!.list.map((v) => v.value)).toEqual(['marker', 'scribble', 'cross', 'bar']);
  });
});

describe('common.burst looks cloud, star and splat', () => {
  /** what a draw left on the box, the word and the shape's three paths */
  const drawnAt = (s: any) => JSON.stringify([css(s.box), css(s.text.el.parentElement), ...[s.shape, s.shapeUnder, s.shapeDots].map((e: SVGElement) => [e.getAttribute('d'), e.getAttribute('transform'), e.style.display])]);
  const comic = { shadow: '#ff3f9a', dots: '#ffb300' };
  test('each draws a pure function of time: a fresh draw and one after another moment agree', () => {
    for (const mode of ['cloud', 'star', 'splat']) for (const t of [0.05, 0.12, 0.3, 0.8, 1.5]) {
      const a = run(burst, { mode, ...comic }, t), b = run(burst, { mode, ...comic }, 2.5);
      burst.draw({ ...b.ctx, t, local: t }, b.s);
      expect([mode, t, drawnAt(b.s)]).toEqual([mode, t, drawnAt(a.s)]);
    }
  });
  test('the sticker is drawn as before (its polygons, none of the paths), also after another mode on the same state', () => {
    const fresh = run(burst, {}, 1.5).s, { s, ctx } = run(burst, { mode: 'splat', ...comic }, 1.5);
    burst.draw({ ...ctx, params: { ...ctx.params, mode: 'sticker', shadow: '', dots: '' } }, s);
    for (const x of [fresh, s]) {
      expect([x.poly.style.display, x.shape.style.display, x.shapeUnder.style.display, x.shapeDots.style.display]).toEqual(['', 'none', 'none', 'none']);
      expect(css(x.box).transform).toBe('rotate(-6deg) scale(1)');
    }
    expect(s.poly.getAttribute('points')).toBe(fresh.poly.getAttribute('points'));
    expect(burst.variants!.list.map((v) => v.value)).toEqual(['sticker', 'blast', 'rays', 'cloud', 'star', 'splat']);
  });
  test('cloud: one bump an arc, inside its circle; the word fits the inner ellipse; it pops in softly and its wobble dies away', () => {
    const c = cloudPath(9, 300, 4), arcs = c.d.match(/A/g)!.length, ends = [...c.d.matchAll(/ (-?[\d.]+),(-?[\d.]+)(?= |$)/g)].map((m) => Math.hypot(+m[1], +m[2]));
    expect(arcs).toBe(9);
    expect(Math.max(...ends)).toBeLessThan(300);
    expect(c.rx).toBeGreaterThan(c.ry);
    expect(cloudPath(9, 300, 4)).toEqual(c);
    expect(cloudPath(9, 300, 5).d).not.toBe(c.d);
    const { s, ctx } = run(burst, { mode: 'cloud' }, 1.5), fs = px(css(s.text.el.parentElement).fontSize), size = 0.62 * 1080;
    expect(fs * textEm('出發！')).toBeLessThan(size * 0.8);
    expect([s.poly.style.display, s.shape.getAttribute('stroke')]).toEqual(['none', ctx.params.ink]);
    expect(shapeEntrance('cloud', 0).scale).toBeCloseTo(0.3, 6);
    expect(Math.abs(shapeEntrance('cloud', 0.15).turn)).toBeGreaterThan(1);
    expect(Math.abs(shapeEntrance('cloud', 1.5).turn)).toBeLessThan(0.05);
  });
  test('star: five rounded tips; a quarter turn back to the tilt while growing from nothing, then settled', () => {
    const { s } = run(burst, { mode: 'star', text: 'No.1' }, 1.5);
    expect(s.shape.getAttribute('d')!.match(/Q/g)!.length).toBe(10);
    const [a, b] = [shapeEntrance('star', 0), shapeEntrance('star', 1.5)];
    expect([a.scale, a.turn + 90, b.scale - 1, b.turn].map((x) => Math.abs(x) < 1e-9)).toEqual([true, true, true, true]);
    expect(css(run(burst, { mode: 'star' }, 0.1).s.box).transform).toMatch(/^rotate\(-[3-9]\d\.\d+deg\)/);
    expect(css(s.box).transform).toBe('rotate(-6.000deg) scale(1.0000)');
  });
  test('splat: no outline, seeded; the drops fly out after the hit; the word switches to black or white when it would vanish', () => {
    const subpaths = (t: number) => run(burst, { mode: 'splat' }, t).s.shape.getAttribute('d')!.match(/M/g)!.length;
    expect(run(burst, { mode: 'splat' }, 1.5).s.shape.getAttribute('stroke')).toBe('none');
    expect(subpaths(1.5)).toBe(subpaths(0.04) + 7);   // the seven drops, none yet at the hit
    const geo = (seed: number) => { const { edge: _edge, ...g } = splatShape(seed); return g; };
    expect(geo(9)).toEqual(geo(9));
    expect(splatShape(9).outline).not.toEqual(splatShape(10).outline);
    expect(readableOn('#1a1a1a', '#ffe14d')).toBe('#1a1a1a');
    expect(readableOn('#ffffff', '#ff3b5c')).toBe('#ffffff');
    expect(readableOn('#ffe14d', '#ffe14d')).toBe('#1a1a1a');
    expect(readableOn('#1a1a1a', '#202020')).toBe('#ffffff');
    expect(css(run(burst, { mode: 'splat', fill: '#222222' }, 1.5).s.text.el.parentElement).color).toBe('#ffffff');
  });
});

describe('common.quote looks type and block', () => {
  const drawnAt = (s: any) => JSON.stringify([css(s.alt), css(s.cursor), css(s.altKick), css(s.altBy), ...s.altRows.map((r: Element) => [css(r), ...[...r.children].map((c) => css(c))])]);
  test('each draws a pure function of time: a fresh draw and one after another moment agree', () => {
    for (const mode of ['type', 'block']) for (const t of [0, 0.3, 0.7, 1.4, 2.6, 3.9]) {
      const a = run(quote, { mode }, t), b = run(quote, { mode }, 3.5);
      quote.draw({ ...b.ctx, t, local: t }, b.s);
      expect([mode, t, drawnAt(b.s)]).toEqual([mode, t, drawnAt(a.s)]);
    }
  });
  test('words and card are drawn as before; after type on the same state words gets its own layer back', () => {
    const { s, ctx } = run(quote, { mode: 'type' }, 2);
    expect([css(s.wrap).display, css(s.alt).display]).toEqual(['none', 'block']);
    quote.draw({ ...ctx, params: { ...ctx.params, mode: 'words' } }, s);
    expect([css(s.wrap).display, css(s.alt).display]).toEqual(['', 'none']);
    const w = run(quote, {}, 3).s;
    expect([css(w.alt).display, w.altRows.length]).toEqual(['none', 0]);
    expect(quote.variants!.list.map((v) => v.value)).toEqual(['words', 'card', 'type', 'block']);
  });
  test('the accent: the 【marked】 characters when there are any, else the hit line; block drops a closing ，。 and blank lines', () => {
    const hl = (l: Array<{ c: string; hl: boolean }>) => l.filter((x) => x.hl).map((x) => x.c).join('');
    expect(quoteChars('但 如果\n去睡吧', -1).map(hl)).toEqual(['', '去睡吧']);
    expect(quoteChars('人生 太短\n【早起】 吧', -1).map(hl)).toEqual(['', '早起']);
    expect(quoteChars('stay 【foolish】.', -1)[0].map((x) => x.c).join('')).toBe('stay foolish.');
    expect(quoteChars('人生 太短，\n\n不要。', -1, true).map((l) => l.map((x) => x.c).join(''))).toEqual(['人生太短', '不要']);
  });
  test('type: characters appear on their times, finishing at 60 % of the item; the cursor is steady while typing, then blinks', () => {
    const { at, step, done } = typeTimes([20, 0, 20], 5);
    expect(at[0][0]).toBe(TYPE_START);
    expect(done).toBeCloseTo(0.6 * 5, 5);
    expect(at[2][0] - at[0][19]).toBeCloseTo(9 * step, 5);   // two line breaks (one a blank line), four characters' time each
    expect(typeTimes([200], 3).step).toBe(0.03);
    expect(typeTimes([2], 10).step).toBe(0.1);
    const text = '老實說，\n我 從來 沒有', { s, ctx } = run(quote, { mode: 'type', text }, 1.0), t = typeTimes([4, 5], ctx.dur);
    const shown = s.altChars.flat().filter((sp: HTMLElement) => css(sp).visibility === 'visible').length;
    expect(shown).toBe(t.at.flat().filter((x) => x <= 1.0).length);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(10);
    expect(s.altChars[1].map((sp: HTMLElement) => css(sp).width)).toEqual(Array(5).fill('1em'));
    expect(typeCursor(t.at, t.step, t.done, 1.0).on).toBe(true);
    const blinks = [0.1, 0.6, 1.2, 1.7].map((u) => typeCursor(t.at, t.step, t.done, t.done + t.step + u).on);
    expect(blinks).toEqual([true, false, true, false]);
    expect(typeCursor(t.at, t.step, t.done, 3.9)).toMatchObject({ line: 1, col: 5 });
    expect(typeCursor(t.at, t.step, t.done, t.at[0][3] + 0.001)).toMatchObject({ line: 0, col: 4 });
    expect(typeCursor(t.at, t.step, t.done, t.at[1][0] - t.step)).toMatchObject({ line: 1, col: 0 });
  });
  test('block: every line is drawn exactly as wide as the block, stacked top to bottom, landing one after another', () => {
    const ink = (text: string) => ({ w: textEm(text) * 100, left: 2, up: 88, down: 12, asc: 116, desc: 29 });
    const spy = vi.spyOn(quoteMeasure, 'ink').mockImplementation((text) => ink(text));
    try {
      const text = '人生 太短，\n不要 浪費 在\n你 討厭 的\n【早起】', { s, theme } = run(quote, { mode: 'block', text }, 3.5);
      const lines = ['人生太短', '不要浪費在', '你討厭的', '早起'], widths = s.altRows.map((r: HTMLElement, i: number) => px(css(r).fontSize) * textEm(lines[i]));
      expect(s.altRows.map((r: HTMLElement) => r.textContent)).toEqual(lines);
      for (const w of widths) expect(w).toBeCloseTo(widths[0], 6);
      expect(widths[0]).toBeLessThanOrEqual(1080 * (1 - 2 * theme.safe.side) + 1e-6);
      const tops = s.altRows.map((r: HTMLElement) => px(css(r).top));
      expect(tops).toEqual([...tops].sort((a, b) => a - b));
      expect(s.altRows[3].querySelector('span')!.style.color).toBeTruthy();   // 【早起】 in the accent
      const early = run(quote, { mode: 'block', text }, 0.15).s.altRows.map((r: HTMLElement) => +css(r).opacity);
      expect(early[0]).toBeGreaterThan(0);
      expect(early.slice(1)).toEqual([0, 0, 0]);
      // too tall for the frame: the whole block narrows instead of a line breaking
      const fit = blockFit([ink('一'), ink('二'), ink('三')], 1000, 600);
      expect(fit.width).toBeLessThan(1000);
      expect(fit.height).toBeCloseTo(600, 6);
    } finally { spy.mockRestore(); }
  });
});
