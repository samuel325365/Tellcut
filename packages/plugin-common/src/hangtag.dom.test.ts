// @vitest-environment jsdom
// common.hangtag's words do not wrap (the tag is set white-space: pre), so a long name or quip made the tag wider than the frame;
// they now shrink together so the tag, centred on x, keeps within the safe sides. jsdom lays nothing out: this reads the sizes
// the block set.
import { createRegistry, Stage, textEm } from '@tellcut/engine';
import { hangtag } from './hangtag.ts';

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const W = 1080, H = 1920;
function draw(params: Record<string, unknown>) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [hangtag] } as any]), media);
  st.load({ version: 1, meta: { width: W, height: H, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'h', type: 'common.hangtag', start: 0, end: 3, params }] }] } as any);
  st.draw(1);
  const divs = [...root.querySelectorAll<HTMLElement>('div')];
  const by = (text: string) => divs.find((d) => d.children.length === 0 && d.textContent === text && d.style.fontSize)!;
  return { by, px: (text: string) => parseFloat(by(text).style.fontSize) };
}

test('a long name or quip shrinks the tag\'s words so it fits the frame; the default tag keeps its sizes', () => {
  const def = draw({});
  expect([def.px('+12'), def.px('生蔗糖'), def.px('Raw sugar'), def.px('先來點糖')]).toEqual([92, 64, 28, 34]);
  const name = '南美洲高山手工有機蔗糖', long = draw({ name });
  const f = long.px(name) / 64;
  expect(f).toBeLessThan(1);
  expect(long.px('+12')).toBeCloseTo(92 * f, 6);
  // the row (value, name) and the padding within the safe sides (0.12 W in 9:16) on both sides of its centre (0.36 W)
  const room = 2 * Math.min(0.36 * W - 0.12 * W, (1 - 0.12) * W - 0.36 * W);
  expect(92 * f * textEm('+12') + 64 * f * textEm(name) + 80).toBeLessThanOrEqual(room + 1e-6);
  expect(draw({ x: 0.5, name: '來自南美洲高山的手工有機糖' }).px('來自南美洲高山的手工有機糖')).toBeGreaterThan(long.px(name));
  const quip = '這一匙下去今天的運動全部白做了而且還要再加一圈操場', q = draw({ quip });
  expect(q.px(quip) * textEm(quip) + 36 * q.px(quip) / 34 + 80).toBeLessThanOrEqual(room + 1e-6);
});
