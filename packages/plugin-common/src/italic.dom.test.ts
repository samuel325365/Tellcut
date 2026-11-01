// @vitest-environment jsdom
// The italic name title (common.headline look name) and the *starred* credits lines (common.outro look credits): CJK faces have no
// italic, so a slanted Chinese character is the browser's machine slant. Latin letters stay italic, CJK characters stand upright.
// jsdom has no 2D context: a stand-in that takes any call is enough, the words are DOM text.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { headline } from './headline.ts';
import { outro } from './outro.ts';
import { cjkRuns, isCjk } from './words.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
/** the stage's root after drawing the block at 3 s */
function drawn(t: ItemType<any, any>, params: Record<string, unknown>) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [t] } as any]), media);
  st.load({
    version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: t.type, start: 0, end: 4, params }] }],
  } as any);
  st.draw(3);
  document.body.append(root);
  return root;
}
/** the style each character is drawn in: the inline font-style of the nearest element that sets one */
function styles(el: Element): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      let e: HTMLElement | null = n.parentElement, st = '';
      while (e && !(st = e.style.fontStyle)) e = e.parentElement;
      for (const c of n.textContent ?? '') if (c.trim()) out.push([c, st || 'normal']);
    } else n.childNodes.forEach(walk);
  };
  walk(el);
  return out;
}
const slanted = (s: Array<[string, string]>, c: string) => s.find(([x]) => x === c)?.[1];

test('isCjk / cjkRuns: Han, kana, Hangul and full-width marks are CJK; spaces join the run before them', () => {
  for (const c of ['新', 'の', 'カ', '한', '＆', '，', '　']) expect(isCjk(c)).toBe(true);
  for (const c of ['A', 'é', '&', ' ', '1']) expect(isCjk(c)).toBe(false);
  expect(cjkRuns('謝謝你們 with love')).toEqual([{ text: '謝謝你們 ', cjk: true }, { text: 'with love', cjk: false }]);
  expect(cjkRuns('Happy 生日')).toEqual([{ text: 'Happy ', cjk: false }, { text: '生日', cjk: true }]);
  expect(cjkRuns('')).toEqual([]);
});

test('headline look name: Chinese characters stand upright, Latin letters stay italic', () => {
  const s = styles(drawn(headline, { look: 'name', text: '新郎 ＆ 新娘 Amy', sub: '婚禮' }));
  expect(slanted(s, '新')).toBe('normal');
  expect(slanted(s, '＆')).toBe('normal');
  expect(slanted(s, 'A')).toBe('italic');
  expect(slanted(s, '婚')).toBe('normal');
});

test('headline look name: an all-Latin name is italic as before', () => {
  const s = styles(drawn(headline, { look: 'name', text: 'Happy Birthday', sub: 'SWEET SIXTEEN' }));
  expect(s.filter(([c]) => 'HappyBirthday'.includes(c)).every(([, st]) => st === 'italic')).toBe(true);
});

test('outro look credits: a *starred* line keeps Latin italic and Chinese upright', () => {
  const root = drawn(outro, { look: 'credits', lines: '*謝謝你們 with love*\n伴郎團\n*and all the friends*', beat: 0.4 });
  const s = styles(root);
  expect(slanted(s, '謝')).toBe('normal');
  expect(slanted(s, 'w')).toBe('italic');
  expect(slanted(s, 'f')).toBe('italic');
  expect(slanted(s, '伴')).toBe('normal');
  expect(root.textContent).toContain('謝謝你們 with love');
});
