// Freesound (spec 2026-10-22-external-sources §5): the widest range of sound effects — foley, ambience, odd noises, single notes,
// loops — under Creative Commons licences. With a token only previews can be fetched (about 192 kbps OGG, enough for a short film);
// the originals need OAuth2 and are not used. The key goes in a header, never in a URL. Its terms forbid mirroring the catalogue:
// only what a film uses is downloaded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const API = 'https://freesound.org/apiv2';
const FIELDS = 'id,name,duration,license,username,tags';
/** --opt license=… as Freesound's filter values */
const LICENSES: Record<string, string> = { cc0: 'Creative Commons 0', by: 'Attribution', 'by-nc': 'Attribution NonCommercial' };

/** a licence URL as a name: CC0 1.0, CC BY 4.0, CC BY-NC 3.0, Sampling+ 1.0; anything else as it is */
export function licenseName(url: string): string {
  const zero = /\/publicdomain\/zero\/([\d.]+)/.exec(url);
  if (zero) return `CC0 ${zero[1]}`;
  const m = /\/licenses\/([a-z+-]+)\/([\d.]+)/.exec(url);
  if (!m) return url;
  return m[1] === 'sampling+' ? `Sampling+ ${m[2]}` : `CC ${m[1].toUpperCase()} ${m[2]}`;
}

/** The key as a header. A key of another shape (a stray newline when pasted) would make the header itself throw with the key in
 *  its message: it is refused first, without being repeated. */
function auth(ctx: SourceCtx) {
  const key = (ctx.key ?? '').trim();
  if (!/^[A-Za-z0-9]+$/.test(key)) throw new SourceError('freesound', 'broken', 'Freesound 的 key 格式不對（只能有英文字母和數字）');
  return { Authorization: `Token ${key}` };
}

interface Result { id: number; name: string; duration: number; license: string; username: string; tags?: string[] }

async function find(ctx: SourceCtx, params: Record<string, string>, ttl = 86400): Promise<{ count: number; results: Result[] }> {
  const r = await ctx.http.json<{ count?: number; results?: Result[] }>(`${API}/search/text/?${new URLSearchParams(params)}`, { headers: auth(ctx), ttl });
  if (!Array.isArray(r?.results)) throw new SourceError('freesound', 'broken', '回應格式看不懂（沒有 results）');
  return { count: r.count ?? r.results.length, results: r.results };
}

export const freesound: SourceAdapter = {
  id: 'freesound', label: 'Freesound', category: 'sound', kinds: ['audio'], needsKey: true,
  limits: [{ n: 60, per: 60 }, { n: 2000, per: 86400 }],
  summary: 'Freesound 音效：種類最多的擬音、環境音、怪聲、樂器單音和 loop，CC 授權（英文關鍵字；可篩長度、BPM、授權）',
  sample: 'rain',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const filters: string[] = [];
    if (q.minSec !== undefined || q.maxSec !== undefined) filters.push(`duration:[${q.minSec ?? '*'} TO ${q.maxSec ?? '*'}]`);
    // a value it does not know is refused: a dropped licence filter would quietly bring back the NC sounds it was meant to keep out
    if (q.opts.bpm !== undefined) {
      const bpm = /^(\d+)-(\d+)$/.exec(q.opts.bpm);
      if (!bpm) throw new Error('--opt bpm 要像 90-120');
      filters.push(`bpm:[${bpm[1]} TO ${bpm[2]}]`);
    }
    if (q.opts.license !== undefined) {
      const l = q.opts.license.toLowerCase();
      if (!Object.hasOwn(LICENSES, l)) throw new Error(`--opt license 只能是 ${Object.keys(LICENSES).join('、')}`);
      filters.push(`license:"${LICENSES[l]}"`);
    }
    // Freesound has no loop field (ac_loop, loop and is_loop are all refused): the tag people put on loops
    if (q.opts.loop !== undefined) {
      if (q.opts.loop !== 'true') throw new Error('--opt loop 只能是 true');
      filters.push('tag:loop');
    }
    const { results } = await find(ctx, { query: q.text, page_size: String(q.limit), fields: FIELDS, ...(filters.length ? { filter: filters.join(' ') } : {}) });
    return results.map((x): AssetHit => ({ ref: `freesound:${x.id}`, source: 'freesound', id: String(x.id), kind: 'audio', title: x.name, duration: x.duration, author: x.username,
      ...(x.tags?.length ? { tags: x.tags.slice(0, 5) } : {}), detail: `${licenseName(x.license)} · ${x.username}` }));
  },

  async get(id, ctx) {
    // a typo ("freesound:..") would reach the API root, answer without previews and mark the whole source broken
    if (!/^\d+$/.test(id)) throw new SourceError('freesound', 'missing', `Freesound 沒有 ${id} 這個音效`);
    const s = await ctx.http.json<{ name: string; username: string; license: string; url: string; previews?: Record<string, string> }>(
      `${API}/sounds/${encodeURIComponent(id)}/?fields=id,name,username,license,previews,duration,url`, { headers: auth(ctx), ttl: 86400, notFound: 'missing' })
      .catch((e) => { if (e instanceof SourceError && e.kind === 'missing') throw new SourceError('freesound', 'missing', `Freesound 沒有 ${id} 這個音效`); throw e; });
    const preview = s.previews?.['preview-hq-ogg'] ?? s.previews?.['preview-hq-mp3'];
    if (!preview) throw new SourceError('freesound', 'broken', '回應格式看不懂（沒有試聽檔）');
    const file = join(ctx.tmpDir, `freesound-${id}${preview.endsWith('.mp3') ? '.mp3' : '.ogg'}`);
    await ctx.http.download(preview, file, { maxBytes: 50e6 });
    return { file, kind: 'audio', meta: { source: 'freesound', id, title: s.name, author: s.username, page: s.url, license: licenseName(s.license), licenseUrl: s.license, quality: 'preview' } };
  },

  // never from the cache: a key that went bad must show in `npm run sources`, not a day later
  async check(ctx) { return `共 ${(await find(ctx, { query: 'rain', page_size: '1', fields: 'id' }, 0)).count} 筆`; },

  credit: (r) => `- SFX: "${r.title}" by ${r.author} (${r.page}), ${r.license}${r.licenseUrl ? ` ${r.licenseUrl}` : ''}`,
};
