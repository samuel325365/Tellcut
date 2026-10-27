// BBC Sound Effects (spec 2026-10-22-external-sources §5): about 33,000 professional recordings under the RemArc licence (personal,
// educational, research use). The JSON endpoints are not official — found by the community (BBC-Sound-Effects-Ripper) — so the
// source is off by default and may change without notice; `npm run sources` notices when it does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter, SourceCtx } from '../types.ts';

const API = 'https://sound-effects-api.bbcrewind.co.uk/api/sfx/search', MEDIA = 'https://sound-effects-media.bbcrewind.co.uk';
/** a bigger page makes their proxy answer 500 */
const MAX_SIZE = 50;

interface Result { id: string; description: string; duration: number; tags?: string[]; categories?: Array<{ className: string }>; additionalMetadata?: { cdName?: string } }

async function find(ctx: SourceCtx, query: string, size: number): Promise<{ total: number; results: Result[] }> {
  const r = await ctx.http.json<{ total?: number; results?: Result[] }>(API, { method: 'POST', body: { criteria: { from: 0, size, query } }, ttl: 7 * 86400 });
  if (!Array.isArray(r?.results)) throw new SourceError('bbc-sfx', 'broken', '回應格式看不懂（沒有 results）');
  return { total: r.total ?? r.results.length, results: r.results };
}

const toHit = (x: Result): AssetHit => ({ ref: `bbc-sfx:${x.id}`, source: 'bbc-sfx', id: x.id, kind: 'audio', title: x.description,
  duration: Math.round(x.duration) / 1000, author: 'BBC', ...(x.tags?.length ? { tags: x.tags } : {}),
  ...(x.additionalMetadata?.cdName || x.categories?.[0]?.className ? { detail: x.additionalMetadata?.cdName || x.categories![0].className } : {}) });

/** The query their search parses (Elasticsearch syntax): an unpaired quote or a dangling AND/OR/NOT makes it answer HTTP 500, which
 *  reads as an outage — so an odd quote goes and a dangling operator is dropped. */
export function cleanQuery(text: string): string {
  let t = (text.match(/"/g) ?? []).length % 2 ? text.replace(/"/g, ' ') : text;
  for (let prev = ''; prev !== t;) { prev = t; t = t.trim().replace(/^(AND|OR|NOT)\b\s*/, '').replace(/\s*\b(AND|OR|NOT)$/, ''); }
  return t.replace(/\s+/g, ' ');
}

export const bbcSfx: SourceAdapter = {
  id: 'bbc-sfx', label: 'BBC Sound Effects', category: 'sound', kinds: ['audio'], needsKey: false, unofficial: true,
  limits: [{ n: 30, per: 60 }],
  summary: 'BBC 專業錄音音效約 3.3 萬筆：自然、城市、交通、室內、年代感的環境音和擬音（英文關鍵字；非官方、僅限個人使用）',
  sample: 'rain',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const { results } = await find(ctx, cleanQuery(q.text), Math.min(MAX_SIZE, q.limit * 3));
    return results.map(toHit).filter((h) => (q.minSec === undefined || h.duration! >= q.minSec) && (q.maxSec === undefined || h.duration! <= q.maxSec)).slice(0, q.limit);
  },

  async get(id, ctx) {
    const x = (await find(ctx, id, 5)).results.find((r) => r.id === id);
    if (!x) throw new SourceError('bbc-sfx', 'missing', `BBC 沒有 ${id} 這筆音效`);
    const wav = ctx.options.format === 'wav', file = join(ctx.tmpDir, `bbc-${id}.${wav ? 'wav' : 'mp3'}`);
    await ctx.http.download(`${MEDIA}/${wav ? 'wav' : 'mp3'}/${id}.${wav ? 'wav' : 'mp3'}`, file, { maxBytes: (wav ? 300 : 100) * 1e6 });
    return { file, kind: 'audio', meta: { source: 'bbc-sfx', id, title: x.description, author: 'BBC', page: `https://sound-effects.bbcrewind.co.uk/search?q=${id}`,
      license: 'RemArc（限個人、教育、研究用途）', licenseUrl: 'https://sound-effects.bbcrewind.co.uk/licensing', quality: wav ? 'original' : 'preview' } };
  },

  async check(ctx) { return `共 ${(await find(ctx, 'rain', 1)).total} 筆`; },

  credit: (r) => `- SFX: BBC Sound Effects ${r.id} "${r.title}" (bbcrewind, RemArc licence, personal use)`,
};
