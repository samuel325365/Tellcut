// End-to-end: overlaps (dissolve, transition length, crossfade), track order and layer order, checked in the saved project.
import type { Browser, Page } from 'playwright-core';
import { demoProject } from '@tellcut/server/test-utils';
import { poller, projectsRoot, readProject, startEditor, stopEditor, writeProject, type App } from '../e2e-kit.ts';

const root = projectsRoot('_e2e7');
let app: App, browser: Browser, page: Page;
const poll = poller(100, 10000);
const disk = () => readProject(root, 'ov');
const items = (track: string) => disk().tracks.find((t: any) => t.id === track).items;
const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };

beforeAll(async () => {
  const p = demoProject();
  Object.assign(p.meta, { duration: 4 });
  p.tracks = [
    { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 2, crop }, { id: 'd', source: 's1', in: 2, speed: 1, start: 1.5, end: 3.5, crop }] },
    { id: 'au', kind: 'audio', gain: 0, items: [{ id: 'a1', source: 's1', in: 0, rate: 1, start: 0, end: 2, gain: 0, fadeIn: 0, fadeOut: 0 },
      { id: 'a2', source: 's1', in: 1.5, rate: 1, start: 1.5, end: 3.5, gain: 0, fadeIn: 0, fadeOut: 0 }] },
  ];
  ({ app, browser, page } = await startEditor({ root, setup: () => writeProject(root, 'ov', p), viewport: { width: 1536, height: 864 }, open: 'ov' }));
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

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
