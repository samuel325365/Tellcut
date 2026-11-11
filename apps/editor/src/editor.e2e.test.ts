// End-to-end (spec §9.3, M4/M5 part): editor → drag, trim, undo → project.json and the preview change → export.
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { makeProjects, makeSource } from '@tellcut/server/test-utils';
import { poller, projectsRoot, readProject, startEditor, stopEditor, type App } from '../e2e-kit.ts';

const root = projectsRoot('_e2e');
let app: App, base: string, browser: Browser, page: Page;

const onDisk = () => readProject(root, 'demo').tracks[0].items[0];
const shot = async () => page.locator('iframe').screenshot();
// the toolbar may still say "saved" for a moment after an edit, so wait on the file itself
const poll = poller(200, 10000);

beforeAll(async () => {
  ({ app, base, browser, page } = await startEditor({ root, autoplay: true, viewport: { width: 1600, height: 900 }, analyze: 'demo', open: 'demo', waitFor: '[data-item-id="c"]',
    setup: async () => { makeProjects(root); await makeSource(join(root, 'demo/src.mp4')); } }));
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

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
