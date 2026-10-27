// Steam's store (spec 2026-10-24-api-picker §5): games in Traditional Chinese with Taiwan prices — description, developer, release
// date, genres, Metacritic score — and their art (a portrait cover, a wide hero, the header), screenshots and trailers; plus the
// most-played chart. Unofficial: storesearch and appdetails are the store page's own endpoints, undocumented and without a key, so
// the public default leaves it off. Trailers are HLS streams only: ffmpeg copies one into an MP4 (after http.ts has taken a slot
// and checked it answers). The art belongs to the games' publishers: recorded, not a gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpeg } from '../../ffmpeg.ts';
import { SourceError, userAgent } from '../http.ts';
import type { AssetHit, AssetKind, SourceAdapter, SourceCtx } from '../types.ts';

const STORE = 'https://store.steampowered.com/api';
const ART = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';
const DAY = 86400;
/** the store's own art of every game: portrait cover (1200×1800), wide hero (1920×620), header (460×215) */
const ARTS: Record<string, { file: string; label: string }> = {
  cover: { file: 'library_600x900_2x.jpg', label: '直式封面' }, hero: { file: 'library_hero.jpg', label: '橫幅主視覺' }, header: { file: 'header.jpg', label: '商店橫幅（小）' },
};
/** the games a search opens (one appdetails each) */
const GAMES_PER_SEARCH = 3;
/** a trailer is cut here: the store's run a few minutes at most */
const TRAILER_MAX_SEC = 600;

interface SearchItem { type: string; id: number; name: string; metascore?: string; price?: { final: number; currency: string } }
interface Movie { id: number; name: string; thumbnail: string; hls_h264?: string }
interface App {
  name: string; steam_appid: number; short_description?: string; developers?: string[]; publishers?: string[]; price_overview?: { final_formatted?: string };
  metacritic?: { score?: number }; genres?: Array<{ description: string }>; recommendations?: { total?: number }; release_date?: { date?: string; coming_soon?: boolean };
  screenshots?: Array<{ id: number; path_thumbnail: string; path_full: string }>; movies?: Movie[];
}

/** the trailer copier, swapped out by the tests (no network there) */
export const steamDeps = {
  async hls(url: string, out: string) {
    // ffmpeg picks the best video and audio of the master playlist; the segments are copied, not re-encoded
    await ffmpeg(['-user_agent', userAgent(), '-i', url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-t', String(TRAILER_MAX_SEC), '-movflags', '+faststart', out]);
  },
};

async function search(ctx: SourceCtx, term: string): Promise<SearchItem[]> {
  const r = await ctx.http.json<{ items?: SearchItem[] }>(`${STORE}/storesearch/?${new URLSearchParams({ term, l: 'tchinese', cc: 'TW' })}`, { ttl: DAY });
  if (!Array.isArray(r?.items)) throw new SourceError('steam', 'broken', '回應格式看不懂（storesearch 沒有 items）');
  return r.items.filter((x) => x.type === 'app');
}

async function app(ctx: SourceCtx, id: number): Promise<App | null> {
  const r = await ctx.http.json<Record<string, { success?: boolean; data?: App }>>(`${STORE}/appdetails?${new URLSearchParams({ appids: String(id), l: 'tchinese', cc: 'tw' })}`, { ttl: DAY });
  const one = r?.[String(id)];
  if (!one || typeof one.success !== 'boolean') throw new SourceError('steam', 'broken', '回應格式看不懂（appdetails）');
  return one.success && one.data ? one.data : null;
}

/** "1245620", or a name: the first game the store finds */
async function resolve(ctx: SourceCtx, query: string): Promise<{ app: App | null; others: SearchItem[] }> {
  if (/^\d+$/.test(query.trim())) return { app: await app(ctx, Number(query)), others: [] };
  const found = await search(ctx, query);
  return { app: found[0] ? await app(ctx, found[0].id) : null, others: found.slice(1, 6) };
}

function hitsOf(a: App, kind: AssetKind | undefined): AssetHit[] {
  const id = a.steam_appid, hits: AssetHit[] = [];
  if (kind !== 'video') {
    for (const [k, v] of Object.entries(ARTS)) hits.push({ ref: `steam:${id}-${k}`, source: 'steam', id: `${id}-${k}`, kind: 'image', title: `${a.name}（${v.label}）`, thumbUrl: `${ART}/${id}/${v.file}`, detail: v.label });
    for (const [i, s] of (a.screenshots ?? []).slice(0, 4).entries()) hits.push({ ref: `steam:${id}-shot-${i}`, source: 'steam', id: `${id}-shot-${i}`, kind: 'image', title: `${a.name}（截圖 ${i + 1}）`, thumbUrl: s.path_thumbnail, detail: '截圖 1920×1080' });
  }
  if (kind !== 'image') {
    for (const m of (a.movies ?? []).filter((m) => m.hls_h264)) hits.push({ ref: `steam:${id}-movie-${m.id}`, source: 'steam', id: `${id}-movie-${m.id}`, kind: 'video', title: `${a.name}：${m.name}`, thumbUrl: m.thumbnail, detail: '預告片' });
  }
  return hits;
}

export const steam: SourceAdapter = {
  id: 'steam', label: 'Steam', category: 'fandom', kinds: ['image', 'video'], needsKey: false, unofficial: true,
  limits: [{ n: 150, per: 300 }],
  summary: 'Steam 商店（非官方）：遊戲的直式封面、橫幅、截圖、預告片（--kind video），資料有繁中介紹、開發商、發售日、類型、Metacritic、台幣價格；assets data steam top 是同時在線排行',
  sample: 'elden ring',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const games = /^\d+$/.test(q.text.trim()) ? [{ id: Number(q.text) }] : (await search(ctx, q.text)).slice(0, GAMES_PER_SEARCH);
    const apps = (await Promise.all(games.map((g) => app(ctx, g.id)))).filter((a): a is App => !!a);
    // the first game's pictures and trailers first: a search is almost always for one game
    return apps.flatMap((a) => hitsOf(a, q.kind)).slice(0, q.limit);
  },

  async get(id, ctx) {
    const m = /^(\d+)-(cover|hero|header|shot-(\d+)|movie-(\d+))$/.exec(id);
    if (!m) throw new SourceError('steam', 'missing', `編號要像 1245620-cover、1245620-shot-0、1245620-movie-<編號>，收到「${id}」`);
    const a = await app(ctx, Number(m[1]));
    if (!a) throw new SourceError('steam', 'missing', `Steam 沒有 ${m[1]} 這個遊戲`);
    const meta = (title: string) => ({ source: 'steam', id, title, author: [...(a.developers ?? []), ...(a.publishers ?? [])].filter((x, i, l) => l.indexOf(x) === i).join(', ') || 'Steam',
      page: `https://store.steampowered.com/app/${a.steam_appid}/`, license: '© 遊戲開發商／發行商（商店宣傳素材）', quality: 'original' as const });
    if (m[4]) {
      const movie = a.movies?.find((x) => String(x.id) === m[4]);
      if (!movie?.hls_h264) throw new SourceError('steam', 'missing', `${a.name} 沒有編號 ${m[4]} 的預告片`);
      // the slot and the reachability check go through http.ts; ffmpeg then reads the playlist and its segments
      await ctx.http.head(movie.hls_h264);
      const file = join(ctx.tmpDir, `steam-${id}.mp4`);
      await steamDeps.hls(movie.hls_h264, file);
      return { file, kind: 'video', meta: meta(`${a.name}：${movie.name}`) };
    }
    const shot = m[3] !== undefined ? a.screenshots?.[Number(m[3])] : undefined;
    if (m[3] !== undefined && !shot) throw new SourceError('steam', 'missing', `${a.name} 沒有第 ${Number(m[3]) + 1} 張截圖`);
    const art = ARTS[m[2]], url = shot ? shot.path_full : `${ART}/${a.steam_appid}/${art.file}`;
    const file = join(ctx.tmpDir, `steam-${id}.jpg`);
    await ctx.http.download(url, file, { maxBytes: 20e6 })
      .catch((e) => { if (e instanceof SourceError && e.kind === 'missing') throw new SourceError('steam', 'missing', `${a.name} 沒有${art?.label ?? '這張圖'}`); throw e; });
    return { file, kind: 'image', meta: meta(`${a.name}（${shot ? `截圖 ${Number(m[3]) + 1}` : art.label}）`) };
  },

  async check(ctx) {
    const r = await ctx.http.json<{ items?: unknown[] }>(`${STORE}/storesearch/?${new URLSearchParams({ term: 'portal', l: 'tchinese', cc: 'TW' })}`);
    if (!Array.isArray(r?.items)) throw new SourceError('steam', 'broken', '回應格式看不懂（storesearch 沒有 items）');
    return `storesearch 可連線（portal：${r.items.length} 筆）`;
  },

  credit: (r) => `- Steam: "${r.title}" by ${r.author} (${r.page}), ${r.license}`,

  async data(query, ctx) {
    if (query.trim().toLowerCase() === 'top') {
      const r = await ctx.http.json<{ response?: { ranks?: Array<{ rank: number; appid: number; last_week_rank?: number; peak_in_game?: number }> } }>('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/', { ttl: 6 * 3600 });
      const ranks = r?.response?.ranks;
      if (!Array.isArray(ranks)) throw new SourceError('steam', 'broken', '回應格式看不懂（GetMostPlayedGames 沒有 ranks）');
      const top = ranks.slice(0, 10), names = await Promise.all(top.map((x) => app(ctx, x.appid).then((a) => a?.name ?? `#${x.appid}`, () => `#${x.appid}`)));
      return ['Steam 同時在線人數排行（每日高峰）：', ...top.map((x, i) => `${x.rank}. ${names[i]}（${x.appid}）：${(x.peak_in_game ?? 0).toLocaleString('en-US')} 人${x.last_week_rank ? `，上週第 ${x.last_week_rank}` : ''}`),
        '', '圖：assets search <appid> --source steam'].join('\n');
    }
    const { app: a, others } = await resolve(ctx, query);
    if (!a) return `Steam 找不到「${query}」（中文、英文名或 appid 都可以）`;
    return [
      `${a.name}（appid ${a.steam_appid}）　https://store.steampowered.com/app/${a.steam_appid}/`,
      [a.developers?.length && `開發 ${a.developers.join('、')}`, a.publishers?.length && `發行 ${a.publishers.join('、')}`, a.release_date?.date && `發售 ${a.release_date.date}${a.release_date.coming_soon ? '（即將推出）' : ''}`].filter(Boolean).join('｜'),
      [a.genres?.length && `類型 ${a.genres.map((g) => g.description).join('、')}`, a.metacritic?.score && `Metacritic ${a.metacritic.score}`, a.price_overview?.final_formatted && `售價 ${a.price_overview.final_formatted}`,
        a.recommendations?.total && `${a.recommendations.total.toLocaleString('en-US')} 篇評論`].filter(Boolean).join('｜'),
      ...(a.short_description ? ['', a.short_description] : []),
      '', `圖：直式封面 steam:${a.steam_appid}-cover、橫幅 -hero、截圖 ${a.screenshots?.length ?? 0} 張（-shot-0…）、預告片 ${a.movies?.filter((x) => x.hls_h264).length ?? 0} 支（--kind video 搜）`,
      ...(others.length ? [`其他符合的：${others.map((o) => `${o.name}（${o.id}）`).join('、')}`] : []),
      '來源：Steam 商店（非官方端點）',
    ].join('\n');
  },
};
