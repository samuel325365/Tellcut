// The home page's import browser: what is in a folder on this PC (names, kinds, sizes — never file contents). Browsers do
// not give a page real file paths, so the page browses through these two read-only routes and hands the paths on.
import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { kindOf, skipName, TELLCUT_ROOT } from '@tellcut/media-node';
import { HttpError, sendJson, type Router } from './http.ts';

const collator = new Intl.Collator('zh-Hant', { sensitivity: 'base', numeric: true });

// `key` (and `drive`, the letter) lets the page word a place in its own language; `label` stays for older pages
// a macOS volume (`volume`) is worded by its own name, the label
export type PlaceKey = 'desktop' | 'downloads' | 'videos' | 'pictures' | 'documents' | 'music' | 'sources' | 'drive' | 'volume' | 'root';
export type Place = { key: PlaceKey; label: string; path: string; kind: 'home' | 'repo' | 'drive'; drive?: string };

/** a place's real path; throws when it is not there */
export type Probe = (path: string) => Promise<string>;
/** how long a place may take to answer before this listing leaves it out */
const PROBE_MS = 1500;
/** the looks still waiting for an answer: a network drive that is gone answers only when SMB gives up, a minute or so later.
 *  The listing does not wait for it (a sync look held up the whole server meanwhile), and asks it again only once that answer
 *  is in, so stuck looks never pile up in Node's few file-system threads. */
const probing = new Map<string, Promise<string | null>>();
function within(path: string, probe: Probe, ms: number): Promise<string | null> {
  let p = probing.get(path);
  if (!p) {
    p = probe(path).catch(() => null).finally(() => probing.delete(path));
    probing.set(path, p);
  }
  return Promise.race([p, new Promise<null>((ok) => setTimeout(ok, ms, null).unref())]);
}

export async function places(o: { probe?: Probe; ms?: number } = {}): Promise<Place[]> {
  const probe = o.probe ?? ((p: string) => realpath(p)), ms = o.ms ?? PROBE_MS;
  const home = homedir(), videos = process.platform === 'darwin' ? 'Movies' : 'Videos';
  const all: Array<{ place: Place; ok?: (real: string) => boolean }> = [];
  for (const [key, label, name] of [['desktop', '桌面', 'Desktop'], ['downloads', '下載', 'Downloads'], ['videos', '影片', videos], ['pictures', '圖片', 'Pictures'], ['documents', '文件', 'Documents'], ['music', '音樂', 'Music']] as const)
    all.push({ place: { key, label, path: join(home, name), kind: 'home' } });
  // a sources/ folder inside tellcut (not in git) for footage kept with Tellcut; any other folder works as well
  all.push({ place: { key: 'sources', label: '素材資料夾（sources）', path: join(TELLCUT_ROOT, 'sources'), kind: 'repo' } });
  if (process.platform === 'win32') {
    for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c); all.push({ place: { key: 'drive', drive: d, label: `本機磁碟 ${d}:`, path: `${d}:\\`, kind: 'drive' } }); }
  } else if (process.platform === 'darwin') {
    // macOS: the startup disk is / itself; other disks, card readers and phones mount under /Volumes (the startup disk's own
    // entry there, a link to /, is not listed twice)
    let vols: string[] = [];
    try { vols = (await readdir('/Volumes')).filter((v) => !v.startsWith('.')); } catch { /* none */ }
    for (const v of vols) all.push({ place: { key: 'volume', label: v, path: join('/Volumes', v), kind: 'drive' }, ok: (real) => real !== '/' });
  }
  const real = await Promise.all(all.map((x) => within(x.place.path, probe, ms)));
  const out = all.filter((x, i) => real[i] !== null && (!x.ok || x.ok(real[i]!))).map((x) => x.place);
  if (process.platform !== 'win32') out.push({ key: 'root', label: '根目錄', path: '/', kind: 'drive' });
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
      // stat follows links: a junction or a symbolic link to a folder is a folder to open (as a link it was "other")
      try { const st = await stat(join(dir, e.name)); if (e.isSymbolicLink() && st.isDirectory()) { entries[i] = { name: e.name, kind: 'dir' }; continue; } size = st.size; }
      catch { /* unreadable, or a link to nothing: size unknown */ }
      entries[i] = { name: e.name, kind: kindOf(e.name) ?? 'other', size };
    }
  };
  await Promise.all(Array.from({ length: Math.min(STAT_AT_ONCE, shown.length) }, worker));
  entries.sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || collator.compare(a.name, b.name));
  const parent = dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, entries };
}

export function fsRoutes(r: Router) {
  r.get('/api/fs/places', async (_req, res) => sendJson(res, 200, { places: await places() }));
  r.get('/api/fs/list', async (_req, res, _p, url) => sendJson(res, 200, await listFolder(url.searchParams.get('path') ?? '')));
}
