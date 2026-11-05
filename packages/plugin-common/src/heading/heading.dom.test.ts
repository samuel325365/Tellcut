// @vitest-environment jsdom
// common.heading drawn on a stage: an empty title draws nothing, the kicker and backing show when asked, and a project's caption
// template never reaches a title. jsdom lays nothing out: these check the elements, the golden pictures how they look.
import { createRegistry, Stage } from '@tellcut/engine';
import { caption } from '../caption.ts';
import { heading } from './index.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

function drawn(params: Record<string, unknown>, t: number, meta: Record<string, unknown> = {}) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption, heading] } as any]), media);
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [], ...meta }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'h', type: 'common.heading', start: 0, end: 3, params }] }] } as any);
  st.draw(t);
  const shown = [...root.querySelectorAll<HTMLElement>('div')].filter((d) => d.style.display && d.style.display !== 'none');
  const box = [...root.querySelectorAll<HTMLElement>('div')].find((d) => d.style.fontSize && d.style.whiteSpace === 'pre' && d.style.position === 'absolute' && d.style.transform.includes('translate('))!;
  return { root, shown, box, text: root.textContent ?? '' };
}

test('an empty title draws nothing: no kicker, sub or backing either', () => {
  const d = drawn({ text: '  ', kicker: '第一章', sub: '副標', backing: 'scrim' }, 1);
  expect(d.shown.filter((e) => e.textContent?.includes('第一章') || e.style.inset === '0px' || e.style.inset === '0')).toEqual([]);
});

test('the kicker and the sub show with the title; a backing shows only the one asked for', () => {
  const d = drawn({ text: '七百年', kicker: '第一章', sub: '一座廣場', backing: 'scrim' }, 1.5);
  expect(d.text).toContain('第一章');
  expect(d.text).toContain('一座廣場');
  const full = d.shown.filter((e) => e.style.background && !e.textContent && (e.style.inset === '0px' || e.style.inset === '0'));
  expect(full.length).toBe(1);
  expect(drawn({ text: '七百年', backing: 'none' }, 1.5).shown.filter((e) => !e.textContent && e.style.background && e.style.background !== 'transparent').length).toBe(0);
});

test('a project\'s caption template never reaches a title', () => {
  const plain = drawn({ text: '七百年', style: 'heavy' }, 1.5).box, withTpl = drawn({ text: '七百年', style: 'heavy' }, 1.5, { captionTemplate: 'neon-fill' }).box;
  expect(withTpl.style.cssText).toBe(plain.style.cssText);
});

test('a short title stays on one line, a little smaller; a long one keeps its size; the kicker never drops below the floor', () => {
  const sizeOf = (params: Record<string, unknown>) => parseFloat(drawn({ size: 9, ...params }, 1).box.style.fontSize);
  const base = sizeOf({ text: '羅馬' });
  // five characters at size 9 in 9:16 do not fit the safe width: shrunk to one line
  expect(sizeOf({ text: '聖彼得廣場' })).toBeLessThan(base);
  expect(sizeOf({ text: '聖彼得廣場' })).toBeGreaterThan(base * 0.62);
  // a line break of its own: the size it asked for; too long a line for 62 %: two lines at about its size (the caption balances them)
  expect(sizeOf({ text: '聖彼得\n廣場' })).toBeCloseTo(base);
  expect(sizeOf({ text: '一座廣場的七百年' })).toBeGreaterThan(base * 0.9);
  const kicker = [...drawn({ text: '許願池', kicker: '第二天', size: 5 }, 1).root.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent === '第二天')!;
  expect(parseFloat(kicker.style.fontSize)).toBeGreaterThanOrEqual(48);
});

test('track and spread: the spacing at a time is the same whatever was drawn before, and gone once the animation is over', () => {
  // gold has no letter spacing of its own: the caption's reset was skipped (cached) and each frame wrapped the last one's in calc()
  const params = { text: '七百年', style: 'gold', animIn: 'track', animOut: 'spread', animDur: 0.6 };
  const stageAt = () => {
    const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption, heading] } as any]), media);
    st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
      tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'h', type: 'common.heading', start: 0, end: 3, params }] }] } as any);
    const box = () => [...root.querySelectorAll<HTMLElement>('div')].find((d) => d.style.fontSize && d.style.whiteSpace === 'pre' && d.style.position === 'absolute' && d.style.transform.includes('translate('))!;
    return (t: number) => { st.draw(t); return box().style.letterSpacing; };
  };
  const walked = stageAt();
  for (const t of [0.1, 0.2, 0.3, 2.5, 2.6]) walked(t);
  expect(walked(2.7)).toBe(stageAt()(2.7));
  expect(walked(2.7)).not.toBe('');
  expect(walked(1.5)).toBe(stageAt()(1.5));
});

test('a title of three lines or more keeps its size: the caption\'s two-line limit is only for captions', () => {
  const sizeOf = (text: string, style = 'heavy') => parseFloat(drawn({ size: 9, text, style }, 1).box.style.fontSize);
  expect(sizeOf('羅馬\n廣場\n夜晚')).toBeCloseTo(sizeOf('羅馬\n廣場'));
  expect(sizeOf('MARRAKECH\nMEDINA\nNIGHTS', 'cycle')).toBeCloseTo(sizeOf('MARRAKECH\nMEDINA', 'cycle'));
});

test('the sub takes the look\'s text shadow scaled to its size (the caption\'s gloss does it)', () => {
  const px = (s: string) => (s.match(/-?\d*\.?\d+(?=px)/g) ?? []).map(Number);
  const d = drawn({ text: '七百年', style: 'giant', sub: '一座廣場', subSize: 0.36 }, 1.5);
  const sub = [...d.root.querySelectorAll<HTMLElement>('div')].find((e) => e.textContent === '一座廣場')!;
  expect(d.box.style.textShadow).not.toBe('');
  const glossSize = parseFloat(sub.style.fontSize);
  expect(px(sub.style.textShadow)).toEqual(px(d.box.style.textShadow).map((v) => +(v * glossSize).toFixed(2)));
});

test('full: a look with a box of its own (sign, ribbon, seal) still sets a short title on one line', () => {
  for (const style of ['sign', 'ribbon', 'seal', 'heavy']) {
    const d = drawn({ text: '羅馬', layout: 'full', style }, 1.5);
    // the runs: the caption box's child holding the visible lines (the word spans' twin is hidden)
    const runs = [...d.box.children].find((c) => c.tagName === 'DIV' && (c as HTMLElement).style.display !== 'none' && c.querySelector('span') && c.textContent?.includes('羅'))!;
    expect(runs.children.length, style).toBe(1);
  }
});
