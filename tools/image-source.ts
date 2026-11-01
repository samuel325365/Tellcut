// `npm run tellcut -- image <id> <file> [--id <name>]`: a picture registered as a photo source of the project, so `c.photo` can use it.
// A picture the project made itself (a poster its own script rendered into the folder, a chart, a frame grabbed by hand) had no way
// into project.json's `sources` but editing it by hand (2026-11-01). A file inside the project is registered where it is; one from
// outside is copied into media/images/ first (the project stays whole when moved). Run it again after the picture is remade: the same
// file keeps its id and gets its new size.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { ingestFiles, kindOf, samePath, sourceId, updateProjectFile } from '@tellcut/media-node';

export interface RegisteredImage { id: string; path: string; width: number; height: number; copied: boolean; again: boolean }

const ID = /^[A-Za-z0-9_-]+$/;

/** `image <專案> …`'s words after the project: the file is the one word that is neither a flag nor --id's value */
export function imageArgs(rest: string[]): { file?: string; id?: string } {
  const ii = rest.indexOf('--id');
  return { file: rest.find((a, i) => !a.startsWith('--') && (ii < 0 || i !== ii + 1)), id: ii >= 0 ? rest[ii + 1] : undefined };
}

/** a free file name in `dir` for `name` (photo.png, photo-2.png, …) */
function freeIn(dir: string, name: string): string {
  let f = join(dir, name);
  for (let n = 2; existsSync(f); n++) f = join(dir, name.replace(/(\.\w+)?$/, (e) => `-${n}${e}`));
  return f;
}

/** `file` (relative to the working folder, else to the project) registered as an image source of the project in `dir`. */
export async function registerImage(dir: string, file: string, o: { id?: string } = {}): Promise<RegisteredImage> {
  if (!existsSync(join(dir, 'project.json'))) throw new Error(`找不到專案（${join(dir, 'project.json')} 不存在）`);
  const abs = [resolve(file), resolve(dir, file)].find((f) => existsSync(f));
  if (!abs) throw new Error(`找不到圖檔 ${file}`);
  if (kindOf(abs) !== 'image') throw new Error(`${basename(abs)} 不是圖片（要 .jpg .jpeg .png .webp .heic）`);
  if (o.id !== undefined && !ID.test(o.id)) throw new Error(`--id「${o.id}」只能用英文字母、數字、- 和 _`);
  const inside = (f: string) => { const r = relative(dir, f); return !!r && !r.startsWith('..') && !isAbsolute(r); };
  const sources = (JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).sources ?? {}) as Record<string, { path: string }>;
  const registered = (f: string) => Object.entries(sources).find(([, s]) => samePath(resolve(dir, s.path)) === samePath(f))?.[0];
  // from outside: copied into media/images/, where the copy made last time is the one replaced (a picture remade outside and
  // registered again keeps its id) and any other file is kept
  const media = join(dir, 'media', 'images'), last = join(media, basename(abs)), copied = !inside(abs);
  const target = !copied ? abs : existsSync(last) && registered(last) ? last : freeIn(media, basename(abs));
  const same = registered(target);
  if (o.id && sources[o.id] && o.id !== same) throw new Error(`素材 id「${o.id}」已經是 ${sources[o.id].path}；換一個 --id`);
  if (copied) { mkdirSync(media, { recursive: true }); copyFileSync(abs, target); }
  const id = o.id ?? same ?? sourceId(target, new Set(Object.keys(sources)));
  // ingestFiles probes it (and turns a HEIC into a JPG in media/) the way `new` and the editor's Import register a photo
  const got = await ingestFiles(dir, [target], new Set());
  const entry = Object.values(got.sources)[0];
  if (!entry || entry.kind !== 'image') throw new Error(got.skipped[0]?.message ?? `${basename(abs)} 讀不出來`);
  // registered again: what else its entry held (a map's place, say) is kept
  updateProjectFile(dir, (p) => { p.sources = { ...(p.sources ?? {}), [id]: { ...(id === same ? p.sources?.[id] : {}), ...entry } }; }, 'image');
  return { id, path: entry.path, width: entry.width, height: entry.height, copied, again: id === same };
}
