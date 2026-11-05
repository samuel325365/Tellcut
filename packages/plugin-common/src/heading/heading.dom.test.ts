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
