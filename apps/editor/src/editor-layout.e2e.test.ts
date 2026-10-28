// End-to-end for the layout: a laptop-sized window (1536×864) shows a big preview for landscape and portrait projects.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e5');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const frameBox = async () => (await page.locator('iframe').boundingBox())!;
const stageBox = async () => (await page.frameLocator('iframe').locator('#stage').boundingBox())!;

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  for (const [id, width, height] of [['wide', 1920, 1080], ['tall', 1080, 1920], ['aud', 1920, 1080]] as const) {
    mkdirSync(join(root, id), { recursive: true });
    await makeSource(join(root, id, 'src.mp4'));
    const p = demoProject();
    Object.assign(p.meta, { width, height, duration: 2 });
    if (id === 'aud') p.tracks.push({ id: 'mus', kind: 'audio', name: 'Music', gain: 0, items: [] } as any);
    writeFileSync(join(root, id, 'project.json'), JSON.stringify(p, null, 2));
  }
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('landscape: the preview takes most of the height; dragging the splitter and F resize it', async () => {
  await page.goto(`${base}/editor/?id=wide`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  const h0 = (await frameBox()).height;
  expect(h0).toBeGreaterThan(420);                                   // was 335 in the old 45% layout
  const sp = (await page.locator('[data-splitter="rows"]').boundingBox())!;
  await page.mouse.move(sp.x + 300, sp.y + 2);
  await page.mouse.down();
  await page.mouse.move(sp.x + 300, sp.y - 98, { steps: 5 });
  await page.mouse.up();
  await poll(async () => (await frameBox()).height).toBeLessThan(h0 - 80);
  await page.keyboard.press('f');
  await poll(async () => (await frameBox()).height).toBeGreaterThan(700);
  await page.keyboard.press('f');
  await page.locator('[data-splitter="rows"]').dblclick();
  await poll(async () => Math.round((await frameBox()).height)).toBe(Math.round(h0));
}, 60000);

test('portrait: the preview is a full-height column, so the 9:16 video is shown large', async () => {
  await page.goto(`${base}/editor/?id=tall`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await poll(async () => (await stageBox()).height).toBeGreaterThan(700);   // was about 335 tall when the preview sat above the timeline
  expect(await page.locator('[data-side] [data-tab]').count()).toBe(3);   // 素材、屬性、對話
}, 60000);
test('item labels fit inside compact rows (CJK glyphs are taller)', async () => {
  await page.goto(`${base}/editor/?id=wide`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  const it = (await page.locator('[data-item-id="f"]').boundingBox())!, label = (await page.locator('[data-item-id="f"] .label').boundingBox())!;
  expect(label.y).toBeGreaterThanOrEqual(it.y);
  expect(label.y + label.height).toBeLessThanOrEqual(it.y + it.height);
}, 60000);

test('a track header shown with its delete button keeps the delete clear of the other buttons', async () => {
  await page.goto(`${base}/editor/?id=wide`);
  await page.waitForSelector('[data-row="v"] .head');
  for (const row of ['v', 'o']) {
    await page.hover(`[data-row="${row}"] .head .tname`);
    const del = (await page.locator(`[data-row="${row}"] [data-track-delete]`).boundingBox())!;
    expect(del).not.toBeNull();
    for (const sel of ['[data-mute]', '[data-magnet]']) {
      const loc = page.locator(`[data-row="${row}"] ${sel}`);
      if (!(await loc.count())) continue;   // the overlay track has no magnet button
      const b = (await loc.boundingBox())!;
      const overlap = del.x < b.x + b.width && b.x < del.x + del.width && del.y < b.y + b.height && b.y < del.y + del.height;
      expect(overlap, `${row}: × over ${sel}`).toBe(false);
    }
  }
});

test('an audio track header leaves its name room to read (not clipped to a letter)', async () => {
  await page.goto(`${base}/editor/?id=aud`);
  await page.waitForSelector('[data-row="mus"] .head');
  const name = (await page.locator('[data-row="mus"] .head .tname').boundingBox())!;
  expect(name.width).toBeGreaterThanOrEqual(40);
  expect(await page.locator('[data-row="mus"] .head .tname').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);   // "Music" is not cut off
}, 60000);

const layoutLabel = () => page.locator('[data-layout]').innerText();
const arranged = () => page.locator('.editor').evaluate((el) => (el.classList.contains('layout-side') ? 'side' : el.classList.contains('layout-stacked') ? 'stacked' : '?'));
const open = async (id: string) => { await page.goto(`${base}/editor/?id=${id}`); await page.waitForSelector('[data-player="ready"]', { timeout: 30000 }); };

test('the Layout button cycles Auto → Stacked → Side for this orientation only, and is remembered', async () => {
  await open('wide');
  expect([await arranged(), await layoutLabel()]).toEqual(['stacked', 'Layout: Auto']);
  await page.locator('[data-layout]').click();
  expect([await arranged(), await layoutLabel()]).toEqual(['stacked', 'Layout: Stacked']);
  await page.locator('[data-layout]').click();
  await poll(arranged).toBe('side');
  expect(await layoutLabel()).toBe('Layout: Side');
  expect(await page.locator('[data-side] [data-tab]').count()).toBe(3);
  await open('wide');
  expect(await arranged()).toBe('side');                       // remembered
  await open('tall');
  expect([await arranged(), await layoutLabel()]).toEqual(['side', 'Layout: Auto']);   // the portrait choice is its own
  await page.keyboard.press('Control+Backslash');                // Ctrl+backslash does what the button does
  await poll(arranged).toBe('stacked');
  await open('wide');
  expect(await arranged()).toBe('side');                       // not touched by the portrait choice
  // back to Auto for both, for the other tests
  await page.keyboard.press('Control+Backslash');
  await poll(layoutLabel).toBe('Layout: Auto');
  await open('tall');
  await page.keyboard.press('Control+Backslash'); await page.keyboard.press('Control+Backslash');
  await poll(layoutLabel).toBe('Layout: Auto');
}, 90000);

test('switching layouts keeps the panels: Properties in side → Media in stacked; Chat stays Chat', async () => {
  await open('tall');
  await page.locator('[data-side] [data-tab="props"]').click();
  await page.locator('[data-layout]').click();                 // Auto → Stacked
  await poll(arranged).toBe('stacked');
  expect(await page.locator('[data-tab="library"]').getAttribute('class')).toContain('on');
  expect(await page.locator('.panel-wrap.pr').count()).toBe(1);
  await page.locator('[data-tab="chat"]').click();
  await page.locator('[data-layout]').click();                 // Stacked → Side
  await poll(arranged).toBe('side');
  expect(await page.locator('[data-side] [data-tab="chat"]').getAttribute('class')).toContain('on');
  await page.locator('[data-layout]').click();                 // Side → Auto
  await poll(layoutLabel).toBe('Layout: Auto');
}, 90000);

test('after switching the layout the preview still plays (the moved iframe gets a new window; the bridge follows it)', async () => {
  await open('wide');
  await page.bringToFront();
  await page.locator('[data-layout]').click();                 // Auto → Stacked: same layout
  await page.locator('[data-layout]').click();                 // Stacked → Side: the preview moves, its iframe reloads
  await poll(arranged).toBe('side');
  const clock = () => page.locator('.clock').innerText();
  const before = await clock();
  await page.locator('[data-transport="play"]').click();                 // right away, while the new player may still be starting
  await poll(clock, 10000).not.toBe(before);
  await page.locator('[data-transport="play"]').click();       // pause
  await page.locator('[data-layout]').click();                 // Side → Auto (stacked): moves back, plays again
  await poll(layoutLabel).toBe('Layout: Auto');
  const again = await clock();
  await page.locator('[data-transport="play"]').click();
  await poll(clock, 10000).not.toBe(again);
  await page.locator('[data-transport="play"]').click();
}, 90000);
