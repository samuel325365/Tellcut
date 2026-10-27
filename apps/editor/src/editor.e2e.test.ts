// End-to-end (spec §9.3, M4/M5 part): editor → drag, trim, undo → project.json and the preview change → export.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { makeProjects, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;

const onDisk = () => JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8')).tracks[0].items[0];
const shot = async () => page.locator('iframe').screenshot();
// the toolbar may still say "saved" for a moment after an edit, so wait on the file itself
const poll = <T>(fn: () => T) => expect.poll(fn, { timeout: 10000, interval: 200 });

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  makeProjects(root);
  await makeSource(join(root, 'demo/src.mp4'));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  const jobs = (await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).jobs;
  for (const j of jobs) await app.queue.wait(j.id);
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=demo`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await page.waitForSelector('[data-item-id="c"]');
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('drag, trim and undo change project.json and the preview', async () => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');   // playhead 0.1 s (30 fps)
  await page.waitForTimeout(500);
  const before = await shot();

  const clip = await page.locator('[data-item-id="c"]').boundingBox();
  await page.mouse.move(clip!.x + clip!.width / 2, clip!.y + clip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(clip!.x + clip!.width / 2 + 60, clip!.y + clip!.height / 2, { steps: 6 });
  await page.mouse.up();
  await poll(() => onDisk().start).toBeGreaterThan(0.1);
  const moved = onDisk();
  await page.waitForTimeout(500);
  expect((await shot()).equals(before)).toBe(false);   // at 0.1 s the clip no longer covers the frame

  const end = await page.locator('[data-item-id="c"] [data-edge="end"]').boundingBox();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2 - 40, end!.y + end!.height / 2, { steps: 4 });
  await page.mouse.up();
  await poll(() => onDisk().end).toBeLessThan(moved.end);

  await page.keyboard.press('Control+z');
  await poll(() => onDisk().end).toBeCloseTo(moved.end, 6);
  await page.waitForSelector('[data-save="saved"]');
}, 120000);

test('the edited project exports', async () => {
  const job = await (await fetch(`${base}/api/projects/demo/export`, { method: 'POST' })).json();
  expect((await app.queue.wait(job.id)).status).toBe('done');
}, 180000);
