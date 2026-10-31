import { settle } from './frame.ts';

test('a frame waits for the fonts its text needs before it is captured', async () => {
  let release!: () => void;
  let laidOut = 0;
  const body = { get offsetWidth() { laidOut++; return 1; } } as unknown as HTMLElement;
  const doc = { body, fonts: { ready: new Promise<void>((r) => (release = r)) } };
  let frames = 0;
  let done = false;
  const p = settle(doc, async () => { frames++; }).then(() => (done = true));
  await new Promise((r) => setTimeout(r, 10));
  expect(laidOut).toBe(1);                 // layout forced first, so pending glyph loads start
  expect(done).toBe(false);
  release();
  await p;
  expect(frames).toBe(2);
});

import { drawFrame } from './frame.ts';

test('drawFrame draws, waits for the media, then runs the late pass', async () => {
  const order: string[] = [];
  let open!: () => void;
  const stage = { draw: (t: number) => order.push(`draw:${t}`), late: (t: number) => order.push(`late:${t}`) };
  const pool = { sync: () => { order.push('sync:start'); return new Promise<void>((r) => (open = () => { order.push('sync:end'); r(); })); } };
  const done = drawFrame(stage, pool, 1.5);
  await new Promise((r) => setTimeout(r, 5));
  expect(order).toEqual(['draw:1.5', 'sync:start']);
  open();
  await done;
  expect(order).toEqual(['draw:1.5', 'sync:start', 'sync:end', 'late:1.5']);
});

import { settledFrame } from './frame.ts';

test('a frame during which a font arrived is drawn again: what a block measured with the fallback font is measured with the real one', async () => {
  // a face (a unicode-range slice) that the first draw's layout asks for and that has loaded once the frame has settled
  const faces = [{ status: 'loaded' }, { status: 'unloaded' }] as Array<{ status: string }>;
  const fonts = { forEach: (f: (x: { status: string }) => void) => faces.forEach(f) };
  const order: string[] = [];
  await settledFrame(async () => { order.push('draw'); }, async () => { order.push('settle'); faces[1].status = 'loaded'; }, fonts);
  expect(order).toEqual(['draw', 'settle', 'draw', 'settle']);
  // nothing new arrives: one draw
  order.length = 0;
  await settledFrame(async () => { order.push('draw'); }, async () => { order.push('settle'); }, fonts);
  expect(order).toEqual(['draw', 'settle']);
  // a font that keeps arriving cannot hold the frame forever
  order.length = 0;
  await settledFrame(async () => { order.push('draw'); }, async () => { faces.push({ status: 'loaded' }); }, fonts);
  expect(order).toEqual(['draw', 'draw', 'draw']);
});
