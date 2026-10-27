// @vitest-environment jsdom
import { mountControls } from './controls.ts';

test('scrubbing while playing keeps one playback loop, not one more per scrub', async () => {
  document.body.innerHTML = '<div id="viewport"><div id="stage"></div></div><button id="play"></button><input id="scrub" type="range" min="0" max="1000"><span id="clock"></span>';
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frames.set(++next, f); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  let clock = 0;
  const audio: any = { play: async () => clock, now: () => clock, stop: () => {} };
  const pool: any = { playing: false, sync: async () => {} };
  let draws = 0;
  mountControls({ stage: document.getElementById('stage')!, draw: () => { draws++; }, late: () => {}, pool, audio, duration: 10 });
  const step = () => { const due = [...frames.values()]; frames.clear(); clock += 0.016; for (const f of due) f(0); return due.length; };
  document.getElementById('play')!.click();
  await Promise.resolve(); await Promise.resolve();
  step();
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  for (const v of ['200', '400', '600']) { scrub.value = v; scrub.dispatchEvent(new Event('input')); await Promise.resolve(); await Promise.resolve(); }
  step();
  expect(step()).toBe(1);                                                             // one loop running
  draws = 0; step();
  expect(draws).toBe(1);
  vi.unstubAllGlobals();
});

test('fast scrubbing: the late pass of a time already drawn over is dropped, only the newest one runs', async () => {
  document.body.innerHTML = '<div id="viewport"><div id="stage"></div></div><button id="play"></button><input id="scrub" type="range" min="0" max="1000"><span id="clock"></span>';
  const syncs: Array<() => void> = [];
  const pool: any = { playing: false, sync: () => new Promise<void>((r) => syncs.push(r)) };
  const audio: any = { play: async () => 0, now: () => 0, stop: () => {} };
  const lates: number[] = [];
  mountControls({ stage: document.getElementById('stage')!, draw: () => {}, late: (t) => { lates.push(t); }, pool, audio, duration: 10 });
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  for (const v of ['100', '200']) { scrub.value = v; scrub.dispatchEvent(new Event('input')); }
  // the media pool finishes the newer seek first, then the older one
  syncs[1](); await Promise.resolve(); await Promise.resolve();
  syncs[0](); await Promise.resolve(); await Promise.resolve();
  expect(lates).toEqual([2]);
});
