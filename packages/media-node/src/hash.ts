import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export function fileHash(key: string, srcPath: string): string {
  const st = statSync(srcPath);
  return createHash('sha1').update(`${key}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
}

/** a file's identity in its project: its path from the project folder, as NTFS sees it (case ignored) */
const identity = (projectDir: string, srcPath: string) => relative(resolve(projectDir), resolve(srcPath)).split(sep).join('/').toLowerCase();
/** fileHash with the file's identity: two files of one size and time (a dual-track recorder's WAVs on FAT32) are not one file */
export const sourceHash = (key: string, projectDir: string, srcPath: string) => fileHash(`${key}|${identity(projectDir, srcPath)}`, srcPath);

/** per project: how many of the files its project.json names have each size and time (read again when project.json changes) */
const twins = new Map<string, { at: string; count: Map<string, number> }>();
const stampOf = (f: string) => { const st = statSync(f); return `${st.size}|${st.mtimeMs}`; };
function sameStamp(projectDir: string, srcPath: string): number {
  const pj = join(projectDir, 'project.json');
  let at: string;
  try { at = stampOf(pj); } catch { return 0; }
  let t = twins.get(projectDir);
  if (t?.at !== at) {
    const count = new Map<string, number>(), seen = new Set<string>();
    try {
      const p = JSON.parse(readFileSync(pj, 'utf8'));
      for (const m of [...Object.values(p?.sources ?? {}), ...Object.values(p?.media ?? {})] as Array<{ path?: unknown }>) {
        if (typeof m?.path !== 'string') continue;
        const f = resolve(projectDir, m.path), k = f.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        try { const s = stampOf(f); count.set(s, (count.get(s) ?? 0) + 1); } catch { /* offline */ }
      }
    } catch { /* unreadable: as if it named nothing */ }
    twins.set(projectDir, (t = { at, count }));
  }
  try { return t.count.get(stampOf(srcPath)) ?? 0; } catch { return 0; }
}
/** the file an analysis folder's note (source.json, analysis.ts) says it was made for is this one */
const notedFor = (dir: string, srcPath: string) => {
  try { return resolve(JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8')).path).toLowerCase() === resolve(srcPath).toLowerCase(); } catch { return false; }
};

/** a folder's name before names carried the file's identity, by its new name: share.ts looks for a sibling project's under both */
const legacyNames = new Map<string, string>();
export const legacyNameOf = (dir: string) => legacyNames.get(resolve(dir));

/**
 * The name of an analysis folder (cache/analysis/<name>) of `srcPath`: sourceHash, the file's identity in it. A folder made
 * before (named by size and time alone) still holds transcripts that took minutes each, so it is used while no other file
 * of the project has that size and time, or its note names this file; otherwise the files that could own it are analysed
 * anew under their own names, rather than sharing a transcript that may be the other's. New folders always get the new name.
 */
export function analysisName(projectDir: string, key: string, srcPath: string): string {
  const base = join(projectDir, 'cache', 'analysis'), now = sourceHash(key, projectDir, srcPath), old = fileHash(key, srcPath);
  legacyNames.set(resolve(base, now), old);
  if (existsSync(join(base, now)) || !existsSync(join(base, old))) return now;
  return sameStamp(projectDir, srcPath) <= 1 || notedFor(join(base, old), srcPath) ? old : now;
}
