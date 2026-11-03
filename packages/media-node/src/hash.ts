import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/** a file's size and modification time, the key every cache name is made of */
export interface Stamp { size: number; mtimeMs: number }
const stampHash = (key: string, st: Stamp) => createHash('sha1').update(`${key}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
export const fileHash = (key: string, srcPath: string): string => stampHash(key, statSync(srcPath));

/** a file's identity in its project: its path from the project folder, as NTFS sees it (case ignored) */
const identity = (projectDir: string, srcPath: string) => relative(resolve(projectDir), resolve(srcPath)).split(sep).join('/').toLowerCase();
/** the name sourceHash gives `srcPath` in `projectDir` when the file has stamp `st` (a file that may be gone: renamed, moved) */
export const sourceHashAt = (key: string, projectDir: string, srcPath: string, st: Stamp) => stampHash(`${key}|${identity(projectDir, srcPath)}`, st);
/** fileHash with the file's identity: two files of one size and time (a dual-track recorder's WAVs on FAT32) are not one file */
export const sourceHash = (key: string, projectDir: string, srcPath: string) => fileHash(`${key}|${identity(projectDir, srcPath)}`, srcPath);

/** per project: the files its project.json names, by size and time (read again when project.json changes) */
const twins = new Map<string, { at: string; files: Map<string, string[]> }>();
const stampOf = (f: string) => { const st = statSync(f); return `${st.size}|${st.mtimeMs}`; };
/** how many of the files the project names have the size and time `srcPath` has (it among them when the project names it) */
export const sameStamp = (projectDir: string, srcPath: string): number => twinsOf(projectDir, srcPath).length;
function twinsOf(projectDir: string, srcPath: string): string[] {
  const pj = join(projectDir, 'project.json');
  let at: string;
  try { at = stampOf(pj); } catch { return []; }
  let t = twins.get(projectDir);
  if (t?.at !== at) {
    const files = new Map<string, string[]>(), seen = new Set<string>();
    try {
      const p = JSON.parse(readFileSync(pj, 'utf8'));
      for (const m of [...Object.values(p?.sources ?? {}), ...Object.values(p?.media ?? {})] as Array<{ path?: unknown }>) {
        if (typeof m?.path !== 'string') continue;
        const f = resolve(projectDir, m.path), k = f.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        try { const s = stampOf(f); files.set(s, [...(files.get(s) ?? []), f]); } catch { /* offline */ }
      }
    } catch { /* unreadable: as if it named nothing */ }
    twins.set(projectDir, (t = { at, files }));
  }
  try { return t.files.get(stampOf(srcPath)) ?? []; } catch { return []; }
}

/** What a file holds, cheaply: its size and 16 slices of 16 KB spread over it from the first byte to the last, hashed (the whole
 *  file when it is small). Two files of one size and time are taken for one only when their prints match: a dual-track recorder's
 *  WAVs differ in every slice that is not silent in both. Kept per path, size and time. */
const SLICE = 16 * 1024, SLICES = 16;
const prints = new Map<string, string>();
export function contentPrint(path: string): string {
  const st = statSync(path), k = `${resolve(path).toLowerCase()}|${st.size}|${st.mtimeMs}`, had = prints.get(k);
  if (had) return had;
  const h = createHash('sha1').update(`${st.size}|`);
  if (st.size <= SLICE * SLICES) h.update(readFileSync(path));
  else {
    const fd = openSync(path, 'r'), buf = Buffer.alloc(SLICE);
    try {
      for (let i = 0; i < SLICES; i++) {
        const n = readSync(fd, buf, 0, SLICE, Math.floor(((st.size - SLICE) * i) / (SLICES - 1)));
        h.update(buf.subarray(0, n));
      }
    } finally { closeSync(fd); }
  }
  const p = h.digest('hex').slice(0, 16);
  prints.set(k, p);
  return p;
}
/** contentPrint without holding the thread up (share.ts looks at footage that may be on a slow external drive or a NAS) */
export async function contentPrintAsync(path: string): Promise<string> {
  const st = await stat(path), k = `${resolve(path).toLowerCase()}|${st.size}|${st.mtimeMs}`, had = prints.get(k);
  if (had) return had;
  const h = createHash('sha1').update(`${st.size}|`), fh = await open(path, 'r');
  try {
    if (st.size <= SLICE * SLICES) h.update(await fh.readFile());
    else {
      const buf = Buffer.alloc(SLICE);
      for (let i = 0; i < SLICES; i++) {
        const { bytesRead } = await fh.read(buf, 0, SLICE, Math.floor(((st.size - SLICE) * i) / (SLICES - 1)));
        h.update(buf.subarray(0, bytesRead));
      }
    }
  } finally { await fh.close(); }
  const p = h.digest('hex').slice(0, 16);
  prints.set(k, p);
  return p;
}
/** the files of the project with srcPath's size and time all hold the same (a file imported twice, say) */
const twinsAlike = (projectDir: string, srcPath: string) => {
  try { const p = contentPrint(srcPath); return twinsOf(projectDir, srcPath).every((f) => contentPrint(f) === p); } catch { return false; }
};
/** the file an analysis folder's note (source.json, analysis.ts) says it was made for is this one */
const notedFor = (dir: string, srcPath: string) => {
  try { return resolve(JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8')).path).toLowerCase() === resolve(srcPath).toLowerCase(); } catch { return false; }
};

/** a folder's name before names carried the file's identity, by its new name: share.ts looks for a sibling project's under both */
const legacyNames = new Map<string, string>();
export const legacyNameOf = (dir: string) => legacyNames.get(resolve(dir));
/** what an analysis folder named by analysisName in this process is for: share.ts looks for the same file's folders under other
 *  names with it (renamed, moved, or the same footage at another path) */
export interface FolderOrigin { key: string; projectDir: string; srcPath: string }
const origins = new Map<string, FolderOrigin>();
export const originOf = (dir: string) => origins.get(resolve(dir));

/**
 * The name of an analysis folder (cache/analysis/<name>) of `srcPath`: sourceHash, the file's identity in it. A folder made
 * before (named by size and time alone) still holds transcripts that took minutes each, so it is used while no other file
 * of the project has that size and time, its note names this file, or those files all hold the same (contentPrint); otherwise the
 * files that could own it are analysed anew under their own names, rather than sharing a transcript that may be the other's. New
 * folders always get the new name.
 */
export function analysisName(projectDir: string, key: string, srcPath: string): string {
  const base = join(projectDir, 'cache', 'analysis'), now = sourceHash(key, projectDir, srcPath), old = fileHash(key, srcPath);
  legacyNames.set(resolve(base, now), old);
  const name = existsSync(join(base, now)) || !existsSync(join(base, old)) ? now
    : sameStamp(projectDir, srcPath) <= 1 || notedFor(join(base, old), srcPath) || twinsAlike(projectDir, srcPath) ? old : now;
  origins.set(resolve(base, name), { key, projectDir, srcPath });
  return name;
}
