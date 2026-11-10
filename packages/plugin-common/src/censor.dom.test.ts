// @vitest-environment jsdom
// common.censor's label is set on one line (white-space: pre): a long one ran off the sticker. It now takes 22 % of the sticker's
// width as before, or less so its words stay inside the sticker.
import { createRegistry, Stage, textEm } from '@tellcut/engine';
import { censor } from './censor.ts';

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
function sticker(params: Record<string, unknown>) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [censor] } as any]), media);
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 2, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.censor', start: 0, end: 1, params }] }] } as any);
  st.draw(0.6);
  const box = [...root.querySelectorAll<HTMLElement>('div')].find((d) => d.style.fontSize)!;
  return { w: parseFloat(box.style.width), px: parseFloat(box.style.fontSize) };
}

test('a long label shrinks to the sticker\'s width; 消音 and short words keep 22 % of it', () => {
  const def = sticker({});
  expect(def.px).toBe(def.w * 0.22);
  expect(sticker({ label: 'BEEP' }).px).toBe(def.w * 0.22);
  const label = '不能說的那個字', long = sticker({ label });
  expect(long.px).toBeLessThan(long.w * 0.22);
  expect(long.px * textEm(label)).toBeLessThanOrEqual(long.w * 0.84 + 1e-6);
});
