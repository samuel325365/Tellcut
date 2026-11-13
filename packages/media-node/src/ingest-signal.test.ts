// A cancelled import stops its downloads (the caller's signal reaches yt-dlp) and fails as a whole instead of counting the URL as skipped.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, ytDlp } from './ingest.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ingest-signal-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('ytDlp with a cancelled signal starts nothing and rejects as an abort', async () => {
  const ac = new AbortController();
  ac.abort();
  await expect(ytDlp('https://example.invalid/v', join(dir, 'media'), false, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
});

test('createProject hands its signal to the download, and a cancel stops the import without writing a project', async () => {
  const ac = new AbortController(), seen: Array<AbortSignal | undefined> = [];
  const download = (_url: string, _dir: string, _audio: boolean, signal?: AbortSignal) => {
    seen.push(signal);
    return new Promise<string>((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  };
  const run = createProject({ id: 'p', inputs: ['https://example.invalid/v'], projectsDir: dir, download, signal: ac.signal });
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toBe(ac.signal);
  ac.abort();
  await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  expect(existsSync(join(dir, 'p', 'project.json'))).toBe(false);
});

test('a download that fails on its own is still a skipped URL', async () => {
  const download = async () => { throw new Error('404'); };
  await expect(createProject({ id: 'p', inputs: ['https://example.invalid/v'], projectsDir: dir, download })).rejects.toThrow(/No usable media[\s\S]*404/);
});
