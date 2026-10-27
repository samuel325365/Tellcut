// Pixabay (spec 2026-10-25-brand-preset §5): free stock footage and photos — everyday life, work, cities, food, scenery — under
// the Pixabay Content License. Needs a key, which the API takes only in the query: it must never reach a message, a hit or a
// record. Terms (pixabay.com/api/docs, read 2026-10-25): 100 requests a minute, answers cached 24 h, files downloaded rather
// than hotlinked, results shown as coming from Pixabay, no mass downloading. Video and photo ids are two separate series, so
// refs carry the kind: pixabay:video-123, pixabay:image-123.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SearchQuery, SourceAdapter, SourceCtx } from '../types.ts';

const API = 'https://pixabay.com/api';
const LICENSE = 'Pixabay Content License';
const LICENSE_URL = 'https://pixabay.com/service/license-summary/';
const DAY = 86400;
/** a lookup by id is followed by its download: its file URLs (largeImageURL's pixabay.com/get/…) are only valid for a while */
const GET_TTL = 600;
const VIDEO_MAX_BYTES = 500e6;
const OPTS = ['order', 'category', 'editors_choice', 'video_type', 'colors'];
const SIZES = ['tiny', 'small', 'medium', 'large'] as const;

interface Rendition { url: string; width: number; height: number; size?: number; thumbnail?: string }
interface VideoHit { id: number; pageURL: string; tags: string; duration: number; user: string; videos: Partial<Record<(typeof SIZES)[number], Rendition>> }
interface ImageHit { id: number; pageURL: string; tags: string; user: string; previewURL: string; webformatURL: string; largeImageURL: string; imageWidth: number; imageHeight: number }
interface Answer<T> { total?: number; totalHits?: number; hits?: T[] }

/** the smallest rendition whose short side is at least `short` px; none is: the biggest there is (an empty url is no rendition) */
export function pickRendition(videos: VideoHit['videos'], short: number): { name: string; url: string; width: number; height: number; enough: boolean } | null {
  const have = SIZES.flatMap((name) => { const r = videos[name]; return r?.url ? [{ name, url: r.url, width: r.width, height: r.height }] : []; });
  const hit = have.find((r) => Math.min(r.width, r.height) >= short);
  if (hit) return { ...hit, enough: true };
  const big = have.at(-1);
  return big ? { ...big, enough: false } : null;
}

/** the smallest rendition that covers a w×h frame without upscaling (cover: the picture's both sides at least the frame's
 *  after scaling to fill it); none does: the biggest there is */
export function pickForFrame(videos: VideoHit['videos'], fw: number, fh: number): ReturnType<typeof pickRendition> {
  const have = SIZES.flatMap((name) => { const r = videos[name]; return r?.url ? [{ name, url: r.url, width: r.width, height: r.height }] : []; });
  const hit = have.find((r) => Math.max(fw / r.width, fh / r.height) <= 1);
  if (hit) return { ...hit, enough: true };
  const big = have.at(-1);
  return big ? { ...big, enough: false } : null;
}

/** the key as it may go into a URL; another shape (a stray character when pasted) would change the query itself */
function keyOf(ctx: SourceCtx): string {
  const key = (ctx.key ?? '').trim();
  if (!/^[A-Za-z0-9-]+$/.test(key)) throw new SourceError('pixabay', 'broken', 'Pixabay 的 key 格式不對（只能有英文字母、數字和 -）');
  return key;
}

const tagsOf = (h: { tags: string }) => h.tags.split(',').map((t) => t.trim()).filter(Boolean);
const isAi = (h: { tags: string }) => tagsOf(h).some((t) => /^ai generated$/i.test(t));
const titleOf = (h: { tags: string }) => tagsOf(h).slice(0, 3).join(', ') || 'Pixabay';
/** wider than tall, taller than wide, or either (1:1 or no ratio) */
function shapeOf(ratio?: string): 'wide' | 'tall' | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio ?? '');
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]);
  return w > h ? 'wide' : h > w ? 'tall' : null;
}

async function ask<T>(ctx: SourceCtx, path: '/' | '/videos/', params: Record<string, string>, ttl = DAY): Promise<Answer<T>> {
  const qs = new URLSearchParams({ key: keyOf(ctx), ...params });
  const r = await ctx.http.json<Answer<T>>(`${API}${path}?${qs}`, { ttl });
  if (!Array.isArray(r?.hits)) throw new SourceError('pixabay', 'broken', '回應格式看不懂（沒有 hits）');
  return r;
}

function baseParams(q: SearchQuery, perPage: number): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(q.opts)) {
    if (!OPTS.includes(k)) throw new Error(`--opt ${k} 不認得；Pixabay 能用 ${OPTS.join('、')}`);
    extra[k] = v;
  }
  return { q: q.text.slice(0, 100), safesearch: 'true', per_page: String(Math.max(3, Math.min(200, perPage))), ...extra };
}

function videoHit(h: VideoHit): AssetHit {
  const r = pickRendition(h.videos, 1080), tags = tagsOf(h), w = r?.width ?? 0, ht = r?.height ?? 0;
  const thumb = h.videos.medium?.thumbnail || h.videos.tiny?.thumbnail;
  return { ref: `pixabay:video-${h.id}`, source: 'pixabay', id: `video-${h.id}`, kind: 'video', title: titleOf(h), duration: h.duration, width: w, height: ht,
    ...(thumb ? { thumbUrl: thumb } : {}), author: h.user, tags,
    detail: ['影片', `${w}×${ht}`, `${h.duration} 秒`, ht > w ? '直式' : '', isAi(h) ? 'AI 生成' : '', h.user].filter(Boolean).join(' · ') };
}

function imageHit(h: ImageHit): AssetHit {
  return { ref: `pixabay:image-${h.id}`, source: 'pixabay', id: `image-${h.id}`, kind: 'image', title: titleOf(h), width: h.imageWidth, height: h.imageHeight,
    thumbUrl: h.previewURL, author: h.user, tags: tagsOf(h),
    detail: ['圖片', `${h.imageWidth}×${h.imageHeight}`, h.imageHeight > h.imageWidth ? '直式' : '', isAi(h) ? 'AI 生成' : '', h.user].filter(Boolean).join(' · ') };
}

async function searchVideos(q: SearchQuery, ctx: SourceCtx): Promise<AssetHit[]> {
  const shape = shapeOf(q.ratio);
  const r = await ask<VideoHit>(ctx, '/videos/', baseParams(q, shape ? q.limit * 3 : q.limit));
  // a video with no file to download (every rendition's url empty) would list as 0×0 and fail on get
  const hits = r.hits!.filter((h) => pickRendition(h.videos ?? {}, 0)).map(videoHit).filter((h) => !shape || (shape === 'wide' ? h.width! > h.height! : h.height! > h.width!));
  return hits.slice(0, q.limit);
}

async function searchImages(q: SearchQuery, ctx: SourceCtx): Promise<AssetHit[]> {
  const shape = shapeOf(q.ratio);
  const r = await ask<ImageHit>(ctx, '/', { ...baseParams(q, q.limit), image_type: 'photo', ...(shape ? { orientation: shape === 'wide' ? 'horizontal' : 'vertical' } : {}) });
  return r.hits!.map(imageHit).slice(0, q.limit);
}

export const pixabay: SourceAdapter = {
  id: 'pixabay', label: 'Pixabay', category: 'media', kinds: ['video', 'image'], needsKey: true,
  limits: [{ n: 100, per: 60 }],
  summary: 'Pixabay：免費實拍影片和照片，生活、工作、城市、食物、自然空景（英文關鍵字；--kind video|image）',
  sample: 'coffee',
  card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

  async search(q, ctx) {
    if (q.kind === 'video') return searchVideos(q, ctx);
    if (q.kind === 'image') return searchImages(q, ctx);
    const [v, i] = await Promise.all([searchVideos(q, ctx), searchImages(q, ctx)]);
    return [...v, ...i].slice(0, q.limit);
  },

  async get(id, ctx) {
    const m = /^(video|image)-(\d+)$/.exec(id);
    if (!m) throw new SourceError('pixabay', 'missing', `Pixabay 的編號看不懂：${id}（要像 video-123 或 image-123）`);
    const [, kind, n] = m;
    if (kind === 'video') {
      const [h] = (await ask<VideoHit>(ctx, '/videos/', { id: n }, GET_TTL)).hits!;
      if (!h) throw new SourceError('pixabay', 'missing', `Pixabay 沒有 ${id} 這支影片`);
      // --opt short=… wins; else the project's frame (getAsset gives frame=WxH); else a 1080 short side
      const frame = /^(\d+)x(\d+)$/.exec(String(ctx.options.frame ?? ''));
      const r = ctx.options.short !== undefined || !frame ? pickRendition(h.videos, Number(ctx.options.short ?? 1080) || 1080) : pickForFrame(h.videos, Number(frame[1]), Number(frame[2]));
      if (!r) throw new SourceError('pixabay', 'missing', `Pixabay 的 ${id} 沒有可以下載的影片檔`);
      const file = join(ctx.tmpDir, `pixabay-${id}.mp4`);
      await ctx.http.download(r.url, file, { maxBytes: VIDEO_MAX_BYTES });
      return { file, kind: 'video', meta: { source: 'pixabay', id, title: titleOf(h), author: h.user, page: h.pageURL, license: LICENSE, licenseUrl: LICENSE_URL, quality: r.enough ? 'original' : 'preview' } };
    }
    const [h] = (await ask<ImageHit>(ctx, '/', { id: n }, GET_TTL)).hits!;
    if (!h) throw new SourceError('pixabay', 'missing', `Pixabay 沒有 ${id} 這張圖`);
    const url = h.largeImageURL || h.webformatURL;
    const file = join(ctx.tmpDir, `pixabay-${id}${extname(new URL(url).pathname).toLowerCase() || '.jpg'}`);
    await ctx.http.download(url, file, { maxBytes: 50e6 });
    return { file, kind: 'image', meta: { source: 'pixabay', id, title: titleOf(h), author: h.user, page: h.pageURL, license: LICENSE, licenseUrl: LICENSE_URL, quality: h.imageWidth > 1280 ? 'preview' : 'original' } };
  },

  async check(ctx) {
    const r = await ask<VideoHit>(ctx, '/videos/', { q: 'coffee', per_page: '3', safesearch: 'true' }, 0);
    return `「coffee」共 ${r.totalHits ?? r.hits!.length} 筆`;
  },

  credit: (r) => `- Pixabay: "${r.title}" by ${r.author} (${r.page}), ${r.license}`,
};
