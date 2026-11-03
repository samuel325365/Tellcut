// @vitest-environment jsdom
// 2026-11-02: what the preset-acceptance films wrote as their own fx, promoted: notecard's strike / stamp / ticked / check / out,
// common.quiz, common.doodle, common.search's bar mode and common.healthbar. jsdom has no layout and no 2D context: the tests read
// what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { motion, resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { addedItem, parseTicked, stampLanding, stampTime, tickSlide, tickState, tickStrike, writeStrike } from './notecard.ts';
import { quiz, quizHeight, quizOptions, rowState, showTimes, typeSpan } from './quiz.ts';
import { blinkOn, doodle, eraseAt, parseStrokes, strokeProgress } from './doodle.ts';
import { breakTime, healthbar, hitAt, hpAt, hpBand, parseHp } from './healthbar.ts';
import { search } from './search.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' ? 10 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext };
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); }; });
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

const media: any = { video() {}, place() {}, stillUrl: (r: { source: string }) => `still:${r.source}`, fileUrl: () => '' };
/** build and draw a block alone on a W×H frame at `local`; the words it reported drawing on a canvas */
function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 4) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div'), said: string[] = [];
  const item: any = { id: 'x', type: type.type, start: 0, end: dur, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: dur, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media, W, H, fps: 30, theme, grades: {}, motion,
    reportText: (_g: unknown, text: string) => said.push(text) };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, theme, ctx, said, root };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;

describe('common.notecard: ticked rows, strike, stamp, write only, stay', () => {
  test('ticked names the rows already done; without it every row before tick is', () => {
    expect(parseTicked('2, 4，x 0')).toEqual([2, 4]);
    expect(tickState(0, 2, 0)).toEqual({ k1: 1, k2: 1, marker: 1 });
    expect(tickState(0, 2, 0, [2, 4])).toEqual({ k1: 0, k2: 0, marker: 0 });
    expect(tickState(3, 2, 0, [2, 4])).toEqual({ k1: 1, k2: 1, marker: 1 });
    expect(tickState(2, 2, 1.2, [2, 4]).marker).toBe(1);
  });
  test('the strike runs after the highlighter (tick) or right after the tick (written); the stamp only once every row is ticked', () => {
    expect(tickStrike(2, 2, 0.9)).toBe(0);
    expect(tickStrike(2, 2, 1.3)).toBe(1);
    expect(tickStrike(0, 2, 0)).toBe(1);
    expect(writeStrike(0.5, 0.45)).toBe(0);
    expect(writeStrike(1.2, 0.45)).toBe(1);
    const o = { ticking: true, now: 5, ticked: [] as number[], check: true, strike: true, every: 0.25 };
    expect(stampTime(6, o)).toBeCloseTo(1.32);
    expect(stampTime(6, { ...o, now: 2 })).toBeNull();
    expect(stampTime(6, { ...o, now: 2, ticked: [1, 2, 4, 5, 6] })).toBeCloseTo(1.32);
    expect(stampTime(6, { ...o, now: 6 })).toBe(0.5);
    expect(stampTime(4, { ...o, ticking: false })).toBeCloseTo(0.45 + 3 * 0.25 + 0.75);
    expect(stampTime(4, { ...o, ticking: false, check: false })).toBeNull();
    expect(stampLanding(0).scale).toBeCloseTo(1.8);
    expect(stampLanding(1)).toEqual({ scale: 1, alpha: 1 });
  });
  test('out off: the ticked card slides in and stays', () => {
    expect(tickSlide(3, 3, 500, false)).toBeCloseTo(0);
    expect(tickSlide(3, 3, 500)).toBeCloseTo(-500);
  });
  test('addInk: items starting with + are written "+ item" in that ink; without it as they are', () => {
    expect(addedItem('+運動', '#2f6f8f')).toEqual({ text: '+ 運動', ink: '#2f6f8f' });
    expect(addedItem('＋ 買菜', '#2f6f8f')).toEqual({ text: '+ 買菜', ink: '#2f6f8f' });
    expect(addedItem('剪片', '#2f6f8f')).toEqual({ text: '剪片', ink: '' });
    expect(addedItem('+運動', '')).toEqual({ text: '+運動', ink: '' });
  });
});

describe('common.quiz', () => {
  test('options, typing span, pop-in times and the full height', () => {
    expect(quizOptions('a| b ||c')).toEqual(['a', 'b', 'c']);
    expect(typeSpan('0.5,2')).toEqual([0.5, 2]);
    expect(typeSpan('')).toEqual([0.2, 1.4]);
    expect(showTimes('1,2', 3, '0,1')).toEqual([1, 2, 1 + 0.25 + 2 * 0.45]);
    expect(quizHeight(3)).toBeGreaterThan(quizHeight(2));
  });
  test('a wrong row is crossed at the reveal and folded away; the answer turns green and stays', () => {
    const sp = motion.spring({ duration: 0.4, bounce: 0.45 }), io = motion.ease.inOut;
    const wrong = rowState(5, 1, false, 3, sp, io), right = rowState(5, 1, true, 3, sp, io);
    expect([wrong.cross, wrong.keep]).toEqual([1, 0]);
    expect([right.good, right.keep]).toEqual([1, 1]);
    expect(rowState(0.5, 1, false, 3, sp, io).pop).toBe(0);
  });
  test('the badge sits on the answer row (a picture from a source takes its place); the card stays in the safe area', () => {
    const { s, theme } = run(quiz, { badge: '🌈', reveal: 1 }, 3.5);
    expect(s.rows).toHaveLength(3);
    expect(s.rows[1].mark.textContent).toBe('🌈');
    expect(s.rows[0].mark).toBeNull();
    expect(Number(css(s.rows[1].mark).opacity)).toBeGreaterThan(0.9);
    expect(Number(css(s.rows[0].r).opacity)).toBe(0);
    const top = parseFloat(css(s.card).top), h = quizHeight(3);
    expect(top + h).toBeCloseTo((1 - theme.safe.bottom) * 1920);
    const pic = run(quiz, { badge: 'x', badgeSource: 'flag', answer: 2 }, 0.1).s;
    expect(pic.rows[2].img.src).toContain('still:flag');
    expect(quiz.media!({ params: { badgeSource: 'flag' } } as any, {} as any).stills).toEqual([{ source: 'flag', t: 0, w: 480 }]);
  });
});

describe('common.doodle', () => {
  test('strokes parsed (junk is none), drawn with a soft start and end, blinking once drawn, the eraser sweep', () => {
    expect(parseStrokes('nope')).toEqual([]);
    expect(parseStrokes('{"a":1}')).toEqual([]);
    expect(parseStrokes('[{"a":0,"p":[0,0,1,1]}, 3]')).toHaveLength(1);
    expect([strokeProgress(0, 0, 1), strokeProgress(1, 0, 1)]).toEqual([0, 1]);
    expect(strokeProgress(0.5, 0, 1)).toBeCloseTo(0.5);
    expect(blinkOn(0.5, 1, [1, 0, 0.5])).toBe(true);
    expect(blinkOn(2.25, 1, [1, 0, 0.5])).toBe(true);
    expect(blinkOn(2.75, 1, [1, 0, 0.5])).toBe(false);
    expect([eraseAt(1, -1, 0.5), eraseAt(0.9, 1, 0.5), eraseAt(1.25, 1, 0.5), eraseAt(3, 1, 0.5)]).toEqual([-1, -1, 0.5, 1]);
  });
  test('the default draws without errors on 9:16 and 16:9', () => {
    expect(() => run(doodle, {}, 1)).not.toThrow();
    expect(() => run(doodle, { erase: 0.5 }, 0.7, 1920, 1080)).not.toThrow();
  });
});

describe('common.search bar', () => {
  test('no phone, a pill under the top safe line; the check fills at press', () => {
    const before = run(search, { mode: 'bar', query: '為什麼？', typeAt: -1, press: 2 }, 1), after = run(search, { mode: 'bar', query: '為什麼？', typeAt: -1, press: 2 }, 2.6);
    expect(css(before.s.ph.screen).display).toBe('none');
    expect(css(before.s.pill.el).display).toBe('flex');
    expect(before.s.pill.type.text.textContent).toBe('為什麼？');
    expect(parseFloat(css(before.s.pill.el).top)).toBeGreaterThan(before.theme.safe.top * 1920);
    expect(before.s.pill.dot.getAttribute('r')).toBe('0');
    expect(Number(after.s.pill.dot.getAttribute('r'))).toBeGreaterThan(40);
    expect(after.s.pill.tick.getAttribute('stroke-dashoffset')).toBe('0');
  });
  test('another mode hides the pill and shows the phone again', () => {
    const r = run(search, { mode: 'bar' }, 1);
    search.draw({ ...r.ctx, params: { ...r.ctx.params, mode: 'results' } }, r.s);
    expect(css(r.s.pill.el).display).toBe('none');
    expect(css(r.s.ph.screen).display).toBe('block');
  });
});

describe('common.healthbar', () => {
  test('ready loads the block font and the LIVE words too, and does nothing without document.fonts (2026-11-03)', async () => {
    const was = Object.getOwnPropertyDescriptor(document, 'fonts'), loads: string[][] = [];
    const s: any = healthbar.build({ params: withDefaults(healthbar.params, { font: 'Inter', live: '直播' }, resolveTheme(undefined, { width: 1080, height: 1920 })), root: document.createElement('div') } as any);
    try {
      Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
      await healthbar.ready!(s);
      Object.defineProperty(document, 'fonts', { configurable: true, value: { load: async (f: string, text: string) => { loads.push([f, text]); return []; }, [Symbol.iterator]: function* () {} } });
      await healthbar.ready!(s);
    } finally { was ? Object.defineProperty(document, 'fonts', was) : delete (document as any).fonts; }
    expect(loads.some(([f]) => f === '700 52px "Inter"')).toBe(true);
    expect(loads.some(([f]) => f === '900 52px "Noto Sans TC"')).toBe(true);
    expect(loads.every(([, text]) => text.includes('直播'))).toBe(true);
  });
  test('stops parsed and sorted, the HP easing to each, the break, hits and heals', () => {
    const st = parseHp('2:60, 0:100, x, 4:x, 3:150');
    expect(st).toEqual([{ t: 0, v: 100 }, { t: 2, v: 60 }, { t: 3, v: 100 }, { t: 4, v: 'x' }]);
    expect(hpAt(st, 1)).toBe(100);
    expect(hpAt(st, 2.5)).toBeCloseTo(60);
    expect(hpAt(st, 2.5, 0.35)).toBeGreaterThan(60);
    expect(breakTime(st)).toBe(4);
    expect(hitAt(st, 2.1).shake).toBeGreaterThan(0);
    expect(hitAt(st, 3.1).flash).toBeGreaterThan(0);
    expect([hpBand(80).i, hpBand(50).i, hpBand(10).i]).toEqual([0, 1, 2]);
  });
  test('every word it draws is reported for check; a header with nothing in it is left out', () => {
    const full = run(healthbar, {}, 0.5).said;
    expect(full).toEqual(expect.arrayContaining(['LIVE', '回放', '挑戰：一小時不看手機', '體力', '穩住']));
    const broken = run(healthbar, {}, 3.6).said;
    expect(broken).toContain('破防');
    expect(run(healthbar, { title: '', live: '', replay: '' }, 0.5).said).toEqual(['體力', '穩住']);
  });
});
