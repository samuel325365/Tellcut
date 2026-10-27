// Anime and manga from AniList (spec 2026-10-24-api-picker §5): covers, banners and character pictures, and each show's titles,
// studio, season, episodes, score and main cast — through its public GraphQL API, no key. AniList limits callers to 30 requests
// a minute (90 when it is not degraded), and it switched its API off for a while in October 2026: a 403 then is "unavailable for
// now" (http.ts), never "nothing found". The pictures belong to the shows' rights holders: recorded, not a gate.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';
import { plainText } from '../wikimedia/index.ts';

const API = 'https://graphql.anilist.co';
const DAY = 86400;
const DESCRIPTION_MAX = 700;

interface Title { romaji?: string | null; english?: string | null; native?: string | null }
interface Media { id: number; title: Title; format?: string | null; seasonYear?: number | null; episodes?: number | null; chapters?: number | null; coverImage?: { extraLarge?: string | null }; bannerImage?: string | null; averageScore?: number | null }
interface Character { id: number; name: { full?: string | null; native?: string | null }; image?: { large?: string | null }; media?: { nodes?: Array<{ title: Title }> } }

async function gql<T>(ctx: SourceCtx, query: string, variables: Record<string, unknown>, ttl = DAY): Promise<T> {
  const r = await ctx.http.json<{ data?: T; errors?: Array<{ message?: string; status?: number }> }>(API, { method: 'POST', body: { query, variables }, ttl, notFound: 'missing', cacheIf: (b) => !b?.errors });
  if (r?.errors?.length) throw new SourceError('anime', 'broken', `GraphQL 查詢被拒絕（${r.errors[0].message ?? 'error'}）`);
  if (!r?.data) throw new SourceError('anime', 'broken', '回應格式看不懂（沒有 data）');
  return r.data;
}

const MEDIA = 'query($q: String, $type: MediaType, $n: Int) { Page(perPage: $n) { media(search: $q, type: $type, sort: SEARCH_MATCH) { id title { romaji english native } format seasonYear episodes chapters coverImage { extraLarge } bannerImage averageScore } } }';
const CHARS = 'query($q: String, $n: Int) { Page(perPage: $n) { characters(search: $q, sort: SEARCH_MATCH) { id name { full native } image { large } media(perPage: 1) { nodes { title { romaji } } } } } }';
const ONE_MEDIA = 'query($id: Int) { Media(id: $id) { id title { romaji english native } coverImage { extraLarge } bannerImage siteUrl } }';
const ONE_CHAR = 'query($id: Int) { Character(id: $id) { id name { full native } image { large } siteUrl } }';
const DETAIL = 'query($id: Int) { Media(id: $id) { id title { romaji english native } synonyms format status episodes duration chapters season seasonYear startDate { year month day } studios(isMain: true) { nodes { name } } genres averageScore popularity description(asHtml: false) siteUrl coverImage { extraLarge } bannerImage characters(sort: ROLE, perPage: 6) { edges { role node { name { full native } } voiceActors(language: JAPANESE) { name { full native } } } } } }';

const typeOf = (opts: Record<string, unknown>) => {
  const t = opts.type ?? 'anime';
  if (t !== 'anime' && t !== 'manga') throw new Error('--opt type 只能是 anime 或 manga');
  return t === 'manga' ? 'MANGA' : 'ANIME';
};
const nameOf = (t: Title) => t.english || t.romaji || t.native || '';
const both = (t: Title) => [nameOf(t), t.native && t.native !== nameOf(t) ? t.native : ''].filter(Boolean).join('／');

export const anime: SourceAdapter = {
  id: 'anime', label: 'AniList', category: 'fandom', kinds: ['image'], needsKey: false,
  limits: [{ n: 30, per: 60 }],
  summary: '動漫（AniList）：作品的封面、橫幅，角色圖（--opt what=character）；資料有標題、製作公司、播出季、集數、評分、主要角色和聲優（英文、羅馬拼音或日文名搜）',
  sample: 'Frieren',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    if (q.opts.what !== undefined && q.opts.what !== 'character' && q.opts.what !== 'show') throw new Error('--opt what 只能是 show 或 character');
    if (q.opts.what === 'character') {
      const d = await gql<{ Page?: { characters?: Character[] } }>(ctx, CHARS, { q: q.text, n: Math.min(25, q.limit) });
      return (d.Page?.characters ?? []).filter((c) => c.image?.large).map((c): AssetHit => ({ ref: `anime:char-${c.id}`, source: 'anime', id: `char-${c.id}`, kind: 'image',
        title: [c.name.full, c.name.native].filter(Boolean).join('／'), thumbUrl: c.image!.large!, detail: ['角色', c.media?.nodes?.[0]?.title.romaji].filter(Boolean).join(' · ') }));
    }
    const d = await gql<{ Page?: { media?: Media[] } }>(ctx, MEDIA, { q: q.text, type: typeOf(q.opts), n: Math.min(25, q.limit) });
    const hits: AssetHit[] = [];
    for (const m of d.Page?.media ?? []) {
      const about = [m.format, m.seasonYear, m.averageScore ? `${m.averageScore} 分` : ''].filter(Boolean).join(' · ');
      if (m.coverImage?.extraLarge) hits.push({ ref: `anime:${m.id}-cover`, source: 'anime', id: `${m.id}-cover`, kind: 'image', title: both(m.title), thumbUrl: m.coverImage.extraLarge, detail: `封面（直式）· ${about}` });
      if (m.bannerImage) hits.push({ ref: `anime:${m.id}-banner`, source: 'anime', id: `${m.id}-banner`, kind: 'image', title: both(m.title), thumbUrl: m.bannerImage, detail: `橫幅（寬扁）· ${about}` });
    }
    return hits.slice(0, q.limit);
  },

  async get(id, ctx) {
    const m = /^(?:(\d+)-(cover|banner)|char-(\d+))$/.exec(id);
    if (!m) throw new SourceError('anime', 'missing', `編號要像 154587-cover、154587-banner 或 char-176754，收到「${id}」`);
    const lost = (e: unknown) => { if (e instanceof SourceError && e.kind === 'missing') throw new SourceError('anime', 'missing', `AniList 沒有 ${id}`); throw e; };
    let url: string | null | undefined, title: string, page: string;
    if (m[3]) {
      const d = await gql<{ Character?: Character & { siteUrl?: string } }>(ctx, ONE_CHAR, { id: Number(m[3]) }).catch(lost);
      url = d.Character?.image?.large; title = [d.Character?.name.full, d.Character?.name.native].filter(Boolean).join('／'); page = d.Character?.siteUrl ?? `https://anilist.co/character/${m[3]}`;
    } else {
      const d = await gql<{ Media?: Media & { siteUrl?: string } }>(ctx, ONE_MEDIA, { id: Number(m[1]) }).catch(lost);
      url = m[2] === 'cover' ? d.Media?.coverImage?.extraLarge : d.Media?.bannerImage; title = `${both(d.Media?.title ?? {})}（${m[2] === 'cover' ? '封面' : '橫幅'}）`;
      page = d.Media?.siteUrl ?? `https://anilist.co/anime/${m[1]}`;
    }
    if (!url) throw new SourceError('anime', 'missing', `AniList 的 ${id} 沒有圖`);
    const file = join(ctx.tmpDir, `anime-${id}${extname(new URL(url).pathname).toLowerCase() || '.jpg'}`);
    await ctx.http.download(url, file, { maxBytes: 20e6 });
    return { file, kind: 'image', meta: { source: 'anime', id, title, author: '作品權利人（經 AniList）', page, license: '© 作品權利人（宣傳圖，版權屬原公司）', quality: 'original' } };
  },

  // never from the cache: an API that was switched off must show in `npm run sources`
  async check(ctx) {
    const d = await gql<{ Media?: { id?: number } }>(ctx, ONE_MEDIA, { id: 1 }, 0);
    if (!d.Media?.id) throw new SourceError('anime', 'broken', '回應格式看不懂（查不到 1 號作品）');
    return 'AniList 可連線';
  },

  credit: (r) => `- Image: "${r.title}" (${r.page}), ${r.license}`,

  async data(query, ctx) {
    const found = (await gql<{ Page?: { media?: Media[] } }>(ctx, MEDIA, { q: query, type: typeOf(ctx.options), n: 5 })).Page?.media ?? [];
    if (!found.length) return `AniList 找不到「${query}」（用英文、羅馬拼音或日文原名；漫畫加 --opt type=manga）`;
    const d = (await gql<{ Media?: any }>(ctx, DETAIL, { id: found[0].id }, 7 * DAY)).Media;
    if (!d) throw new SourceError('anime', 'broken', `查不到 ${found[0].id} 號作品的資料`);
    const date = d.startDate?.year ? [d.startDate.year, d.startDate.month, d.startDate.day].filter(Boolean).join('-') : '';
    const desc = plainText(String(d.description ?? '').replace(/<br\s*\/?>/gi, ' ')), cut = desc.length > DESCRIPTION_MAX ? `${desc.slice(0, DESCRIPTION_MAX)}…` : desc;
    const cast = (d.characters?.edges ?? []).map((e: any) => `${e.node.name.full}${e.node.name.native ? `（${e.node.name.native}）` : ''}${e.voiceActors?.[0] ? ` CV：${e.voiceActors[0].name.native ?? e.voiceActors[0].name.full}` : ''}${e.role === 'MAIN' ? '［主角］' : ''}`);
    return [
      `${both(d.title)}${d.title.romaji && d.title.romaji !== nameOf(d.title) ? `（${d.title.romaji}）` : ''}　${d.siteUrl ?? ''}`,
      [d.format, d.status, date && `開播 ${date}`, d.season && d.seasonYear && `${d.seasonYear} ${d.season}`, d.episodes && `${d.episodes} 集`, d.duration && `每集 ${d.duration} 分`, d.chapters && `${d.chapters} 話`].filter(Boolean).join('｜'),
      [d.studios?.nodes?.length && `製作 ${d.studios.nodes.map((s: any) => s.name).join('、')}`, d.genres?.length && `類型 ${d.genres.join('、')}`, d.averageScore && `評分 ${d.averageScore}/100`, d.popularity && `${d.popularity.toLocaleString('en-US')} 人收藏`].filter(Boolean).join('｜'),
      ...(cast.length ? [`主要角色：${cast.join('、')}`] : []),
      ...(cut ? ['', cut] : []),
      ...(found.length > 1 ? ['', `其他符合的：${found.slice(1).map((m) => both(m.title)).join('、')}`] : []),
      '', `圖：assets get <專案> anime:${d.id}-cover（直式封面）、anime:${d.id}-banner（橫幅）；角色圖用 --opt what=character 搜`,
      '來源：AniList（簡介是英文，旁白要自己改寫）',
    ].join('\n');
  },
};
