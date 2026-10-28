// End-to-end for the timeline refresh (spec 2026-10-28-timeline-refresh): screenshots for a person to look at, and the
// timeline's own controls in a real browser.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { makeSource, startApp } from '../../server/src/test-utils.ts';
import { denseProject } from '../../../tools/fixtures/dense.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e_tl');
const shots = join(TELLCUT_ROOT, '.cache/timeline-shots');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const open = async (id: string) => { await page.goto(`${base}/editor/?id=${id}`); await page.waitForSelector('[data-player="ready"]', { timeout: 30000 }); };

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  for (const [id, width, height] of [['dense', 1920, 1080], ['tall', 1080, 1920]] as const) {
    mkdirSync(join(root, id), { recursive: true });
    await makeSource(join(root, id, 'src.mp4'));
    writeFileSync(join(root, id, 'project.json'), JSON.stringify(denseProject({ width, height }), null, 2));
  }
  // a real agent-made project's timeline (its footage is not in the fixture: the clips show as offline)
  cpSync(join(TELLCUT_ROOT, 'tools/fixtures/baking4-guide'), join(root, 'baking'), { recursive: true });
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
}, 120000);

afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('screenshots for review: the dense project and baking4-guide, stacked and side by side', async () => {
  const out: string[] = [];
  for (const id of ['dense', 'tall', 'baking']) {
    for (const arrange of ['stacked', 'side'] as const) {
      await page.goto(`${base}/editor/`);
      await page.evaluate((a) => localStorage.setItem('tellcut.layout', JSON.stringify({ arrange: { landscape: a, portrait: a } })), arrange);
      if (id === 'baking') { await page.goto(`${base}/editor/?id=${id}`); await page.waitForSelector('.timeline [data-item-id]', { timeout: 30000 }); }
      else await open(id);
      await page.waitForTimeout(500);
      expect(await page.locator('.timeline [data-item-id]').count()).toBeGreaterThan(10);
      const file = join(shots, `${id}-${arrange}.png`);
      await page.screenshot({ path: file });
      out.push(file);
    }
  }
  await page.evaluate(() => localStorage.removeItem('tellcut.layout'));
  console.log(`timeline screenshots:\n${out.join('\n')}`);
}, 180000);

test('dragging the playhead head scrubs', async () => {
  await open('dense');
  const clock = () => page.locator('.clock').innerText();
  const before = await clock();
  const head = (await page.locator('[data-playhead-head]').boundingBox())!;
  await page.mouse.move(head.x + head.width / 2, head.y + 3);
  await page.mouse.down();
  await page.mouse.move(head.x + 300, head.y + 3, { steps: 6 });
  await page.mouse.up();
  await poll(clock).not.toBe(before);
}, 60000);
