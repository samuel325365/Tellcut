// @vitest-environment jsdom
// common.gauge drawn on a stage: the readout in words takes the place of the digits and the unit (jsdom lays nothing out and the
// canvas is a stand-in: this checks the text elements, the golden pictures how it looks).
import { createRegistry, Stage } from '@tellcut/engine';
import { gauge } from './gauge.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

function drawn(params: Record<string, unknown>, t: number) {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [gauge] } as any]), media);
  st.load({
    version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'g', type: 'common.gauge', start: 0, end: 3.5, params }] }],
  } as any);
  st.draw(t);
  const shown = [...root.querySelectorAll('div')].filter((d) => d.style.display !== 'none' && !d.children.length).map((d) => d.textContent);
  return shown;
}

test('by default the readout is the number with its unit', () => {
  expect(drawn({ danger: -1, boom: -1 }, 1.6)).toContain('分');
});

test('a readout in words is shown in the LED, the unit is not; it changes at each hit', () => {
  const p = { hits: '0.3:8, 1.2:9', readout: '第4, 第1', danger: -1, boom: -1, unit: '分' };
  const at1 = drawn(p, 0.8), at2 = drawn(p, 1.8);
  expect(at1).toContain('第4');
  expect(at1).not.toContain('分');
  expect(at2).toContain('第1');
});

test('look neutral: no guilt zone names on the band or under the readout', () => {
  const shown = drawn({ look: 'neutral' }, 2.6);
  for (const w of ['清', '地', '超越地獄', '爆表']) expect(shown).not.toContain(w);
  expect(drawn({}, 2.6).join('')).toMatch(/清/);
});
