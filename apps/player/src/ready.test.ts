import { whenReady } from './ready.ts';

test('whenReady waits for fonts and images', async () => {
  let fontsDone!: () => void;
  const fonts = { ready: new Promise<void>((r) => (fontsDone = r)) };
  let decoded = 0;
  const img = { decode: () => { decoded++; return Promise.resolve(); } } as unknown as HTMLImageElement;
  let settled = false;
  const p = whenReady({ preload: async () => {}, audio: async () => {}, images: () => [img, img], fonts }).then(() => (settled = true));
  await new Promise((r) => setTimeout(r, 20));
  expect(settled).toBe(false);
  expect(decoded).toBe(2);
  fontsDone();
  await p;
  expect(settled).toBe(true);
});
