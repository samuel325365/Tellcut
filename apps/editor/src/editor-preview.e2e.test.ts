// End-to-end for Plan 6: pick on the preview, drag to move, double-click text to edit, lanes for overlapping clips; then export.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e4');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const disk = () => JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8'));
const chapter = () => disk().tracks.find((t: any) => t.id === 'o').items.find((i: any) => i.id === 'ch');
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'demo'), { recursive: true });
  await makeSource(join(root, 'demo/src.mp4'));
  const p = demoProject();
  p.meta.duration = 4;
  Object.assign(p.meta, { width: 1920, height: 1080 });
  p.tracks[0].items.push({ id: 'c2', source: 's1', in: 2, speed: 1, start: 0.5, end: 2, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });   // overlaps c
  p.tracks[1].items.push({ id: 'ch', type: 'core.title', start: 1, end: 4, params: { text: 'CHAPTER ONE' } });
  writeFileSync(join(root, 'demo/project.json'), JSON.stringify(p, null, 2));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  for (const j of (await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).jobs) await app.queue.wait(j.id);
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=demo`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  // the title is fully in at 3 s: click the ruler there (4 s fill 1600 - 160 px, so 3 s is 1080 px past the headers)
  const ruler = (await page.locator('[data-ruler]').boundingBox())!;
  await page.mouse.click(ruler.x + 140 + 1080, ruler.y + ruler.height / 2);
  await page.waitForTimeout(800);
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('overlapping clips sit in two lanes', async () => {
  const [a, b] = await Promise.all([page.locator('[data-item-id="c"]').boundingBox(), page.locator('[data-item-id="c2"]').boundingBox()]);
  expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
});

test('click a text on the preview selects its item; dragging the box moves it', async () => {
  const frame = page.frameLocator('iframe');
  const num = (await frame.getByText(/CHAPTER (ONE|TWO)/).boundingBox())!;
  await page.mouse.click(num.x + num.width / 2, num.y + num.height / 2);
  await page.waitForSelector('[data-props="ch"]');
  const box = (await frame.locator('.sel-box').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await poll(() => chapter().transform?.x ?? 0).toBeGreaterThan(0);
}, 60000);

test('double-click a text on the preview to edit it', async () => {
  const frame = page.frameLocator('iframe');
  const num = (await frame.getByText(/CHAPTER (ONE|TWO)/).boundingBox())!;
  await page.mouse.dblclick(num.x + num.width / 2, num.y + num.height / 2);
  const input = frame.locator('.text-edit');
  await input.waitFor();
  await input.fill('CHAPTER TWO');
  await input.press('Control+Enter');   // core.title's text is multi-line: Enter adds a line, Ctrl+Enter saves
  await poll(() => chapter().params.text).toBe('CHAPTER TWO');
}, 60000);

test('the moved and retitled project exports', async () => {
  const job = await (await fetch(`${base}/api/projects/demo/export`, { method: 'POST' })).json();
  expect((await app.queue.wait(job.id)).status).toBe('done');
}, 180000);
