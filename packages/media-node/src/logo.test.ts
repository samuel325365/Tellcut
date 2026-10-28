import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './ffmpeg.ts';
import { contrastRatio, importLogo, inspectLogo, logoContrastWarning } from './logo.ts';

const fixture = (f: string) => fileURLToPath(new URL(`../../../tools/fixtures/brand/${f}`, import.meta.url));
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a: string, b: string, d = 24) => hex(a).every((v, i) => Math.abs(v - hex(b)[i]) <= d);
let dir: string;
// a project folder: importLogo refuses a folder without project.json
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'logo-')); writeFileSync(join(dir, 'project.json'), '{}'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('the Tellcut SVG is extrudable and its colours are the blue and the white', async () => {
  const i = await inspectLogo(fixture('tellcut.svg'));
  expect(i).toMatchObject({ kind: 'svg', width: 32, height: 32, extrudable: true });
  expect(i.colors.slice(0, 2)).toEqual(['#2f8cff', '#f6f7f9']);
});

test('inspectLogo tells why an SVG cannot be extruded', async () => {
  const svg = (body: string) => { const f = join(dir, `${Math.random().toString(36).slice(2)}.svg`); writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">${body}</svg>`); return f; };
  const text = await inspectLogo(svg('<text x="0" y="30" fill="#123456">ACME</text>'));
  expect(text).toMatchObject({ extrudable: false, why: expect.stringContaining('文字') });
  const image = await inspectLogo(svg('<image href="data:image/png;base64,AAAA" width="10" height="10"/><rect width="10" height="10" fill="#ff0000"/>'));
  expect(image).toMatchObject({ extrudable: false, why: expect.stringContaining('點陣圖') });
  const stroke = await inspectLogo(svg('<path d="M0 0 L100 40" fill="none" stroke="#000"/>'));
  expect(stroke).toMatchObject({ extrudable: false, why: expect.stringContaining('描邊') });
  expect((await inspectLogo(svg('<rect width="100" height="40" fill="#abc"/>'))).colors).toEqual(['#aabbcc']);
});

test('a transparent PNG is transparent and its colours come from its opaque pixels', async () => {
  const i = await inspectLogo(fixture('bakery.png'));
  expect(i).toMatchObject({ kind: 'png', width: 256, height: 256, transparent: true });
  expect(near(i.colors[0], '#c8752a')).toBe(true);
  expect(i.colors.some((c) => near(c, '#5a3418'))).toBe(true);
});

test('the colours of a logo on white leave the white out', async () => {
  const jpg = join(dir, 'w.jpg');
  await run(['-f', 'lavfi', '-i', 'color=c=white:s=200x200,drawbox=x=50:y=50:w=100:h=100:color=0x1f7a5c:t=fill', '-frames:v', '1', jpg]);
  const i = await inspectLogo(jpg);
  expect(i).toMatchObject({ kind: 'jpg', width: 200, height: 200, transparent: false });
  expect(near(i.colors[0], '#1f7a5c')).toBe(true);
  expect(i.colors.some((c) => near(c, '#ffffff', 30))).toBe(false);
});

test('importLogo copies into media/brand and replaces an older logo of another format', async () => {
  const a = await importLogo(dir, fixture('tellcut.svg'));
  expect(a.path).toBe('media/brand/logo.svg');
  expect(existsSync(join(dir, 'media/brand/logo.svg'))).toBe(true);
  const b = await importLogo(dir, fixture('bakery.png'));
  expect(b.path).toBe('media/brand/logo.png');
  expect(existsSync(join(dir, 'media/brand/logo.svg'))).toBe(false);
  await expect(importLogo(dir, join(dir, 'nope.gif'))).rejects.toThrow(/SVG、PNG、JPG、WebP/);
});


// review fixes (plan 3 final review)
test('fill none inherited from <svg> or <g>, a fill:none class, a gradient fill or a mix with stroke-only shapes is not extrudable', async () => {
  const svg = (s: string) => { const f = join(dir, `${Math.random().toString(36).slice(2)}.svg`); writeFileSync(f, s); return f; };
  const cases = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4 L20 20"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#000"><path d="M4 4 L20 20"/></g></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.a{fill:none;stroke:#000}</style><path class="a" d="M4 4 L20 20"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="10" height="10" fill="#f00"/><circle cx="16" cy="16" r="6" fill="none" stroke="#000"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"/></defs><rect width="24" height="24" fill="url(#g)"/></svg>',
  ];
  for (const c of cases) expect((await inspectLogo(svg(c))).extrudable, c).toBe(false);
  expect((await inspectLogo(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#2f8cff"><path d="M0 0 L24 0 L24 24 Z"/></g></svg>'))).extrudable).toBe(true);
});

test('importing the logo that is already in the project keeps it', async () => {
  const first = await importLogo(dir, fixture('tellcut.svg'));
  const again = await importLogo(dir, join(dir, first.path));
  expect(again.path).toBe('media/brand/logo.svg');
  expect(existsSync(join(dir, 'media/brand/logo.svg'))).toBe(true);
  expect(again.info.extrudable).toBe(true);
});

// review fixes (brand plan 3 minors, 2026-10-27)
test('an SVG drawn on a white page rect: the page is not a colour; a smaller white rect or a coloured page is', async () => {
  const svg = (vb: string, body: string) => { const f = join(dir, `${Math.random().toString(36).slice(2)}.svg`); writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`); return f; };
  const tri = '<path d="M10 10 L90 10 L50 35 Z" fill="#c8102e"/>';
  expect((await inspectLogo(svg('0 0 100 40', `<rect width="100%" height="100%" fill="#ffffff"/>${tri}`))).colors).toEqual(['#c8102e']);
  expect((await inspectLogo(svg('-50 -20 100 40', `<rect x="-50" y="-20" width="100" height="40" style="fill:#fff"/>${tri}`))).colors).toEqual(['#c8102e']);
  expect((await inspectLogo(svg('0 0 100 40', `<rect x="10" y="10" width="20" height="10" fill="#fff"/>${tri}`))).colors).toContain('#ffffff');
  expect((await inspectLogo(svg('0 0 100 40', `<rect width="100" height="40" fill="#123456"/>${tri}`))).colors).toContain('#123456');
});

test('a full-bleed badge keeps its colour: white letters on red come out red', async () => {
  const png = join(dir, 'badge.png');
  await run(['-f', 'lavfi', '-i', 'color=c=0xc8102e:s=200x120,drawbox=x=50:y=40:w=100:h=40:color=white:t=fill', '-frames:v', '1', png]);
  const i = await inspectLogo(png);
  expect(i.transparent).toBe(false);
  expect(near(i.colors[0], '#c8102e')).toBe(true);
});

test('a plain grey ground is still left out', async () => {
  const png = join(dir, 'grey.png');
  await run(['-f', 'lavfi', '-i', 'color=c=0xe0e0e0:s=200x200,drawbox=x=50:y=50:w=100:h=100:color=0x1f7a5c:t=fill', '-frames:v', '1', png]);
  const i = await inspectLogo(png);
  expect(near(i.colors[0], '#1f7a5c')).toBe(true);
  expect(i.colors.some((c) => near(c, '#e0e0e0', 12))).toBe(false);
});

test('a picture under 64 px finds its corners after the upscale', async () => {
  const png = join(dir, 'small.png');
  // a green stripe down the middle: corners read at the unscaled size would land on it
  await run(['-f', 'lavfi', '-i', 'color=c=0x808080:s=32x16,drawbox=x=8:y=0:w=16:h=16:color=0x1f7a5c:t=fill', '-frames:v', '1', png]);
  const i = await inspectLogo(png);
  expect(near(i.colors[0], '#1f7a5c')).toBe(true);
  expect(i.colors.some((c) => near(c, '#808080', 12))).toBe(false);
});

test('importLogo into a folder that is not a project creates nothing', async () => {
  const typo = join(dir, 'typo');
  await expect(importLogo(typo, fixture('tellcut.svg'))).rejects.toThrow(/找不到專案/);
  expect(existsSync(typo)).toBe(false);
});

test('a logo that hardly shows on the background is warned about', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
  const black = { kind: 'png' as const, width: 10, height: 10, colors: ['#050505'] };
  expect(logoContrastWarning(black, '#1a1a1a')).toMatch(/對比.*淺色背景（例如 #f4f1ea）/);
  expect(logoContrastWarning({ ...black, colors: ['#2f8cff'] }, '#1a1a1a')).toBeNull();
  expect(logoContrastWarning({ ...black, colors: ['#f6f7f9'] }, '#ffffff')).toMatch(/深色/);
  // an SVG that names no colour is drawn black
  expect(logoContrastWarning({ kind: 'svg', width: 10, height: 10, colors: [] }, '#0d0f14')).toMatch(/#000000/);
  expect(logoContrastWarning({ kind: 'png', width: 10, height: 10, colors: [] }, '#0d0f14')).toBeNull();
});
