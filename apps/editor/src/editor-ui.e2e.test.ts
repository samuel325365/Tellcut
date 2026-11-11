// End-to-end UI checks: the help, controls that must not cover each other on a zoomed-out timeline, collapsing, transport.
import type { Browser, Page } from 'playwright-core';
import { demoProject } from '@tellcut/server/test-utils';
import { poller, projectsRoot, readProject, startEditor, stopEditor, writeProject, type App } from '../e2e-kit.ts';

const root = projectsRoot('_e2e8');
let app: App, browser: Browser, page: Page;
const poll = poller(100, 10000);
const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const hit = (x: number, y: number) => page.evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y});
  return e.closest('[data-transition-edge]') ? 'transition-edge' : e.closest('[data-transition]') ? 'transition' : e.closest('[data-overlap]') ? 'overlap'
    : e.closest('[data-edge]') ? e.closest('[data-edge]').getAttribute('data-edge') : e.tagName })()`);

beforeAll(async () => {
  const p = demoProject();
  Object.assign(p.meta, { width: 1920, height: 1080, duration: 60 });
  p.tracks = [{ id: 'v', kind: 'video', items: [
    { id: 'a', source: 's1', in: 0, speed: 1, start: 0, end: 1.5, crop },
    { id: 'b', source: 's1', in: 1.5, speed: 1, start: 1.25, end: 3, crop, transitionIn: { type: 'dissolve', dur: 0.25 } },   // Wedding-like 0.25 s dissolve
    { id: 'tiny', source: 's1', in: 0, speed: 1, start: 10, end: 10.4, crop },
  ] }, { id: 'mu', kind: 'audio', gain: 0, items: [] }];
  ({ app, browser, page } = await startEditor({ root, setup: () => writeProject(root, 'ui', p), viewport: { width: 1280, height: 720 }, open: 'ui' }));
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

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
  expect(readProject(root, 'ui').tracks.length).toBe(2);   // nothing edited
}, 60000);
