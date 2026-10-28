// A company's website as brand material (spec 2026-10-28-brand-preset-rethink §2): the first screen as a picture, the colours the
// page is painted in and the fonts of its heading and text, into the project's media/brand/:
//   npm run tellcut -- site <id> <url>
// The page chat's agent can only run npm run tellcut, so reading the site is a tellcut command. A site that cannot be read (offline,
// blocked, behind a login) fails in one line and the film is made from the logo and the introduction as before.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from '@tellcut/media-node';

export interface SiteInfo {
  url: string; title: string; description: string;
  /** #rrggbb by how much of the first screen they paint (backgrounds by area, text by its letters), near ones merged, at most 6 */
  colors: string[];
  /** the first family of the heading's (h1, else h2) and the body's font-family; heading null when the page has neither */
  fonts: { heading: string | null; body: string | null };
  /** project-relative: the first screen, 1440×900 */
  screenshot: string;
  /** the page's og:image, as an address (not downloaded) */
  image: string | null;
}

const W = 1440, H = 900;
/** colours closer than this (RGB distance) are one colour */
const NEAR = 24;

// Runs in the page, as a string (a function would be serialised with the bundler's helpers). Backgrounds: a grid of points, each
// taking the first opaque background under it (a picture or a gradient there: the point is skipped, the screenshot shows it). Text:
// every visible text node, weighted by its letters × font size², about the area its letters cover.
const MEASURE = `(() => {
  const W = innerWidth, H = innerHeight, STEP = 16, weights = new Map();
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true }), memo = new Map();
  const rgba = (css) => {
    if (memo.has(css)) return memo.get(css);
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = css; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data, out = [d[0], d[1], d[2], d[3] / 255];
    memo.set(css, out); return out;
  };
  const hex = (v) => '#' + v.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
  const add = (h, w) => weights.set(h, (weights.get(h) || 0) + w);
  const opaque = (el) => { const v = rgba(getComputedStyle(el).backgroundColor); return v[3] >= 0.9 ? v : null; };
  const canvasBg = opaque(document.documentElement) || (document.body && opaque(document.body)) || [255, 255, 255, 1];
  for (let y = STEP / 2; y < H; y += STEP) for (let x = STEP / 2; x < W; x += STEP) {
    let el = document.elementFromPoint(x, y), bg = null, skip = false;
    for (; el; el = el.parentElement) {
      if (/^(IMG|VIDEO|CANVAS|IFRAME|svg|PICTURE)$/.test(el.tagName)) { skip = true; break; }
      const st = getComputedStyle(el);
      if (st.backgroundImage !== 'none') { skip = true; break; }
      const v = opaque(el);
      if (v) { bg = v; break; }
    }
    if (!skip) add(hex(bg || canvasBg), STEP * STEP);
  }
  const walk = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent.trim(), el = n.parentElement;
    if (!text || !el) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    if (!b.width || !b.height || b.bottom <= 0 || b.top >= H || b.right <= 0 || b.left >= W) continue;
    const v = rgba(st.color), fs = parseFloat(st.fontSize) || 16;
    if (v[3] >= 0.5) add(hex(v), text.length * fs * fs * 0.5);
  }
  const first = (el) => {
    if (!el) return null;
    const f = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    return f || null;
  };
  const meta = (sel) => { const m = document.querySelector(sel); return m ? m.getAttribute('content') || '' : ''; };
  const og = meta('meta[property="og:image"]');
  return {
    weights: [...weights.entries()],
    fonts: { heading: first(document.querySelector('h1') || document.querySelector('h2')), body: first(document.body) },
    title: document.title || '',
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    image: og ? new URL(og, location.href).href : null,
  };
})()`;

/** the colours by weight, each merged into a heavier one within NEAR of it; the first `n` */
export function mainColours(weights: Array<[string, number]>, n = 6): string[] {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const kept: Array<{ hex: string; v: number[]; w: number }> = [];
  for (const [hex, w] of [...weights].sort((a, b) => b[1] - a[1])) {
    const v = rgb(hex), near = kept.find((k) => Math.hypot(k.v[0] - v[0], k.v[1] - v[1], k.v[2] - v[2]) < NEAR);
    if (near) near.w += w; else kept.push({ hex, v, w });
  }
  return kept.sort((a, b) => b.w - a.w).slice(0, n).map((k) => k.hex);
}

/** Opens `url` in Chrome and writes media/brand/site.png (the first screen) and site.json into `projectDir`. */
export async function readSite(url: string, projectDir: string, o: { timeoutMs?: number } = {}): Promise<SiteInfo> {
  const ms = o.timeoutMs ?? 30000, dir = join(projectDir, 'media', 'brand'), shot = 'media/brand/site.png';
  const tmp = join(dir, '.site-new.png');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  // one deadline for the whole read (a web font or a script that never answers held fonts.ready and the screenshot for minutes):
  // when it passes, the browser is closed, which ends whatever step was waiting
  const end = Date.now() + ms, left = () => Math.max(1000, end - Date.now());
  const read = async (): Promise<SiteInfo> => {
    browser = await chromium.launch({ executablePath: chromePath(), headless: true, timeout: left() });
    // the headless browser's own name (HeadlessChrome) is turned away by some sites
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36` });
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: left() });
    if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
    // the rest of the page (pictures, fonts) within what is left of the time; a site whose trackers never finish is read as it is
    await page.waitForLoadState('load', { timeout: left() }).catch(() => {});
    await page.evaluate(`Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${Math.min(5000, left())}))]).then(() => new Promise((r) => setTimeout(r, 800)))`);
    const m = await page.evaluate(MEASURE) as { weights: Array<[string, number]>; fonts: SiteInfo['fonts']; title: string; description: string; image: string | null };
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: tmp, timeout: left() });
    const info: SiteInfo = { url: page.url(), title: m.title, description: m.description, colors: mainColours(m.weights), fonts: m.fonts, screenshot: shot, image: m.image };
    renameSync(tmp, join(projectDir, shot));
    writeFileSync(join(dir, 'site.json'), JSON.stringify(info, null, 2));
    return info;
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error(`超過 ${Math.round(ms / 1000)} 秒`)), ms); })]);
  } catch (e) {
    rmSync(tmp, { force: true });
    const why = ((e as Error).message ?? String(e)).split('\n')[0].replace(/^page\.goto:\s*/, '');
    throw new Error(`讀不到官網 ${url}（${why}）：照常用商標和公司介紹`);
  } finally {
    clearTimeout(timer);
    await browser?.close().catch(() => {});
  }
}
