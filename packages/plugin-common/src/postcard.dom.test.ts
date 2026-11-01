// @vitest-environment jsdom
// common.postcard is a scene block, under the video, and the clip that plays in its window (frame: postcardWindow) lies above it.
// While the next card slid in, turned over or spread out, that clip played on in the window over it — acceptance film T2: the next
// stop's clip showed in the old card's window about half a second before the new card had arrived. Not a hole, the card on top goes
// into the top container, above the clip, over a copy of the desk and the cards under it cut to the window; a hole, back under the
// video. pushAt / pushBack draw the window's clip in a rectangle growing to the whole frame and back; drop cards land after a spread.
import { createRegistry, Stage } from '@tellcut/engine';
import { postcard, postcardWindow, type Card } from './postcard.ts';

// jsdom has no 2D context: a stand-in that takes any call (as hide.dom.test.ts)
const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : k === 'measureText' ? () => ({ width: 10 }) : t[k]) }); }; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video: (_r: unknown, parent: HTMLElement) => { const v = document.createElement('video'); parent.appendChild(v); return v; }, place() {}, stillUrl: () => 'still.jpg', fileUrl: () => '', sync: async () => {}, image() {} };
const W = 1080, H = 1920, WIN = postcardWindow('portrait');
const still = { source: 's', t: 1 };
const card = (index: number, extra: Partial<Card> = {}): Card => ({ index, orient: 'portrait', show: 'front', front: { enter: still, exit: still, open: 0.8, stamp: { label: 'MAROC' } }, ...extra });
const clip = (id: string, start: number, end: number, frame: number[] = WIN) =>
  ({ id, source: 's', in: 10, speed: 1, start, end, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, frame });
const project = (params: Record<string, unknown>, clips: unknown[]): any => ({
  version: 1, meta: { width: W, height: H, fps: 30, duration: 8, background: '#000', plugins: [] },
  sources: { s: { path: 's.mp4', duration: 60, width: 1280, height: 720, kind: 'video', audio: false } }, media: {}, grids: [],
  tracks: [
    { id: 'bgfx', kind: 'scene', items: [{ id: 'pc', type: 'common.postcard', start: 0, end: 6, params }] },
    { id: 'v1', kind: 'video', items: clips },
  ],
});

function stage(params: Record<string, unknown>, clips: unknown[] = [clip('c', 0, 6)]) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [postcard] } as any]), media);
  st.load(project(params, clips));
  const lift = root.querySelector('.st-top')!.firstElementChild!.firstElementChild as HTMLElement;
  const [clipBox, liftStage, push] = [...lift.children] as HTMLElement[];
  const item = root.querySelector('.st-item[data-id="pc"]')!;
  const cards = (el: Element) => [...el.querySelectorAll('div')].filter((d) => /rgba\(25, ?12, ?4/.test(d.style.boxShadow) && d.style.display !== 'none');
  const at = (t: number) => {
    st.draw(t);
    return { lifted: cards(liftStage).length, copies: lift.style.display !== 'none' && clipBox.style.display !== 'none' ? cards(clipBox).length : 0, under: cards(item).length,
      push: lift.style.display !== 'none' && push.style.display !== 'none' ? push : null };
  };
  const srcs = () => item.querySelectorAll('img[src]').length;
  return { at, srcs };
}

test('postcard: the next card comes in over the clip in its window, over a copy of the pile there; settled, under the clip', () => {
  const pc = stage({ card: card(1, { enter: { from: [-1250, 120, -8], dur: 0.8 } }), pile: [card(0)] });
  // sliding in: the new card above the clip, the old card (moving into the pile) copied into the window — not the next clip
  expect(pc.at(0.3)).toMatchObject({ lifted: 1, copies: 1, under: 1 });
  // settled and open: the clip plays through the hole, nothing lifted
  expect(pc.at(1.5)).toMatchObject({ lifted: 0, copies: 0, under: 2 });
});

test('postcard: turned over or spread out it lies over the clip; with no clip in the window (or a full-screen one) never lifted', () => {
  const flip = stage({ card: card(1, { enter: undefined, flip: { at: 2, dur: 0.8 }, back: {} }), pile: [card(0)] });
  expect(flip.at(1.5).lifted).toBe(0);
  expect(flip.at(2.3)).toMatchObject({ lifted: 1, copies: 1 });
  expect(flip.at(3.5)).toMatchObject({ lifted: 1, copies: 1 });   // its back faces us
  const spread = stage({ card: card(1), pile: [card(0)], spread: { at: 2, dur: 1, slots: [[300, 500, -5, 0.4]] } });
  expect(spread.at(2.5).lifted).toBe(1);
  expect(stage({ card: card(1, { enter: { from: [1250, 160, 9], dur: 0.8 } }), pile: [card(0)] }, []).at(0.3).lifted).toBe(0);
  expect(stage({ card: card(1, { enter: { from: [1250, 160, 9], dur: 0.8 } }), pile: [card(0)] }, [clip('c', 0, 6, [0, 0, 1, 1])]).at(0.3).lifted).toBe(0);
});

test('postcard: drop cards land after the spread, on top of it, their times counted from their own at', () => {
  const drop = { ...card(2, { enter: { from: [-40, -1900, -6], dur: 0.9 }, flip: { at: 1.7, dur: 0.8 }, back: {} }), at: 3 };
  const pc = stage({ card: card(1), pile: [card(0)], spread: { at: 1, dur: 1, slots: [[300, 500, -5, 0.4]] }, drop: [drop] }, []);
  // built hidden, its stills already asked for (so ready() waits for them and the frame it lands in has them)
  expect(pc.srcs() - stage({ card: card(1), pile: [card(0)] }, []).srcs()).toBe(2);
  expect(pc.at(2.5).under).toBe(2);   // the pile and this card, spread; the drop card not yet
  expect(pc.at(3.3).under).toBe(3);   // coming in
  // with a clip in the window the drop card is the one lifted, the spread cards copied under it
  const live = stage({ card: card(1), pile: [card(0)], spread: { at: 1, dur: 1, slots: [[300, 500, -5, 0.4]] }, drop: [drop] });
  expect(live.at(3.3)).toMatchObject({ lifted: 1, copies: 2, under: 2 });
});

test('postcard: pushAt grows the window clip to the whole frame, pushBack brings it back; a full-screen clip in the middle needs nothing', () => {
  const p = { card: card(1), pushAt: 1.5, pushDur: 0.5, pushBack: 3.5 };
  const rect = (b: HTMLElement) => [b.style.left, b.style.top, b.style.width, b.style.height].map((v) => parseFloat(v));
  const one = stage(p);
  expect(one.at(1.2).push).toBeNull();
  const growing = one.at(1.75).push!;
  expect(growing.querySelector('video')).not.toBeNull();
  const [x, y, w, h] = rect(growing);
  expect(x).toBeLessThan(WIN[0] * W); expect(x).toBeGreaterThan(0);
  expect(w).toBeGreaterThan(WIN[2] * W); expect(w).toBeLessThan(W);
  expect(y + h).toBeGreaterThan((WIN[1] + WIN[3]) * H);
  expect(rect(one.at(2.5).push!)).toEqual([0, 0, W, H]);   // the window clip still on the track: drawn full here
  expect(rect(one.at(3.75).push!)[2]).toBeLessThan(W);     // shrinking
  expect(one.at(4.2).push).toBeNull();                     // back in the card
  // the usual cut: a full-screen clip while it is full, the window clips while it grows and shrinks
  const cut = stage(p, [clip('a', 0, 2), clip('b', 2, 3.5, [0, 0, 1, 1]), clip('c', 3.5, 6)]);
  expect(cut.at(1.75).push).not.toBeNull();
  expect(cut.at(2.5).push).toBeNull();
  expect(cut.at(3.75).push).not.toBeNull();
});
