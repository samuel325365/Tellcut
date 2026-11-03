// A Tellcut project from folders, files and URLs (spec 2026-10-14 §4).
//   npm run new -- <id> <folder|file|url>... [--size 1920x1080|1080x1920|1080x1080] [--fps 30] [--name 名稱] [--audio] [--force]
//   npm run new -- <id> --blank [--size …]      no footage: an animated explainer (blocks, narration, score)
// Paths are absolute, or relative to tellcut/ (npm runs scripts there), e.g. D:\Trips\Kyoto.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TELLCUT_ROOT, createProject, tellcutUrl } from '@tellcut/media-node';
import { Usage } from './usage.ts';
import { parseArgs, type FlagSpec } from './args.ts';

const USAGE = '用法：npm run new -- <專案名> <資料夾|檔案|網址>... [--size 1920x1080] [--fps 30] [--name 名稱] [--audio] [--force]\n'
  + '      沒有素材的動畫解說片：npm run new -- <專案名> --blank [--size 1080x1920]';
/** --force, --audio and --blank take no value, the others one (apps/server's chat runner reads `npm run new` the same way) */
const NEW_FLAGS: FlagSpec = { '--size': 'value', '--fps': 'value', '--name': 'value', '--force': 'switch', '--audio': 'switch', '--blank': 'switch' };

export interface NewArgs { id: string; inputs: string[]; size?: [number, number]; fps?: number; name?: string; force: boolean; audio: boolean; blank: boolean }

/** `npm run new`'s words, checked before anything is made: --size 1920x or --fps with no value used to fail only after the
 *  footage was ingested, leaving a projects/<id>/media/ without a project.json. Throws Usage. */
export function newArgs(argv: string[]): NewArgs {
  const flags = parseArgs(argv, NEW_FLAGS, USAGE), [id, ...inputs] = flags.words;
  if (!id || (!inputs.length && !flags.has('--blank'))) throw new Usage(USAGE);
  const size = flags.get('--size'), fps = flags.get('--fps'), name = flags.get('--name');
  const m = size !== undefined ? /^(\d+)x(\d+)$/i.exec(size.trim()) : null;
  if (size !== undefined && (!m || !(+m[1] > 0 && +m[2] > 0))) throw new Usage(`--size「${size}」要寫成 寬x高，例如 1920x1080、1080x1920\n${USAGE}`);
  if (fps !== undefined && !(/^\d+$/.test(fps.trim()) && +fps > 0)) throw new Usage(`--fps「${fps}」要是正整數，例如 30\n${USAGE}`);
  return { id, inputs, size: m ? [+m[1], +m[2]] : undefined, fps: fps !== undefined ? +fps : undefined, name,
    force: flags.has('--force'), audio: flags.has('--audio'), blank: flags.has('--blank') };
}

async function main(argv: string[]) {
  let a: NewArgs;
  try { a = newArgs(argv); } catch (e) { console.error((e as Error).message); process.exit(2); }
  const { id } = a;
  try {
    const r = await createProject({ id, inputs: a.inputs, projectsDir: join(TELLCUT_ROOT, 'projects'), size: a.size, force: a.force, audioUrls: a.audio, blank: a.blank,
      fps: a.fps, name: a.name, log: console.log });
    const p = r.project;
    console.log(`\n專案 ${id}：${p.meta.width}×${p.meta.height}、${Object.keys(p.sources).length} 個影片／照片、${Object.keys(p.media).length} 首音樂 → ${r.file}`);
    if (r.skipped.length) console.log(`略過：\n  ${r.skipped.join('\n  ')}`);
    // the Tellcut server (if it runs) starts analysing at once — proxies, sheets, the transcript — in the background
    try {
      const res = await fetch(`${tellcutUrl()}/api/projects/${encodeURIComponent(id)}/analyze`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      if (res.ok) console.log('伺服器已經開始在背景分析素材（含逐字稿）。');
    } catch { /* no server: inspect does it */ }
    console.log(a.blank && !Object.keys(p.sources).length ? `下一步：寫 projects/${id}/cut.ts（方法：npm run tellcut -- cut-api），再 npm run cut -- ${id}` : `下一步：npm run inspect -- ${id}`);
  } catch (e) {
    console.error(`無法建立專案：${(e as Error).message}`);
    process.exit(1);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2));
