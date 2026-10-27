// Makes the Incompetech catalog snapshot (spec 2026-10-22-external-sources §5), run by hand once in a while:
//   npx tsx tools/sources/incompetech-catalog.ts
// incompetech.com does not answer from here, so its pieces.json (title, genre, feel, bpm, length…) and genre.json come from the
// Wayback Machine, and only the pieces the archive.org mirror holds are kept, with the mirror's file name, sha1 and size.
// Writes packages/media-node/src/sources/incompetech/catalog.json.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHttp, SOURCES_CACHE_DIR, TELLCUT_ROOT } from '@tellcut/media-node';

const PIECES = 'https://web.archive.org/web/20260928121052id_/https://incompetech.com/music/royalty-free/pieces.json';
const GENRES = 'https://web.archive.org/web/20251114204932id_/https://incompetech.com/music/royalty-free/genre.json';
const MIRROR = 'abook-music-incompetech-cc-by-4.0';
const OUT = join(TELLCUT_ROOT, 'packages', 'media-node', 'src', 'sources', 'incompetech', 'catalog.json');

interface Piece { title: string; length: string; instruments?: string; genre?: string; bpm?: string; description?: string; feel?: string; isrc?: string }
interface IaFile { name: string; title?: string; length?: string; genre?: string; sha1: string; size: string }

const http = createHttp({ source: 'incompetech', cacheDir: SOURCES_CACHE_DIR, limits: [{ n: 15, per: 60 }] });
const tmp = mkdtempSync(join(tmpdir(), 'incompetech-'));
/** a JSON file downloaded whole; Wayback's raw (id_) copies may still be gzip bytes */
async function fetchJson<T>(url: string, name: string): Promise<T> {
  const f = join(tmp, name);
  await http.download(url, f, { maxBytes: 20e6 });
  let b = readFileSync(f);
  if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  return JSON.parse(b.toString('utf8'));
}
const secs = (hms: string) => hms.split(':').reduce((s, x) => s * 60 + Number(x), 0);
const list = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

try {
  const pieces = await fetchJson<Piece[]>(PIECES, 'pieces.json');
  const genres = new Map((await fetchJson<Array<{ id: number; genre: string }>>(GENRES, 'genre.json')).map((g) => [String(g.id), g.genre]));
  const files = (await fetchJson<{ result: IaFile[] }>(`https://archive.org/metadata/${MIRROR}/files`, 'files.json')).result.filter((f) => /^incompetech-.*\.mp3$/.test(f.name));
  const used = new Set<string>();
  const items = files.map((f) => {
    const title = f.title ?? f.name.replace(/^incompetech-|\.mp3$/g, ''), length = Math.round(Number(f.length ?? 0) * 100) / 100;
    // a title can appear twice in pieces.json: the one whose length is closest
    const p = pieces.filter((x) => x.title === title).sort((a, b) => Math.abs(secs(a.length) - length) - Math.abs(secs(b.length) - length))[0];
    const base = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'piece';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    const bpm = Number(p?.bpm);
    return { id, title, file: f.name, genre: (p?.genre && genres.get(p.genre)) || f.genre || '', feel: list(p?.feel), bpm: bpm > 0 ? bpm : null, length,
      instruments: list(p?.instruments), description: (p?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), ...(p?.isrc ? { isrc: p.isrc } : {}), sha1: f.sha1, size: Number(f.size) };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  const head = { snapshot: '2026-09-28', mirror: MIRROR };
  // one piece per line: a later snapshot diffs by piece
  writeFileSync(OUT, `{"snapshot":${JSON.stringify(head.snapshot)},"mirror":${JSON.stringify(head.mirror)},"items":[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]}\n`);
  console.log(`${items.length} 首，其中 ${items.filter((x) => x.bpm).length} 首有 BPM → ${OUT}`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
