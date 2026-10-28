// A project as one zip, and back (review3 R3-H1: projects/ is not in git, and there was no way to hand a film over or back it up).
//   npm run export-project -- <id> [--media] [--out <file.zip>]     → tellcut/backups/<id>-<date>-<time>.zip
//   npm run import-project -- <file.zip> [--as <new id>]            → projects/<id>/
// The zip holds one folder, <id>/: project.json, cut.ts, narration.json, storyboard.md, brand.md (a brand film's brand card), fx/,
// score/ and .history/ (versions, proposals, the chat). --media adds media/ and the footage that lives outside the project (D:\Trips…, tellcut/sources/…), copied
// into media/linked/ with project.json pointing there, so the zip stands on its own. cache/ is made again; exports/ are the films
// themselves (copy them as they are).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ID, TELLCUT_ROOT } from '@tellcut/media-node';

type Raw = { sources?: Record<string, { path: string }>; media?: Record<string, { path: string }>; [k: string]: unknown };
export interface ExportPlan { files: Array<{ from: string; to: string }>; project: Raw; outside: string[] }

// cache/cut-state.json is the one cache file kept: what the last cut wrote, so a cut after the import still notices the
// editor's edits (without it, it wrote over them without asking)
const OWN = ['cut.ts', 'narration.json', 'storyboard.md', 'brand.md', 'cache/cut-state.json'], OWN_DIRS = ['fx', 'score', '.history'];
/** every file under `dir`/`sub`, as paths relative to `dir` with / */
const walk = (dir: string, sub: string): string[] => {
  const at = join(dir, sub);
  if (!existsSync(at)) return [];
  return readdirSync(at, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(dir, `${sub}/${e.name}`) : e.isFile() ? [`${sub}/${e.name}`] : []);
};
/** the hash cut-state.json keeps (tools/cut/cut.ts) */
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const insideOf = (dir: string, f: string) => { const r = relative(dir, resolve(dir, f)); return !!r && !r.startsWith('..') && !isAbsolute(r); };

/** what goes into the zip (relative to its <id>/ folder) and the project.json it gets */
export function exportPlan(dir: string, project: Raw, o: { media: boolean }): ExportPlan {
  // a lock or a half-written file of work running as it is zipped (a chat turn's) is not part of the project
  const files = [...OWN.filter((f) => existsSync(join(dir, f))), ...OWN_DIRS.flatMap((d) => walk(dir, d)).filter((f) => !/\.lock$|\.tmp(\.|$)/.test(f))].map((to) => ({ from: join(dir, to), to }));
  const p: Raw = structuredClone(project);
  const refs = [...Object.entries(p.sources ?? {}), ...Object.entries(p.media ?? {})];
  const outside = refs.filter(([, s]) => !insideOf(dir, s.path)).map(([id]) => id);
  if (o.media) {
    const have = new Set<string>();
    for (const to of walk(dir, 'media')) { files.push({ from: join(dir, to), to }); have.add(to); }
    for (const [id, s] of refs) {
      if (insideOf(dir, s.path)) {
        // footage kept in the project but not under media/
        const to = relative(dir, resolve(dir, s.path)).split('\\').join('/');
        if (!have.has(to) && existsSync(join(dir, to))) { files.push({ from: join(dir, to), to }); have.add(to); }
        continue;
      }
      const from = resolve(dir, s.path), to = `media/linked/${id}-${basename(from)}`;
      if (!existsSync(from)) continue;   // offline here too: the path stays as it was
      files.push({ from, to });
      s.path = to;
    }
  }
  return { files, project: p, outside: o.media ? outside.filter((id) => { const s = p.sources?.[id] ?? p.media?.[id]; return !!s && !insideOf(dir, s.path); }) : outside };
}

const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
function tar(args: string[]) {
  const r = spawnSync(TAR, args, { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`tar 失敗：${(r.stderr || r.error?.message || '').trim().split(/\r?\n/).slice(-2).join(' ／ ')}`);
}
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

/** writes the zip; returns its path */
export function exportProject(dir: string, o: { media: boolean; out?: string }): string {
  const id = basename(dir), out = resolve(o.out ?? join(TELLCUT_ROOT, 'backups', `${id}-${stamp()}.zip`));
  const before = readFileSync(join(dir, 'project.json'), 'utf8');
  const plan = exportPlan(dir, JSON.parse(before), o);
  // as writeProjectFile writes it; the paths --media rewrote make it a different text from the one the last cut hashed
  const text = JSON.stringify(plan.project, null, 2) + '\n';
  mkdirSync(dirname(out), { recursive: true });
  // a folder laid out as the zip, next to it (the same drive: files are hard-linked where they can be, not copied)
  const stage = mkdtempSync(join(dirname(out), '.stage-')), top = join(stage, id);
  try {
    for (const f of plan.files) {
      const to = join(top, f.to);
      mkdirSync(dirname(to), { recursive: true });
      try { linkSync(f.from, to); } catch { copyFileSync(f.from, to); }
    }
    mkdirSync(top, { recursive: true });
    writeFileSync(join(top, 'project.json'), text);
    // unedited since the last cut: the zip's cut-state names the text in the zip, or the import's next cut refused for nothing.
    // Edited: the old hash stays, and still differs
    const state = join(top, 'cache', 'cut-state.json');
    const kept = (() => { try { return JSON.parse(readFileSync(state, 'utf8')).hash; } catch { return undefined; } })();
    if (kept === sha1(before)) {
      rmSync(state);   // a hard link to the project's own file: written anew, not through it
      writeFileSync(state, JSON.stringify({ hash: sha1(text) }));
    }
    rmSync(out, { force: true });
    tar(['-a', '-c', '-f', out, '-C', stage, id]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  return out;
}

/** unpacks a zip from exportProject into projectsDir/<its id or `as`>; never over an existing project. Returns the folder. */
export function importProject(zip: string, projectsDir: string, as?: string): string {
  if (as !== undefined && !PROJECT_ID.test(as)) throw new Error(`「${as}」不能當專案名稱：英文字母、數字、_ 和 -，不能用 _ 或 - 開頭`);
  mkdirSync(projectsDir, { recursive: true });
  const tmp = mkdtempSync(join(projectsDir, '.import-'));
  try {
    tar(['-x', '-f', resolve(zip), '-C', tmp]);
    const tops = readdirSync(tmp).filter((n) => existsSync(join(tmp, n, 'project.json')) && statSync(join(tmp, n)).isDirectory());
    if (tops.length !== 1) throw new Error(`${basename(zip)} 不是 export-project 做的檔案（裡面要有一個資料夾，放著 project.json）`);
    const id = as ?? tops[0];
    if (!PROJECT_ID.test(id)) throw new Error(`「${id}」不能當專案名稱：用 --as 另取一個`);
    const target = join(projectsDir, id);
    if (existsSync(target)) throw new Error(`專案「${id}」已經有了，沒有覆蓋：用 --as <新名稱> 匯入成另一個專案`);
    renameSync(join(tmp, tops[0]), target);
    return target;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function main(argv: string[]) {
  const flag = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const pos = argv.filter((a, i) => !a.startsWith('--') && !['--out', '--as'].includes(argv[i - 1]));
  if (process.env.npm_lifecycle_event === 'import-project') {
    if (!pos[0]) { console.error('用法：npm run import-project -- <檔案.zip> [--as <新名稱>]'); process.exit(2); }
    const at = importProject(resolve(process.env.INIT_CWD ?? process.cwd(), pos[0]), join(TELLCUT_ROOT, 'projects'), flag('--as'));
    console.log(`匯入了：${at}\n素材分析會在打開專案或跑 npm run inspect 時重做。`);
    return;
  }
  const id = pos[0], dir = id ? join(TELLCUT_ROOT, 'projects', id) : '';
  if (!id || !existsSync(join(dir, 'project.json'))) { console.error('用法：npm run export-project -- <專案> [--media] [--out <檔案.zip>]'); process.exit(2); }
  const media = argv.includes('--media'), out = flag('--out');
  const zip = exportProject(dir, { media, out: out && resolve(process.env.INIT_CWD ?? process.cwd(), out) });
  const plan = exportPlan(dir, JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')), { media });
  console.log(`打包好了：${zip}（${(statSync(zip).size / 1e6).toFixed(1)} MB）`);
  if (!media && plan.outside.length) console.log(`沒有包進素材：${plan.outside.length} 個檔案在專案外面（${plan.outside.slice(0, 6).join('、')}）。要整包帶走就加 --media。`);
  else if (!media) console.log('沒有包進 media/（匯入的素材、旁白、配樂）：要整包帶走就加 --media。');
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
