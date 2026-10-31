// The same footage in another project: its analysis (proxy, thumbnails, scenes, sheets, transcript, faces…) is shared instead of
// made again. An analysis folder is named by the file's size and time, not by the project, so a sibling project with the same
// footage has a folder of the same name; its finished files are hard-linked here (no space taken, no time), or copied when a link
// cannot be made (another drive). Files are always replaced by an atomic rename, so a later change in one project never reaches
// the other.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { analysisFiles } from './analysis.ts';
import { EXTRAS_VERSION } from './extras.ts';
import { legacyNameOf } from './hash.ts';

/** work in progress (locks, half-written temps) is never taken */
const PRIVATE = /\.lock$|\.tmp(\.|$)|^mono(\.\d+)?\.f32$/;
/** what extras.version stamps (extras.ts): taken only from a folder stamped with this code's version, or an older version's
 *  sheets were linked in right after sourceExtras had removed its own, and stamped current */
const VERSIONED = /^(extras\.version|sheets\.json|sheet-\d+\.jpg|burned(-v2)?\.json)$/;
const current = (from: string) => { try { return readFileSync(join(from, 'extras.version'), 'utf8') === EXTRAS_VERSION; } catch { return false; } };

/** the folders of the same name in the sibling projects that have one (the same footage analysed there); also of the name it
 *  had before names carried the file's path (hash.ts), so footage an older project analysed is still shared */
export function siblingFolders(dir: string): string[] {
  const projects = resolve(dir, '..', '..', '..', '..'), self = basename(resolve(dir, '..', '..', '..')), old = legacyNameOf(dir);
  const names = [basename(dir), ...(old && old !== basename(dir) ? [old] : [])];
  try {
    return readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== self)
      .flatMap((d) => names.map((n) => join(projects, d.name, 'cache', 'analysis', n))).filter((f) => existsSync(f));
  } catch { return []; }
}

/** Links into `dir` (projects/<id>/cache/analysis/<hash>) every finished file a sibling project's folder of the same name has
 *  and this one does not; returns how many. */
export function shareFolder(dir: string): number {
  let taken = 0;
  for (const from of siblingFolders(dir)) {
    let names: string[] = [];
    try { names = readdirSync(from).filter((n) => !PRIVATE.test(n)); } catch { continue; }
    if (names.some((n) => VERSIONED.test(n)) && !current(from)) names = names.filter((n) => !VERSIONED.test(n));
    for (const n of names) {
      const src = join(from, n), dst = join(dir, n);
      try {
        if (existsSync(dst) || !statSync(src).isFile()) continue;
        mkdirSync(dir, { recursive: true });
        try { linkSync(src, dst); } catch { copyFileSync(src, dst); }
        taken++;
      } catch { /* a file another process is replacing right now: left for the next look */ }
    }
  }
  return taken;
}

/** A source's analysis from a sibling project with the same footage; returns how many files were taken. */
export const shareAnalysis = (projectDir: string, srcPath: string) => existsSync(srcPath) ? shareFolder(analysisFiles(projectDir, srcPath).dir) : 0;
