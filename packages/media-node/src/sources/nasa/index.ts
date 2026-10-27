// NASA Image and Video Library (spec 2026-10-24-api-picker §5): space, Earth, rockets and missions as pictures and footage, mostly
// public domain (NASA's own work; some items carry a third party's copyright, which their page says). No key. A search gives each
// item's id and a small preview; the files are listed per item (/asset/<id>): the original and smaller copies of each.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { cleanUrl, SourceError } from '../http.ts';
import type { AssetHit, AssetKind, SourceAdapter, SourceCtx } from '../types.ts';

const API = 'https://images-api.nasa.gov';
/** an original picture this big or smaller is taken as it is; a bigger one, its large copy */
const IMAGE_MAX_BYTES = 20e6;
/** footage: the first copy (original, large, medium, small, preview, mobile: biggest first) at most this big */
const VIDEO_MAX_BYTES = 400e6;
const LICENSE = 'NASA media (generally not copyrighted; see the item page)';
const LICENSE_URL = 'https://www.nasa.gov/nasa-brand-center/images-and-media/';

interface ItemData { nasa_id: string; title: string; media_type: string; date_created?: string; center?: string; photographer?: string; secondary_creator?: string; description?: string }
interface Item { data?: ItemData[]; links?: Array<{ href: string; render?: string }> }
interface Collection { collection?: { items?: Item[]; metadata?: { total_hits?: number } } }

const page = (id: string) => `https://images.nasa.gov/details/${encodeURIComponent(id)}`;
const authorOf = (d: ItemData) => d.photographer || d.secondary_creator || (d.center ? `NASA ${d.center}` : 'NASA');

async function search(ctx: SourceCtx, params: Record<string, string>, ttl = 86400): Promise<Item[]> {
  const r = await ctx.http.json<Collection>(`${API}/search?${new URLSearchParams(params)}`, { ttl });
  if (!Array.isArray(r?.collection?.items)) throw new SourceError('nasa', 'broken', '回應格式看不懂（沒有 collection.items）');
  return r.collection.items;
}

/** the files NASA keeps of one item; missing when the id is not theirs */
async function files(ctx: SourceCtx, id: string): Promise<string[]> {
  const r = await ctx.http.json<{ collection?: { items?: Array<{ href: string }> } }>(`${API}/asset/${encodeURIComponent(id)}`, { ttl: 7 * 86400, notFound: 'missing' })
    .catch((e) => { if (e instanceof SourceError && e.kind === 'missing') throw new SourceError('nasa', 'missing', `NASA 沒有 ${id} 這個項目`); throw e; });
  if (!Array.isArray(r?.collection?.items)) throw new SourceError('nasa', 'broken', '回應格式看不懂（沒有檔案清單）');
  return r.collection.items.map((x) => cleanUrl(x.href));
}

/** the copy of `kind` to download: the first of `order` that exists and (by its HEAD) is not over `max` bytes */
async function pick(ctx: SourceCtx, list: string[], order: string[], max: number): Promise<{ url: string; copy: string } | null> {
  for (const copy of order) {
    const url = list.find((u) => decodeURIComponent(new URL(u).pathname).endsWith(copy));
    if (!url) continue;
    const h = await ctx.http.head(url).catch(() => null);
    if (h && (h.length === undefined || h.length <= max)) return { url, copy };
  }
  return null;
}

export const nasa: SourceAdapter = {
  id: 'nasa', label: 'NASA Image and Video Library', category: 'media', kinds: ['image', 'video'], needsKey: false,
  limits: [{ n: 60, per: 60 }],
  summary: 'NASA 圖片影片庫：太空、地球、火箭、太空人、任務的照片和影片，多為公有領域（英文關鍵字；--kind image|video）',
  sample: 'saturn',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    const media = q.kind === 'video' ? 'video' : q.kind === 'image' ? 'image' : 'image,video';
    const items = await search(ctx, { q: q.text, media_type: media, page_size: String(Math.min(100, q.limit)) });
    const hits: AssetHit[] = [];
    for (const it of items) {
      const d = it.data?.[0];
      if (!d?.nasa_id || (d.media_type !== 'image' && d.media_type !== 'video')) continue;
      const thumb = it.links?.find((l) => l.render === 'image')?.href ?? it.links?.[0]?.href;
      hits.push({ ref: `nasa:${d.nasa_id}`, source: 'nasa', id: d.nasa_id, kind: d.media_type as AssetKind, title: d.title, author: authorOf(d),
        ...(thumb ? { thumbUrl: cleanUrl(thumb) } : {}), detail: [d.media_type === 'video' ? '影片' : '圖片', d.date_created?.slice(0, 10), authorOf(d)].filter(Boolean).join(' · ') });
    }
    return hits.slice(0, q.limit);
  },

  async get(id, ctx) {
    const list = await files(ctx, id);
    const isVideo = list.some((u) => /\.mp4$/i.test(new URL(u).pathname));
    const want = isVideo
      ? await pick(ctx, list, ['~orig.mp4', '~large.mp4', '~medium.mp4', '~small.mp4', '~preview.mp4', '~mobile.mp4'], VIDEO_MAX_BYTES)
      : await pick(ctx, list, ['~orig.jpg', '~orig.png', '~orig.jpeg', '~large.jpg', '~medium.jpg'], IMAGE_MAX_BYTES);
    if (!want) throw new SourceError('nasa', 'missing', `NASA 的 ${id} 沒有可以下載的${isVideo ? '影片' : '圖片'}檔`);
    const [d] = (await search(ctx, { nasa_id: id }, 7 * 86400)).map((x) => x.data?.[0]).filter((x): x is ItemData => !!x);
    const kind: AssetKind = isVideo ? 'video' : 'image';
    const file = join(ctx.tmpDir, `nasa-${id.replace(/[^A-Za-z0-9_-]/g, '-')}${extname(new URL(want.url).pathname).toLowerCase()}`);
    await ctx.http.download(want.url, file, { maxBytes: isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES * 2 });
    return { file, kind, meta: { source: 'nasa', id, title: d?.title ?? id, author: d ? authorOf(d) : 'NASA', page: page(id), license: LICENSE, licenseUrl: LICENSE_URL,
      quality: want.copy.startsWith('~orig') ? 'original' : 'preview' } };
  },

  async check(ctx) {
    const r = await ctx.http.json<Collection>(`${API}/search?${new URLSearchParams({ q: 'moon', page_size: '1' })}`);
    const n = r?.collection?.metadata?.total_hits;
    if (n === undefined) throw new SourceError('nasa', 'broken', '回應格式看不懂（沒有 total_hits）');
    return `「moon」共 ${n} 筆`;
  },

  credit: (r) => `- NASA: "${r.title}" by ${r.author} (${r.page}), ${r.license}`,
};
