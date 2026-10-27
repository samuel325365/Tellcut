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
