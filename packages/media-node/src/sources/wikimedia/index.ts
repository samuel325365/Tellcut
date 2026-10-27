// Wikimedia Commons (spec 2026-10-22-external-sources §5): free pictures of places, things and history, searchable in Chinese. One
// generator=search call gives each file's size, thumbnail, author and licence. Since 2026 Wikimedia throttles callers that do not
// say who they are to about 10 requests a minute (and answers 429 at once to a bare user agent); with a contact it allows 200.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { cleanUrl, SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const META = { iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription', iiextmetadatalanguage: 'zh-tw' };
/** Commons makes thumbnails at fixed widths only (…, 1920, 3840): asking for 2560 brings the 3840 file */
const THUMB_WIDTH = 1920;
/** an original this size or smaller, in a format the player reads, is taken as it is */
const ORIGINAL_MAX_SIDE = 3840, ORIGINAL_MAX_BYTES = 20e6;
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** HTML from Commons metadata (an author's link, a description) as plain text */
export function plainText(html: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return html.replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== '#') return named[e.toLowerCase()] ?? m;
      // a number past the last code point (an author's typo, &#99999999;) stays as written: fromCodePoint throws on it
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/[​‎‏]/g, '').replace(/\s+/g, ' ').trim();
}

interface Info { width: number; height: number; size: number; mime: string; url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }
interface Page { pageid: number; title: string; index?: number; missing?: boolean; imageinfo?: Info[] }

const api = (params: Record<string, string>) => `${COMMONS}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`;
const meta = (i: Info, k: string) => plainText(i.extmetadata?.[k]?.value ?? '');
const titleOf = (p: Page) => p.title.replace(/^File:/, '').replace(/\.[^.]+$/, '');

/** MediaWiki answers an error with HTTP 200 and `error` ("Search is currently too busy", maxlag): busy for now, never "nothing found" */
const NOT_AN_ERROR = (b: { error?: unknown } | null) => !b?.error;
function mediaWikiError(r: { error?: { code?: string; info?: string } } | null) {
  if (r?.error) throw new SourceError('wikimedia', 'temporary', `暫時不能用（${r.error.info ?? r.error.code ?? 'error'}）`);
}

async function pages(ctx: SourceCtx, params: Record<string, string>, ttl: number): Promise<Page[]> {
  const r = await ctx.http.json<{ query?: { pages?: unknown }; error?: { code?: string; info?: string } }>(api(params), { ttl, cacheIf: NOT_AN_ERROR });
  mediaWikiError(r);
  // nothing found: Commons leaves `query` out altogether
  if (!r?.query) return [];
  if (!Array.isArray(r.query.pages)) throw new SourceError('wikimedia', 'broken', '回應格式看不懂（沒有 pages）');
  return r.query.pages as Page[];
}

/** portrait, landscape or square — the side of the film a ratio like 9:16 asks for */
function orientation(w: number, h: number): 'portrait' | 'landscape' | 'square' {
  const r = w / h;
  return r < 0.95 ? 'portrait' : r > 1.05 ? 'landscape' : 'square';
}

export const wikimedia: SourceAdapter = {
  id: 'wikimedia', label: 'Wikimedia Commons', category: 'media', kinds: ['image'], needsKey: false,
  limits: [{ n: 200, per: 60 }],
  limitsWithoutContact: [{ n: 10, per: 60 }],
  summary: 'Wikimedia Commons 的免費圖片：地點、建築、街景、歷史照片，中文關鍵字可搜（多為 CC BY／BY-SA，credits 自動標註）',
  sample: '台北101',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const want = q.ratio ? (() => { const [a, b] = q.ratio!.split(':').map(Number); return a > 0 && b > 0 ? orientation(a, b) : undefined; })() : undefined;
    const found = await pages(ctx, { generator: 'search', gsrnamespace: '6', gsrsearch: `${q.text} filetype:bitmap`, gsrlimit: String(want ? Math.min(50, q.limit * 3) : q.limit),
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '330', ...META }, 86400);
    const hits: AssetHit[] = [];
    for (const p of found.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      const i = p.imageinfo?.[0];
      // a GIF (filetype:bitmap includes them) stays a GIF as a thumbnail too, and the player cannot use one
      if (!i || i.mime === 'image/gif' || (want && orientation(i.width, i.height) !== want)) continue;
      const author = meta(i, 'Artist'), license = meta(i, 'LicenseShortName');
      hits.push({ ref: `wikimedia:${p.pageid}`, source: 'wikimedia', id: String(p.pageid), kind: 'image', title: titleOf(p), width: i.width, height: i.height,
        ...(i.thumburl ? { thumbUrl: cleanUrl(i.thumburl) } : {}), ...(author ? { author } : {}), detail: [`${i.width}×${i.height}`, license, author].filter(Boolean).join(' · ') });
    }
    return hits.slice(0, q.limit);
  },

  async get(id, ctx) {
    const [p] = await pages(ctx, { pageids: id, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(THUMB_WIDTH), ...META }, 86400);
    const i = p?.imageinfo?.[0];
    if (!p || p.missing || !i) throw new SourceError('wikimedia', 'missing', `Commons 沒有 ${id} 這個檔案`);
    // an SVG, a TIFF or a very big picture: the raster thumbnail Commons makes of it
    const original = RASTER.has(i.mime) && Math.max(i.width, i.height) <= ORIGINAL_MAX_SIDE && i.size <= ORIGINAL_MAX_BYTES;
    // a landscape picture 1920 wide is only 1440 high: a 9:16 film would blow it up, so the next width Commons makes (3840)
    let thumb = i.thumburl;
    if (!original && i.width > i.height && i.width > ORIGINAL_MAX_SIDE) {
      const [wide] = await pages(ctx, { pageids: id, prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(ORIGINAL_MAX_SIDE) }, 86400);
      thumb = wide?.imageinfo?.[0]?.thumburl ?? thumb;
    }
    const url = cleanUrl(original || !thumb ? i.url : thumb), file = join(ctx.tmpDir, `wikimedia-${id}${extname(new URL(url).pathname).toLowerCase()}`);
    await ctx.http.download(url, file, { maxBytes: 50e6 });
    const licenseUrl = meta(i, 'LicenseUrl');
    return { file, kind: 'image', meta: { source: 'wikimedia', id, title: titleOf(p), author: meta(i, 'Artist') || 'Wikimedia Commons', page: cleanUrl(i.descriptionurl),
      license: meta(i, 'LicenseShortName') || '見作品頁', ...(licenseUrl ? { licenseUrl } : {}), quality: original ? 'original' : 'preview' } };
  },

  async check(ctx) {
    const r = await ctx.http.json<{ query?: { general?: { sitename?: string } }; error?: { code?: string; info?: string } }>(api({ meta: 'siteinfo', siprop: 'general' }));
    mediaWikiError(r);
    const name = r?.query?.general?.sitename;
    if (!name) throw new SourceError('wikimedia', 'broken', '回應格式看不懂（沒有 siteinfo）');
    return `Commons 可連線（${name}）`;
  },

  credit: (r) => `- Image: "${r.title}" by ${r.author} (${r.page}), ${r.license}${r.licenseUrl ? ` ${r.licenseUrl}` : ''}`,

  data: (query, ctx) => wikiIntro(query, ctx),
};

/** an intro longer than this is cut: enough to check a fact, short enough for the page chat's budget */
const INTRO_MAX = 1200;
const SOURCE_LINE = '來源：維基百科（CC BY-SA 4.0），旁白引用要自己改寫';
interface WikiPage { title: string; missing?: boolean; invalid?: boolean; extract?: string; fullurl?: string; index?: number; pageprops?: { disambiguation?: string }; varianttitles?: Record<string, string> }

/** The intro of a Wikipedia article in Traditional Chinese (zh, variant zh-tw; `--opt lang=en` for another Wikipedia), to check
 *  narration against: a redirect is followed, a disambiguation page or an unknown title answered with the nearest titles. */
async function wikiIntro(query: string, ctx: SourceCtx): Promise<string> {
  const lang = String(ctx.options.lang ?? 'zh');
  if (!/^[a-z][a-z-]{1,11}$/.test(lang)) throw new Error('--opt lang 要像 zh、en、ja（維基百科的語言代碼）');
  const base = `https://${lang}.wikipedia.org/w/api.php`, zh = lang === 'zh';
  const ask = async (params: Record<string, string>) => {
    const r = await ctx.http.json<{ query?: { pages?: WikiPage[]; redirects?: Array<{ from: string; to: string }> }; error?: { code?: string; info?: string } }>(
      `${base}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...(zh ? { variant: 'zh-tw' } : {}), ...params })}`, { ttl: 7 * 86400, cacheIf: NOT_AN_ERROR });
    mediaWikiError(r);
    return r?.query;
  };
  // converttitles: 臺北車站 finds the article titled 台北車站 (or its Simplified twin) without a search round
  const page = (title: string) => ask({ redirects: '1', ...(zh ? { converttitles: '1' } : {}), prop: 'extracts|pageprops|info', exintro: '1', explaintext: '1', inprop: 'url|varianttitles', ppprop: 'disambiguation', titles: title });
  const nearest = async (text: string) => ((await ask({ generator: 'search', gsrsearch: text, gsrlimit: '5', prop: 'info', inprop: 'varianttitles' }))?.pages ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const shown = (p: WikiPage) => (zh && p.varianttitles?.['zh-tw']) || p.title;
  const block = (p: WikiPage, extra: string[] = []) => {
    const text = (p.extract ?? '').trim(), intro = text.length > INTRO_MAX ? `${text.slice(0, INTRO_MAX)}…（全文見網址）` : text;
    return [`${shown(p)}（${p.fullurl ? decodeURI(p.fullurl) : ''}）`, ...extra, '', intro].join('\n');
  };

  // a title MediaWiki cannot have ([, ], {, }, |, #, <, >) comes back `invalid` with no text: the search below takes it instead
  const q = /[[\]{}|#<>]/.test(query) ? undefined : await page(query), p = q?.pages?.[0];
  if (p && !p.missing && !p.invalid) {
    const extra = q?.redirects?.length ? [`（「${q.redirects[0].from}」重新導向到這裡）`] : [];
    if (p.pageprops?.disambiguation !== undefined) {
      const others = (await nearest(query)).filter((c) => c.title !== p.title).map(shown);
      extra.push('⚠ 這是消歧義頁，請改查下面其中一個：', ...others);
    }
    return [block(p, extra), '', SOURCE_LINE].join('\n');
  }
  const words = query.replace(/[[\]{}|#<>]/g, ' ').trim(), found = words ? await nearest(words) : [];
  if (!found.length) return `維基百科沒有「${query}」的條目`;
  const first = (await page(found[0].title))?.pages?.[0];
  return [`找不到條目「${query}」，最接近的是：`, ...found.map(shown), '', ...(first && !first.missing ? [block(first), ''] : []), SOURCE_LINE].join('\n');
}
