// End-to-end for the timeline refresh (spec 2026-10-28-timeline-refresh): screenshots for a person to look at, and the
// timeline's own controls in a real browser.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { makeSource, startApp } from '../../server/src/test-utils.ts';
import { denseProject } from '../../../tools/fixtures/dense.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e_tl');
const shots = join(TELLCUT_ROOT, '.cache/timeline-shots');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 10000) => expect.poll(fn, { timeout, interval: 100 });
const open = async (id: string) => { await page.goto(`${base}/editor/?id=${id}`); await page.waitForSelector('[data-player="ready"]', { timeout: 30000 }); };

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  for (const [id, width, height] of [['dense', 1920, 1080], ['tall', 1080, 1920]] as const) {
    mkdirSync(join(root, id), { recursive: true });
    await makeSource(join(root, id, 'src.mp4'));
    writeFileSync(join(root, id, 'project.json'), JSON.stringify(denseProject({ width, height }), null, 2));
  }
  // a real agent-made project's timeline (its footage is not in the fixture: the clips show as offline)
  cpSync(join(TELLCUT_ROOT, 'tools/fixtures/baking4-guide'), join(root, 'baking'), { recursive: true });
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
}, 120000);

afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('screenshots for review: the dense project and baking4-guide, stacked and side by side', async () => {
  const out: string[] = [];
  for (const id of ['dense', 'tall', 'baking']) {
    for (const arrange of ['stacked', 'side'] as const) {
      await page.goto(`${base}/editor/`);
      await page.evaluate((a) => localStorage.setItem('tellcut.layout', JSON.stringify({ arrange: { landscape: a, portrait: a } })), arrange);
      if (id === 'baking') { await page.goto(`${base}/editor/?id=${id}`); await page.waitForSelector('.timeline [data-item-id]', { timeout: 30000 }); }
      else await open(id);
      await page.waitForTimeout(500);
      expect(await page.locator('.timeline [data-item-id]').count()).toBeGreaterThan(10);
      const file = join(shots, `${id}-${arrange}.png`);
      await page.screenshot({ path: file });
      out.push(file);
    }
  }
  await page.evaluate(() => localStorage.removeItem('tellcut.layout'));
  console.log(`timeline screenshots:\n${out.join('\n')}`);
}, 180000);

test('dragging the playhead head scrubs', async () => {
  await open('dense');
  const clock = () => page.locator('.clock').innerText();
  const before = await clock();
  const head = (await page.locator('[data-playhead-head]').boundingBox())!;
  await page.mouse.move(head.x + head.width / 2, head.y + 3);
  await page.mouse.down();
  await page.mouse.move(head.x + 300, head.y + 3, { steps: 6 });
  await page.mouse.up();
  await poll(clock).not.toBe(before);
}, 60000);

const itemCount = () => page.locator('.timeline [data-item-id]').count();

test('with the preview focused, Ctrl+D duplicates and Ctrl+= zooms the timeline', async () => {
  await open('dense');
  await page.locator('[data-item-id="h1"]').click();
  const n0 = await itemCount(), z0 = Number(await page.locator('[data-zoom]').inputValue());
  await page.locator('iframe').focus();
  await page.keyboard.press('Control+d');
  await poll(itemCount).toBe(n0 + 1);
  await page.keyboard.press('Control+Equal');
  await poll(async () => Number(await page.locator('[data-zoom]').inputValue())).toBeGreaterThan(z0);
}, 60000);

test('with text selected on the page, Ctrl+C copies the text, not the clips', async () => {
  await open('dense');
  await page.locator('[data-item-id="h2"]').click();
  const n0 = await itemCount();
  await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.toolbar .name')!); getSelection()!.removeAllRanges(); getSelection()!.addRange(r); });
  await page.keyboard.press('Control+c');
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);
  expect(await itemCount()).toBe(n0);                                   // nothing was copied, so nothing pasted
}, 60000);

test('the tray: buttons do what their keys do; a tool that cannot act is greyed and says why', async () => {
  await open('dense');
  const tool = (id: string) => page.locator(`[data-tool="${id}"]`);
  await page.locator('[data-ruler]').click({ position: { x: 176 + 20, y: 5 } });          // the playhead near 0, inside c0 (clear of its head)
  await expect.poll(async () => tool('deleteLeft').getAttribute('aria-disabled')).toBe('false');
  expect(await tool('delete').getAttribute('aria-disabled')).toBe('true');                  // nothing selected
  expect(await tool('delete').getAttribute('data-tip')).toContain('先選取片段');                // the reason, in the UI language
  const n0 = await itemCount();
  await tool('split').click();
  await poll(itemCount).toBeGreaterThan(n0);                                                 // split cut the clips under the playhead
  await tool('delete').click();                                                              // still greyed: nothing happens
  await page.locator('[data-item-id="h0"]').click();
  await poll(async () => tool('duplicate').getAttribute('aria-disabled')).toBe('false');
  const n1 = await itemCount();
  await tool('duplicate').click();
  await poll(itemCount).toBe(n1 + 1);
  expect(await page.locator('.tl-tray [data-snap]').count()).toBe(1);                      // snap and track height moved here
  expect(await page.locator('.toolbar [data-snap]').count()).toBe(0);
}, 60000);

test('the razor on the playhead splits; it is not drawn when the playhead is scrolled out of view', async () => {
  await open('dense');
  await page.locator('[data-ruler]').click({ position: { x: 176 + 40, y: 5 } });
  const n0 = await itemCount();
  await page.locator('[data-razor]').click();
  await poll(itemCount).toBeGreaterThan(n0);
  await page.locator('[data-zoom]').fill('100');                                            // zoomed right in: the playhead…
  await page.locator('[data-hscroll]').click({ position: { x: 600, y: 5 } });               // …is paged out of view
  await poll(() => page.locator('[data-razor]').count()).toBe(0);
}, 60000);

test('the tray fits a narrow timeline: every control can be reached (landscape side by side at 1000 px, portrait at 1280 px)', async () => {
  for (const [id, w, arrange] of [['dense', 1000, 'side'], ['tall', 1280, 'auto']] as const) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.goto(`${base}/editor/`);
    await page.evaluate((a) => localStorage.setItem('tellcut.layout', JSON.stringify({ arrange: { landscape: a, portrait: 'auto' } })), arrange);
    await open(id);
    const tray = (await page.locator('[data-tray]').boundingBox())!;
    for (const sel of ['[data-add-track]', '[data-tool="duplicate"]', '[data-snap]', '[data-track-size]', '[data-zoom-out]', '[data-zoom-fit]', '[data-zoom-in]']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect([sel, b.x + b.width <= tray.x + tray.width + 0.5, b.width > 4]).toEqual([sel, true, true]);
    }
    const slider = await page.locator('[data-zoom]').boundingBox();      // hidden on a narrow tray, else whole
    expect(slider === null || slider.x + slider.width <= tray.x + tray.width + 0.5).toBe(true);
  }
  await page.evaluate(() => localStorage.removeItem('tellcut.layout'));
  await page.setViewportSize({ width: 1536, height: 864 });
}, 90000);

const disk = async (id: string) => (await (await fetch(`${base}/api/projects/${id}`)).json()).tracks;

test('copy, paste, then one undo: the project is exactly as before', async () => {
  await open('dense');
  const before = await disk('dense'), n0 = await itemCount();
  await page.locator('[data-item-id="h1"]').click();
  await page.keyboard.press('Control+c');
  await page.locator('[data-ruler]').click({ position: { x: 176 + 300, y: 5 } });
  await page.keyboard.press('Control+v');
  await poll(itemCount).toBeGreaterThan(n0);
  await page.keyboard.press('Control+z');
  await poll(itemCount).toBe(n0);
  await poll(() => disk('dense')).toEqual(before);
}, 60000);

test('a locked track is still locked after a reload', async () => {
  await open('dense');
  const row = page.locator('[data-row]').first(), id = (await row.getAttribute('data-row'))!;
  await row.locator('[data-lock]').click();
  await poll(() => page.locator(`[data-row="${id}"]`).getAttribute('class')).toContain('locked');
  await open('dense');
  expect(await page.locator(`[data-row="${id}"]`).getAttribute('class')).toContain('locked');
  await page.locator(`[data-row="${id}"] [data-lock]`).click();                              // unlocked for the tests after this one
  await poll(() => page.locator(`[data-row="${id}"]`).getAttribute('class')).not.toContain('locked');
}, 60000);

test('in the focused preview, the timeline keys hold back the browser (Space, arrows, Ctrl+D) and the rest do not (Ctrl+C, Ctrl+Shift+D)', async () => {
  await open('dense');
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  // a listener added after the preview's own one sees what it did to the event
  await frame.evaluate(() => { (window as any).__prevented = []; addEventListener('keydown', (e) => (window as any).__prevented.push([e.key, e.ctrlKey, e.shiftKey, e.defaultPrevented])); });
  await page.locator('iframe').focus();
  for (const k of ['ArrowRight', 'Control+d', 'Control+c', 'Control+Shift+D']) await page.keyboard.press(k);
  const seen: Array<[string, boolean, boolean, boolean]> = await frame.evaluate(() => (window as any).__prevented);
  expect(seen.filter(([key]) => !['Control', 'Shift'].includes(key)).map(([key, , , p]) => [key, p])).toEqual([['ArrowRight', true], ['d', true], ['c', false], ['D', false]]);
}, 60000);
