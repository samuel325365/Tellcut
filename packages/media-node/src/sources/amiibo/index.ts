// AmiiboAPI (spec 2026-10-24-api-picker §5): every amiibo — about 900 Nintendo figures and cards — with its character, game
// series, amiibo series, release dates and a picture (a cut-out PNG). The closest thing to a Nintendo character API there is: no
// key. It moved to amiiboapi.org in 2026 (the .com answers 404). The pictures belong to Nintendo: recorded, not a gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const API = 'https://www.amiiboapi.org/api/amiibo/';
const WEEK = 7 * 86400;

interface Amiibo { name: string; character: string; gameSeries: string; amiiboSeries: string; type: string; head: string; tail: string; image: string; release?: Record<string, string | null> }

async function ask(ctx: SourceCtx, params: Record<string, string>, ttl = WEEK): Promise<Amiibo[]> {
  const r = await ctx.http.json<{ amiibo?: Amiibo[] | Amiibo | null }>(`${API}?${new URLSearchParams(params)}`, { ttl });
  if (!r || !('amiibo' in r)) throw new SourceError('amiibo', 'broken', '回應格式看不懂（沒有 amiibo）');
  // one id answers with the amiibo itself, an unknown one with null
  return r.amiibo == null ? [] : Array.isArray(r.amiibo) ? r.amiibo : [r.amiibo];
}

/** By name ("Yoshi - Golf" for "yoshi"), else by character, else by game series ("Splatoon"); each list at most once. */
async function find(ctx: SourceCtx, text: string): Promise<Amiibo[]> {
  for (const k of ['name', 'character', 'gameseries']) {
    const found = await ask(ctx, { [k]: text });
    if (found.length) return found;
  }
  return [];
}

const idOf = (a: Amiibo) => `${a.head}${a.tail}`;
const firstRelease = (a: Amiibo) => Object.values(a.release ?? {}).filter((d): d is string => !!d).sort()[0];

export const amiibo: SourceAdapter = {
  id: 'amiibo', label: 'AmiiboAPI', category: 'fandom', kinds: ['image'], needsKey: false,
  limits: [{ n: 60, per: 60 }],
  summary: '任天堂角色（AmiiboAPI）：約 900 隻 amiibo 的去背圖、角色、遊戲系列、發售日（英文名搜：Mario、Link、Splatoon）',
  sample: 'Yoshi',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    return (await find(ctx, q.text)).slice(0, q.limit).map((a): AssetHit => ({
      ref: `amiibo:${idOf(a)}`, source: 'amiibo', id: idOf(a), kind: 'image', title: `${a.name}（${a.amiiboSeries}）`, thumbUrl: a.image,
      detail: [a.gameSeries, a.type, firstRelease(a)].filter(Boolean).join(' · ') }));
  },

  async get(id, ctx) {
    if (!/^[0-9a-f]{16}$/i.test(id)) throw new SourceError('amiibo', 'missing', `amiibo 的編號是 16 位十六進位（像 0100000000040002），收到「${id}」`);
    const [a] = await ask(ctx, { id: id.toLowerCase() });
    if (!a?.image) throw new SourceError('amiibo', 'missing', `沒有編號 ${id} 的 amiibo`);
    const file = join(ctx.tmpDir, `amiibo-${id.toLowerCase()}.png`);
    await ctx.http.download(a.image, file, { maxBytes: 10e6 });
    return { file, kind: 'image', meta: { source: 'amiibo', id: id.toLowerCase(), title: `${a.name}（${a.amiiboSeries}）`, author: 'Nintendo',
      page: `${API}?id=${id.toLowerCase()}`, license: '© Nintendo（amiibo 圖片版權屬任天堂）', quality: 'original' } };
  },

  async check(ctx) {
    const n = (await ask(ctx, { name: 'mario' }, 0)).length;
    if (!n) throw new SourceError('amiibo', 'broken', '查「mario」沒有結果');
    return `「mario」共 ${n} 個`;
  },

  credit: (r) => `- amiibo: "${r.title}" (${r.page}), ${r.license}`,

  async data(query, ctx) {
    const found = await find(ctx, query);
    if (!found.length) return `找不到「${query}」的 amiibo（用英文：角色名 Link、遊戲系列 Splatoon、amiibo 名 Yoshi - Golf）`;
    const lines = found.slice(0, 25).map((a) => `${a.name}｜角色 ${a.character}｜遊戲 ${a.gameSeries}｜系列 ${a.amiiboSeries}｜${a.type}｜首發 ${firstRelease(a) ?? '未發售'}｜amiibo:${idOf(a)}`);
    return [`「${query}」共 ${found.length} 個 amiibo${found.length > 25 ? '（列前 25 個）' : ''}：`, ...lines, '', '圖：assets get <專案> amiibo:<編號>（去背 PNG）', '來源：AmiiboAPI（amiiboapi.org）；圖片 © Nintendo'].join('\n');
  },
};
