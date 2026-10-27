// A Tellcut project from folders, files and URLs (spec 2026-10-14 §4).
//   npm run new -- <id> <folder|file|url>... [--size 1920x1080|1080x1920|1080x1080] [--fps 30] [--name 名稱] [--audio] [--force]
//   npm run new -- <id> --blank [--size …]      no footage: an animated explainer (blocks, narration, score)
// Paths are absolute, or relative to tellcut/ (npm runs scripts there), e.g. D:\Trips\Kyoto.
import { join } from 'node:path';
import { TELLCUT_ROOT, createProject, tellcutUrl } from '@tellcut/media-node';

const argv = process.argv.slice(2), flags = new Map<string, string | true>(), pos: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const k = a.slice(2);
  flags.set(k, k === 'force' || k === 'audio' || k === 'blank' ? true : argv[++i]);
}
const [id, ...inputs] = pos;
if (!id || (!inputs.length && !flags.has('blank'))) {
  console.error('用法：npm run new -- <專案名> <資料夾|檔案|網址>... [--size 1920x1080] [--fps 30] [--name 名稱] [--audio] [--force]\n'
    + '      沒有素材的動畫解說片：npm run new -- <專案名> --blank [--size 1080x1920]');
  process.exit(2);
}
const size = typeof flags.get('size') === 'string' ? ((flags.get('size') as string).split('x').map(Number) as [number, number]) : undefined;
try {
  const r = await createProject({ id, inputs, projectsDir: join(TELLCUT_ROOT, 'projects'), size, force: flags.has('force'), audioUrls: flags.has('audio'), blank: flags.has('blank'),
    fps: flags.has('fps') ? Number(flags.get('fps')) : undefined, name: typeof flags.get('name') === 'string' ? (flags.get('name') as string) : undefined, log: console.log });
  const p = r.project;
  console.log(`\n專案 ${id}：${p.meta.width}×${p.meta.height}、${Object.keys(p.sources).length} 個影片／照片、${Object.keys(p.media).length} 首音樂 → ${r.file}`);
  if (r.skipped.length) console.log(`略過：\n  ${r.skipped.join('\n  ')}`);
  // the Tellcut server (if it runs) starts analysing at once — proxies, sheets, the transcript — in the background
  try {
    const res = await fetch(`${tellcutUrl()}/api/projects/${encodeURIComponent(id)}/analyze`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    if (res.ok) console.log('伺服器已經開始在背景分析素材（含逐字稿）。');
  } catch { /* no server: inspect does it */ }
  console.log(flags.has('blank') && !Object.keys(p.sources).length ? `下一步：寫 projects/${id}/cut.ts（方法：npm run tellcut -- cut-api），再 npm run cut -- ${id}` : `下一步：npm run inspect -- ${id}`);
} catch (e) {
  console.error(`無法建立專案：${(e as Error).message}`);
  process.exit(1);
}
