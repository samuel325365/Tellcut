// @vitest-environment jsdom
// Words a block draws on a canvas have a transparent DOM copy (review 4, R4-C2), so check's __tellcut.layout() and the editor's
// double-click find them: a text node shown the way apps/player/src/layout.ts counts it (no display none, no visibility hidden,
// opacity above 0.05), its colour transparent.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { headline } from './headline.ts';
import { printer } from './printer.ts';

/** a 2D context where every call is a no-op */
function fakeContext(canvas: HTMLCanvasElement): any {
  const fn: any = new Proxy(function () {}, {
    get: (_t, k) => (typeof k === 'symbol' ? undefined : k === 'canvas' ? canvas : k === 'valueOf' || k === 'toString' ? () => 0
      : k === 'measureText' ? (s: string) => ({ width: s.length * 10 }) : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }) : fn),
    set: () => true, apply: () => fn,
  });
  return fn;
}
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { return fakeContext(this); } as any);
  (document as any).fonts = { load: async () => [], check: () => true };
  (HTMLImageElement.prototype as any).decode = async () => {};
});
afterEach(() => vi.restoreAllMocks());

const media: any = { begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p };
async function texts(block: ItemType<any, any>, params: Record<string, unknown>, t: number, o: { W?: number; H?: number } = {}) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [block as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: o.W ?? 1080, height: o.H ?? 1920, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'b', type: block.type, start: 0, end: 5, params }] }] } as any);
  await st.ready();
  st.draw(t);
  const out: Array<{ text: string; clear: boolean }> = [], walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement!;
    if (!n.textContent?.trim()) continue;
    let alpha = 1, shown = true;
    for (let e: HTMLElement | null = el; e && e !== root; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') shown = false;
      alpha *= Number(cs.opacity || 1);
    }
    if (shown && alpha > 0.05) out.push({ text: n.textContent, clear: /^(transparent|rgba\(0, 0, 0, 0\))$/.test(getComputedStyle(el).color) });
  }
  return out;
}
const words = (l: Array<{ text: string }>) => l.map((x) => x.text);

test('headline: the brand and proof looks keep their words in the DOM, transparent', async () => {
  const brand = await texts(headline, { look: 'brand', text: 'Made for makers', sub: 'OUR STORY' }, 2);
  expect(words(brand)).toEqual(expect.arrayContaining(['Made for makers', 'OUR STORY']));
  expect(brand.every((x) => x.clear)).toBe(true);
  const proof = await texts(headline, { look: 'proof', text: '696+', sub: 'clips' }, 2);
  expect(words(proof)).toEqual(expect.arrayContaining(['696+', 'clips']));
  // a line not in yet is left out
  expect(words(await texts(headline, { look: 'brand', text: 'Made for makers', sub: '' }, 0))).not.toContain('Made for makers');
});

test('printer: the stamp and the model name', async () => {
  const l = words(await texts(printer, { stamp: '吃飽了', stampAt: 2.3, model: 'TP-16 THERMAL' }, 2.8));
  expect(l).toEqual(expect.arrayContaining(['吃飽了', 'TP-16 THERMAL']));
  expect(words(await texts(printer, { stamp: '吃飽了', stampAt: 2.3 }, 1))).not.toContain('吃飽了');
});
