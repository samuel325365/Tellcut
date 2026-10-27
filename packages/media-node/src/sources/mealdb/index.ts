// TheMealDB and TheCocktailDB (spec 2026-10-24-api-picker §5): recipes and cocktails with a photo of the finished dish or drink —
// ingredients and measures, steps, category, cuisine, glass. Two sites of the same makers with the same API, so one factory: the
// public test key "1" is part of the address (the free tier the sites offer for development; no sign-up). English only. The photos
// are the sites': recorded, not a gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const WEEK = 7 * 86400, STEPS_MAX = 1200;

interface Kind { id: 'mealdb' | 'cocktaildb'; label: string; site: string; list: 'meals' | 'drinks'; field: 'Meal' | 'Drink'; noun: string; card: string; summary: string; sample: string }
type Item = Record<string, string | null>;

function make(k: Kind): SourceAdapter {
  const api = `https://www.${k.site}/api/json/v1/1`;
  const ask = async (ctx: SourceCtx, path: string, params: Record<string, string>): Promise<Item[]> => {
    const r = await ctx.http.json<Record<string, unknown>>(`${api}/${path}?${new URLSearchParams(params)}`, { ttl: WEEK });
    if (!r || !(k.list in r)) throw new SourceError(k.id, 'broken', `回應格式看不懂（沒有 ${k.list}）`);
    // nothing found: null, or the words "no data found" (TheCocktailDB's filter)
    const list = r[k.list];
    return Array.isArray(list) ? (list as Item[]) : [];
  };
  /** by name, else by an ingredient (that answer has only the id, name and photo) */
  const find = async (ctx: SourceCtx, text: string) => {
    const byName = await ask(ctx, 'search.php', { s: text });
    return byName.length ? byName : ask(ctx, 'filter.php', { i: text });
  };
  const id = (x: Item) => x[`id${k.field}`]!, name = (x: Item) => x[`str${k.field}`]!, thumb = (x: Item) => x[`str${k.field}Thumb`];
  const ingredients = (x: Item) => Array.from({ length: 20 }, (_, i) => [x[`strIngredient${i + 1}`]?.trim(), x[`strMeasure${i + 1}`]?.trim()] as const)
    .filter(([ing]) => ing).map(([ing, m]) => (m ? `${ing}（${m}）` : ing!));
  const page = (x: Item) => `https://www.${k.site}/${k.list === 'meals' ? 'meal' : 'drink'}/${id(x)}`;

  return {
    id: k.id, label: k.label, category: 'knowledge', kinds: ['image'], needsKey: false,
    limits: [{ n: 60, per: 60 }],
    summary: k.summary, sample: k.sample,
    card: () => readFileSync(new URL(k.card, import.meta.url), 'utf8'),

    async search(q, ctx) {
      return (await find(ctx, q.text)).filter((x) => thumb(x)).slice(0, q.limit).map((x): AssetHit => ({
        ref: `${k.id}:${id(x)}`, source: k.id, id: id(x), kind: 'image', title: name(x), thumbUrl: `${thumb(x)}/preview`,
        detail: [x.strCategory, x.strArea ?? x.strAlcoholic, x.strGlass].filter(Boolean).join(' · ') || `${k.noun}照片` }));
    },

    async get(itemId, ctx) {
      if (!/^\d+$/.test(itemId)) throw new SourceError(k.id, 'missing', `${k.label} 的編號是數字，收到「${itemId}」`);
      const [x] = await ask(ctx, 'lookup.php', { i: itemId });
      if (!x || !thumb(x)) throw new SourceError(k.id, 'missing', `${k.label} 沒有 ${itemId} 這個${k.noun}`);
      const file = join(ctx.tmpDir, `${k.id}-${itemId}.jpg`);
      await ctx.http.download(thumb(x)!, file, { maxBytes: 20e6 });
      return { file, kind: 'image', meta: { source: k.id, id: itemId, title: name(x), author: k.label, page: page(x), license: `© ${k.label}（照片依網站條款，測試 key 供開發與個人使用）`, quality: 'original' } };
    },

    async check(ctx) {
      const n = (await ask(ctx, 'search.php', { s: k.sample })).length;
      if (!n) throw new SourceError(k.id, 'broken', `查「${k.sample}」沒有結果`);
      return `「${k.sample}」共 ${n} 筆`;
    },

    credit: (r) => `- Photo: "${r.title}" (${r.page}), ${r.license}`,

    async data(query, ctx) {
      const byName = await ask(ctx, 'search.php', { s: query });
      if (!byName.length) {
        const withIt = await ask(ctx, 'filter.php', { i: query });
        return withIt.length ? [`沒有叫「${query}」的${k.noun}；用到 ${query} 的有：`, ...withIt.slice(0, 15).map((x) => `${name(x)}（${k.id}:${id(x)}）`), '', `細節：assets data ${k.id} <名稱>`].join('\n')
          : `${k.label} 找不到「${query}」（用英文菜名、酒名或材料）`;
      }
      const x = byName[0], steps = (x.strInstructions ?? '').replace(/\s+/g, ' ').trim();
      return [
        `${name(x)}　${page(x)}`,
        [x.strCategory && `類別 ${x.strCategory}`, x.strArea && `地區 ${x.strArea}`, x.strAlcoholic && x.strAlcoholic, x.strGlass && `杯型 ${x.strGlass}`, x.strTags && `標籤 ${x.strTags}`].filter(Boolean).join('｜'),
        `材料：${ingredients(x).join('、')}`,
        ...(steps ? ['', `做法：${steps.length > STEPS_MAX ? `${steps.slice(0, STEPS_MAX)}…` : steps}`] : []),
        ...(x.strYoutube ? [`影片：${x.strYoutube}`] : []),
        ...(byName.length > 1 ? ['', `其他符合的：${byName.slice(1, 8).map(name).join('、')}`] : []),
        '', `照片：assets get <專案> ${k.id}:${id(x)}`, `來源：${k.label}（英文，旁白要自己改寫）`,
      ].join('\n');
    },
  };
}

export const mealdb = make({ id: 'mealdb', label: 'TheMealDB', site: 'themealdb.com', list: 'meals', field: 'Meal', noun: '料理', card: './card.md', sample: 'ramen',
  summary: '食譜（TheMealDB）：各國料理的成品照，資料有材料與份量、做法、類別、地區、示範影片連結（英文菜名或材料搜：ramen、salmon）' });
export const cocktaildb = make({ id: 'cocktaildb', label: 'TheCocktailDB', site: 'thecocktaildb.com', list: 'drinks', field: 'Drink', noun: '調酒', card: './cocktaildb.md', sample: 'margarita',
  summary: '調酒（TheCocktailDB）：調酒的成品照，資料有材料與份量、做法、杯型、有無酒精（英文酒名或材料搜：margarita、gin）' });
