// @vitest-environment jsdom
// common.caption drawn on a stage: a quoted line's words line up with their times, the gloss's shadow is scaled to it, a look's
// own clip keeps the wipe, strip's highlighter is drawn from this frame alone. jsdom lays nothing out: these check the elements.
import { createRegistry, Stage } from '@tellcut/engine';
import { caption } from '../caption.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

const ZH = { text: '今天帶你去吃【台南】', words: [[0.2, 2], [0.6, 4], [1.0, 6], [1.4, 8]] };
/** a stage with one caption; draw(t) returns its box, its runs' spans and its word spans */
function stage(params: Record<string, unknown>) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [caption] } as any]), media);
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.caption', start: 0, end: 3, params }] }] } as any);
  return (t: number) => {
    st.draw(t);
    const box = root.querySelector<HTMLElement>('div[style*="font-size"]')!;
    const lines = [...root.querySelectorAll('div')].filter((d) => d.parentElement?.style.display !== 'none' && d.style.position === 'relative');
    const words = lines.flatMap((l) => [...l.children].filter((c) => c.tagName === 'SPAN') as HTMLElement[]);
    const gloss = [...root.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent === String(params.gloss ?? '\u0000'));
    return { root, box, words, gloss };
  };
}
const drawn = (params: Record<string, unknown>, t: number) => stage(params)(t);
const hot = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('span')].filter((s) => s.style.color).map((s) => s.textContent).join('');

test('quote: the opening quote mark does not push the word being said one character on', () => {
  // karaoke on the runs: 今天 is said at 0.3 s, with or without the quote marks around the line
  expect(hot(drawn({ ...ZH }, 0.3).root)).toBe('今天台南');
  expect(hot(drawn({ ...ZH, quote: true }, 0.3).root)).toBe('“今天台南');   // the opening mark lights with the first word
  // a word effect: the words are 帶你, not 天帶; the quote marks ride with the first and the last word
  const one = drawn({ ...ZH, quote: true, wordFx: 'one' }, 0.7).words.filter((w) => w.style.display !== 'none').map((w) => w.textContent);
  expect(one).toEqual(['帶你']);
  expect(drawn({ ...ZH, quote: true, wordFx: 'color' }, 1.1).words.map((w) => w.textContent)).toEqual(['“今天', '帶你', '去吃', '台南”']);
});

test('the gloss takes the look\'s text shadow scaled to its size, and drops it when the look has none', () => {
  const px = (s: string) => (s.match(/-?\d*\.?\d+(?=px)/g) ?? []).map(Number);
  const d = drawn({ text: '字幕', style: 'heavy', gloss: 'a gloss', glossSize: 0.5 }, 1.5);
  expect(d.box.style.textShadow).not.toBe('');
  expect(px(d.gloss!.style.textShadow)).toEqual(px(d.box.style.textShadow).map((v) => +(v * 0.5).toFixed(2)));
  expect(drawn({ text: '字幕', style: 'outline', gloss: 'a gloss' }, 1.5).gloss!.style.textShadow).toBe('');
});

test('a look with a clip of its own (ticket, scrap) still wipes in: the wipe goes to a mask', () => {
  for (const style of ['ticket', 'scrap']) {
    const at = stage({ text: '字幕', style, animIn: 'wipe', animDur: 0.6 });
    const mid = at(0.1);
    expect(mid.box.style.clipPath, style).toMatch(/^polygon/);
    expect((mid.box.style as any).maskImage, style).toMatch(/linear-gradient/);
    const after = at(1.5);
    expect(after.box.style.clipPath, style).toMatch(/^polygon/);
    expect((after.box.style as any).maskImage || '', style).toBe('');
  }
  // without a clip of its own the wipe stays the box's clip
  const plain = drawn({ text: '字幕', style: 'outline', animIn: 'wipe', animDur: 0.6 }, 0.1);
  expect(plain.box.style.clipPath).toMatch(/^inset/);
  expect((plain.box.style as any).maskImage || '').toBe('');
});

test('strip with a word effect: the highlighter is on the hot words of this frame, whatever was drawn before', () => {
  const bg = (ws: HTMLElement[]) => ws.map((w) => !!w.style.background || [...w.querySelectorAll<HTMLElement>('span')].some((c) => !!c.style.background));
  const params = { ...ZH, style: 'strip', wordFx: 'color' };
  const fresh = (t: number) => bg(drawn(params, t).words);
  // 去吃 is being said at 1.1 s; 台南 is marked: both on the highlighter, on a first draw too
  expect(fresh(1.1)).toEqual([false, false, true, true]);
  const at = stage(params);
  at(1.1);
  expect(bg(at(0.7).words)).toEqual(fresh(0.7));
  expect(bg(at(0.7).words)).toEqual([false, true, false, true]);
});
