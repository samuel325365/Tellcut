import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureFont3d } from './font3d.ts';

let d1 = '', d2 = '';
beforeEach(() => { d1 = mkdtempSync(join(tmpdir(), 'font3d-')); d2 = mkdtempSync(join(tmpdir(), 'font3d-')); });
afterEach(() => { rmSync(d1, { recursive: true, force: true }); rmSync(d2, { recursive: true, force: true }); });

/** a fetch whose css2 answer names https://x/a.ttf, and the TTF answers `ttf` */
function fakeFetch(ttf: { status: number; body?: number[] }) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.includes('/css2')) return new Response("@font-face { font-family: 'X'; src: url(https://x/a.ttf) format('truetype'); }");
    return new Response(ttf.body ? new Uint8Array(ttf.body) : null, { status: ttf.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

test('font3d downloads the TTF the css2 API names, once, into every folder', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, body: [1, 2, 3] });
  expect(await ensureFont3d('sans', { dirs: [d1, d2], fetch })).toEqual({ file: 'NotoSansTC-900.ttf', downloaded: true });
  for (const d of [d1, d2]) expect([...readFileSync(join(d, 'NotoSansTC-900.ttf'))]).toEqual([1, 2, 3]);
  const css = calls.find((c) => c.url.includes('/css2'))!;
  expect(css.url).toContain('family=Noto+Sans+TC:wght@900');
  expect(JSON.stringify(css.headers)).not.toMatch(/Mozilla|Chrome/);
  const n = calls.length;
  expect(await ensureFont3d('sans', { dirs: [d1, d2], fetch })).toEqual({ file: 'NotoSansTC-900.ttf', downloaded: false });
  expect(calls).toHaveLength(n);
});

test('a folder that lacks the file gets a copy without another download', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, body: [4, 5] });
  await ensureFont3d('round', { dirs: [d1], fetch });
  const n = calls.length;
  expect(await ensureFont3d('round', { dirs: [d1, d2], fetch })).toEqual({ file: 'Huninn-400.ttf', downloaded: false });
  expect([...readFileSync(join(d2, 'Huninn-400.ttf'))]).toEqual([4, 5]);
  expect(calls).toHaveLength(n);
});

test('a failed download leaves no file', async () => {
  const { fetch } = fakeFetch({ status: 500 });
  await expect(ensureFont3d('serif', { dirs: [d1], fetch })).rejects.toThrow(/Noto Serif TC/);
  expect(existsSync(join(d1, 'NotoSerifTC-900.ttf'))).toBe(false);
  expect(readdirSync(d1).filter((f) => f.endsWith('.tmp'))).toEqual([]);
});

test('an unknown feel is a usage error', async () => {
  const { fetch } = fakeFetch({ status: 200, body: [1] });
  await expect(ensureFont3d('bold' as any, { dirs: [d1], fetch })).rejects.toThrow(/sans.*serif.*round/);
});
