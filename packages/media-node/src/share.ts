// The same footage in another project: its analysis (proxy, thumbnails, scenes, sheets, transcript, faces…) is shared instead of
// made again. An analysis folder is named by the file's size and time, not by the project, so a sibling project with the same
// footage has a folder of the same name; its finished files are hard-linked here (no space taken, no time), or copied when a link
// cannot be made (another drive). Files are always replaced by an atomic rename, so a later change in one project never reaches
// the other.
// The name also carries the file's path in its project (hash.ts), so footage renamed or moved, or the same footage at another
// path, has a folder of another name: those are found by their notes (source.json: the file a folder was made for and what it
// held) and shared once the content is known to be the same (relatives).
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { EXTRAS_VERSION } from './extras-version.ts';
import { contentPrint, legacyNameOf, originOf, sameStamp, sourceHashAt } from './hash.ts';

/** work in progress (locks, half-written temps) is never taken, nor the other folder's note: it names the other file */
const PRIVATE = /\.lock$|\.tmp(\.|$)|^mono(\.\d+)?\.f32$|^source\.json$/;
/** what extras.version stamps (extras.ts): taken only from a folder stamped with this code's version, or an older version's
 *  sheets were linked in right after sourceExtras had removed its own, and stamped current */
const VERSIONED = /^(extras\.version|sheets\.json|sheet-\d+\.jpg|burned(-v2)?\.json)$/;
const current = (from: string) => { try { return readFileSync(join(from, 'extras.version'), 'utf8') === EXTRAS_VERSION; } catch { return false; } };

/** a folder's note: the file it was made for, and that file's content print (contentPrint; notes written before it have none) */
interface Note { path: string; print?: string }
const NOTE = 'source.json';
/** notes are written once and never change: kept once read */
const notes = new Map<string, Note>();
function noteOf(dir: string): Note | null {
  const had = notes.get(dir);
  if (had) return had;
  try {
    const n = JSON.parse(readFileSync(join(dir, NOTE), 'utf8'));
    if (typeof n?.path !== 'string') return null;
    const note: Note = { path: n.path, ...(typeof n.print === 'string' ? { print: n.print } : {}) };
    notes.set(dir, note);
    return note;
  } catch { return null; }
}
/** `dir`'s note, when it has none: which file it is for (`srcPath`, else what analysisName named it for) and what that file holds */
export function labelFolder(dir: string, srcPath = originOf(dir)?.srcPath) {
  const note = join(dir, NOTE);
  if (!srcPath || existsSync(note)) return;
  try { writeFileSync(note, JSON.stringify({ path: srcPath, print: contentPrint(srcPath) })); } catch { /* the source or folder is gone */ }
}

const subdirs = (dir: string) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name); } catch { return []; } };
const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/**
 * Folders made for the same footage under another name (`dir` named by analysisName in this process; [] otherwise), in any
 * project, this one too: footage renamed or moved since it was analysed, or the same footage at another path. A folder qualifies
 * when its note names a file whose name, with this file's size and time and the same key, is the folder's name — the footage it
 * was made for had this size and time — and holds the same: the print in its note, else that file's own when it is still there
 * with this size and time, matches this file's. Two different files of one size and time never share. A folder whose file is gone
 * and whose note has no print (made before prints) is taken only when it is the one such file, and no other file of this project
 * has this size and time (the rule analysisName keeps for folders named before paths).
 */
function relatives(dir: string, skip: Set<string>): string[] {
  const o = originOf(dir);
  if (!o) return [];
  let st;
  try { st = statSync(o.srcPath); } catch { return []; }
  const projects = resolve(dir, '..', '..', '..', '..'), sure: string[] = [], unsure = new Map<string, string[]>();
  let mine: string | undefined;
  const print = () => (mine ??= contentPrint(o.srcPath));
  for (const p of subdirs(projects)) {
    const base = join(projects, p, 'cache', 'analysis');
    for (const name of subdirs(base)) {
      const f = join(base, name), note = f === dir || skip.has(f) ? null : noteOf(f);
      if (!note || sourceHashAt(o.key, join(projects, p), note.path, st) !== name) continue;
      try {
        if (same(note.path, o.srcPath)) { sure.push(f); continue; }
        if (note.print) { if (note.print === print()) sure.push(f); continue; }
        let was = null;
        try { was = statSync(note.path); } catch { /* renamed, moved or deleted */ }
        if (was) { if (was.size === st.size && was.mtimeMs === st.mtimeMs && contentPrint(note.path) === print()) sure.push(f); continue; }
        const k = resolve(note.path).toLowerCase();
        unsure.set(k, [...(unsure.get(k) ?? []), f]);
      } catch { /* a file being replaced right now: left for the next look */ }
    }
  }
  return unsure.size === 1 && sameStamp(o.projectDir, o.srcPath) <= 1 ? [...sure, ...[...unsure.values()][0]] : sure;
}

/** the folders of the same name in the sibling projects that have one (the same footage analysed there); also of the name it
 *  had before names carried the file's path (hash.ts), so footage an older project analysed is still shared; and the folders
 *  of the same footage under another name (relatives: renamed, moved, at another path) */
export function siblingFolders(dir: string): string[] {
  const projects = resolve(dir, '..', '..', '..', '..'), self = basename(resolve(dir, '..', '..', '..')), old = legacyNameOf(dir);
  const names = [basename(dir), ...(old && old !== basename(dir) ? [old] : [])];
  let named: string[] = [];
  try {
    named = readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== self)
      .flatMap((d) => names.map((n) => join(projects, d.name, 'cache', 'analysis', n))).filter((f) => existsSync(f));
  } catch { /* no projects folder */ }
  return [...named, ...relatives(resolve(dir), new Set(named))];
}

/** Links into `dir` (projects/<id>/cache/analysis/<hash>) every finished file a sibling project's folder of the same name has
 *  (or a folder of the same footage under another name) and this one does not; returns how many. */
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
  if (taken) labelFolder(dir);   // its own note: the file it is for here, so it can be found again after a rename too
  return taken;
}
