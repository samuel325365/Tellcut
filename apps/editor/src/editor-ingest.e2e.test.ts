// End-to-end: folder → npm run new (createProject) → first cut (Cut) → editor (photo, title, speech captions, beat grid) → export.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, TELLCUT_ROOT, createProject, makeClicks, makePhoneVideo, makePhoto, makeTalkingVideo, probeDuration } from '@tellcut/media-node';
import { Cut } from '../../../tools/cut/cut.ts';
import { sse, startApp } from '../../server/src/test-utils.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e10'), src = join(root, '_src');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 20000) => expect.poll(fn, { timeout, interval: 200 });
const disk = () => JSON.parse(readFileSync(join(root, 'trip', 'project.json'), 'utf8'));

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  await makeTalkingVideo(join(src, 'talk.mp4'), 'Hello everyone. The birthday cake is ready.');
  await makePhoto(join(src, 'pic.jpg'), { w: 1200, h: 900, taken: '2026:03:07 10:00:00' });
  await makeClicks(join(src, 'song.wav'), { bpm: 120, seconds: 20 });
  await createProject({ id: 'trip', inputs: [src], projectsDir: root, size: [1280, 720] });
  const c = await Cut.open(join(root, 'trip'));
  c.music('song', { fadeOut: 1 });
  c.photo('pic', { len: 2 });
  c.clip('talk', { from: 0, len: 4 });
  c.title('測試標題', { at: 0, len: 2 });
  await c.save();
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
  await page.goto(`${base}/editor/?id=trip`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 60000 });
}, 900000);

afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('the first cut opens in the editor: the photo is an image, the title is text, the music shows its tempo', async () => {
  const stage = page.frameLocator('iframe').locator('#stage');
  await poll(() => stage.locator('img').count()).toBeGreaterThan(0);
  await poll(() => stage.getByText('測試標題').count()).toBeGreaterThan(0);
  await poll(() => page.locator('[data-add-music="song"]').textContent(), 120000).toContain('BPM');
  expect(disk().grids[0]).toMatchObject({ id: 'music', bpm: expect.any(Number) });
}, 180000);

test('speech becomes captions attached to the clip', async () => {
  const clip = disk().tracks.find((t: any) => t.id === 'v1').items.find((i: any) => i.source === 'talk');
  await page.locator(`[data-item-id="${clip.id}"]`).click();
  await page.click('[data-speech-captions]');
  await poll(() => disk().tracks.flatMap((t: any) => t.items).filter((i: any) => i.type === 'core.caption' && i.parent === clip.id).length, 60000).toBeGreaterThan(0);
}, 180000);

test('the whole thing exports', async () => {
  const job = await (await fetch(`${base}/api/projects/trip/export`, { method: 'POST' })).json();
  const last = (await sse(`${base}/api/jobs/${job.id}/events`)).at(-1);
  expect(last.status).toBe('done');
  expect(await probeDuration(join(root, 'trip', last.result.file))).toBeCloseTo(disk().meta.duration, 0);
}, 600000);

test('Import in the media panel adds footage and music that analyse in the background, without the Agent', async () => {
  const more = join(root, '_more');
  mkdirSync(more, { recursive: true });
  await makePhoneVideo(join(more, 'more.mp4'), { created: '2026-03-07T01:12:00Z' });
  await makeClicks(join(more, 'beat.wav'), { bpm: 100, seconds: 12 });
  await page.click('[data-import-media]');
  await page.fill('[data-path]', more);
  await page.press('[data-path]', 'Enter');
  await page.locator('[data-entry="beat.wav"] input').check();
  await page.locator('[data-entry="more.mp4"] input').check();
  await page.click('[data-add]');
  await poll(() => page.locator('[data-add-source="more"]').count()).toBeGreaterThan(0);
  await poll(() => disk().sources.more?.kind).toBe('video');
  expect(disk().media.beat.path).toBe('../_more/beat.wav');
  await poll(() => page.locator('[data-add-source="more"] .seg-thumb').count(), 120000).toBeGreaterThan(0);
  await poll(() => page.locator('[data-add-music="beat"]').textContent(), 120000).toContain('BPM');
  await page.reload();
  await page.waitForSelector('[data-player="ready"]', { timeout: 60000 });
  expect(await page.locator('[data-add-music="beat"]').count()).toBe(1);
}, 300000);
