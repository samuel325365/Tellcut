// @vitest-environment jsdom
// Blocks q–z sized to their room: lines that would run off the frame or the card shrink (or fit), short ones are drawn as before.
// jsdom has no layout and no 2D context: the tests read what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { resolveTheme, textEm, withDefaults, type ItemType } from '@tellcut/engine';
import { quote } from './quote.ts';
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
