// End-to-end for M8 and the playback fixes: click-to-seek, instant first play, export from the toolbar, library music, preview quality.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { run } from '@tellcut/media-node';
import { demoProject } from '@tellcut/server/test-utils';
import { openProject, poller, projectsRoot, readProject, startEditor, stopEditor, writeProject, type App } from '../e2e-kit.ts';

const root = projectsRoot('_e2e3');
let app: App, base: string, browser: Browser, page: Page;
const disk = () => readProject(root, 'demo');
const poll = poller(100, 10000);
const clock = () => page.locator('.clock').textContent();

beforeAll(async () => {
  const setup = async () => {
    mkdirSync(join(root, 'demo/media'), { recursive: true });
    await run(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', join(root, 'demo/media/tone.wav')]);
    const p = demoProject({ media: { tone: { path: 'media/tone.wav' } } });
    p.meta.duration = 4;
    p.tracks.push({ id: 'mu', kind: 'music', gain: 0, items: [{ id: 'm', media: 'tone', in: 0, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0 }] });
    await writeProject(root, 'demo', p);
  };
  // no autoplay flag: the same policy a person's Chrome applies
  ({ app, base, browser, page } = await startEditor({ root, setup, analyze: 'demo', viewport: { width: 1600, height: 900 }, open: 'demo', waitFor: '[data-item-id="c"]' }));
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

test('clicking an empty spot on the timeline jumps there, and play starts within a second', async () => {
  // the overlay track only has a flash at 0.5–0.8 s: around 3 s it is empty
  const row = await page.locator('[data-row="o"]').boundingBox();
  await page.mouse.click(row!.x + 140 + (row!.width - 140) * 0.75, row!.y + row!.height / 2);
  await poll(clock).not.toMatch(/^0:00\.00/);
  const at = await clock();
  await page.waitForTimeout(1500);                                              // let the background decode finish
  await page.keyboard.press('Space');
  await poll(clock, 1000).not.toBe(at);
  await page.keyboard.press('Space');
}, 60000);

test('library music, preview quality', async () => {
  await page.click('[data-lib-tab="audio"]');
  await page.click('[data-add-music="tone"]');
  await page.click('[data-add-picked]');
  await poll(() => disk().tracks.find((t: any) => t.id === 'mu').items.length).toBe(2);
  await page.selectOption('[data-quality]', 'draft');
  await poll(() => page.frameLocator('iframe').locator('body').evaluate((b) => b.classList.contains('draft'))).toBe(true);
}, 60000);

test('export from the toolbar: progress, result link, history', async () => {
  await page.click('[data-export]');
  await page.waitForSelector('[data-export-progress], [data-export-result]', { timeout: 30000 });
  const link = page.locator('[data-export-result]');
  await link.waitFor({ timeout: 180000 });
  const href = await link.getAttribute('href');
  expect((await fetch(`${base}${href}`)).status).toBe(200);
  await poll(() => page.locator('[data-export-entry]').count()).toBe(1);
}, 240000);

test('on a small screen the lower tracks can be scrolled into view with the wheel', async () => {
  // a fresh window opened on a small screen; the demo's few tracks overflow a 420 px window
  const small = await browser.newPage({ viewport: { width: 1280, height: 420 }, locale: 'zh-TW' });
  try {
    await openProject(small, base, 'demo');
    const tracks = small.locator('[data-tracks]');
    const box = (await tracks.boundingBox())!;
    expect(await tracks.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await small.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await small.mouse.wheel(0, 400);
    await poll(() => tracks.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    const mu = (await small.locator('[data-row="mu"]').boundingBox())!;
    expect(mu.y + mu.height).toBeLessThanOrEqual(box.y + box.height + 1);   // the last track is now inside the visible area
  } finally { await small.close(); }
}, 60000);
