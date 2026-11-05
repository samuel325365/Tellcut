import { fetchIdle, Stalled } from './fetch-idle.ts';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** a body that sends `n` pieces `gap` ms apart, then (stall) stops sending without ending */
const trickle = (n: number, gap: number, stall = false) => new ReadableStream<Uint8Array>({
  async start(c) {
    for (let i = 0; i < n; i++) { await pause(gap); c.enqueue(new Uint8Array([i])); }
    if (!stall) c.close();
  },
});

test('a download that keeps arriving is never cut short, however long it takes; one that stops sending gives up', async () => {
  // 10 pieces 30 ms apart: 300 ms in all, three times the 100 ms of silence allowed
  const slow = (async () => new Response(trickle(10, 30), { status: 200, headers: { 'x-a': '1' } })) as unknown as typeof fetch;
  const r = await fetchIdle(slow, 'https://x/a', {}, 100);
  expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(r.headers.get('x-a')).toBe('1');
  const stops = (async () => new Response(trickle(2, 10, true))) as unknown as typeof fetch;
  await expect(fetchIdle(stops, 'https://x/a', {}, 100)).rejects.toBeInstanceOf(Stalled);
  // no answer at all, from a fetch that does not even honour its signal
  const never = (() => new Promise(() => {})) as unknown as typeof fetch;
  await expect(fetchIdle(never, 'https://x/a', {}, 100)).rejects.toThrow(/the connection stalled: nothing arrived for 0 s/);
});

test('the answer keeps its status; an error from the fetch itself comes through as it is', async () => {
  const gone = (async () => new Response('no', { status: 404 })) as unknown as typeof fetch;
  expect((await fetchIdle(gone, 'https://x/a', {}, 100)).status).toBe(404);
  const offline = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  await expect(fetchIdle(offline, 'https://x/a', {}, 100)).rejects.toThrow('fetch failed');
});
