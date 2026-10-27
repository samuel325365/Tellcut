// Game wikis (spec 2026-10-24-api-picker §5): Super Mario Wiki and Zelda Wiki — the fan encyclopaedias of two of Nintendo's biggest
// series — through their own MediaWiki APIs (no key). Bulbapedia was dropped: Cloudflare answers Node's requests with a bot check
// whatever they say they are (2026-10-24), and PokeAPI has the Pokémon. Pictures: each matching article's lead image (usually the character's
// official art) first, then files whose names match. Facts: an article's intro (TextExtracts). The pictures are the game companies'
// (the wikis host them as fair use) and the texts are under each wiki's licence: both recorded, not a gate.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';
import { plainText } from '../wikimedia/index.ts';

interface Wiki { id: string; name: string; api: string; text: string; textUrl: string }
export const WIKIS: Wiki[] = [
  { id: 'mario', name: 'Super Mario Wiki', api: 'https://www.mariowiki.com/api.php', text: 'CC BY-SA 4.0', textUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'zelda', name: 'Zelda Wiki', api: 'https://zeldawiki.wiki/w/api.php', text: 'GFDL 1.3', textUrl: 'https://www.gnu.org/licenses/fdl-1.3.html' },
];
/** each wiki is a site of its own: its own rate limit */
const WIKI_LIMITS = [{ n: 30, per: 60 }];
const THUMB = 330, BIG = 1920, ORIGINAL_MAX_SIDE = 3840, ORIGINAL_MAX_BYTES = 20e6, INTRO_MAX = 900;
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface Info { width: number; height: number; size: number; mime: string; url: string; thumburl?: string; descriptionurl?: string }
interface Page { pageid?: number; title: string; index?: number; missing?: boolean; imageinfo?: Info[]; pageimage?: string; extract?: string; fullurl?: string }

/** the wiki --opt wiki names (mario, zelda), both when it is not given */
function wikisOf(ctx: SourceCtx): Wiki[] {
  const w = ctx.options.wiki;
  if (w === undefined) return WIKIS;
  const one = WIKIS.find((x) => x.id === w);
  if (!one) throw new Error(`--opt wiki 只能是 ${WIKIS.map((x) => x.id).join('、')}`);
  return [one];
}

async function query(ctx: SourceCtx, wiki: Wiki, params: Record<string, string>, ttl = 86400): Promise<Page[]> {
  const r = await ctx.sub(wiki.id, WIKI_LIMITS).json<{ query?: { pages?: unknown }; error?: { info?: string; code?: string } }>(
    `${wiki.api}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`, { ttl, cacheIf: (b) => !b?.error });
  // MediaWiki answers an error with HTTP 200 (a busy search, maxlag): unavailable for now, never "nothing found"
  if (r?.error) throw new SourceError('game-wikis', 'temporary', `${wiki.name} 暫時不能用（${r.error.info ?? r.error.code ?? 'error'}）`);
  if (!r?.query) return [];
  if (!Array.isArray(r.query.pages)) throw new SourceError('game-wikis', 'broken', `${wiki.name} 的回應格式看不懂（沒有 pages）`);
  return r.query.pages as Page[];
}

const bareTitle = (t: string) => t.replace(/^File:/, '').replace(/\.[^.]+$/, '');
const sameTitle = (a: string, b: string) => a.replace(/_/g, ' ') === b.replace(/_/g, ' ');

/** Each wiki's answer: one that fails costs only its own part, unless all fail (then the first failure is the answer). */
async function eachWiki<T>(wikis: Wiki[], ask: (w: Wiki) => Promise<T>): Promise<T[]> {
  const settled = await Promise.allSettled(wikis.map(ask));
  const ok = settled.filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw (settled.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason;
  return ok;
}

/** One wiki's pictures for a search: the lead images of the matching articles in their order, then the matching files. */
async function pictures(ctx: SourceCtx, wiki: Wiki, text: string, limit: number): Promise<AssetHit[]> {
  const articles = (await query(ctx, wiki, { generator: 'search', gsrnamespace: '0', gsrsearch: text, gsrlimit: String(Math.min(5, limit)), prop: 'pageimages', piprop: 'name' }))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const leads = [...new Set(articles.map((p) => p.pageimage).filter((x): x is string => !!x))];
  const info = { prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(THUMB) };
  const leadPages = leads.length ? await query(ctx, wiki, { titles: leads.map((x) => `File:${x}`).join('|'), ...info }) : [];
  const files = (await query(ctx, wiki, { generator: 'search', gsrnamespace: '6', gsrsearch: text, gsrlimit: String(limit), ...info })).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const ordered = [...leads.map((l) => leadPages.find((p) => sameTitle(p.title, `File:${l}`))).filter((p): p is Page => !!p), ...files];
  const seen = new Set<number>(), hits: AssetHit[] = [];
  for (const p of ordered) {
    const i = p.imageinfo?.[0];
    // a GIF stays a GIF as a thumbnail too, and the player cannot use one
    if (!p.pageid || !i || seen.has(p.pageid) || i.mime === 'image/gif') continue;
    seen.add(p.pageid);
    const id = `${wiki.id}-${p.pageid}`;
    hits.push({ ref: `game-wikis:${id}`, source: 'game-wikis', id, kind: 'image', title: bareTitle(p.title), width: i.width, height: i.height,
      ...(i.thumburl ? { thumbUrl: i.thumburl } : {}), author: wiki.name, detail: `${wiki.name} · ${i.width}×${i.height}` });
  }
  return hits;
}

export const gameWikis: SourceAdapter = {
  id: 'game-wikis', label: 'Game wikis', category: 'fandom', kinds: ['image'], needsKey: false,
  limits: [{ n: 90, per: 60 }],
  summary: '遊戲維基：超級瑪利歐 Wiki、薩爾達 Wiki 的角色、道具、場景圖和條目摘要（英文關鍵字；--opt wiki=mario|zelda）',
  sample: 'Yoshi',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const lists = await eachWiki(wikisOf(ctx), (w) => pictures(ctx, w, q.text, q.limit));
    const hits: AssetHit[] = [];
    for (let k = 0; lists.some((l) => k < l.length); k++) for (const l of lists) if (k < l.length) hits.push(l[k]);
    return hits.slice(0, q.limit);
  },

  async get(id, ctx) {
    const m = /^([a-z]+)-(\d+)$/.exec(id), wiki = m && WIKIS.find((w) => w.id === m[1]);
    if (!m || !wiki) throw new SourceError('game-wikis', 'missing', `編號要像 mario-457287（維基-檔案編號），收到「${id}」`);
    const [p] = await query(ctx, wiki, { pageids: m[2], prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: String(BIG) });
    const i = p?.imageinfo?.[0];
    if (!p || p.missing || !i) throw new SourceError('game-wikis', 'missing', `${wiki.name} 沒有 ${m[2]} 這個檔案`);
    const original = RASTER.has(i.mime) && Math.max(i.width, i.height) <= ORIGINAL_MAX_SIDE && i.size <= ORIGINAL_MAX_BYTES;
    const url = original || !i.thumburl ? i.url : i.thumburl, file = join(ctx.tmpDir, `game-wikis-${id}${extname(new URL(url).pathname).toLowerCase()}`);
    await ctx.http.download(url, file, { maxBytes: 50e6 });
    return { file, kind: 'image', meta: { source: 'game-wikis', id, title: bareTitle(p.title), author: wiki.name, page: i.descriptionurl ?? url,
      license: `© 原權利人（遊戲公司）；${wiki.name} 以合理使用收錄`, quality: original ? 'original' : 'preview' } };
  },

  async check(ctx) {
    const names = await Promise.all(WIKIS.map(async (w) => {
      const r = await ctx.sub(w.id, WIKI_LIMITS).json<{ query?: { general?: { sitename?: string } } }>(`${w.api}?action=query&format=json&formatversion=2&meta=siteinfo&siprop=general`);
      if (!r?.query?.general?.sitename) throw new SourceError('game-wikis', 'broken', `${w.name} 的回應格式看不懂（沒有 siteinfo）`);
      return r.query.general.sitename;
    }));
    return `${names.join('、')} 可連線`;
  },

  credit: (r) => `- Image: "${r.title}" via ${r.author} (${r.page}), ${r.license}`,

  async data(query_, ctx) {
    const blocks = await eachWiki(wikisOf(ctx), async (w) => {
      const [p] = await query(ctx, w, { redirects: '1', prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', inprop: 'url', piprop: 'name', titles: query_ }, 7 * 86400);
      // an article without an intro (an infobox and a list) is still the article: named, with its address
      if (p && !p.missing) {
        const text = plainText(p.extract ?? ''), intro = text.length > INTRO_MAX ? `${text.slice(0, INTRO_MAX)}…（全文見網址）` : text;
        return [`【${w.name}】${p.title}（${p.fullurl ?? ''}）`, ...(p.pageimage ? [`主圖：${p.pageimage}（assets search "${p.title}" --source game-wikis --opt wiki=${w.id} 第一筆）`] : []),
          intro || '（這個條目沒有導言，見網址）', `文字授權：${w.text}`].join('\n');
      }
      const near = (await query(ctx, w, { generator: 'search', gsrnamespace: '0', gsrsearch: query_, gsrlimit: '5' }, 7 * 86400)).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((x) => x.title);
      return near.length ? `【${w.name}】沒有條目「${query_}」，最接近的：${near.join('、')}` : `【${w.name}】沒有「${query_}」`;
    });
    return [...blocks, '（英文條目；旁白引用要自己改寫成中文）'].join('\n\n');
  },
};
