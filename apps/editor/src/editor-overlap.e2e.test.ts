// End-to-end: overlaps (dissolve, transition length, crossfade), track order and layer order, checked in the saved project.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e7');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const disk = () => JSON.parse(readFileSync(join(root, 'ov', 'project.json'), 'utf8'));
const items = (track: string) => disk().tracks.find((t: any) => t.id === track).items;
const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'ov'), { recursive: true });
  await makeSource(join(root, 'ov', 'src.mp4'));
  const p = demoProject();
  Object.assign(p.meta, { duration: 4 });
  p.tracks = [
    { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 2, crop }, { id: 'd', source: 's1', in: 2, speed: 1, start: 1.5, end: 3.5, crop }] },
    { id: 'au', kind: 'audio', gain: 0, items: [{ id: 'a1', source: 's1', in: 0, rate: 1, start: 0, end: 2, gain: 0, fadeIn: 0, fadeOut: 0 },
      { id: 'a2', source: 's1', in: 1.5, rate: 1, start: 1.5, end: 3.5, gain: 0, fadeIn: 0, fadeOut: 0 }] },
  ];
  writeFileSync(join(root, 'ov', 'project.json'), JSON.stringify(p, null, 2));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=ov`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('a click on a video overlap adds a dissolve as long as the overlap; its block\'s edge drags the length', async () => {
  const ov = await box('[data-overlap="d"]');
  await page.mouse.click(ov.x + ov.width / 2, ov.y + ov.height - 4);
  await poll(() => items('v')[1].transitionIn).toEqual({ type: 'dissolve', dur: 0.5 });
  const edge = await box('[data-transition="d"] [data-transition-edge]');
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + ov.width / 2, edge.y + edge.height / 2, { steps: 5 });   // + a quarter second
  await page.mouse.up();
  await poll(() => items('v')[1].transitionIn.dur).toBeGreaterThan(0.6);
}, 60000);

test('a click on a sound overlap crossfades the two clips; a second click takes it off', async () => {
  let ov = await box('[data-overlap="a2"]');
  await page.mouse.click(ov.x + ov.width / 2, ov.y + ov.height - 3);           // the lower edge: away from the volume line
  await poll(() => [items('au')[0].fadeOut, items('au')[1].fadeIn]).toEqual([0.5, 0.5]);
  ov = await box('[data-overlap="a2"]');
  await page.mouse.click(ov.x + ov.width / 2, ov.y + ov.height - 3);
  await poll(() => [items('au')[0].fadeOut, items('au')[1].fadeIn]).toEqual([0, 0]);
}, 60000);

test('＋軌道 adds a video track; its grip drags it under the first one; Ctrl+[ puts the selected clip under the other', async () => {
  await page.selectOption('[data-add-track]', 'video');
  await poll(() => disk().tracks.map((t: any) => t.id)).toEqual(['v', 'video', 'au']);
  const grip = await box('[data-track-grip="video"]'), target = await box('[data-row="v"]');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, target.y + target.height / 2, { steps: 5 });
  await page.mouse.up();
  await poll(() => disk().tracks.map((t: any) => t.id)).toEqual(['video', 'v', 'au']);
  const d = await box('[data-item-id="d"]');
  await page.mouse.click(d.x + d.width - 20, d.y + d.height - 6);
  await page.keyboard.press('Control+BracketLeft');
  await poll(() => items('v').map((i: any) => i.id)).toEqual(['d', 'c']);
}, 60000);

test('inside a dissolve: the upper part of the clip start is the transition block, the lower part the trim grip', async () => {
  const d = await box('[data-item-id="d"]');
  const hit = (x: number, y: number) => page.evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y});
    return e.closest('[data-transition]') ? 'transition' : e.closest('[data-edge]') ? e.closest('[data-edge]').getAttribute('data-edge') : e.className })()`);
  expect(await hit(d.x + 2, d.y + d.height * 0.2)).toBe('transition');
  expect(await hit(d.x + 2, d.y + d.height * 0.8)).toBe('start');
}, 60000);

test('clip layers stay under the track headers when a clip runs past the left edge', async () => {
  const head = await box('[data-row="au"] .head');
  await page.locator('.timeline').hover();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120);                                        // Shift+wheel: scroll time so a1 starts left of the lane
  await page.keyboard.up('Shift');
  const inHead = (x: number, y: number) => page.evaluate(`!!document.elementFromPoint(${x}, ${y}).closest('.head')`);
  for (const [fx, fy] of [[0.9, 0.15], [0.5, 0.5], [0.9, 0.85]]) expect(await inHead(head.x + head.width * fx, head.y + head.height * fy)).toBe(true);
}, 60000);
