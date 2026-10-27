// Batch QC of a rendered video (developer mode; maintainer docs: dev/docs/batch/README.md, private): what the orchestrator looks at before passing a
// subagent's video — a contact sheet of the whole film, strips of every video cut (±0.3 s at 10 fps: a clip whose in or
// out point runs a frame or two into the neighbouring source shot shows that shot's burned-in captions there), loudness,
// size, and whether any common.* block slipped in.
//   npm run batch:qc -- <id> [--file <mp4>]      → projects/<id>/cache/qc/sheet.jpg, cuts-1.jpg …  (default: the newest film in exports/)
// A relative --file is relative to the folder the command was typed in (npm runs scripts in tellcut/ and keeps that in INIT_CWD).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTimes, type Project } from '@tellcut/engine';
import { TELLCUT_ROOT, ffmpegPath, ffprobePath, listExports, parseLoudness } from '@tellcut/media-node';

interface Item { id: string; start: number; end: number; parent?: string; source?: string }
interface Track { kind: string; items: Item[] }
const USAGE = '用法：npm run batch:qc -- <專案> [--file <mp4>]';

/** Film times where a video clip starts or ends (times resolved through `parent`), inside the film (not at 0 or the end);
 *  an edge within 0.5 s after the last kept one is the same cut. */
export function cutPoints(p: { tracks: Track[] }, dur: number): number[] {
  const times = resolveTimes(p as unknown as Pick<Project, 'tracks'>), all = new Set<number>();
  for (const t of p.tracks) if (t.kind === 'video') for (const it of t.items) if (it.source) {
    const r = times.get(it.id) ?? it;
    for (const x of [r.start, r.end]) if (x > 0.25 && x < dur - 0.25) all.add(Math.round(x * 100) / 100);
  }
  const out: number[] = [];
  for (const x of [...all].sort((a, b) => a - b)) if (!out.length || x - out[out.length - 1] > 0.5) out.push(x);
  return out;
}

/** `<id> [--file <mp4>]`; null on a missing id, a --file without a value, or anything else. `cwd` resolves a relative --file. */
export function parseArgs(argv: string[], cwd: string): { id: string; file?: string } | null {
  const pos: string[] = [];
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (a === '--file' && i + 1 < argv.length && !argv[i + 1].startsWith('--')) file = resolve(cwd, argv[++i]);
    else return null;
  }
  return pos.length === 1 ? { id: pos[0], ...(file ? { file } : {}) } : null;
}

/** the last lines of ffmpeg's stderr (or the message) instead of a stack */
const brief = (e: unknown) => { const x = e as { stderr?: unknown; message?: string } | null;
  return String(x?.stderr || x?.message || e).trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ／ '); };


/** how many items use a common.* type (batch videos made without the shared library must have none) */
export const commonRefs = (projectJson: string) => (projectJson.match(/"type":\s*"common\./g) ?? []).length;

function main() {
  const args = parseArgs(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
  if (!args) { console.error(USAGE); process.exit(2); }
  const { id } = args, dir = join(TELLCUT_ROOT, 'projects', id), mp4 = args.file ?? listExports(dir)[0]?.path ?? join(dir, 'output', `${id}.mp4`);   // output/: renders before R3-H2
  if (!existsSync(mp4)) { console.error(`找不到成品：${mp4}${args.file ? '' : `（先跑 npm run batch:render -- ${id}）`}`); process.exit(1); }
  const raw = readFileSync(join(dir, 'project.json'), 'utf8'), p = JSON.parse(raw);
  const out = join(dir, 'cache', 'qc'); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const piped = { stdio: 'pipe' as const };   // stderr goes into the error, printed once by brief()
  const ff = (args: string[]) => execFileSync(ffmpegPath(), ['-v', 'error', '-y', ...args], piped);
  const dur = +execFileSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], piped).toString().trim();
  const tw = p.meta.height > p.meta.width ? 160 : 240;

  ff(['-i', mp4, '-vf', `fps=1/${(dur / 24).toFixed(3)},scale=${tw}:-1,tile=12x2`, '-frames:v', '1', join(out, 'sheet.jpg')]);
  const cuts = cutPoints(p, dur), rows: string[] = [], pages: string[] = [];
  cuts.forEach((t, i) => {
    const f = join(out, `row-${i}.png`);
    ff(['-ss', (t - 0.3).toFixed(2), '-t', '0.7', '-i', mp4, '-vf', `fps=10,scale=${tw}:-1,tile=7x1`, '-frames:v', '1', f]);
    rows.push(f);
  });
  for (let i = 0; i < rows.length; i += 6) {
    const chunk = rows.slice(i, i + 6), f = join(out, `cuts-${i / 6 + 1}.jpg`);
    if (chunk.length === 1) copyFileSync(chunk[0], f);
    else ff([...chunk.flatMap((c) => ['-i', c]), '-filter_complex', `${chunk.map((_, k) => `[${k}]`).join('')}vstack=inputs=${chunk.length}`, f]);
    pages.push(f);
  }
  rows.forEach((f) => rmSync(f, { force: true }));

  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-nostats', '-i', mp4, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const loud = parseLoudness(r.stderr ?? ''), size = statSync(mp4).size, commons = commonRefs(raw);
  console.log(`${id}：${dur.toFixed(2)} 秒、${(size / 1e6).toFixed(1)} MB（${((size * 8) / dur / 1e6).toFixed(1)} Mbps）、`
    + `響度 ${loud ? `${loud.lufs} LUFS${loud.peak !== undefined ? `、真峰值 ${loud.peak} dBFS` : ''}` : '量不到'}、common 積木 ${commons} 個`);
  console.log(`整片縮圖：${join(out, 'sheet.jpg')}`);
  console.log(`剪接點 ${cuts.length} 個，每頁 6 個：${pages.length ? pages.join('、') : '（沒有影片片段）'}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (e) { console.error(`batch:qc 失敗：${brief(e)}`); process.exit(1); }
}
