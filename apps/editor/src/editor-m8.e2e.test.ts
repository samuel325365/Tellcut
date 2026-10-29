// End-to-end for M8 and the playback fixes: click-to-seek, instant first play, export from the toolbar, library music, preview quality.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT, run } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e3');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const disk = () => JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8'));
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const clock = () => page.locator('.clock').textContent();

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'demo/media'), { recursive: true });
  await makeSource(join(root, 'demo/src.mp4'));
  await run(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', join(root, 'demo/media/tone.wav')]);
  const p = demoProject({ media: { tone: { path: 'media/tone.wav' } } });
  p.meta.duration = 4;
  p.tracks.push({ id: 'mu', kind: 'music', gain: 0, items: [{ id: 'm', media: 'tone', in: 0, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0 }] });
  writeFileSync(join(root, 'demo/project.json'), JSON.stringify(p, null, 2));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  for (const j of (await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).jobs) await app.queue.wait(j.id);
  // no autoplay flag: the same policy a person's Chrome applies
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=demo`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await page.waitForSelector('[data-item-id="c"]');
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

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
    await small.goto(`${base}/editor/?id=demo`);
    await small.waitForSelector('[data-player="ready"]', { timeout: 30000 });
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
