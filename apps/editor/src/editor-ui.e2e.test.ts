// End-to-end UI checks: the help, controls that must not cover each other on a zoomed-out timeline, collapsing, transport.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e8');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const hit = (x: number, y: number) => page.evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y});
  return e.closest('[data-transition-edge]') ? 'transition-edge' : e.closest('[data-transition]') ? 'transition' : e.closest('[data-overlap]') ? 'overlap'
    : e.closest('[data-edge]') ? e.closest('[data-edge]').getAttribute('data-edge') : e.tagName })()`);

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'ui'), { recursive: true });
  await makeSource(join(root, 'ui', 'src.mp4'));
  const p = demoProject();
  Object.assign(p.meta, { width: 1920, height: 1080, duration: 60 });
  p.tracks = [{ id: 'v', kind: 'video', items: [
    { id: 'a', source: 's1', in: 0, speed: 1, start: 0, end: 1.5, crop },
    { id: 'b', source: 's1', in: 1.5, speed: 1, start: 1.25, end: 3, crop, transitionIn: { type: 'dissolve', dur: 0.25 } },   // Wedding-like 0.25 s dissolve
    { id: 'tiny', source: 's1', in: 0, speed: 1, start: 10, end: 10.4, crop },
  ] }, { id: 'mu', kind: 'audio', gain: 0, items: [] }];
  writeFileSync(join(root, 'ui', 'project.json'), JSON.stringify(p, null, 2));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=ui`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
}, 120000);

afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('幫助 sits in the top-left corner; ? opens it, Esc closes it', async () => {
  const b = await box('[data-help]');
  expect([b.x < 60, b.y < 30]).toEqual([true, true]);
  await page.keyboard.press('Shift+Slash');
  await page.waitForSelector('[data-help-panel]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-help-panel]', { state: 'detached' });
}, 60000);

test('at the zoom a long project opens with (20 px/s, like Wedding), a 0.25 s dissolve, its transition edge and a 0.4 s clip\'s grips are each reachable', async () => {
  expect(await page.evaluate('Math.round(parseFloat(document.querySelector("[data-item-id=tiny]").style.width))')).toBe(8);   // 0.4 s at 20 px/s
  const b = await box('[data-item-id="b"]'), tr = await box('[data-transition="b"]'), tiny = await box('[data-item-id="tiny"]');
  expect(await hit(tr.x + tr.width - 1, tr.y + tr.height / 2)).toBe('transition-edge');
  expect(await hit(b.x + 8, b.y + b.height * 0.8)).toBe('overlap');     // the 12 px overlap target past the trim grip
  expect(await hit(b.x + 2, b.y + b.height * 0.8)).toBe('start');
  expect(await hit(tiny.x + 1.5, tiny.y + tiny.height / 2)).toBe('start');                 // inside the 1 px border
  expect(await hit(tiny.x + tiny.width - 1.5, tiny.y + tiny.height / 2)).toBe('end');
}, 60000);

test('a click on a track name collapses it; the transport and the snap switch work', async () => {
  const h0 = (await box('[data-row="v"]')).height;
  await page.click('[data-row="v"] .tname');
  await poll(async () => (await box('[data-row="v"]')).height).toBe(12);
  await page.click('[data-row="v"] .tname');
  await poll(async () => (await box('[data-row="v"]')).height).toBe(h0);
  await page.click('[data-transport="end"]');
  await poll(() => page.locator('.transport .clock').textContent()).toMatch(/^1:00\.00/);
  await page.click('[data-transport="home"]');
  await poll(() => page.locator('.transport .clock').textContent()).toMatch(/^0:00\.00/);
  await page.click('[data-snap]');
  await poll(() => page.locator('[data-snap]').textContent()).toBe('Snap: Off');
  expect(JSON.parse(readFileSync(join(root, 'ui', 'project.json'), 'utf8')).tracks.length).toBe(2);   // nothing edited
}, 60000);
