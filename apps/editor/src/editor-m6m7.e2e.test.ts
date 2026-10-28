// End-to-end for M6/M7: properties panel, crop mode, library, envelope point, track mute → project.json changes → export.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT, run } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e2');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const disk = () => JSON.parse(readFileSync(join(root, 'demo/project.json'), 'utf8'));
const track = (id: string) => disk().tracks.find((t: any) => t.id === id);
// the toolbar may still say "saved" for a moment after an edit, so wait on the file itself
const poll = <T>(fn: () => T) => expect.poll(fn, { timeout: 10000, interval: 200 });

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'demo/media'), { recursive: true });
  await makeSource(join(root, 'demo/src.mp4'));
  await run(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', join(root, 'demo/media/tone.wav')]);
  const p = demoProject({ media: { tone: { path: 'media/tone.wav' } } });
  p.tracks.push({ id: 'mu', kind: 'music', gain: 0, items: [{ id: 'm', media: 'tone', in: 0, start: 0, end: 1, gain: 0, fadeIn: 0, fadeOut: 0 }] });
  writeFileSync(join(root, 'demo/project.json'), JSON.stringify(p, null, 2));
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  for (const j of (await (await fetch(`${base}/api/projects/demo/analyze`, { method: 'POST' })).json()).jobs) await app.queue.wait(j.id);
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=demo`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await page.waitForSelector('[data-item-id="c"]');
}, 120000);

// closing Chrome can take ~25 s while other e2e files render exports in parallel (0.2 s alone)
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('properties panel, crop mode, library, envelope and bus edits reach project.json', async () => {
  // properties panel: a committed number field is one validated edit
  await page.click('[data-item-id="c"]');
  const speed = page.locator('[data-field="speed"] input');
  await speed.fill('0.5');
  await speed.press('Enter');
  await poll(() => disk().tracks[0].items[0].speed).toBe(0.5);

  // crop mode: drag the viewfinder inside the preview, Esc leaves
  await page.click('[data-crop="from"]');
  await page.waitForSelector('[data-crop-banner]');
  const finder = page.frameLocator('iframe').locator('[data-crop-box]');
  // the demo's 16:9 source fills its 16:9 frame at zoom 1: zoom in first so the viewfinder has room to move
  let box = await finder.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -100);
  await poll(() => disk().tracks[0].items[0].crop.from.zoom).toBeGreaterThan(1);
  box = await finder.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2, { steps: 5 });
  await page.mouse.up();
  await poll(() => disk().tracks[0].items[0].crop.from.x).toBeGreaterThan(0.5);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-crop-banner]', { state: 'detached' });

  // library: click picks an overlay, the button adds it at the playhead
  await page.click('[data-add-overlay="core.flash"]');
  await page.click('[data-add-picked]');
  await poll(() => disk().tracks.flatMap((t: any) => t.items).filter((i: any) => i.type === 'core.flash').length).toBe(2);

  // envelope: on the selected clip, clicking the volume line adds a control point (a first click only selects it)
  await page.locator('[data-item-id="m"]').click({ position: { x: 4, y: 4 } });
  const line = await page.locator('[data-item-id="m"] [data-env-line]').boundingBox();
  await page.mouse.click(line!.x + line!.width / 2, line!.y + line!.height / 2);
  await poll(() => track('mu').items[0].envelope?.length ?? 0).toBe(1);

  // track bus: mute
  await page.click('[data-row="mu"] [data-mute]');
  await poll(() => track('mu').muted).toBe(true);
}, 120000);

test('the edited project (envelope, muted bus, new overlay, crop) exports', async () => {
  const job = await (await fetch(`${base}/api/projects/demo/export`, { method: 'POST' })).json();
  expect((await app.queue.wait(job.id)).status).toBe('done');
}, 180000);
