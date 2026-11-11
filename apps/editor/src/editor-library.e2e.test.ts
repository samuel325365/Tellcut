// My blocks in the editor (spec 2026-10-29-my-library §3.2, §3.3): ☆ saves a project's own block, another project adds it from
// the My blocks group, and the copy lands in its fx/lib/ with meta.fx and the item in one edit.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { demoProject } from '@tellcut/server/test-utils';
import { openProject, poller, projectsRoot, startEditor, stopEditor, writeProject, type App } from './e2e-kit.ts';

const root = projectsRoot('_e2e-library');
let app: App, base: string, browser: Browser, page: Page;
const poll = poller(150, 15000);
const BOX = `export default [{ type: 'fx.box', label: 'Box', doc: 'a red box', kind: 'overlay', params: [],
  build: (ctx) => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:30%;background:#f00'; ctx.root.appendChild(el); return {}; }, draw: () => {} }];\n`;

beforeAll(async () => {
  const setup = async () => {
    for (const id of ['one', 'two']) {
      mkdirSync(join(root, id, 'fx'), { recursive: true });
      const p = demoProject();
      Object.assign(p.meta, { name: id, duration: 4, ...(id === 'one' ? { fx: ['fx/box.js'] } : {}) });
      await writeProject(root, id, p);
    }
    writeFileSync(join(root, 'one', 'fx', 'box.js'), BOX);
  };
  ({ app, base, browser, page } = await startEditor({ root, setup, viewport: { width: 1400, height: 820 }, app: { libraryThumb: async () => {} } }));
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

test('☆ saves a project block to My blocks; another project adds it from the My blocks group', async () => {
  await openProject(page, base, 'one');
  await page.click('[data-lib-tab="effects"]');
  await page.hover('[data-add-overlay="fx.box"]');
  await page.click('[data-save-block="fx.box"]');
  await page.waitForSelector('[data-save-dialog="block"]');
  await poll(() => page.locator('[data-save-notes]').textContent()).not.toContain('…');
  await page.fill('[data-save-name]', '紅盒子');
  await page.click('[data-save-confirm]');
  await page.waitForSelector('[data-lib-toast]');
  expect(existsSync(join(root, '_library', 'blocks', 'box', 'fx', 'box.js'))).toBe(true);
  await poll(() => page.locator('[data-save-block="fx.box"]').textContent()).toBe('★');

  await openProject(page, base, 'two');
  await page.click('[data-lib-tab="effects"]');
  await page.waitForSelector('[data-lib-group="block:mine"] [data-add-mine="fx.box"]');
  expect(await page.locator('[data-add-mine="fx.box"]').textContent()).toBe('紅盒子');
  await page.click('[data-add-mine="fx.box"]');
  await page.click('[data-add-picked]');
  const saved = () => { try { return JSON.parse(readFileSync(join(root, 'two', 'project.json'), 'utf8')); } catch { return null; } };
  await poll(() => saved()?.meta.fx).toEqual(['fx/lib/box/_entry.js']);
  expect(saved().tracks.flatMap((t: any) => t.items).some((i: any) => i.type === 'fx.box')).toBe(true);
  expect(existsSync(join(root, 'two', 'fx', 'lib', 'box', 'box.js'))).toBe(true);
  // the copy now shows as this project's, tagged; nothing is left to add from My blocks
  await page.waitForSelector('[data-lib-group="block:fx"] [data-from-mine="box"]');
  expect(await page.locator('[data-lib-group="block:mine"]').count()).toBe(0);
  // the copy, selected after adding, offers no ☆: saving it would only take the entry's place (final review C1)
  if (await page.locator('[data-tab="props"]').count()) await page.click('[data-tab="props"]');   // the side layout only; the stacked one always shows it
  await page.waitForSelector('[data-props]');
  expect(await page.locator('[data-props-save-block]').count()).toBe(0);
}, 120000);

test('a slow answer about My blocks does not reset a field being typed in', async () => {
  const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  try {
    await p.route('**/api/projects/two/library', async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue(); });
    await openProject(p, base, 'two');
    await p.click('[data-item-id="c"]');
    const speed = p.locator('[data-field="speed"] input');
    await speed.fill('0.5');
    await p.waitForTimeout(3500);   // the slow answer would land here
    expect(await speed.inputValue()).toBe('0.5');
    await speed.press('Enter');
    const disk = () => JSON.parse(readFileSync(join(root, 'two', 'project.json'), 'utf8'));
    await poll(() => disk().tracks.find((t: any) => t.kind === 'video').items.find((i: any) => i.id === 'c').speed).toBe(0.5);
  } finally { await p.close(); }
}, 120000);

// the block gallery opened from the editor: the project's own blocks are listed, and "Add to project" lands in this tab's timeline
test('the gallery opened from a project lists its own blocks and adds one at the playhead of the tab that opened it', async () => {
  const p = await browser.newPage({ viewport: { width: 1400, height: 820 }, locale: 'en-US' });
  try {
    await openProject(p, base, 'one');
    await p.click('[data-lib-tab="effects"]');
    const [g] = await Promise.all([p.context().waitForEvent('page'), p.click('[data-gallery-link]')]);
    await g.waitForSelector('[data-own-section] [data-card="own:fx.box"]', { timeout: 30000 });
    expect(await g.locator('[data-card="own:fx.box"] [data-own-tag]').count()).toBe(1);
    await g.click('[data-card="own:fx.box"]');
    expect(await g.locator('[data-detail="own:fx.box"] iframe').getAttribute('src')).toContain('id=one');
    const disk = () => JSON.parse(readFileSync(join(root, 'one', 'project.json'), 'utf8'));
    const boxes = () => disk().tracks.flatMap((t: any) => t.items).filter((i: any) => i.type === 'fx.box').length;
    const before = boxes();
    await g.click('[data-detail="own:fx.box"] [data-gallery-add]');
    await poll(() => g.locator('[data-add-status]').textContent()).toContain('one');
    await poll(boxes).toBe(before + 1);
    // a shared block too, from its own card
    await g.click('[data-card="core.flash"]');
    await g.click('[data-detail="core.flash"] [data-gallery-add]');
    await poll(() => disk().tracks.flatMap((t: any) => t.items).filter((i: any) => i.type === 'core.flash').length).toBe(2);
    await g.close();
  } finally { await p.close(); }
}, 120000);
