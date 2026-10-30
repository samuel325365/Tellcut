// @vitest-environment jsdom
// The words a block writes by itself when a parameter is left empty, drawn on a stage as a film made by cut.ts is (no editor in
// between): in the language of the block's text, or of the project's when the block has none. jsdom has no 2D context: a
// stand-in that takes any call is enough, the words are DOM text.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { caption } from './caption.ts';
import { postcard } from './postcard.ts';
import { slip } from './slip.ts';
import { story } from './story.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
/** the text a block shows at 1.5 s, alone or under a caption that says what language the film is in */
function shown(t: ItemType<any, any>, params: Record<string, unknown>, film?: string) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [t, caption] } as any]), media);
  st.load({
    version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: t.type, start: 0, end: 3, params }, ...(film ? [{ id: 'c', type: 'common.caption', start: 0, end: 3, params: { text: film } }] : [])] }],
  } as any);
  st.draw(1.5);
  return root.textContent ?? '';
}

test('common.slip with no number: 重點 over an English title says POINT, over a Japanese one ポイント', () => {
  expect(shown(slip, { no: '' })).toContain('重點');
  expect(shown(slip, { no: '', title: 'No garlic sauce', sub: 'The owner makes a miso sauce instead' })).toContain('POINT');
  expect(shown(slip, { no: '', title: 'にんにくソースなし', sub: '' })).toContain('ポイント');
  expect(shown(slip, { no: '', title: 'No garlic sauce', sub: '' })).not.toContain('重點');
});

test('common.story: a poll with one answer gets the other in the language of the question', () => {
  expect(shown(story, { options: '' })).toMatch(/是[\s\S]*否/);
  const en = shown(story, { text: 'Go again?', options: 'Sure' });
  expect(en).toContain('Yes');
  expect(en).not.toMatch(/[是否]/);
});

test('common.postcard\'s back: the line under Carte Postale follows the handwriting, else the film', () => {
  const card = (lines: string[]) => ({ card: { index: 0, orient: 'portrait', show: 'back', front: { stamp: { label: '' } }, back: { lines: lines.map((text) => ({ text })) } } });
  const spaced = (s: string) => [...s].join(' ');
  expect(shown(postcard, card(['到了巴黎']))).toContain(spaced('寄給自己的明信片'));
  expect(shown(postcard, card(['Made it to Paris']))).toContain(spaced('A POSTCARD TO MYSELF'));
  expect(shown(postcard, card(['パリに着いた']))).toContain(spaced('自分に宛てたはがき'));
  // a back with nothing written on it: the film's language, from its caption
  expect(shown(postcard, card([]), 'Two days in Paris')).toContain(spaced('A POSTCARD TO MYSELF'));
  expect(shown(postcard, card([]))).toContain(spaced('寄給自己的明信片'));
});
