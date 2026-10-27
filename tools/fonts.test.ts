import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadFonts, mergeFontSpecs } from './fonts.ts';

test('downloads Google and direct fonts, rewrites the CSS to local files and skips what it has', async () => {
  const hits: string[] = [];
  let port = 0;
  const srv = createServer((req, res) => {
    hits.push(req.url!);
    if (req.url!.startsWith('/css2')) {
      const ua = req.headers['user-agent'] ?? '';
      res.end(`/* latin */\n@font-face { font-family: 'Noto Serif TC'; font-weight: 300; src: url(http://127.0.0.1:${port}/f/a.woff2) format('woff2'); unicode-range: U+0000-00FF; }\n` +
        `@font-face { font-family: 'Noto Serif TC'; font-weight: 300; src: url(http://127.0.0.1:${port}/f/b.woff2) format('woff2'); unicode-range: U+4E00-4EFF; }` + (ua.includes('Chrome') ? '' : 'BAD-UA'));
    } else if (req.url!.startsWith('/f/') || req.url === '/cubic.ttf') res.end(Buffer.from('font-bytes'));
    else { res.statusCode = 404; res.end(); }
  });
  port = await new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as any).port)));
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  try {
    const specs = ['Noto Serif TC:wght@300', { family: 'Cubic 11', url: `http://127.0.0.1:${port}/cubic.ttf` }];
    const r = await downloadFonts(specs, dir, { cssBase: `http://127.0.0.1:${port}` });
    expect(r.failed).toEqual([]);
    const css = readFileSync(join(dir, 'fonts.css'), 'utf8');
    expect(css).not.toContain('127.0.0.1');
    expect(css).not.toContain('BAD-UA');
    expect(css).toMatch(/url\(files\/[0-9a-f]{16}\.woff2\)/);
    expect(css).toContain("font-family: 'Cubic 11'");
    expect(css).toMatch(/url\(files\/[0-9a-f]{16}\.ttf\) format\('truetype'\)/);
    expect(readdirSync(join(dir, 'files'))).toHaveLength(3);
    expect(hits.find((h) => h.startsWith('/css2'))).toContain('family=Noto+Serif+TC:wght@300');
    hits.length = 0;
    await downloadFonts(specs, dir, { cssBase: `http://127.0.0.1:${port}` });
    expect(hits.filter((h) => !h.startsWith('/css2'))).toEqual([]);   // font files already here: not fetched again
    const bad = await downloadFonts([{ family: 'Nope', url: `http://127.0.0.1:${port}/missing.ttf` }], dir);
    expect(bad.failed).toEqual(['Nope']);
    expect(existsSync(join(dir, 'fonts.css'))).toBe(true);
  } finally { srv.close(); }
});

test('each Google family with the same axes is asked for once, with every weight; other axes and direct files stay as they are', () => {
  const direct = { family: 'Own', url: 'https://example.org/own.ttf' };
  expect(mergeFontSpecs(['Noto Sans TC:wght@400;500;700', 'Noto Serif TC:wght@400', 'Noto Sans TC:wght@500;700;900', direct, direct,
    'Cormorant Garamond:ital,wght@0,300;1,300', 'Cormorant Garamond:ital,wght@0,500;0,300', 'Inter', 'Inter'])).toEqual([
    'Noto Sans TC:wght@400;500;700;900', 'Noto Serif TC:wght@400', direct, 'Cormorant Garamond:ital,wght@0,300;0,500;1,300', 'Inter',
  ]);
});

test('a font file with a fixed name and face: false is downloaded under that name and left out of fonts.css', async () => {
  const srv = createServer((req, res) => { if (req.url === '/Inter-700.ttf') res.end(Buffer.from('ttf-bytes')); else { res.statusCode = 404; res.end(); } });
  const port = await new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as any).port)));
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  try {
    const r = await downloadFonts([{ family: 'Inter', url: `http://127.0.0.1:${port}/Inter-700.ttf`, weight: '700', file: 'Inter-700.ttf', face: false }], dir);
    expect(r.failed).toEqual([]);
    expect(existsSync(join(dir, 'files', 'Inter-700.ttf'))).toBe(true);
    expect(readFileSync(join(dir, 'fonts.css'), 'utf8')).not.toContain('Inter-700.ttf');
  } finally { srv.close(); }
});

test('mergeFontSpecs keeps a download-only file next to the same family from Google', () => {
  const file = { family: 'Inter', url: 'https://x/i.ttf', weight: '700', file: 'Inter-700.ttf', face: false };
  expect(mergeFontSpecs(['Inter:wght@300', 'Inter:wght@400;600;700', file])).toEqual(['Inter:wght@300;400;600;700', file]);
});

test('offline, a family whose CSS cannot be fetched keeps its faces from the last fonts.css instead of vanishing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  const css = (fam: string, n: string) => `/* latin */\n@font-face {\n  font-family: '${fam}';\n  src: url(https://g.test/${n}.woff2) format('woff2');\n}\n`;
  const online = (async (url: string) => {
    if (url.includes('family=Noto+Sans+TC')) return new Response(css('Noto Sans TC', 'sans'));
    if (url.includes('family=Inter')) return new Response(css('Inter', 'inter'));
    return new Response(Buffer.from('font-bytes'));
  }) as typeof fetch;
  const offline = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  const specs = ['Noto Sans TC:wght@400', 'Inter:wght@400', { family: 'Cubic 11', url: 'https://x.test/cubic.ttf' }];
  expect((await downloadFonts(specs, dir, { fetch: online })).failed).toEqual([]);
  const before = readFileSync(join(dir, 'fonts.css'), 'utf8');
  expect(before.match(/@font-face/g)).toHaveLength(3);
  const r = await downloadFonts(specs, dir, { fetch: offline });
  expect(r.failed).toEqual(['Noto Sans TC', 'Inter']);
  const after = readFileSync(join(dir, 'fonts.css'), 'utf8');
  expect(after.match(/@font-face/g)).toHaveLength(3);            // all three faces still declared
  for (const fam of ['Noto Sans TC', 'Inter', 'Cubic 11']) expect(after).toContain(`font-family: '${fam}'`);
  expect(after).toMatch(/url\(files\/[0-9a-f]{16}\.woff2\)/);
  // one whose font file is gone is not kept (it would point at nothing)
  for (const f of readdirSync(join(dir, 'files'))) if (f.endsWith('.woff2')) rmSync(join(dir, 'files', f));
  await downloadFonts(specs, dir, { fetch: offline });
  expect(readFileSync(join(dir, 'fonts.css'), 'utf8').match(/@font-face/g)).toHaveLength(1);
});
