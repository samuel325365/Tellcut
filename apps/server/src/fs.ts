// The home page's import browser: what is in a folder on this PC (names, kinds, sizes — never file contents). Browsers do
// not give a page real file paths, so the page browses through these two read-only routes and hands the paths on.
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { kindOf, skipName, TELLCUT_ROOT } from '@tellcut/media-node';
import { HttpError, sendJson, type Router } from './http.ts';

const collator = new Intl.Collator('zh-Hant', { sensitivity: 'base', numeric: true });

// `key` (and `drive`, the letter) lets the page word a place in its own language; `label` stays for older pages
export type PlaceKey = 'desktop' | 'downloads' | 'videos' | 'pictures' | 'documents' | 'music' | 'sources' | 'drive' | 'root';
export type Place = { key: PlaceKey; label: string; path: string; kind: 'home' | 'repo' | 'drive'; drive?: string };

export function places(): Place[] {
  const home = homedir(), out: Place[] = [];
  for (const [key, label, name] of [['desktop', '桌面', 'Desktop'], ['downloads', '下載', 'Downloads'], ['videos', '影片', 'Videos'], ['pictures', '圖片', 'Pictures'], ['documents', '文件', 'Documents'], ['music', '音樂', 'Music']] as const) {
    const p = join(home, name);
    if (existsSync(p)) out.push({ key, label, path: p, kind: 'home' });
  }
  // a sources/ folder inside tellcut (not in git) for footage kept with Tellcut; any other folder works as well
  const src = join(TELLCUT_ROOT, 'sources');
  if (existsSync(src)) out.push({ key: 'sources', label: '素材資料夾（sources）', path: src, kind: 'repo' });
  if (process.platform === 'win32') {
    for (let c = 67; c <= 90; c++) { const p = `${String.fromCharCode(c)}:\\`; if (existsSync(p)) out.push({ key: 'drive', drive: String.fromCharCode(c), label: `本機磁碟 ${String.fromCharCode(c)}:`, path: p, kind: 'drive' }); }
  } else out.push({ key: 'root', label: '根目錄', path: '/', kind: 'drive' });
  return out;
}

/** stats at once while listing: a NAS answers each one slowly, and a folder of thousands one at a time took minutes */
const STAT_AT_ONCE = 16;
type Entry = { name: string; kind: 'dir' } | { name: string; kind: 'video' | 'image' | 'audio' | 'other'; size: number };

/** async, so a slow or huge folder never holds up the server's other requests (the editor's saves, the media) meanwhile */
export async function listFolder(path: string) {
  if (!path || !isAbsolute(path)) throw new HttpError(400, '請給完整路徑（例如 D:\\旅遊\\京都）', { code: 'fs.notAbsolute' });
  const dir = resolve(path);
  let st;
  try { st = await stat(dir); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(404, `找不到 ${dir}`, { code: 'fs.notFound', params: { dir } });
    throw new HttpError(403, `讀不到 ${dir}`, { code: 'fs.unreadable', params: { dir } });
  }
  if (!st.isDirectory()) throw new HttpError(400, `${dir} 不是資料夾`, { code: 'fs.notDir', params: { dir } });
  let names;
  try { names = await readdir(dir, { withFileTypes: true }); } catch { throw new HttpError(403, `讀不到 ${dir}`, { code: 'fs.unreadable', params: { dir } }); }
  const shown = names.filter((e) => !skipName(e.name));   // hidden and system names: what an import's folder walk passes over too
  const entries: Entry[] = new Array(shown.length);
  let next = 0;
  const worker = async () => {
    while (next < shown.length) {
      const i = next++, e = shown[i];
      if (e.isDirectory()) { entries[i] = { name: e.name, kind: 'dir' }; continue; }
      let size = 0;
      try { size = (await stat(join(dir, e.name))).size; } catch { /* unreadable: size unknown */ }
      entries[i] = { name: e.name, kind: kindOf(e.name) ?? 'other', size };
    }
  };
  await Promise.all(Array.from({ length: Math.min(STAT_AT_ONCE, shown.length) }, worker));
  entries.sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || collator.compare(a.name, b.name));
  const parent = dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, entries };
}

export function fsRoutes(r: Router) {
  r.get('/api/fs/places', (_req, res) => sendJson(res, 200, { places: places() }));
  r.get('/api/fs/list', async (_req, res, _p, url) => sendJson(res, 200, await listFolder(url.searchParams.get('path') ?? '')));
}
