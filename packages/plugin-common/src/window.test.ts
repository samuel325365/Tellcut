// window.ts' imagesReady is every picture block's ready(): it waits for the images that have a src to decode (or fail), and for
// nothing else (a block may hold no image yet, or one with its src removed).
import { imagesReady } from './window.ts';

const img = (src: string | null, complete: boolean, decode: () => Promise<void>) =>
  ({ getAttribute: (k: string) => (k === 'src' ? src : null), complete, decode }) as unknown as HTMLImageElement;

test('imagesReady waits for the images still loading, skips missing ones and those with no src, and a failed decode still resolves', async () => {
  let release!: () => void, decoded = 0;
  const slow = img('a.jpg', false, () => new Promise<void>((r) => { release = () => { decoded++; r(); }; }));
  const broken = img('b.jpg', false, () => Promise.reject(new Error('no picture')));
  const never = () => { throw new Error('not waited for'); };
  let done = false;
  const p = imagesReady([null, undefined, img(null, false, never), img('c.jpg', true, never), slow, broken]).then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 10));
  expect(done).toBe(false);
  release();
  await p;
  expect([done, decoded]).toEqual([true, 1]);
});
