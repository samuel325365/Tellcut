import { createLimiter } from './limit.ts';

test('never more than n run at once, and every task finishes', async () => {
  const lim = createLimiter(2), done: number[] = [];
  const task = (i: number) => lim.run(async () => { await new Promise((r) => setTimeout(r, 5 + (i % 3))); done.push(i); return i; });
  const out = await Promise.all([0, 1, 2, 3, 4, 5].map(task));
  expect(out).toEqual([0, 1, 2, 3, 4, 5]);
  expect(done.length).toBe(6);
  expect(lim.peak).toBe(2);
  expect(lim.active).toBe(0);
});

test('a failing task frees its slot', async () => {
  const lim = createLimiter(1);
  await expect(lim.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  expect(await lim.run(async () => 7)).toBe(7);
});
