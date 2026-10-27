// End-to-end: the timeline's scrollbar and zoom slider, double-click to play an item, and the library audition.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e6');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const disk = () => JSON.parse(readFileSync(join(root, 'long', 'project.json'), 'utf8'));
const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
const clock = () => page.locator('.transport .clock').textContent();

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'long'), { recursive: true });
  await makeSource(join(root, 'long', 'src.mp4'));
  const p = demoProject();
  Object.assign(p.meta, { width: 1920, height: 1080, duration: 120 });   // 120 s: fitting it would need 11 px/s
  writeFileSync(join(root, 'long', 'project.json'), JSON.stringify(p, null, 2));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=long`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('a long project is not squeezed: the scrollbar thumb drags through time and the slider zooms', async () => {
  const track = await box('[data-hscroll]'), thumb = await box('[data-hthumb]');
  expect(thumb.width).toBeLessThan(track.width * 0.7);                 // at 20 px/s only part of the 121 s is in view
  const x0 = (await box('[data-item-id="c"]')).x;
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down();
  await page.mouse.move(thumb.x + thumb.width / 2 + 200, thumb.y + thumb.height / 2, { steps: 5 });
  await page.mouse.up();
  await poll(async () => (await box('[data-item-id="c"]')).x).toBeLessThan(x0 - 300);   // the clip at 0 s went out to the left
  await page.locator('[data-zoom]').fill('0');
  await poll(async () => Math.round((await box('[data-hthumb]')).width)).toBe(Math.round(track.width));   // all of it in view
}, 60000);

test('double-clicking a clip on the timeline plays its raw material alone; "play the result" goes back to the finished video', async () => {
  const rows = await page.locator('[data-row]').count();
  await page.locator('[data-item-id="c"]').dblclick();
  await page.waitForSelector('[data-audition]');
  expect(await page.locator('[data-row]').count()).toBe(rows);                          // the timeline keeps the real tracks
  expect(await page.locator('[data-audition-add]').count()).toBe(0);   // it is in the project already
  await page.click('[data-audition-result]');
  await page.waitForSelector('[data-audition]', { state: 'detached' });
  expect(await page.locator('[data-row]').count()).toBe(rows);
  await poll(clock).not.toMatch(/^0:00\.00/);                          // the finished video plays from the clip's start
  await page.keyboard.press('Space');
  await page.locator('[data-item-id="c"]').dblclick({ modifiers: ['Shift'] });   // Shift: straight to the finished video
  await poll(clock).not.toMatch(/^0:00\.00/);
  expect(await page.locator('[data-audition]').count()).toBe(0);
  await page.keyboard.press('Space');
}, 60000);

test('a timeline item auditions where it is: the clock runs over the item, not from 0', async () => {
  await page.keyboard.press('End');                                    // away from 0: a reading under 0.5 s means "played from 0"
  await poll(clock).toMatch(/^2:00\.00/);
  await page.locator('[data-item-id="f"]').dblclick();                // the flash, 0.5–0.8 s
  const seen: number[] = [];
  for (let i = 0; i < 12; i++) {
    const [m, s] = (await clock())!.split(' / ')[0].split(':');
    seen.push(Number(m) * 60 + Number(s));
    await page.waitForTimeout(25);
  }
  expect(Math.min(...seen)).toBeGreaterThanOrEqual(0.4);                // a play reports up to 50 ms before its start (audio lead-in)
  await page.waitForSelector('[data-audition]', { state: 'detached' });
  await poll(clock).toMatch(/^0:00\.50/);                              // back at the item's start
}, 60000);

test('double-clicking a library segment auditions it alone; it ends by itself and leaves the project as it was', async () => {
  await page.keyboard.press('Home');
  await poll(clock).toMatch(/^0:00\.00/);
  const rows = await page.locator('[data-row]').count();
  await page.locator('[data-add-source="s1"]').first().dblclick();
  await page.waitForSelector('[data-audition]');
  // the banner sits above the picture, not over it (it hid the top of a narrow 9:16 preview)
  const banner = await box('[data-audition]'), view = await box('.preview iframe');
  expect(banner.y + banner.height).toBeLessThanOrEqual(view.y + 0.5);
  expect(await page.locator('[data-row]').count()).toBe(rows);         // the temporary tracks go to the preview only
  await poll(clock).not.toMatch(/^0:00\.00/);
  await page.waitForSelector('[data-audition]', { state: 'detached', timeout: 15000 });
  expect(await page.locator('[data-row]').count()).toBe(rows);
  await poll(clock).toMatch(/^0:00\.00/);
  expect(await page.locator('.toolbar .player-error').count()).toBe(0);
  expect(disk().tracks.length).toBe(2);
}, 60000);

test('Esc ends an audition; "add" in its banner keeps the material', async () => {
  await page.locator('[data-add-overlay="core.flash"]').dblclick();
  await page.waitForSelector('[data-audition]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-audition]', { state: 'detached' });
  expect(disk().tracks.flatMap((t: any) => t.items).filter((i: any) => i.type === 'core.flash').length).toBe(1);
  await page.locator('[data-add-overlay="core.flash"]').dblclick();
  await page.click('[data-audition-add]');
  await poll(() => disk().tracks.flatMap((t: any) => t.items).filter((i: any) => i.type === 'core.flash').length).toBe(2);
  expect(disk().tracks.some((t: any) => t.muted)).toBe(false);
}, 60000);
