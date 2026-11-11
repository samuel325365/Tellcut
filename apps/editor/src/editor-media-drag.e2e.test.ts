// End-to-end for the media panel (spec 2026-11-10-media-panel-visual): library cards dragged onto the timeline with the mouse,
// a file from the PC dropped on it, and screenshots of the three pages and of a drag for a person to look at.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath, makeClicks, TELLCUT_ROOT } from '@tellcut/media-node';
import { demoProject, makeSource, startApp } from '../../server/src/test-utils.ts';
import { t } from './i18n/index.ts';

const CHROME = chromePath();
const root = join(TELLCUT_ROOT, 'projects/_e2e_drag');
const shots = join(TELLCUT_ROOT, '.cache/media-shots');
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist'), editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
let app: Awaited<ReturnType<typeof startApp>>['app'], base: string, browser: Browser, page: Page;
const poll = <T>(fn: () => T, timeout = 15000) => expect.poll(fn, { timeout, interval: 100 });
const shot = (name: string) => page.screenshot({ path: join(shots, `${name}.png`) });

const FLASH = { peak: 1, rise: 0, hold: 0, fall: 0.3, power: 1, color: '#fff' };
const still = { x: 0.5, y: 0.5, zoom: 1 };
/** a 4 s source cut into two clips on the magnetic track, a flash on the overlay track, a song and an empty music track */
function project() {
  return demoProject({
    meta: { ...demoProject().meta, width: 1280, height: 720, duration: 4 },
    sources: { src: { path: 'src.mp4', duration: 4, width: 320, height: 180, kind: 'video', audio: true } },
    media: { song: { path: 'song.wav' } },
    tracks: [
      { id: 'v', kind: 'video', magnetic: true, items: [
        { id: 'c1', source: 'src', in: 0, speed: 1, start: 0, end: 2, crop: { from: still, to: still } },
        { id: 'c2', source: 'src', in: 2, speed: 1, start: 2, end: 4, crop: { from: still, to: still } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'f', type: 'core.flash', start: 0.5, end: 2, params: FLASH }] },
      { id: 'mu', kind: 'music', items: [] },
    ],
  });
}
const disk = (id: string) => JSON.parse(readFileSync(join(root, id, 'project.json'), 'utf8'));
const items = (id: string, track: string) => disk(id).tracks.find((x: any) => x.id === track)?.items ?? [];

async function open(id: string) {
  mkdirSync(join(root, id), { recursive: true });
  await makeSource(join(root, id, 'src.mp4'));
  await makeClicks(join(root, id, 'song.wav'), { seconds: 3 });
  writeFileSync(join(root, id, 'project.json'), JSON.stringify(project(), null, 2));
  await page.goto(`${base}/editor/?id=${id}`);
  await page.waitForSelector('[data-player="ready"]', { timeout: 30000 });
  await page.bringToFront();
}
const center = async (sel: string) => { const b = (await page.locator(sel).first().boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
/** a mouse drag from a card to a point, with a screenshot while it is held */
async function drag(card: string, to: { x: number; y: number }, name?: string) {
  const from = await center(card);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(150);
  if (name) await shot(name);
  await page.mouse.up();
}

beforeAll(async () => {
  for (const d of [playerDist, editorDist]) if (!existsSync(join(d, 'index.html'))) throw new Error(`Build first: npm run build:player && npm run build:editor (${d})`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  ({ app, base } = await startApp({ projectsDir: root, playerDist, editorDist }));
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 864 }, locale: 'zh-TW' });
}, 120000);
afterAll(async () => { await browser?.close(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

test('a scene card dragged between the two clips of the magnetic track goes in there and pushes the second on; Ctrl+Z takes it out', async () => {
  await open('scene');
  await page.waitForSelector('[data-add-source="src"]');
  await shot('page-video');
  const c2 = await center('[data-item-id="c2"]');
  await drag('[data-add-source="src"]', { x: c2.b.x + 4, y: c2.y }, 'drag-scene');
  await poll(() => items('scene', 'v').length).toBe(3);
  const v = items('scene', 'v');
  expect(v.map((i: any) => i.id).indexOf('c2')).toBe(2);         // the new clip went in before c2
  expect(v.find((i: any) => i.id === 'c2').start).toBeGreaterThan(2);
  await page.locator('.timeline').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await poll(() => items('scene', 'v').map((i: any) => i.id)).toEqual(['c1', 'c2']);
  // once analysed, each stretch of the source is a picture card
  await page.waitForSelector('[data-add-source="src"] .seg-pic', { timeout: 60000 });
  await page.waitForTimeout(300);
  await shot('page-video-thumbs');
}, 120000);

test('a block card dropped at the time of an item already on the overlay track shares the track in another lane', async () => {
  await open('block');
  await page.locator('[data-lib-tab="effects"]').click();
  await page.waitForSelector('[data-add-overlay="core.flash"]');
  await page.waitForSelector('.block-pic:not(.none)', { timeout: 30000 });   // the gallery's pictures
  await page.waitForTimeout(500);                                // measured and cropped
  await shot('page-effects');
  const f = await center('[data-item-id="f"]');
  await drag('[data-add-overlay="core.flash"]', { x: f.b.x + 10, y: f.y }, 'drag-block');
  await poll(() => items('block', 'o').length).toBe(2);
  const boxes = await page.locator('.timeline [data-row="o"] [data-item-id], .timeline [data-item-id]').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).dataset.itemId !== 'c1' && (e as HTMLElement).dataset.itemId !== 'c2').map((e) => e.getBoundingClientRect().top));
  expect(new Set(boxes.map(Math.round)).size).toBeGreaterThan(1);   // two lanes
}, 120000);

test('a music card held over the video track shows a red ghost; let go, nothing is added and the note says why', async () => {
  await open('music');
  await page.locator('[data-lib-tab="audio"]').click();
  await page.waitForSelector('[data-add-music="song"]');
  await shot('page-audio');
  const c1 = await center('[data-item-id="c1"]');
  const from = await center('[data-add-music="song"]');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(c1.x, c1.y, { steps: 12 });
  await page.waitForSelector('.drop-ghost.bad');
  await shot('drag-music-refused');
  await page.mouse.up();
  await poll(() => page.locator('body').innerText()).toContain(t('ed.dropWrongKind', {}, 'zh'));
  await page.waitForTimeout(1500);
  expect(items('music', 'v').length).toBe(2);
  expect(items('music', 'mu').length).toBe(0);
}, 120000);

test('a video file from the PC dropped on the timeline is copied into media/import, added, and placed there', async () => {
  await open('file');
  const bytes = readFileSync(join(root, 'file', 'src.mp4')).toString('base64');
  const c2 = await center('[data-item-id="c2"]');
  const dt = await page.evaluateHandle((b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), d = new DataTransfer();
    d.items.add(new File([raw], 'dropped.mp4', { type: 'video/mp4', lastModified: 1_700_000_000_000 }));
    return d;
  }, bytes);
  const fire = (type: string) => page.evaluate(([type, d, x, y]) => {
    document.querySelector('.timeline')!.dispatchEvent(new DragEvent(type as string, { dataTransfer: d as DataTransfer, clientX: x as number, clientY: y as number, bubbles: true, cancelable: true }));
  }, [type, dt, c2.b.x + c2.b.width - 4, c2.y] as const);
  await fire('dragover');
  await page.waitForSelector('.drop-line');
  await shot('drag-file');
  await fire('drop');
  await poll(() => Object.keys(disk('file').sources)).toContain('dropped');
  expect(disk('file').sources.dropped.path).toBe('media/import/dropped.mp4');
  expect(existsSync(join(root, 'file', 'media', 'import', 'dropped.mp4'))).toBe(true);
  await poll(() => items('file', 'v').map((i: any) => i.source)).toEqual(['src', 'src', 'dropped']);   // past c2's middle: after it
}, 120000);

test('a music card let go on the "+ New track" strip under the tracks makes a music track of its own; over the preview the card keeps following', async () => {
  await open('newtrack');
  await page.locator('[data-lib-tab="audio"]').click();
  await page.waitForSelector('[data-add-music="song"]');
  const from = await center('[data-add-music="song"]'), preview = await center('iframe[data-player]');
  const pointer = () => page.locator('iframe[data-player]').evaluate((f) => getComputedStyle(f).pointerEvents);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  // the player's iframe would take the moves passing over it: it ignores the pointer while a card is dragged
  await page.mouse.move(preview.x, preview.y, { steps: 6 });
  expect(await pointer()).toBe('none');
  const strip = await center('[data-drop-new="bottom"]');
  await page.mouse.move(strip.x, strip.y, { steps: 12 });
  await page.waitForSelector('[data-drop-new="bottom"].on');
  await shot('drag-new-track');
  await page.mouse.up();
  await poll(() => disk('newtrack').tracks.filter((x: any) => x.kind === 'music').length).toBe(2);
  const made = disk('newtrack').tracks.filter((x: any) => x.kind === 'music' && x.id !== 'mu');
  expect(made[0].items.map((i: any) => i.media)).toEqual(['song']);
  expect(items('newtrack', 'mu').length).toBe(0);
  expect(await pointer()).toBe('auto');
}, 120000);

test('a file from the PC dropped on the media panel is added to the project and placed nowhere', async () => {
  await open('panel');
  const bytes = readFileSync(join(root, 'panel', 'song.wav')).toString('base64');
  const panel = await center('aside.library');
  const dt = await page.evaluateHandle((b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), d = new DataTransfer();
    d.items.add(new File([raw], 'dropped.wav', { type: 'audio/wav', lastModified: 1_700_000_000_000 }));
    return d;
  }, bytes);
  const fire = (type: string) => page.evaluate(([type, d, x, y]) => {
    document.querySelector('aside.library')!.dispatchEvent(new DragEvent(type as string, { dataTransfer: d as DataTransfer, clientX: x as number, clientY: y as number, bubbles: true, cancelable: true }));
  }, [type, dt, panel.x, panel.y] as const);
  await fire('dragover');
  await page.waitForSelector('aside.library.file-over');
  await shot('drag-file-panel');
  await fire('drop');
  await poll(() => Object.keys(disk('panel').media)).toContain('dropped');
  expect(disk('panel').media.dropped.path).toBe('media/import/dropped.wav');
  await page.waitForTimeout(500);
  const all = disk('panel').tracks.flatMap((x: any) => x.items).map((i: any) => i.media ?? i.source ?? i.type);
  expect(all).not.toContain('dropped');
  await page.waitForSelector('aside.library:not(.file-over)');
}, 120000);
