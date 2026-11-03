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

test('a picture that cannot be decoded fails a render (strict) but not a preview', async () => {
  const bad = { decode: () => Promise.reject(new Error('EncodingError')), getAttribute: () => 'media/images/broken.png' } as unknown as HTMLImageElement;
  const empty = { decode: () => Promise.reject(new Error('EncodingError')), getAttribute: () => null } as unknown as HTMLImageElement;
  const deps = { preload: async () => {}, audio: async () => {}, fonts: { ready: Promise.resolve() } };
  await expect(whenReady({ ...deps, images: () => [bad] })).resolves.toBeUndefined();
  await expect(whenReady({ ...deps, images: () => [bad], strict: true })).rejects.toThrow(/broken\.png/);
  await expect(whenReady({ ...deps, images: () => [empty], strict: true })).resolves.toBeUndefined();
});
