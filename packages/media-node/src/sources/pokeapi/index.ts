// PokeAPI (spec 2026-10-24-api-picker §5): every Pokémon's names (Traditional Chinese, Japanese, English), types, stats, abilities,
// evolution family and Pokédex text, and the official artwork and HOME renders as transparent PNGs (PokeAPI/sprites on GitHub). No
// key. PokeAPI has no search: one GraphQL query lists every species with its names (kept 30 days — its fair-use policy asks for
// local caching, on pain of a ban), and a name is matched against that. The names and pictures belong to Nintendo / Creatures /
// GAME FREAK: recorded in the credits, not a gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const GQL = 'https://beta.pokeapi.co/graphql/v1beta';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other';
/** PokeAPI's GraphQL allows about 100 calls an hour; the answers are kept 30 days */
const GQL_LIMITS = [{ n: 100, per: 3600 }];
const MONTH = 30 * 86400;
/** PokeAPI's language ids: Japanese (kana), Traditional Chinese, English */
const JA = 1, ZH = 4, EN = 9;
const LICENSE = '© Nintendo / Creatures / GAME FREAK（名稱與圖片版權屬原公司）';
const OWNER = 'The Pokémon Company / Nintendo / Creatures / GAME FREAK';

interface Name { name: string; language_id: number; genus?: string }
interface Species { id: number; name: string; names: Name[] }

async function gql<T>(ctx: SourceCtx, query: string, variables: Record<string, unknown> = {}, ttl = MONTH): Promise<T> {
  const r = await ctx.sub('gql', GQL_LIMITS).json<{ data?: T; errors?: Array<{ message?: string }> }>(GQL, { method: 'POST', body: { query, variables }, ttl, cacheIf: (b) => !b?.errors });
  // a query PokeAPI no longer understands (its schema changed) is not a passing problem
  if (r?.errors?.length) throw new SourceError('pokeapi', 'broken', `GraphQL 查詢被拒絕（${r.errors[0].message ?? 'error'}）`);
  if (!r?.data) throw new SourceError('pokeapi', 'broken', '回應格式看不懂（沒有 data）');
  return r.data;
}

const INDEX = `{ species: pokemon_v2_pokemonspecies(order_by: {id: asc}) { id name names: pokemon_v2_pokemonspeciesnames(where: {language_id: {_in: [${JA}, ${ZH}, ${EN}]}}) { name language_id } } }`;
async function index(ctx: SourceCtx): Promise<Species[]> {
  const d = await gql<{ species?: Species[] }>(ctx, INDEX);
  if (!Array.isArray(d.species) || !d.species.length) throw new SourceError('pokeapi', 'broken', '回應格式看不懂（沒有寶可夢清單）');
  return d.species;
}

const nameIn = (s: { names: Name[] }, lang: number) => s.names.find((n) => n.language_id === lang)?.name;
const fold = (x: string) => x.toLowerCase().normalize('NFKC').replace(/[\s\-_.·・'’:♀♂]/g, '');
/** 皮卡丘 (Pikachu) #025 */
const titleOf = (s: Species) => `${nameIn(s, ZH) ?? s.name}（${nameIn(s, EN) ?? s.name}）#${String(s.id).padStart(3, '0')}`;

/** Species matching a name in any of the three languages, or a number: exact names first, then those it begins, then the rest. */
export function matchSpecies(all: Species[], query: string): Species[] {
  const q = fold(query.replace(/^#/, ''));
  if (!q) return [];
  if (/^\d+$/.test(q)) return all.filter((s) => s.id === Number(q));
  const rank = (s: Species) => {
    const words = [s.name, ...s.names.map((n) => n.name)].map(fold);
    return words.includes(q) ? 0 : words.some((w) => w.startsWith(q)) ? 1 : words.some((w) => w.includes(q)) ? 2 : 3;
  };
  return all.map((s) => ({ s, r: rank(s) })).filter((x) => x.r < 3).sort((a, b) => a.r - b.r || a.s.id - b.s.id).map((x) => x.s);
}

/** "25", "25-home", "25-shiny", "25-home-shiny" */
function parseId(id: string): { n: number; home: boolean; shiny: boolean } | null {
  const m = /^(\d+)(-home)?(-shiny)?$/.exec(id);
  return m ? { n: Number(m[1]), home: !!m[2], shiny: !!m[3] } : null;
}
const art = (p: { n: number; home: boolean; shiny: boolean }) => `${SPRITES}/${p.home ? 'home' : 'official-artwork'}/${p.shiny ? 'shiny/' : ''}${p.n}.png`;

const DETAIL = `query($id: Int!) { s: pokemon_v2_pokemonspecies_by_pk(id: $id) { id name is_legendary is_mythical capture_rate generation_id
  names: pokemon_v2_pokemonspeciesnames(where: {language_id: {_in: [${JA}, ${ZH}, ${EN}]}}) { name genus language_id }
  flavor: pokemon_v2_pokemonspeciesflavortexts(where: {language_id: {_eq: ${ZH}}}, order_by: {version_id: desc}, limit: 1) { flavor_text }
  chain: pokemon_v2_evolutionchain { species: pokemon_v2_pokemonspecies(order_by: {order: asc}) { id name names: pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: ${ZH}}}) { name } } }
  mons: pokemon_v2_pokemons(where: {is_default: {_eq: true}}) { height weight
    types: pokemon_v2_pokemontypes { type: pokemon_v2_type { name names: pokemon_v2_typenames(where: {language_id: {_eq: ${ZH}}}) { name } } }
    stats: pokemon_v2_pokemonstats { base_stat stat: pokemon_v2_stat { name } }
    abilities: pokemon_v2_pokemonabilities { is_hidden ability: pokemon_v2_ability { name names: pokemon_v2_abilitynames(where: {language_id: {_eq: ${ZH}}}) { name } } } } } }`;
interface Detail {
  id: number; name: string; is_legendary: boolean; is_mythical: boolean; capture_rate: number; generation_id: number; names: Name[];
  flavor: Array<{ flavor_text: string }>; chain?: { species: Array<{ id: number; name: string; names: Array<{ name: string }> }> };
  mons: Array<{ height: number; weight: number; types: Array<{ type: { name: string; names: Array<{ name: string }> } }>;
    stats: Array<{ base_stat: number; stat: { name: string } }>; abilities: Array<{ is_hidden: boolean; ability: { name: string; names: Array<{ name: string }> } }> }>;
}
const STATS: Record<string, string> = { hp: 'HP', attack: '攻擊', defense: '防禦', 'special-attack': '特攻', 'special-defense': '特防', speed: '速度' };

/** one species as text for the agent, in Traditional Chinese */
export function describe(d: Detail): string {
  const zh = nameIn(d, ZH) ?? d.name, genus = d.names.find((n) => n.language_id === ZH)?.genus, mon = d.mons[0];
  const others = [nameIn(d, EN), nameIn(d, JA)].filter(Boolean).join('／');
  const lines = [`${zh}（${others}）#${String(d.id).padStart(3, '0')}${genus ? `　${genus}` : ''}`];
  if (mon) {
    lines.push(`屬性：${mon.types.map((t) => t.type.names[0]?.name ?? t.type.name).join('、')}`);
    lines.push(`身高 ${(mon.height / 10).toFixed(1)} m、體重 ${(mon.weight / 10).toFixed(1)} kg`);
    const total = mon.stats.reduce((a, s) => a + s.base_stat, 0);
    lines.push(`種族值：${mon.stats.map((s) => `${STATS[s.stat.name] ?? s.stat.name} ${s.base_stat}`).join('、')}（合計 ${total}）`);
    lines.push(`特性：${mon.abilities.map((a) => `${a.ability.names[0]?.name ?? a.ability.name}${a.is_hidden ? '（隱藏特性）' : ''}`).join('、')}`);
  }
  const family = d.chain?.species ?? [];
  if (family.length > 1) lines.push(`進化家族：${family.map((s) => s.names[0]?.name ?? s.name).join('、')}`);
  lines.push(`第 ${d.generation_id} 世代；捕獲率 ${d.capture_rate}${d.is_legendary ? '；傳說的寶可夢' : ''}${d.is_mythical ? '；幻之寶可夢' : ''}`);
  const text = d.flavor[0]?.flavor_text.replace(/\s+/g, '');
  if (text) lines.push(`圖鑑：${text}`);
  return lines.join('\n');
}

export const pokeapi: SourceAdapter = {
  id: 'pokeapi', label: 'PokeAPI', category: 'fandom', kinds: ['image'], needsKey: false,
  limits: [{ n: 300, per: 60 }],
  summary: '寶可夢（PokeAPI）：官方插圖和 HOME 3D 圖（去背 PNG），中文、英文、日文名或編號都能找；資料有屬性、種族值、特性、進化、圖鑑文字',
  sample: '皮卡丘',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const found = matchSpecies(await index(ctx), q.text).slice(0, q.limit);
    const home = q.opts.style === 'home', shiny = q.opts.shiny === 'true';
    if (q.opts.style !== undefined && q.opts.style !== 'home' && q.opts.style !== 'artwork') throw new Error('--opt style 只能是 artwork 或 home');
    return found.map((s): AssetHit => {
      const id = `${s.id}${home ? '-home' : ''}${shiny ? '-shiny' : ''}`;
      return { ref: `pokeapi:${id}`, source: 'pokeapi', id, kind: 'image', title: titleOf(s), thumbUrl: art({ n: s.id, home, shiny }),
        detail: `${home ? 'HOME 3D 圖' : '官方插圖'}${shiny ? '（異色）' : ''} · 去背 PNG` };
    });
  },

  async get(id, ctx) {
    const p = parseId(id);
    if (!p) throw new SourceError('pokeapi', 'missing', `編號要像 25、25-home、25-shiny，收到「${id}」`);
    const s = (await index(ctx)).find((x) => x.id === p.n);
    if (!s) throw new SourceError('pokeapi', 'missing', `沒有編號 ${p.n} 的寶可夢`);
    const file = join(ctx.tmpDir, `pokeapi-${id}.png`);
    await ctx.http.download(art(p), file, { maxBytes: 10e6 })
      .catch((e) => { if (e instanceof SourceError && e.kind === 'missing') throw new SourceError('pokeapi', 'missing', `${titleOf(s)} 沒有${p.home ? ' HOME 圖' : '官方插圖'}${p.shiny ? '（異色）' : ''}`); throw e; });
    return { file, kind: 'image', meta: { source: 'pokeapi', id, title: `${titleOf(s)}${p.home ? ' HOME' : ''}${p.shiny ? ' 異色' : ''}`, author: OWNER,
      page: `https://pokeapi.co/api/v2/pokemon-species/${p.n}`, license: LICENSE, quality: 'original' } };
  },

  // never from the cache: a GraphQL that stopped answering must show in `npm run sources`
  async check(ctx) {
    const d = await gql<{ s?: { name?: string } }>(ctx, '{ s: pokemon_v2_pokemonspecies_by_pk(id: 25) { name } }', {}, 0);
    if (!d.s?.name) throw new SourceError('pokeapi', 'broken', '回應格式看不懂（查不到 25 號）');
    return `GraphQL 可連線（25 號是 ${d.s.name}）`;
  },

  credit: (r) => `- Pokémon: "${r.title}" (${r.page}), ${r.license}`,

  async data(query, ctx) {
    const found = matchSpecies(await index(ctx), query);
    if (!found.length) return `找不到寶可夢「${query}」（中文、英文、日文名或編號都可以）`;
    const d = await gql<{ s?: Detail | null }>(ctx, DETAIL, { id: found[0].id });
    if (!d.s) throw new SourceError('pokeapi', 'broken', `查不到 ${found[0].id} 號的資料`);
    const more = found.slice(1, 8).map(titleOf);
    return [describe(d.s), ...(more.length ? ['', `其他符合的：${more.join('、')}`] : []), '',
      `圖：assets get <專案> pokeapi:${d.s.id}（官方插圖）、pokeapi:${d.s.id}-home（HOME 3D 圖），後面加 -shiny 是異色`,
      '來源：PokeAPI（資料 BSD 授權；名稱與圖片 © Nintendo / Creatures / GAME FREAK）'].join('\n');
  },
};
