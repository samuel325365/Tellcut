// @vitest-environment jsdom
// The still a block shows is loading from build on, and ready() waits for it (review 4, R4-C4): the first exported frames have
// the picture, not the stand-in box.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { polaroid } from './polaroid.ts';
import { postmark } from './postmark.ts';

let decoded: string[], release: () => void;
beforeEach(() => {
  decoded = [];
  const gate = new Promise<void>((r) => { release = r; });
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
  (HTMLImageElement.prototype as any).decode = function (this: HTMLImageElement) { decoded.push(this.getAttribute('src') ?? ''); return gate; };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => undefined, set: () => true }) as any);
});
afterEach(() => { vi.restoreAllMocks(); delete (HTMLImageElement.prototype as any).decode; });

const media: any = { begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'),
  stillUrl: (r: { source: string; t: number }) => `still/${r.source}@${r.t}.jpg`, fileUrl: (p: string) => p };

test.each([[polaroid, { source: 'a', t: 1.5 }], [postmark, { source: 'a', t: 1.5 }]] as const)('%#: ready() waits for the still', async (block, params) => {
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'common', items: [block as unknown as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, media: {}, grids: [],
    sources: { a: { path: 'a.mp4', duration: 10, width: 1920, height: 1080 } },
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'b', type: block.type, start: 0, end: 3, params }] }] } as any);
  let done = false;
  const r = st.ready().then(() => { done = true; });
  await new Promise((ok) => setTimeout(ok, 10));
  expect(decoded.some((s) => s.startsWith('still/a@1.5'))).toBe(true);
  expect(done).toBe(false);
  release();
  await r;
  expect(done).toBe(true);
});
