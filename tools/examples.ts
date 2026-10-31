// The example projects (spec 2026-10-30-showcase-films part 2):  npm run examples [-- <name> … | --all]
// They live on the GitHub release `examples` of samuel325365/Tellcut: <name>.zip is a project as `export-project --media --public`
// packs it, <name>.mp4 the finished film. Without names it lists them; with names (or --all) it downloads each zip to
// .cache/examples/, imports it into projects/ (never over a project already there) and puts the film in the project's exports/.
// It prints in English: the people who run it have just cloned Tellcut from GitHub (a ruling of the plan; the other tools print Chinese).
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { PROJECT_ID, TELLCUT_ROOT } from '@tellcut/media-node';
import { ImportError, importProject } from './export-project.ts';

export const REPO = 'samuel325365/Tellcut', TAG = 'examples';
export const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`;
export const RELEASE_PAGE = `https://github.com/${REPO}/releases/tag/${TAG}`;

/** a release file: its size and, when GitHub gives one, its digest ("sha256:<hex>") */
export interface Asset { name: string; size: number; url: string; digest?: string }
export interface Example { id: string; zip: Asset; film?: Asset }
type Fetch = typeof fetch;
const HEADERS = { accept: 'application/vnd.github+json', 'user-agent': 'tellcut-examples' };

async function get(f: Fetch, url: string, what: string): Promise<Response> {
  try { return await f(url, { headers: HEADERS }); }
  catch (e) { throw new Error(`Could not reach GitHub for ${what} (${(e as Error).message}). Check the internet connection and try again.`); }
}

/** the examples on the release, by name; a zip that is not a project name, or a film without a zip, is left out */
export async function listExamples(o: { fetch?: Fetch } = {}): Promise<Example[]> {
  const r = await get(o.fetch ?? fetch, RELEASE_API, 'the list of examples');
  if (r.status === 404) throw new Error(`There are no example projects yet (${RELEASE_PAGE}).`);
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for the list of examples; try again later.`);
  const assets = ((await r.json()) as { assets?: Array<{ name: string; size: number; browser_download_url: string; digest?: string | null }> }).assets ?? [];
  const by = new Map(assets.map((a) => [a.name, { name: a.name, size: a.size, url: a.browser_download_url, ...(a.digest ? { digest: a.digest } : {}) }]));
  return [...by.values()].filter((a) => a.name.endsWith('.zip') && PROJECT_ID.test(a.name.slice(0, -4)))
    .map((zip) => { const id = zip.name.slice(0, -4), film = by.get(`${id}.mp4`); return { id, zip, ...(film ? { film } : {}) }; })
    .sort((a, b) => a.id.localeCompare(b.id));
}

const sha256 = async (file: string) => { const h = createHash('sha256'); await pipeline(createReadStream(file), h); return h.digest('hex'); };

/** `asset` into `file`, through file.part: a download that breaks, or ends short, or is not the release's file, leaves nothing behind */
async function download(f: Fetch, asset: Asset, file: string, log: (s: string) => void) {
  const part = `${file}.part`;
  log(`  downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
  try {
    const r = await get(f, asset.url, asset.name);
    if (!r.ok || !r.body) throw new Error(`GitHub answered ${r.status}`);
    await pipeline(Readable.fromWeb(r.body as any), createWriteStream(part));
    // a connection closed early can end the stream without an error: the size the release gives (else the response's) must be there
    const want = asset.size || Number(r.headers.get('content-length')) || 0, got = statSync(part).size;
    if (want && got !== want) throw new Error(`it ended after ${got} of ${want} bytes; try again`);
    const [algo, hex] = (asset.digest ?? '').split(':');
    if (algo === 'sha256' && hex && (await sha256(part)) !== hex.toLowerCase()) throw new Error('what arrived is not the file on the release (its sha256 differs); try again');
    renameSync(part, file);
  } catch (e) {
    rmSync(part, { force: true });
    throw new Error(`Downloading ${asset.name} failed: ${(e as Error).message}`);
  }
}

/** Downloads and imports one example; a project of that name already there is left alone (installed: false). */
export async function installExample(ex: Example, o: { fetch?: Fetch; projectsDir: string; cacheDir: string; log: (s: string) => void }): Promise<{ dir: string; installed: boolean }> {
  const f = o.fetch ?? fetch, dir = join(o.projectsDir, ex.id);
  if (existsSync(dir)) { o.log(`${ex.id}: already in projects/, left as it is (delete or rename it to get the example again)`); return { dir, installed: false }; }
  mkdirSync(o.cacheDir, { recursive: true });
  const zip = join(o.cacheDir, ex.zip.name);
  o.log(`${ex.id}:`);
  // a zip downloaded whole before is used again
  if (!existsSync(zip) || statSync(zip).size !== ex.zip.size) await download(f, ex.zip, zip, o.log);
  try { importProject(zip, o.projectsDir, ex.id); }   // under the example's name, whatever the folder inside the zip is called
  catch (e) {
    if (!(e instanceof ImportError)) throw e;
    if (e.code === 'exists') throw new Error(`${ex.id} appeared in projects/ while downloading; it was left as it is`);
    if (e.code === 'badName') throw new Error(`"${e.subject}" cannot be a project name`);
    // a zip that does not unpack into a project is no use again: the next run downloads it anew
    rmSync(zip, { force: true });
    throw new Error(`${ex.zip.name} is not a project Tellcut can import (${e.code === 'unpack' ? 'it does not unpack' : 'no folder with a project.json inside'}); it was deleted, run this again to download it anew`);
  }
  if (ex.film) {
    mkdirSync(join(dir, 'exports'), { recursive: true });
    try { await download(f, ex.film, join(dir, 'exports', ex.film.name), o.log); }
    catch (e) { o.log(`  the project is in, but its film is not: ${(e as Error).message}. Export it from the editor, or run this again after deleting the project.`); }
  }
  return { dir, installed: true };
}

async function main(argv: string[]) {
  const all = argv.includes('--all'), names = argv.filter((a) => !a.startsWith('--'));
  const list = await listExamples(), projectsDir = join(TELLCUT_ROOT, 'projects');
  if (!all && !names.length) {
    console.log(`Example projects (${RELEASE_PAGE}):\n`);
    const w = Math.max(...list.map((e) => e.id.length), 4);
    for (const e of list) {
      const mb = ((e.zip.size + (e.film?.size ?? 0)) / 1e6).toFixed(0).padStart(5);
      console.log(`  ${e.id.padEnd(w)}  ${mb} MB${existsSync(join(projectsDir, e.id)) ? '  (installed)' : ''}`);
    }
    console.log(`\nInstall one:  npm run examples -- <name>\nInstall all:  npm run examples -- --all`);
    return;
  }
  const unknown = names.filter((n) => !list.some((e) => e.id === n));
  if (unknown.length) throw new Error(`No example called ${unknown.join(', ')}. The examples are: ${list.map((e) => e.id).join(', ')}`);
  const chosen = all ? list : list.filter((e) => names.includes(e.id));
  let n = 0;
  for (const e of chosen) if ((await installExample(e, { projectsDir, cacheDir: join(TELLCUT_ROOT, '.cache', 'examples'), log: (s) => console.log(s) })).installed) n++;
  if (n) console.log(`\n${n} example${n > 1 ? 's' : ''} added. Open Tellcut's home page (npm run server) and pick one; the footage is analysed again the first time a project opens.`);
}

// exitCode, not exit(): exiting while fetch's sockets close trips a libuv assertion on Windows
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).catch((e: Error) => { console.error(e.message); process.exitCode = 1; });
