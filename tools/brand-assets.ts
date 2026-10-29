// Tellcut's own logo files (spec 2026-10-30-showcase-films §1), made from the one dachshund in plugin-common/src/dachshund.ts:
//   npm run brand-assets            → docs/brand/*.svg, the icon as PNG (32–512 px), and tools/fixtures/brand/tellcut.svg
// The wordmark is Nunito 800 (a Tellcut font, so films can set it as text too) turned into paths, so the files need no font.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import opentype from 'opentype.js';
import { chromium } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { DOG_COLORS, dogSvg, type DogLook } from '@tellcut/plugin-common';

const CACHE = join(TELLCUT_ROOT, '.cache', 'brand');
const PNG_SIZES = [32, 64, 128, 256, 512];
/** the wordmark's ink and the tagline's, per look */
const WORDS: Record<DogLook, { name: string; tag: string }> = { light: { name: '#161412', tag: '#5e5246' }, dark: { name: '#f4ebdd', tag: '#cdbfa8' } };

/** Nunito 800 as a TTF in .cache/brand/, downloaded the first time. Google's css2 API names a whole .ttf to a client that is not
 *  a browser (tools/font3d.ts does the same). */
export async function ensureNunito(get: typeof fetch = fetch): Promise<string> {
  const file = join(CACHE, 'Nunito-800.ttf');
  if (existsSync(file)) return file;
  const css = await (await get('https://fonts.googleapis.com/css2?family=Nunito:wght@800')).text();
  const url = /url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
  if (!url) throw new Error('Google Fonts did not name a Nunito TTF');
  const res = await get(url);
  if (!res.ok) throw new Error(`Nunito download failed: ${res.status}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(`${file}.tmp`, Buffer.from(await res.arrayBuffer()));
  renameSync(`${file}.tmp`, file);
  return file;
}

const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

/** the dog with "Tellcut" and "Tell it. Cut it." to its right, the words as paths */
function lockup(font: opentype.Font, look: DogLook): string {
  const ink = WORDS[look], nameSize = 54, tagSize = 17, x = 168;
  const name = font.getPath('Tellcut', x, 50, nameSize), tag = font.getPath('Tell it. Cut it.', x + 2, 72, tagSize);
  const w = Math.ceil(x + Math.max(font.getAdvanceWidth('Tellcut', nameSize), font.getAdvanceWidth('Tell it. Cut it.', tagSize) + 2) + 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 80">${inner(dogSvg({ look, holes: 'cut' }))}`
    + `<path d="${name.toPathData(2)}" fill="${ink.name}"/><path d="${tag.toPathData(2)}" fill="${ink.tag}"/></svg>`;
}

/** Every logo file into `outDir`; with `png`, the light icon as PNG at 32–512 px too. Returns the files written. */
export async function buildBrandAssets(o: { outDir: string; fontFile: string; png: boolean }): Promise<string[]> {
  const b = readFileSync(o.fontFile), font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const svgs: Record<string, string> = {
    'tellcut-logo.svg': dogSvg({ look: 'light', holes: 'cut' }),
    'tellcut-logo-dark.svg': dogSvg({ look: 'dark', holes: 'cut' }),
    'tellcut-icon.svg': dogSvg({ look: 'light', holes: 'paint', icon: true, tile: DOG_COLORS.light.hole }),
    'tellcut-icon-dark.svg': dogSvg({ look: 'dark', holes: 'paint', icon: true, tile: DOG_COLORS.dark.hole }),
    'tellcut-icon-16.svg': dogSvg({ look: 'light', holes: 'paint', icon: true, tile: DOG_COLORS.light.hole, size: 16 }),
    'tellcut-lockup.svg': lockup(font, 'light'),
    'tellcut-lockup-dark.svg': lockup(font, 'dark'),
  };
  mkdirSync(o.outDir, { recursive: true });
  const files = Object.entries(svgs).map(([name, svg]) => { const f = join(o.outDir, name); writeFileSync(f, `${svg}\n`); return f; });
  if (!o.png) return files;
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    const page = await browser.newPage();
    for (const px of PNG_SIZES) {
      await page.setViewportSize({ width: px, height: px });
      await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svgs['tellcut-icon.svg'].replace('<svg ', `<svg width="${px}" height="${px}" `)}`);
      const f = join(o.outDir, `tellcut-icon-${px}.png`);
      await page.screenshot({ path: f, omitBackground: true });
      files.push(f);
    }
  } finally { await browser.close(); }
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = join(TELLCUT_ROOT, 'docs', 'brand');
  const files = await buildBrandAssets({ outDir: out, fontFile: await ensureNunito(), png: true });
  copyFileSync(join(out, 'tellcut-logo.svg'), join(TELLCUT_ROOT, 'tools', 'fixtures', 'brand', 'tellcut.svg'));
  for (const f of files) console.log(f);
  console.log('→ tools/fixtures/brand/tellcut.svg');
}
