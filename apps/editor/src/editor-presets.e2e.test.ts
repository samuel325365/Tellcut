// "Save as my preset" end to end (spec 2026-10-29-my-library §3.5, §3.6): the editor's button sends the task, the (fake) agent writes
// the draft, the dialog opens on it, a point is removed and one changed, and the preset appears on the home page with what was kept.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const FAKE = `node "${fileURLToPath(new URL('../../server/src/chat/fake-claude.mjs', import.meta.url))}"`;
const root = join(TELLCUT_ROOT, 'projects/_e2e-presets');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 15000) => expect.poll(fn, { timeout, interval: 150 });

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'trip'), { recursive: true });
  await makeSource(join(root, 'trip', 'src.mp4'));
  const p = demoProject();
  Object.assign(p.meta, { name: 'trip', duration: 4 });
  writeFileSync(join(root, 'trip', 'project.json'), JSON.stringify(p, null, 2));
  process.env.FAKE_CLAUDE_PROJECTS = root;
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist, claude: FAKE, libraryThumb: async () => {}, presetPoster: async (_o, out) => { writeFileSync(out, 'JPG'); } }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1400, height: 860 }, locale: 'zh-TW' });
}, 120000);

afterAll(async () => { await browser?.close(); await app?.close(); delete process.env.FAKE_CLAUDE_PROJECTS; rmSync(root, { recursive: true, force: true }); });

test('Save as preset: the agent drafts, the user trims the points, the preset shows on the home page', async () => {
  await page.goto(`${base}/editor/?id=trip`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
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
