// @vitest-environment jsdom
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { wipe } from './wipe.ts';

// jsdom has no canvas: curl's shadow is drawn on a 2D context that takes every call and does nothing
const noop: any = new Proxy(() => noop, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : noop), set: () => true });
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => noop) as any; });

const media: any ={ begin() {}, video() {}, place() {}, stillUrl: () => '', sync: async () => {}, image() {} };
const project = (art: string): any => ({
  version: 1, meta: { width: 400, height: 400, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'w', type: 'common.wipe', start: 0, end: 4, params: { mode: 'curl', art } }] }],
});

test('curl: the blocks hosted on both sheets are disposed when the block is swapped or the wipe goes (a 3D block frees its GPU things)', () => {
  const log: string[] = [];
  const art = (type: string): ItemType => ({ type, label: type, kind: 'overlay', params: [], build: () => ({ type }),
    draw() {}, dispose: (s: any) => log.push(`dispose ${s.type}`) });
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'x', items: [wipe, art('fx.a'), art('fx.b')] } as any]), media);
  st.load(project('fx.a'));
  st.draw(1);
  st.update(project('fx.b'));
  st.draw(1);
  expect(log).toEqual(['dispose fx.a', 'dispose fx.a']);   // the front sheet and its ghost
  st.update({ ...project('fx.b'), tracks: [{ id: 'o', kind: 'overlay', items: [] }] });
  expect(log.slice(2)).toEqual(['dispose fx.b', 'dispose fx.b']);
});
