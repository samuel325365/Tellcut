// My blocks in the editor (spec 2026-10-29-my-library §3.2, §3.3): ☆ saves a project's own block, another project adds it from
// the My blocks group, and the copy lands in its fx/lib/ with meta.fx and the item in one edit.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e-library');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 15000) => expect.poll(fn, { timeout, interval: 150 });
const BOX = `export default [{ type: 'fx.box', label: 'Box', doc: 'a red box', kind: 'overlay', params: [],
  build: (ctx) => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:30%;background:#f00'; ctx.root.appendChild(el); return {}; }, draw: () => {} }];\n`;

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  for (const id of ['one', 'two']) {
    mkdirSync(join(root, id, 'fx'), { recursive: true });
    await makeSource(join(root, id, 'src.mp4'));
    const p = demoProject();
    Object.assign(p.meta, { name: id, duration: 4, ...(id === 'one' ? { fx: ['fx/box.js'] } : {}) });
    writeFileSync(join(root, id, 'project.json'), JSON.stringify(p, null, 2));
  }
  writeFileSync(join(root, 'one', 'fx', 'box.js'), BOX);
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist, libraryThumb: async () => {} }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1400, height: 820 }, locale: 'zh-TW' });
}, 120000);

afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('☆ saves a project block to My blocks; another project adds it from the My blocks group', async () => {
  await page.goto(`${base}/editor/?id=one`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await page.hover('[data-add-overlay="fx.box"]');
  await page.click('[data-save-block="fx.box"]');
  await page.waitForSelector('[data-save-dialog="block"]');
  await poll(() => page.locator('[data-save-notes]').textContent()).not.toContain('…');
  await page.fill('[data-save-name]', '紅盒子');
  await page.click('[data-save-confirm]');
  await page.waitForSelector('[data-lib-toast]');
  expect(existsSync(join(root, '_library', 'blocks', 'box', 'fx', 'box.js'))).toBe(true);
  await poll(() => page.locator('[data-save-block="fx.box"]').textContent()).toBe('★');

  await page.goto(`${base}/editor/?id=two`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await page.waitForSelector('[data-lib-group="block:mine"] [data-add-mine="fx.box"]');
  expect(await page.locator('[data-add-mine="fx.box"]').textContent()).toBe('紅盒子');
  await page.click('[data-add-mine="fx.box"]');
  await page.click('[data-add-picked]');
  const saved = () => { try { return JSON.parse(readFileSync(join(root, 'two', 'project.json'), 'utf8')); } catch { return null; } };
  await poll(() => saved()?.meta.fx).toEqual(['fx/lib/box/_entry.js']);
  expect(saved().tracks.flatMap((t: any) => t.items).some((i: any) => i.type === 'fx.box')).toBe(true);
  expect(existsSync(join(root, 'two', 'fx', 'lib', 'box', 'box.js'))).toBe(true);
  // the copy now shows as this project's, tagged; nothing is left to add from My blocks
  await page.waitForSelector('[data-lib-group="block:fx"] [data-from-mine="box"]');
  expect(await page.locator('[data-lib-group="block:mine"]').count()).toBe(0);
  // the copy, selected after adding, offers no ☆: saving it would only take the entry's place (final review C1)
  if (await page.locator('[data-tab="props"]').count()) await page.click('[data-tab="props"]');   // the side layout only; the stacked one always shows it
  await page.waitForSelector('[data-props]');
  expect(await page.locator('[data-props-save-block]').count()).toBe(0);
}, 120000);
