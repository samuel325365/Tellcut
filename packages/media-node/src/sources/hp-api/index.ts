// Harry Potter (spec 2026-10-24-api-picker §5): HP-API (hp-api.onrender.com) for the characters — house, patronus, wand, actor —
// and the spells, with PotterDB (api.potterdb.com, from the Harry Potter Wiki) for what HP-API lacks: pictures of most characters
// (HP-API has 25 among 437) and each spell's incantation, effect and light. No key on either. The pictures are film stills and
// wiki images owned by Warner Bros.: recorded, not a gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renameRetry } from '../../fsutil.ts';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const HP = 'https://hp-api.onrender.com/api';
const PDB = 'https://api.potterdb.com/v1';
const WEEK = 7 * 86400;
const PDB_LIMITS = [{ n: 60, per: 60 }];
const LICENSE = '© Warner Bros.（電影劇照與維基圖片，版權屬原公司）';

interface HpCharacter { id: string; name: string; alternate_names?: string[]; species?: string; gender?: string; house?: string; dateOfBirth?: string | null; ancestry?: string;
  wand?: { wood?: string; core?: string; length?: number | null }; patronus?: string; hogwartsStudent?: boolean; hogwartsStaff?: boolean; actor?: string; alive?: boolean; image?: string }
interface HpSpell { id: string; name: string; description: string }
interface PdbCharacter { id: string; attributes: { name: string; slug?: string; image?: string | null; wiki?: string; born?: string | null; died?: string | null; house?: string | null;
  blood_status?: string | null; species?: string | null; patronus?: string | null; wands?: string[]; titles?: string[]; alias_names?: string[] } }
interface PdbSpell { id: string; attributes: { name: string; incantation?: string | null; effect?: string | null; category?: string | null; light?: string | null; creator?: string | null; wiki?: string } }

async function hpList<T>(ctx: SourceCtx, path: string, ttl = WEEK): Promise<T[]> {
  const r = await ctx.http.json<T[]>(`${HP}/${path}`, { ttl });
  if (!Array.isArray(r)) throw new SourceError('hp-api', 'broken', `HP-API 的回應格式看不懂（/${path} 不是清單）`);
  return r;
}
async function pdb<T>(ctx: SourceCtx, path: string, params: Record<string, string> = {}, o: { notFound?: 'missing' } = {}): Promise<T> {
  const q = new URLSearchParams(params).toString();
  const r = await ctx.sub('potterdb', PDB_LIMITS).json<{ data?: T }>(`${PDB}/${path}${q ? `?${q}` : ''}`, { ttl: WEEK, ...o });
  if (!r || !('data' in r)) throw new SourceError('hp-api', 'broken', 'PotterDB 的回應格式看不懂（沒有 data）');
  return r.data as T;
}

const fold = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const hit = (q: string, ...words: Array<string | undefined | null>) => { const f = fold(q); return !!f && words.some((w) => !!w && fold(w).includes(f)); };
/** a picture the player can show (PotterDB's spells and some characters are animated GIFs) */
const usable = (url?: string | null): url is string => !!url && !/\.gif($|[/?])/i.test(url);
/** the file's extension from what the server says it is: wiki images named .jpg are often WebP */
const extOf = (type: string, url: string) => (/webp/.test(type) ? '.webp' : /png/.test(type) ? '.png' : /jpe?g/.test(type) ? '.jpg' : /\.(png|webp)(\?|\/|$)/i.exec(url)?.[0].slice(0, -1).toLowerCase() ?? '.jpg');

/** one character as text for the agent */
function hpLine(c: HpCharacter): string {
  const wand = c.wand && (c.wand.wood || c.wand.core) ? `魔杖 ${[c.wand.wood, c.wand.core, c.wand.length ? `${c.wand.length} 吋` : ''].filter(Boolean).join('、')}` : '';
  return [`${c.name}${c.alternate_names?.length ? `（又名 ${c.alternate_names.join('、')}）` : ''}`,
    [c.house && `學院 ${c.house}`, c.species && c.species !== 'human' && `種族 ${c.species}`, c.ancestry && `血統 ${c.ancestry}`, c.dateOfBirth && `生日 ${c.dateOfBirth}`,
      c.patronus && `守護靈 ${c.patronus}`, wand, c.actor && `演員 ${c.actor}`, c.hogwartsStaff ? '霍格華茲教職員' : c.hogwartsStudent ? '霍格華茲學生' : '', c.alive === false ? '已故' : ''].filter(Boolean).join('｜')].join('：');
}
function pdbLine(c: PdbCharacter): string {
  const a = c.attributes;
  return `${a.name}：${[a.house && `學院 ${a.house}`, a.species && `種族 ${a.species}`, a.blood_status && `血統 ${a.blood_status}`, a.born && `出生 ${a.born}`, a.died && `死亡 ${a.died}`,
    a.patronus && `守護靈 ${a.patronus}`, a.wands?.length ? `魔杖 ${a.wands.join('；')}` : '', a.titles?.length ? `頭銜 ${a.titles.slice(0, 3).join('、')}` : '', a.wiki].filter(Boolean).join('｜')}`;
}

export const hpApi: SourceAdapter = {
  id: 'hp-api', label: 'HP-API + PotterDB', category: 'fandom', kinds: ['image'], needsKey: false,
  limits: [{ n: 60, per: 60 }],
  summary: '哈利波特（HP-API＋PotterDB）：角色圖、角色資料（學院、守護靈、魔杖、演員）、咒語（咒語、效果、光的顏色）（英文名搜：Hermione、Expelliarmus）',
  sample: 'Hermione',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const [chars, pdbChars] = await Promise.all([hpList<HpCharacter>(ctx, 'characters'), pdb<PdbCharacter[]>(ctx, 'characters', { 'filter[name_cont]': q.text, 'page[size]': String(Math.min(50, q.limit)) })]);
    // HP-API's film portraits first, then PotterDB's wiki pictures (often the same person, another picture)
    const hits: AssetHit[] = [];
    for (const c of chars.filter((c) => usable(c.image) && hit(q.text, c.name, c.actor, ...(c.alternate_names ?? [])))) {
      hits.push({ ref: `hp-api:hp-${c.id}`, source: 'hp-api', id: `hp-${c.id}`, kind: 'image', title: c.name, thumbUrl: c.image, detail: ['HP-API', c.house, c.actor].filter(Boolean).join(' · ') });
    }
    for (const c of pdbChars ?? []) {
      if (!usable(c.attributes.image)) continue;
      hits.push({ ref: `hp-api:pdb-${c.id}`, source: 'hp-api', id: `pdb-${c.id}`, kind: 'image', title: c.attributes.name, thumbUrl: c.attributes.image,
        detail: ['PotterDB（維基圖）', c.attributes.house].filter(Boolean).join(' · ') });
    }
    return hits.slice(0, q.limit);
  },

  async get(id, ctx) {
    const m = /^(hp|pdb)-([0-9a-f-]{36})$/.exec(id);
    if (!m) throw new SourceError('hp-api', 'missing', `編號要像 hp-<uuid> 或 pdb-<uuid>，收到「${id}」`);
    let name: string, image: string | undefined | null, page: string;
    if (m[1] === 'hp') {
      const c = (await hpList<HpCharacter>(ctx, 'characters')).find((x) => x.id === m[2]);
      if (!c) throw new SourceError('hp-api', 'missing', `HP-API 沒有角色 ${m[2]}`);
      ({ name, image } = c); page = `${HP}/character/${c.id}`;
    } else {
      const c = await pdb<PdbCharacter>(ctx, `characters/${m[2]}`, {}, { notFound: 'missing' })
        .catch((e) => { if (e instanceof SourceError && e.kind === 'missing') throw new SourceError('hp-api', 'missing', `PotterDB 沒有角色 ${m[2]}`); throw e; });
      name = c.attributes.name; image = c.attributes.image; page = c.attributes.wiki ?? `${PDB}/characters/${c.id}`;
    }
    if (!usable(image)) throw new SourceError('hp-api', 'missing', `${name} 沒有可用的圖`);
    const base = join(ctx.tmpDir, `hp-api-${id}`), got = await ctx.http.download(image, `${base}.img`, { maxBytes: 30e6 });
    const file = `${base}${extOf(got.type, image)}`;
    renameRetry(`${base}.img`, file);
    return { file, kind: 'image', meta: { source: 'hp-api', id, title: name, author: 'Warner Bros.', page, license: LICENSE, quality: 'original' } };
  },

  async check(ctx) {
    const n = (await hpList<HpSpell>(ctx, 'spells', 0)).length;
    if (!n) throw new SourceError('hp-api', 'broken', 'HP-API 沒有咒語清單');
    return `HP-API 可連線（咒語 ${n} 個）`;
  },

  credit: (r) => `- Image: "${r.title}" (${r.page}), ${r.license}`,

  async data(query, ctx) {
    const [chars, spells, pdbSpells] = await Promise.all([hpList<HpCharacter>(ctx, 'characters'), hpList<HpSpell>(ctx, 'spells'),
      Promise.all([pdb<PdbSpell[]>(ctx, 'spells', { 'filter[name_cont]': query }), pdb<PdbSpell[]>(ctx, 'spells', { 'filter[incantation_cont]': query })]).then(([a, b]) => [...(a ?? []), ...(b ?? [])])]);
    const people = chars.filter((c) => hit(query, c.name, c.actor, ...(c.alternate_names ?? []))).slice(0, 8);
    const pdbPeople = people.length ? [] : ((await pdb<PdbCharacter[]>(ctx, 'characters', { 'filter[name_cont]': query, 'page[size]': '5' })) ?? []);
    const spellLines = new Map<string, string>();
    for (const s of pdbSpells) {
      const a = s.attributes;
      spellLines.set(fold(a.incantation?.replace(/\(.*\)/, '') ?? a.name), `${a.incantation ?? a.name}（${a.name}）：${[a.effect, a.category && `類別 ${a.category}`, a.light && `光 ${a.light}`, a.creator && `發明者 ${a.creator}`].filter(Boolean).join('｜')}`);
    }
    for (const s of spells.filter((s) => hit(query, s.name))) if (!spellLines.has(fold(s.name))) spellLines.set(fold(s.name), `${s.name}：${s.description}`);
    const out = [
      ...(people.length || pdbPeople.length ? ['角色：', ...people.map(hpLine), ...pdbPeople.map(pdbLine)] : []),
      ...(spellLines.size ? [...(people.length || pdbPeople.length ? [''] : []), '咒語：', ...[...spellLines.values()].slice(0, 10)] : []),
    ];
    if (!out.length) return `找不到「${query}」的角色或咒語（用英文：Hermione、Dobby、Expelliarmus、Patronus）`;
    return [...out, '', '圖：assets search "<角色英文名>" --source hp-api', '來源：HP-API、PotterDB（Harry Potter Wiki）；英文資料，旁白要自己改寫'].join('\n');
  },
};
