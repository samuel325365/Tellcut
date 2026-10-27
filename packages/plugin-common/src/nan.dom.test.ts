// @vitest-environment jsdom
// Review 4: blocks that wrote NaN into a style on every frame (invisible, but wrong). cssCamel keeps what it last wrote on the
// element (`_c`), so the test reads that rather than the browser-validated style.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { notify } from './notify.ts';
import { quote } from './quote.ts';

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', sync: async () => {}, image() {} };
const project = (type: string, params: Record<string, unknown>): any => ({
  version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 3, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type, start: 0, end: 3, params }] }],
});
/** every style value written with NaN in it, as "prop: value" */
function nanWrites(t: ItemType<any, any>, params: Record<string, unknown>, times: number[]): string[] {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'x', items: [t] } as any]), media);
  st.load(project(t.type, params));
  const out: string[] = [];
  for (const time of times) {
    st.draw(time);
    for (const el of root.querySelectorAll('*')) for (const [k, v] of Object.entries((el as any)._c ?? {})) if (String(v).includes('NaN')) out.push(`${k}: ${v}`);
  }
  return out;
}

test('notify: a note without a button writes no NaN (its chip is never shown)', () => {
  expect(nanWrites(notify, { items: '0.1|msg|小美||晚餐要吃什麼？' }, [0.5, 1.5, 2.5])).toEqual([]);
});

test('quote: an empty quote never slams, so it does not shake by NaN', () => {
  expect(nanWrites(quote, { text: '' }, [0.5, 1.5, 2.5])).toEqual([]);
});
