import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureFont3d } from './font3d.ts';

let d1 = '', d2 = '';
beforeEach(() => { d1 = mkdtempSync(join(tmpdir(), 'font3d-')); d2 = mkdtempSync(join(tmpdir(), 'font3d-')); });
afterEach(() => { rmSync(d1, { recursive: true, force: true }); rmSync(d2, { recursive: true, force: true }); });

/** the first bytes of a TrueType font (sfnt version 1.0), then `rest` */
const TTF = (...rest: number[]) => [0, 1, 0, 0, ...rest];

/** a fetch whose css2 answer names https://x/a.ttf, and the TTF answers `ttf`; `hang` never answers it (until aborted) */
function fakeFetch(ttf: { status: number; body?: number[]; hang?: boolean }) {
  const calls: Array<{ url: string; headers: Record<string, string>; signal?: AbortSignal | null }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, signal: init?.signal });
    if (url.includes('/css2')) return new Response("@font-face { font-family: 'X'; src: url(https://x/a.ttf) format('truetype'); }");
    if (ttf.hang) return new Promise((_, no) => init?.signal?.addEventListener('abort', () => no(init.signal!.reason)));
    return new Response(ttf.body ? new Uint8Array(ttf.body) : null, { status: ttf.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

test('font3d downloads the TTF the css2 API names, once, into every folder', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, body: TTF(1, 2, 3) });
  expect(await ensureFont3d('sans', { dirs: [d1, d2], fetch })).toEqual({ file: 'NotoSansTC-900.ttf', downloaded: true });
  for (const d of [d1, d2]) expect([...readFileSync(join(d, 'NotoSansTC-900.ttf'))]).toEqual(TTF(1, 2, 3));
  const css = calls.find((c) => c.url.includes('/css2'))!;
  expect(css.url).toContain('family=Noto+Sans+TC:wght@900');
  expect(JSON.stringify(css.headers)).not.toMatch(/Mozilla|Chrome/);
  const n = calls.length;
  expect(await ensureFont3d('sans', { dirs: [d1, d2], fetch })).toEqual({ file: 'NotoSansTC-900.ttf', downloaded: false });
  expect(calls).toHaveLength(n);
});

test('a folder that lacks the file gets a copy without another download', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, body: TTF(4, 5) });
  await ensureFont3d('round', { dirs: [d1], fetch });
  const n = calls.length;
  expect(await ensureFont3d('round', { dirs: [d1, d2], fetch })).toEqual({ file: 'Huninn-400.ttf', downloaded: false });
  expect([...readFileSync(join(d2, 'Huninn-400.ttf'))]).toEqual(TTF(4, 5));
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

test('a download that is not a TrueType font (an OpenType CFF, a woff, a web page) is refused and leaves no file', async () => {
  const bodies = [[0x4f, 0x54, 0x54, 0x4f, 1], [0x77, 0x4f, 0x46, 0x46, 1], [...Buffer.from('<!doctype html>')]];
  for (const body of bodies) {
    await expect(ensureFont3d('sans', { dirs: [d1], fetch: fakeFetch({ status: 200, body }).fetch })).rejects.toThrow(/不是 TrueType/);
    expect(readdirSync(d1)).toEqual([]);
  }
  // 'true' (an Apple TrueType) is a TTF too
  await ensureFont3d('sans', { dirs: [d1], fetch: fakeFetch({ status: 200, body: [...Buffer.from('true'), 9] }).fetch });
  expect(existsSync(join(d1, 'NotoSansTC-900.ttf'))).toBe(true);
});

test('a download that never answers ends at the time limit and leaves no file', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, hang: true });
  const t0 = Date.now();
  await expect(ensureFont3d('serif', { dirs: [d1], fetch, timeoutMs: 200 })).rejects.toThrow(/Noto Serif TC.*超過/);
  expect(Date.now() - t0).toBeLessThan(5000);
  expect(calls.every((c) => c.signal)).toBe(true);
  expect(readdirSync(d1)).toEqual([]);
}, 10000);

test('two runs at once each write their own temporary file, and the copy into the other folder lands whole', async () => {
  const { fetch } = fakeFetch({ status: 200, body: TTF(7, 8) });
  const [a, b] = await Promise.all([ensureFont3d('round', { dirs: [d1, d2], fetch }), ensureFont3d('round', { dirs: [d1, d2], fetch })]);
  expect(a.file).toBe(b.file);
  for (const d of [d1, d2]) {
    expect([...readFileSync(join(d, 'Huninn-400.ttf'))]).toEqual(TTF(7, 8));
    expect(readdirSync(d).filter((f) => f !== 'Huninn-400.ttf')).toEqual([]);
  }
});
