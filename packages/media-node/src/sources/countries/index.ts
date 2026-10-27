// Countries (spec 2026-10-24-api-picker §5): every country's flag, capital, area, languages, currencies, region and neighbours,
// and its population. REST Countries, the usual answer, went key-only in 2026 (v3.1 retired, v5 needs a key), so its source data
// is read directly: the mledoze/countries dataset (ODbL) from GitHub, kept 30 days; the population from the World Bank (no key);
// the flags from flagcdn (public domain). Names in Traditional Chinese as Taiwan writes them come from the runtime's own CLDR
// (Intl.DisplayNames): the dataset's Chinese names are Simplified.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const DATASET = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const MONTH = 30 * 86400;
const FLAG = (cca2: string, w = 2560) => `https://flagcdn.com/w${w}/${cca2.toLowerCase()}.png`;

interface Country {
  name: { common: string; official: string }; cca2: string; cca3: string; capital?: string[]; region?: string; subregion?: string; area?: number;
  languages?: Record<string, string>; currencies?: Record<string, { name: string; symbol?: string }>; borders?: string[]; latlng?: [number, number];
  altSpellings?: string[]; translations?: Record<string, { official: string; common: string }>; flag?: string; landlocked?: boolean; unMember?: boolean;
}

const zhName = new Intl.DisplayNames(['zh-Hant-TW'], { type: 'region' }), jaName = new Intl.DisplayNames(['ja'], { type: 'region' });
const zhCurrency = new Intl.DisplayNames(['zh-Hant-TW'], { type: 'currency' });
const nameOf = (c: Country) => { try { return zhName.of(c.cca2) ?? c.name.common; } catch { return c.name.common; } };
const fold = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[\s'’.,()-]/g, '');

async function dataset(ctx: SourceCtx): Promise<Country[]> {
  const r = await ctx.http.json<Country[]>(DATASET, { ttl: MONTH });
  if (!Array.isArray(r) || !r.length || !r[0]?.cca2) throw new SourceError('countries', 'broken', '國家資料集的格式看不懂');
  return r;
}

/** Countries matching a name in Traditional Chinese, Japanese, English, any of the dataset's languages, or a code (JP, JPN):
 *  exact names first, then those it begins, then the rest. */
export function matchCountries(all: Country[], query: string): Country[] {
  const q = fold(query);
  if (!q) return [];
  const rank = (c: Country) => {
    const words = [nameOf(c), (() => { try { return jaName.of(c.cca2); } catch { return undefined; } })(), c.name.common, c.name.official, c.cca2, c.cca3, ...(c.altSpellings ?? []),
      ...Object.values(c.translations ?? {}).flatMap((t) => [t.common, t.official])].filter((x): x is string => !!x).map(fold);
    return words.includes(q) ? 0 : words.some((w) => w.startsWith(q)) ? 1 : words.some((w) => w.includes(q)) ? 2 : 3;
  };
  return all.map((c) => ({ c, r: rank(c) })).filter((x) => x.r < 3).sort((a, b) => a.r - b.r || nameOf(a.c).localeCompare(nameOf(b.c))).map((x) => x.c);
}

/** the latest population the World Bank has; null when it has none (Taiwan is not in its tables) */
async function population(ctx: SourceCtx, cca3: string): Promise<{ value: number; year: string } | null> {
  const r = await ctx.sub('worldbank', [{ n: 60, per: 60 }]).json<unknown>(`https://api.worldbank.org/v2/country/${cca3}/indicator/SP.POP.TOTL?format=json&mrv=1`, { ttl: MONTH });
  const row = Array.isArray(r) && Array.isArray(r[1]) ? (r[1] as Array<{ value: number | null; date: string }>)[0] : undefined;
  return row?.value ? { value: row.value, year: row.date } : null;
}

const people = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)} 億` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('en-US')} 萬` : n.toLocaleString('en-US'));

export const countries: SourceAdapter = {
  id: 'countries', label: 'Countries', category: 'knowledge', kinds: ['image'], needsKey: false,
  limits: [{ n: 120, per: 60 }],
  summary: '各國資料：國旗（PNG，寬 2560）；資料有繁中國名、首都、人口、面積、語言、貨幣、區域、鄰國（中文、英文名或代碼都能找）',
  sample: '日本',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    return matchCountries(await dataset(ctx), q.text).slice(0, q.limit).map((c): AssetHit => ({
      ref: `countries:${c.cca2.toLowerCase()}`, source: 'countries', id: c.cca2.toLowerCase(), kind: 'image', title: `${nameOf(c)}國旗（${c.name.common}）`,
      thumbUrl: FLAG(c.cca2, 320), detail: '國旗 PNG · 寬 2560' }));
  },

  async get(id, ctx) {
    const c = (await dataset(ctx)).find((x) => x.cca2.toLowerCase() === id.toLowerCase());
    if (!c) throw new SourceError('countries', 'missing', `沒有代碼 ${id} 的國家（用兩個字母的代碼，像 jp）`);
    const file = join(ctx.tmpDir, `countries-${c.cca2.toLowerCase()}.png`);
    await ctx.http.download(FLAG(c.cca2), file, { maxBytes: 20e6 });
    return { file, kind: 'image', meta: { source: 'countries', id: c.cca2.toLowerCase(), title: `${nameOf(c)}國旗（${c.name.common}）`, author: 'flagcdn.com',
      page: `https://flagcdn.com/${c.cca2.toLowerCase()}.svg`, license: 'Public domain', quality: 'original' } };
  },

  async check(ctx) {
    const r = await ctx.http.json<Country[]>(DATASET);
    if (!Array.isArray(r) || !r.length) throw new SourceError('countries', 'broken', '國家資料集的格式看不懂');
    return `國家資料集可下載（${r.length} 國）`;
  },

  credit: (r) => `- Flag: "${r.title}" (${r.page}), ${r.license}`,

  async data(query, ctx) {
    const all = await dataset(ctx), found = matchCountries(all, query);
    if (!found.length) return `找不到國家「${query}」（中文、英文名或代碼都可以）`;
    const c = found[0], pop = await population(ctx, c.cca3).catch(() => null), byCode = new Map(all.map((x) => [x.cca3, x]));
    const money = Object.entries(c.currencies ?? {}).map(([code, v]) => { let zh = ''; try { zh = zhCurrency.of(code) ?? ''; } catch { /* unknown code */ } return `${zh || v.name}（${code}${v.symbol ? `，${v.symbol}` : ''}）`; });
    return [
      `${nameOf(c)}（${c.name.common}；正式名稱 ${c.name.official}）${c.flag ?? ''}`,
      [c.capital?.length && `首都 ${c.capital.join('、')}`, c.region && `區域 ${c.region}${c.subregion ? `／${c.subregion}` : ''}`, c.landlocked ? '內陸國' : ''].filter(Boolean).join('｜'),
      [pop ? `人口 ${people(pop.value)}（${pop.year} 年，世界銀行）` : '人口：世界銀行沒有資料', c.area && `面積 ${c.area.toLocaleString('en-US')} 平方公里`].filter(Boolean).join('｜'),
      [Object.values(c.languages ?? {}).length && `語言 ${Object.values(c.languages ?? {}).join('、')}`, money.length && `貨幣 ${money.join('、')}`].filter(Boolean).join('｜'),
      ...(c.borders?.length ? [`鄰國：${c.borders.map((b) => { const n = byCode.get(b); return n ? nameOf(n) : b; }).join('、')}`] : []),
      ...(c.latlng ? [`中心座標：${c.latlng[0]}, ${c.latlng[1]}`] : []),
      ...(found.length > 1 ? [`其他符合的：${found.slice(1, 6).map(nameOf).join('、')}`] : []),
      '', `國旗：assets get <專案> countries:${c.cca2.toLowerCase()}`,
      '來源：mledoze/countries（ODbL）、世界銀行；國名用台灣的寫法',
    ].join('\n');
  },
};
