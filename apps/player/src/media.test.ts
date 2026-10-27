import { makeResolver } from './media.ts';

const project: any = { sources: { s: { path: '../src/s.mp4', duration: 9 } } };
const PURL = 'http://h/tellcut/projects/p/project.json';
const ref = { source: 's', in: 1, out: 3, speed: 2, interp: 'none' as const };

test('api mode needs no files and points at the server', async () => {
  const r = await makeResolver(new URLSearchParams('media=api&id=p'), project, PURL, 'http://h', async () => { throw new Error('no fetch expected'); });
  expect(r.video(ref, 1)).toEqual({ url: 'http://h/api/projects/p/media/proxy/s', time: 3 });
});

test('source preview works without a prepared cache index (M-9)', async () => {
  const r = await makeResolver(new URLSearchParams(''), project, PURL, 'http://h', async () => { throw new Error('404'); });
  expect(r.video(ref, 1)).toEqual({ url: 'http://h/tellcut/projects/src/s.mp4', time: 3 });
  expect(() => r.still({ source: 's', t: 1 })).toThrow(/stills/);
});

test('cache mode reads the index named by ?index=', async () => {
  const seen: string[] = [];
  await makeResolver(new URLSearchParams('mode=render&index=cache/index-job1.json'), project, PURL, 'http://h', async (u) => { seen.push(u); return { videos: {}, stills: {}, audio: {} }; });
  expect(seen).toEqual(['http://h/tellcut/projects/p/cache/index-job1.json']);
});

test('?index= only from this server, like ?project=: another site is refused before anything is fetched', async () => {
  const seen: string[] = [];
  const json = async (u: string) => { seen.push(u); return { videos: {}, stills: {}, audio: {} }; };
  for (const q of ['mode=render&index=http://evil/index.json', 'index=//evil/index.json'])
    await expect(makeResolver(new URLSearchParams(q), project, PURL, 'http://h', json)).rejects.toThrow(/index 只能來自這台伺服器/);
  expect(seen).toEqual([]);
});
