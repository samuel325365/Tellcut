import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSite } from './site.ts';

const FIXTURE = readFileSync(join(__dirname, 'fixtures/site/index.html'), 'utf8');
const PLAIN = '<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system, BlinkMacSystemFont"><p>No heading here.</p></body></html>';
const srv = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(req.url === '/plain' ? PLAIN : FIXTURE); });
let base = '', tmpProject = '';
beforeAll(async () => { base = `http://127.0.0.1:${await new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as any).port)))}`; });
afterAll(() => new Promise<void>((r) => srv.close(() => r())));
beforeEach(() => { tmpProject = mkdtempSync(join(tmpdir(), 'site-')); });
afterEach(() => rmSync(tmpProject, { recursive: true, force: true }));

test('site: colours by area, the heading and body fonts, a screenshot', async () => {
  const s = await readSite(`${base}/`, tmpProject);
  expect(s.colors[0]).toBe('#101418');
  expect(s.colors).toContain('#e60012');
  expect(s.colors.length).toBeLessThanOrEqual(6);
  expect(s.fonts).toEqual({ heading: 'Georgia', body: 'Segoe UI' });
  expect(s.title).toBe('Lumen Harbor - lights for small studios');
  expect(s.description).toMatch(/LED panels/);
  expect(s.image).toBe(`${base}/og.jpg`);
  expect(s.screenshot).toBe('media/brand/site.png');
  expect(existsSync(join(tmpProject, 'media/brand/site.png'))).toBe(true);
  expect(JSON.parse(readFileSync(join(tmpProject, 'media/brand/site.json'), 'utf8')).title).toBe(s.title);
});

test('fonts: first family of the stack, null without a heading', async () => {
  const s = await readSite(`${base}/plain`, tmpProject);
  expect(s.fonts).toEqual({ heading: null, body: '-apple-system' });
  expect(s.colors[0]).toBe('#fafafa');
  expect(s.image).toBeNull();
});

test('an unreachable site fails in one line', async () => {
  await expect(readSite('http://127.0.0.1:9/', tmpProject, { timeoutMs: 5000 })).rejects.toThrow(/讀不到官網/);
  expect(existsSync(join(tmpProject, 'media/brand/site.png'))).toBe(false);
});
