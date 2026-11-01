// @vitest-environment jsdom
// common.chat's open= and since: the acceptance films E2 and V2 each wrote an fx (fx.bubbleopen) to grow a video bubble to the whole
// frame and back, and V2 split its chat in two with a helper that rewrote every line so the second item started with the messages
// already there. Now the block does both: while open= runs it draws the main-track clip that plays in the bubble (its frame stays
// chatWindow(…)) in a box growing from the bubble's rect, and `since` starts an item at a second of the same conversation.
import { createRegistry, Stage } from '@tellcut/engine';
import { chat, chatWindow } from './chat.ts';

// jsdom has no 2D context: a stand-in that takes any call (as frame.dom.test.ts)
const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const W = 1080, H = 1920;
let uses: Array<{ source: string; in: number; local: number; parent: HTMLElement }> = [];
const media: any = {
  begin() { uses = []; },
  video(ref: any, parent: HTMLElement, local: number) { const v = document.createElement('video'); parent.appendChild(v); uses.push({ source: ref.source, in: ref.in, local, parent }); return v; },
  place() {}, stillUrl: (r: any) => `still:${r.source}@${r.t}`, fileUrl: () => '', sync: async () => {}, image() {},
};
const ITEMS = '0|me|看這個\n0.5|me||video|src=s|t=3|t2=9|play=1-5|open=2-4|ratio=4:5|w=0.6\n5.5|them|哇';
const CROP = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const project = (params: Record<string, unknown>, clips: Array<{ id: string; start: number; end: number; in: number; frame: number[] }>, at = 0): any => ({
  version: 1, meta: { width: W, height: H, fps: 30, duration: 8, background: '#000', plugins: [] },
  sources: { s: { path: 's.mp4', duration: 60, width: 1280, height: 720, kind: 'video', audio: false } }, media: {}, grids: [],
  tracks: [
    { id: 'v1', kind: 'video', items: clips.map((c) => ({ source: 's', speed: 1, crop: CROP, ...c })) },
    { id: 'ov', kind: 'overlay', items: [{ id: 'chat', type: 'common.chat', start: at, end: 8, params }] },
  ],
});

function stage(params: Record<string, unknown>, clips: Parameters<typeof project>[1], at = 0) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [chat] } as any]), media);
  st.load(project(params, clips, at));
  const item = root.querySelector('.st-item[data-id="chat"]') as HTMLElement;
  const open = item.lastElementChild as HTMLElement, box = open.children[1] as HTMLElement;
  const px = (v: string) => Number(v.replace('px', ''));
  /** the open box's rect as frame fractions, null when nothing is open */
  const at2 = (t: number) => {
    st.draw(t);
    if (open.style.display === 'none') return null;
    return [px(box.style.left) / W, px(box.style.top) / H, px(box.style.width) / W, px(box.style.height) / H];
  };
  return { st, item, open, box, at: at2 };
}

test('open=: the box grows from the bubble to the whole frame and back with the rect chatWindow gives, showing the clip in that bubble', () => {
  const p = { items: ITEMS }, frame = chatWindow(p, 1, W, H)!;
  // the bubble's clip in two pieces (two parts of the source), both at the bubble's frame; a full-frame clip elsewhere is not it
  const s = stage(p, [{ id: 'c1', start: 1, end: 3, in: 20, frame }, { id: 'c2', start: 3, end: 5, in: 40, frame }, { id: 'x', start: 5, end: 8, in: 50, frame: [0, 0, 1, 1] }]);
  expect(s.at(1.5)).toBeNull();                                            // playing in its bubble, not open yet
  for (const t of [2.1, 2.225, 2.4, 3, 3.7, 3.9]) {
    const r = s.at(t)!, want = chatWindow(p, 1, W, H, { t })!;
    r.forEach((v, j) => expect(v).toBeCloseTo(want[j], 3));
  }
  const mid = s.at(2.225)!;
  expect(mid[2]).toBeGreaterThan(frame[2]);
  expect(mid[2]).toBeLessThan(1);
  expect(Number(s.box.style.borderRadius.replace('px', ''))).toBeGreaterThan(0);   // rounded on the way
  expect(uses.filter((u) => s.box.contains(u.parent)).map((u) => [u.in, u.local])).toEqual([[20, 1.225]]);   // c1, 1.225 s in
  expect(s.at(3)).toEqual([0, 0, 1, 1]);
  expect(s.box.style.borderRadius).toBe('0.00px');
  expect(uses.filter((u) => s.box.contains(u.parent)).map((u) => [u.in, u.local])).toEqual([[40, 0]]);       // the second piece
  expect(Number((s.open.children[0] as HTMLElement).style.opacity)).toBeCloseTo(0.6);                         // the chat behind dims
  expect(s.at(4.2)).toBeNull();                                            // back in its bubble
  expect(uses.some((u) => s.box.contains(u.parent))).toBe(false);
});

test('open=: without a clip in the bubble the box shows the bubble\'s still; open=秒 stays open', () => {
  const s = stage({ items: ITEMS.replace('open=2-4', 'open=2') }, []);
  expect(s.at(3)).toEqual([0, 0, 1, 1]);
  expect(s.box.querySelector('img')!.getAttribute('src')).toBe('still:s@3');
  expect(s.at(7.9)).toEqual([0, 0, 1, 1]);                                 // to the item's end
  expect(uses).toEqual([]);
  // after play (5 s) the opened still is the after-play poster
  const t2 = stage({ items: ITEMS.replace('open=2-4', 'open=5.2-7') }, []);
  t2.at(6);
  expect(t2.box.querySelector('img')!.getAttribute('src')).toBe('still:s@9');
});

test('since: the second item starts with the messages there, settled, and the played video on its t2 poster', () => {
  const s = stage({ items: ITEMS, since: 5.6 }, [], 3);
  s.at(3);                                                                 // the item's first frame: the conversation at 5.6 s
  const boxes = [...s.item.querySelectorAll<HTMLElement>('div')].filter((d) => d.style.height && d.style.width === `${W}px` && d.style.display === 'block' && d.style.top);
  expect(boxes.length).toBeGreaterThanOrEqual(3);
  for (const b of boxes) { expect(b.style.opacity).toBe('1'); expect(b.style.transform).toBe('none'); }
  const shown = [...s.item.querySelectorAll('img')].filter((i) => (i.parentElement as HTMLElement).style.display === 'block' && !s.open.contains(i));
  expect(shown.map((i) => i.getAttribute('src'))).toEqual(['still:s@9']);
  // the same draw without since, 0.1 s after "哇" arrived: it is still popping in
  const fresh = stage({ items: ITEMS }, []);
  fresh.at(5.6);
  const pops = [...fresh.item.querySelectorAll<HTMLElement>('div')].filter((d) => d.style.width === `${W}px` && d.style.display === 'block' && d.style.transform.startsWith('scale'));
  expect(pops.length).toBe(1);
});
