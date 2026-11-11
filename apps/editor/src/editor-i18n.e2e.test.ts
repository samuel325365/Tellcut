// End-to-end: the three interface languages. Home and gallery are fully translated; editor labels are English in every language, tooltips follow the language.
import type { Browser, Page } from 'playwright-core';
import { demoProject } from '@tellcut/server/test-utils';
import { projectsRoot, startEditor, stopEditor, writeProject, type App } from '../e2e-kit.ts';

const root = projectsRoot('_e2e_i18n');
let app: App, base: string, browser: Browser;
const CJK = /[㐀-鿿]/;
const KANA = /[぀-ヿ]/;

// no shared page: each test opens its own, in the language it checks
beforeAll(async () => {
  ({ app, base, browser } = await startEditor({ root, setup: () => writeProject(root, 'lang', demoProject()), viewport: null }));
}, 120000);

afterAll(() => stopEditor(root, { browser, app }));

async function open(locale: string, url: string, ready: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale });
  await page.goto(`${base}${url}`);
  await page.waitForSelector(ready, { timeout: 30000 });
  return page;
}

/** the page text without the parts that are never translated (the selectors) */
const textWithout = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const c = document.body.cloneNode(true) as HTMLElement;
  for (const s of sels) c.querySelectorAll(s).forEach((e) => e.remove());
  return c.textContent ?? '';
}, selectors);

test('home and gallery in English and Japanese show no Chinese apart from names and parameters', async () => {
  const home = await open('en-US', '/editor/', '.home');
  await home.waitForSelector('.card');
  // only what is never translated is left out: project names and Claude's replies; card chrome and attachment text are checked
  const homeSel = ['.card .title', '.msg.assistant', '.lang-switch'];
  expect(await textWithout(home, homeSel)).not.toMatch(CJK);
  await home.click('[data-attach]');
  await home.waitForSelector('[data-place]');
  const places = await home.locator('[data-place]').allTextContents();
  expect(places.length).toBeGreaterThan(0);
  for (const p of places) expect(p).not.toMatch(CJK);
  await home.click('[data-import] .icon-btn');   // close the dialog
  await home.click('[data-lang="ja"]');
  await home.waitForFunction('document.documentElement.lang === "ja" || /[\\u3040-\\u30ff]/.test(document.body.textContent)');
  const ja = await textWithout(home, homeSel);   // kanji are fine in Japanese, so only the kana is checked
  expect(ja).toMatch(KANA);
  await home.close();

  const gallery = await open('en-US', '/editor/?gallery', '.g-browse');
  const gallerySel = ['[data-params]', 'iframe', '.lang-switch'];
  expect(await textWithout(gallery, gallerySel)).not.toMatch(CJK);
  await gallery.click('[data-lang="ja"]');
  await gallery.waitForFunction('/[\\u3040-\\u30ff]/.test(document.body.textContent)');
  expect(await textWithout(gallery, gallerySel)).toMatch(KANA);
  await gallery.close();
}, 120000);

test('editor labels are English in every language; tooltips follow it', async () => {
  const labels: string[] = [], tips: string[] = [];
  for (const locale of ['zh-TW', 'en-US', 'ja-JP']) {
    const page = await open(locale, '/editor/?id=lang', '[data-player="ready"]');
    labels.push(await page.evaluate(`[...document.querySelectorAll('.toolbar button, .toolbar select, .tl-tray button, .tl-tray select, .tabs button, [role=tab]')].map((e) => e.textContent.trim()).join('|')`));
    // no control is clipped: the tray's "+ Track" select and the header buttons show their whole text
    const clipped = await page.evaluate(`[...document.querySelectorAll('.tl-tray select, .row .head button')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.className + ':' + e.textContent)`);
    expect(clipped).toEqual([]);
    // a <select> never reports its clipped text through scrollWidth: compare the widest option (measured) with the box minus the arrow
    // (a Mac's menulist arrow takes about 16 px, Windows' about 20: an auto-width select there is the text plus 16)
    const short = await page.evaluate(`[...document.querySelectorAll('.tl-tray select')].filter((s) => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(s).font; const w = Math.max(...[...s.options].map((o) => c.measureText(o.textContent).width)); return s.clientWidth < w + ${process.platform === 'darwin' ? 14 : 20}; }).map((s) => s.clientWidth + ':' + [...s.options].map((o) => o.textContent).join('/'))`);
    expect(short).toEqual([]);
    await page.hover('[data-snap]');
    await page.waitForSelector('[data-tooltip]');
    await page.waitForFunction('(() => { const t = document.querySelector("[data-tooltip]"); return !!t && t.textContent.length > 0; })()');
    tips.push((await page.locator('[data-tooltip]').textContent())!);
    await page.close();
  }
  expect(labels[0]).toMatch(/Snap: /);
  expect(labels[0]).not.toMatch(CJK);
  expect(labels[1]).toBe(labels[0]);
  expect(labels[2]).toBe(labels[0]);
  expect(tips[0]).toMatch(CJK);
  expect(tips[0]).not.toMatch(KANA);
  expect(tips[1]).not.toMatch(CJK);
  expect(tips[1]).not.toMatch(KANA);
  expect(tips[2]).toMatch(KANA);
}, 120000);
