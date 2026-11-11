// "Save as my preset" end to end (spec 2026-10-29-my-library §3.5, §3.6): the editor's button sends the task, the (fake) agent writes
// the draft, the dialog opens on it, a point is removed and one changed, and the preset appears on the home page with what was kept.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { demoProject } from '@tellcut/server/test-utils';
import { openProject, poller, projectsRoot, startEditor, stopEditor, writeProject, type App } from './e2e-kit.ts';

const FAKE = `node "${fileURLToPath(new URL('../../server/src/chat/fake-claude.mjs', import.meta.url))}"`;
const root = projectsRoot('_e2e-presets');
let app: App, base: string, browser: Browser, page: Page;
const poll = poller(150, 15000);

beforeAll(async () => {
  const setup = async () => {
    const p = demoProject();
    Object.assign(p.meta, { name: 'trip', duration: 4 });
    await writeProject(root, 'trip', p);
    process.env.FAKE_CLAUDE_PROJECTS = root;
  };
  ({ app, base, browser, page } = await startEditor({ root, setup, viewport: { width: 1400, height: 860 },
    app: { claude: FAKE, libraryThumb: async () => {}, presetPoster: async (_o, out) => { writeFileSync(out, 'JPG'); } } }));
}, 120000);

afterAll(async () => { await stopEditor(root, { browser, app }); delete process.env.FAKE_CLAUDE_PROJECTS; });

test('Save as preset: the agent drafts, the user trims the points, the preset shows on the home page', async () => {
  await openProject(page, base, 'trip');
  await page.click('[data-tab="chat"]');
  await page.click('[data-save-preset]');
  await page.waitForSelector('[data-save-preset-dialog="save"]', { timeout: 30000 });
  expect(await page.inputValue('[data-preset-name]')).toBe('我的短片');
  await page.hover('[data-preset-point="0"]');
  await page.click('[data-preset-point-remove="0"]');
  await page.fill('[data-preset-point="0"]', '字幕放下面');
  await page.click('[data-preset-save]');
  await page.waitForSelector('[data-preset-toast]');
  expect(existsSync(join(root, 'trip', 'preset-draft.json'))).toBe(false);

  await page.goto(`${base}/editor/`);
  const card = page.locator('[data-preset^="my-"]', { hasText: '我的短片' });
  await poll(() => card.count()).toBeGreaterThan(0);
  await card.first().click();
  await page.waitForSelector('[data-preset-points-view]');
  expect(await page.locator('[data-preset-points-view] li').allTextContents()).toEqual(['字幕放下面']);
  await page.click('[data-preset-delete]');
  await page.click('[data-preset-delete-confirm]');
  await poll(() => page.locator('[data-preset-dialog]').count()).toBe(0);
  await poll(() => card.count()).toBe(0);
}, 120000);
