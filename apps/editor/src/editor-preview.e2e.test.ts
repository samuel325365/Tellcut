// End-to-end for Plan 6: pick on the preview, drag to move, double-click text to edit, lanes for overlapping clips; then export.
import type { Browser, Page } from 'playwright-core';
import { demoProject } from '@tellcut/server/test-utils';
import { poller, projectsRoot, readProject, startEditor, stopEditor, writeProject, type App } from '../e2e-kit.ts';

const root = projectsRoot('_e2e4');
let app: App, base: string, browser: Browser, page: Page;
const disk = () => readProject(root, 'demo');
const chapter = () => disk().tracks.find((t: any) => t.id === 'o').items.find((i: any) => i.id === 'ch');
const poll = poller(100, 10000);

beforeAll(async () => {
  const p = demoProject();
  p.meta.duration = 4;
  Object.assign(p.meta, { width: 1920, height: 1080 });
  p.tracks[0].items.push({ id: 'c2', source: 's1', in: 2, speed: 1, start: 0.5, end: 2, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });   // overlaps c
  p.tracks[1].items.push({ id: 'ch', type: 'core.title', start: 1, end: 4, params: { text: 'CHAPTER ONE' } });
  ({ app, base, browser, page } = await startEditor({ root, setup: () => writeProject(root, 'demo', p), analyze: 'demo', viewport: { width: 1600, height: 900 }, open: 'demo' }));
  // the title is fully in at 3 s: click the ruler there (4 s fill 1600 - 160 px, so 3 s is 1080 px past the headers)
  const ruler = (await page.locator('[data-ruler]').boundingBox())!;
  await page.mouse.click(ruler.x + 140 + 1080, ruler.y + ruler.height / 2);
  await page.waitForTimeout(800);
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

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
