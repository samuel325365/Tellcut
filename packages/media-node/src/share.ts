// The same footage in another project: its analysis (proxy, thumbnails, scenes, sheets, transcript, faces…) is shared instead of
// made again. An analysis folder is named by the file's size and time, not by the project, so a sibling project with the same
// footage has a folder of the same name; its finished files are hard-linked here (no space taken, no time), or copied when a link
// cannot be made (another drive). Files are always replaced by an atomic rename, so a later change in one project never reaches
// the other.
// The name also carries the file's path in its project (hash.ts), so footage renamed or moved, or the same footage at another
// path, has a folder of another name: those are found by their notes (source.json: the file a folder was made for and what it
// held) and shared once the content is known to be the same (relatives).
// The looking runs on the server's thread: every project's cache/analysis is read, and the footage may be on an external drive or
// a NAS that answers slowly, so all of it is asynchronous (a few projects at a time) and other requests go on meanwhile.
import { existsSync, writeFileSync } from 'node:fs';
import { access, copyFile, link, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { EXTRAS_VERSION } from './extras-version.ts';
import { contentPrint, contentPrintAsync, legacyNameOf, originOf, sameStamp, sourceHashAt } from './hash.ts';

/** work in progress (locks, half-written temps) is never taken, nor the other folder's note: it names the other file */
const PRIVATE = /\.lock$|\.tmp(\.|$)|^mono(\.\d+)?\.f32$|^source\.json$/;
/** what extras.version stamps (extras.ts): taken only from a folder stamped with this code's version, or an older version's
 *  sheets were linked in right after sourceExtras had removed its own, and stamped current */
const VERSIONED = /^(extras\.version|sheets\.json|sheet-\d+\.jpg|burned(-v\d+)?\.json)$/;
const current = async (from: string) => { try { return (await readFile(join(from, 'extras.version'), 'utf8')) === EXTRAS_VERSION; } catch { return false; } };

/** a folder's note: the file it was made for, and that file's content print (contentPrint; notes written before it have none) */
interface Note { path: string; print?: string }
const NOTE = 'source.json';
/** notes are written once and never change: kept once read */
const notes = new Map<string, Note>();
async function noteOf(dir: string): Promise<Note | null> {
  const had = notes.get(dir);
  if (had) return had;
  try {
    const n = JSON.parse(await readFile(join(dir, NOTE), 'utf8'));
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

const subdirs = async (dir: string) => { try { return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name); } catch { return []; } };
const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const exists = (f: string) => access(f).then(() => true, () => false);
/** projects looked at at once */
const AT_ONCE = 8;
/** `fn` of every item, at most `n` at a time; the results in the items' order (what is shared first stays the same) */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** a file dropped on the editor (the server's upload.ts): it is given the browser's lastModified, whole milliseconds, while the
 *  original's time may have a fraction of one (NTFS, APFS), so the two stamps, and the folder names made of them, differ */
const dropped = (projectDir: string, f: string) => /^media\/import\//.test(relative(resolve(projectDir), resolve(f)).split(sep).join('/').toLowerCase());
/** the folder `name`, whose note names a file still there of this size and within a millisecond of this time (one side dropped),
 *  was made for that file as it is now, and the two hold the same */
async function nearly(note: Note, key: string, projectDir: string, name: string, st: { size: number; mtimeMs: number }, print: () => Promise<string>) {
  try {
    const was = await stat(note.path);
    if (was.size !== st.size || Math.abs(was.mtimeMs - st.mtimeMs) >= 1 || sourceHashAt(key, projectDir, note.path, was) !== name) return false;
    return (note.print ?? (await contentPrintAsync(note.path))) === (await print());
  } catch { return false; }
}

/**
 * Folders made for the same footage under another name (`dir` named by analysisName in this process; [] otherwise), in any
 * project, this one too: footage renamed or moved since it was analysed, or the same footage at another path. A folder qualifies
 * when its note names a file whose name, with this file's size and time and the same key, is the folder's name — the footage it
 * was made for had this size and time — and holds the same: the print in its note, else that file's own when it is still there
 * with this size and time, matches this file's. Two different files of one size and time never share. A folder whose file is gone
 * and whose note has no print (made before prints) is taken only when it is the one such file, and no other file of this project
 * has this size and time (the rule analysisName keeps for folders named before paths). When this file or the folder's is one
 * dropped on the editor, a time within a millisecond is the same time, the other file still there and holding the same (nearly).
 */
async function relatives(dir: string, skip: Set<string>): Promise<string[]> {
  const o = originOf(dir);
  if (!o) return [];
  let st: { size: number; mtimeMs: number };
  try { st = await stat(o.srcPath); } catch { return []; }
  const projects = resolve(dir, '..', '..', '..', '..'), sure: string[] = [], unsure = new Map<string, string[]>();
  let mine: Promise<string> | undefined;
  const print = () => (mine ??= contentPrintAsync(o.srcPath)), mineDropped = dropped(o.projectDir, o.srcPath);
  // each project's folders in order, a few projects at a time, put together in the projects' order
  const found = await mapLimit(await subdirs(projects), AT_ONCE, async (p) => {
    const base = join(projects, p, 'cache', 'analysis'), out: Array<{ f: string; unsure?: string }> = [];
    for (const name of await subdirs(base)) {
      const f = join(base, name), note = f === dir || skip.has(f) ? null : await noteOf(f);
      if (!note) continue;
      if (sourceHashAt(o.key, join(projects, p), note.path, st) !== name) {
        if ((mineDropped || dropped(join(projects, p), note.path)) && (await nearly(note, o.key, join(projects, p), name, st, print))) out.push({ f });
        continue;
      }
      try {
        if (same(note.path, o.srcPath)) { out.push({ f }); continue; }
        if (note.print) { if (note.print === (await print())) out.push({ f }); continue; }
        let was = null;
        try { was = await stat(note.path); } catch { /* renamed, moved or deleted */ }
        if (was) { if (was.size === st.size && was.mtimeMs === st.mtimeMs && (await contentPrintAsync(note.path)) === (await print())) out.push({ f }); continue; }
        out.push({ f, unsure: resolve(note.path).toLowerCase() });
      } catch { /* a file being replaced right now: left for the next look */ }
    }
    return out;
  });
  for (const { f, unsure: k } of found.flat()) {
    if (k === undefined) sure.push(f);
    else unsure.set(k, [...(unsure.get(k) ?? []), f]);
  }
  return unsure.size === 1 && sameStamp(o.projectDir, o.srcPath) <= 1 ? [...sure, ...[...unsure.values()][0]] : sure;
}

/** the folders of the same name in the sibling projects that have one (the same footage analysed there); also of the name it
 *  had before names carried the file's path (hash.ts), so footage an older project analysed is still shared; and the folders
 *  of the same footage under another name (relatives: renamed, moved, at another path) */
export async function siblingFolders(dir: string): Promise<string[]> {
  const projects = resolve(dir, '..', '..', '..', '..'), self = basename(resolve(dir, '..', '..', '..')), old = legacyNameOf(dir);
  const names = [basename(dir), ...(old && old !== basename(dir) ? [old] : [])];
  let named: string[] = [];
  try {
    const all = (await readdir(projects, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== self)
      .flatMap((d) => names.map((n) => join(projects, d.name, 'cache', 'analysis', n)));
    const there = await mapLimit(all, AT_ONCE, exists);
    named = all.filter((_, i) => there[i]);
  } catch { /* no projects folder */ }
  return [...named, ...(await relatives(resolve(dir), new Set(named)))];
}

/** Links into `dir` (projects/<id>/cache/analysis/<hash>) every finished file a sibling project's folder of the same name has
 *  (or a folder of the same footage under another name) and this one does not; returns how many. */
export async function shareFolder(dir: string): Promise<number> {
  let taken = 0;
  for (const from of await siblingFolders(dir)) {
    let names: string[] = [];
    try { names = (await readdir(from)).filter((n) => !PRIVATE.test(n)); } catch { continue; }
    if (names.some((n) => VERSIONED.test(n)) && !(await current(from))) names = names.filter((n) => !VERSIONED.test(n));
    for (const n of names) {
      const src = join(from, n), dst = join(dir, n);
      try {
        if ((await exists(dst)) || !(await stat(src)).isFile()) continue;
        await mkdir(dir, { recursive: true });
        try { await link(src, dst); } catch (e) {
          // made meanwhile (another look at the same folder): it is there. Otherwise copied under a temporary name and renamed into
          // place, so a page reading the file meanwhile never gets half of it
          if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
          const tmp = `${dst}.tmp.${process.pid}_${Math.random().toString(36).slice(2)}`;
          try { await copyFile(src, tmp); await rename(tmp, dst); } finally { await rm(tmp, { force: true }).catch(() => {}); }
        }
        taken++;
      } catch { /* a file another process is replacing right now: left for the next look */ }
    }
  }
  if (taken) labelFolder(dir);   // its own note: the file it is for here, so it can be found again after a rename too
  return taken;
}
