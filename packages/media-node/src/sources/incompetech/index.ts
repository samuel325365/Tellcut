// Incompetech, Kevin MacLeod's music under CC BY 4.0 (spec 2026-10-22-external-sources §5). incompetech.com does not answer from
// here, so the pieces are searched in an offline snapshot of its catalog (catalog.json, made by tools/sources/incompetech-catalog.ts)
// and downloaded from the archive.org mirror of 833 of them — not official, hence off by default.
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SourceError } from '../http.ts';
import type { AssetHit, SourceAdapter } from '../types.ts';

export interface Piece { id: string; title: string; file: string; genre: string; feel: string[]; bpm: number | null; length: number; instruments: string[]; description: string; isrc?: string; sha1: string; size: number }
export interface Catalog { snapshot: string; mirror: string; items: Piece[] }

export const CATALOG: Catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

const has = (list: string[], v: string) => list.some((x) => x.toLowerCase().includes(v.toLowerCase()));
/** "90-120", or one number for ±5 */
function inRange(bpm: number | null, spec: string): boolean {
  if (bpm === null) return false;
  const [a, b] = spec.split('-').map(Number);
  return b === undefined || Number.isNaN(b) ? Math.abs(bpm - a) <= 5 : bpm >= a && bpm <= b;
}
/** title 3, feel and genre 2, description and instruments 1, per word */
function score(p: Piece, words: string[]): number {
  let s = 0;
  for (const w of words) {
    if (p.title.toLowerCase().includes(w)) s += 3;
    if (has(p.feel, w)) s += 2;
    if (p.genre.toLowerCase().includes(w)) s += 2;
    if (p.description.toLowerCase().includes(w)) s += 1;
    if (has(p.instruments, w)) s += 1;
  }
  return s;
}

const toHit = (p: Piece): AssetHit => ({ ref: `incompetech:${p.id}`, source: 'incompetech', id: p.id, kind: 'music', title: p.title, duration: p.length,
  ...(p.bpm ? { bpm: p.bpm } : {}), author: 'Kevin MacLeod', detail: [p.genre, p.feel.join('、')].filter(Boolean).join(' · ') });

/** the adapter over a catalog (tests give their own) */
export function incompetechSource(catalog: Catalog = CATALOG): SourceAdapter {
  const url = (p: Piece) => `https://archive.org/download/${catalog.mirror}/${encodeURIComponent(p.file)}`;
  return {
    id: 'incompetech', label: 'Incompetech（Kevin MacLeod）', category: 'sound', kinds: ['music'], needsKey: false, unofficial: true,
    limits: [{ n: 15, per: 60 }],
    summary: `Kevin MacLeod 的配樂 ${catalog.items.length} 首（CC BY 4.0）：電影感、YouTube 風，可依情緒、曲風、BPM、長度篩（英文關鍵字；非官方鏡像、僅限個人使用）`,
    sample: 'calm piano',
    card: () => readFileSync(new URL('./card.md', import.meta.url), 'utf8'),

    async search(q) {
      const words = q.text.toLowerCase().split(/\s+/).filter(Boolean), o = q.opts;
      // no keyword (conditions only): every piece scores 0, and by title the first page was all "A…" — a mixed page instead, the
      // same one for the same conditions
      const seed = JSON.stringify([o, q.minSec, q.maxSec]), mix = (p: Piece) => createHash('sha1').update(seed + p.id).digest('hex');
      const tie = words.length ? (a: Piece, b: Piece) => (a.title < b.title ? -1 : 1) : (a: Piece, b: Piece) => (mix(a) < mix(b) ? -1 : 1);
      return catalog.items
        .filter((p) => (q.minSec === undefined || p.length >= q.minSec) && (q.maxSec === undefined || p.length <= q.maxSec))
        .filter((p) => (!o.feel || has(p.feel, o.feel)) && (!o.genre || p.genre.toLowerCase().includes(o.genre.toLowerCase())) && (!o.instrument || has(p.instruments, o.instrument)) && (!o.bpm || inRange(p.bpm, o.bpm)))
        .map((p) => ({ p, s: score(p, words) }))
        .filter((x) => !words.length || x.s > 0)
        .sort((a, b) => b.s - a.s || tie(a.p, b.p))
        .slice(0, q.limit).map((x) => toHit(x.p));
    },

    async get(id, ctx) {
      const p = catalog.items.find((x) => x.id === id);
      if (!p) throw new SourceError('incompetech', 'missing', `Incompetech 清單裡沒有 ${id}`);
      const file = join(ctx.tmpDir, `incompetech-${p.id}.mp3`);
      await ctx.http.download(url(p), file, { maxBytes: 60e6 });
      if (createHash('sha1').update(readFileSync(file)).digest('hex') !== p.sha1) { rmSync(file, { force: true }); throw new SourceError('incompetech', 'temporary', '下載的檔案不完整'); }
      return { file, kind: 'music', ...(p.bpm ? { bpm: p.bpm } : {}), meta: { source: 'incompetech', id: p.id, title: p.title, author: 'Kevin MacLeod',
        page: p.isrc ? `https://incompetech.com/music/royalty-free/index.html?isrc=${p.isrc}` : 'https://incompetech.com/music/royalty-free/',
        license: 'CC BY 4.0', licenseUrl: LICENSE, quality: 'original' } };
    },

    async check(ctx) {
      const h = await ctx.http.head(url(catalog.items[0]));
      if (!/^audio\//.test(h.type)) throw new SourceError('incompetech', 'temporary', `鏡像回的不是音檔（${h.type || '沒有類型'}）`);
      return `清單 ${catalog.items.length} 首（快照 ${catalog.snapshot}），鏡像可下載`;
    },

    credit: (r) => `- Music: "${r.title}" by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0 (${LICENSE})`,
  };
}

export const incompetech = incompetechSource();
