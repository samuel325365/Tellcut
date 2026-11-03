// CLI around the shared renderer in @tellcut/media-node.
//   npx tsx tools/render.ts --project <id> [--stills 1.5,3] [--from s --to s]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseProject } from '@tellcut/engine';
import { exportBusy, nextExportBase, openPage, playerPath, prepareProject, projectRegistry, projectTarget, refreshCredits, renderVideo, tryExportLock } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { projectArgOrExit } from './project-arg.ts';
import { secs, secsList } from './cut/speech.ts';
import { parseArgsOrExit, type FlagSpec } from './args.ts';
export { TELLCUT_ROOT, openPage, playerPath, playerUrl, projectTarget, renderVideo, type PageSession } from '@tellcut/media-node';

const USAGE = '用法：npx tsx tools/render.ts --project <專案> [--stills 1.5,3] [--from 秒 --to 秒]';
/** what render takes (batch/render.ts passes on all but --project) */
export const RENDER_FLAGS: FlagSpec = { '--project': 'value', '--stills': 'value', '--from': 'value', '--to': 'value' };

export interface RenderArgs { stills?: number[]; from?: number; to?: number }
/** --stills, --from and --to as times (seconds or m:ss), checked before the lock and the clips: --stills a drew a frame at NaN,
 *  --from abc rendered from NaN */
export function renderArgs(get: (k: string) => string | undefined): RenderArgs {
  const stills = get('--stills'), from = get('--from'), to = get('--to');
  return { stills: stills === undefined ? undefined : secsList(stills, '--stills'), from: from === undefined ? undefined : secs(from, '--from 的時間'), to: to === undefined ? undefined : secs(to, '--to 的時間') };
}

async function main() {
  const a = parseArgsOrExit(process.argv.slice(2), RENDER_FLAGS, USAGE);
  const projectId = a.get('--project')!, pdir = projectArgOrExit(projectId, USAGE);
  let times: RenderArgs;
  try { times = renderArgs(a.get); } catch (e) { console.error((e as Error).message); process.exit(2); }
  // the project's export lock, as the server's export takes it (it cuts the same clips into cache/): a server exporting this
  // project, or another render of it, makes this one stop at once (stills too: their prepare step writes the same cache/)
  const release = tryExportLock(pdir);
  if (!release) { console.error(exportBusy(pdir) ?? '這個專案正在別處輸出：等它結束再輸出'); process.exit(2); }
  try { await renderLocked(projectId, pdir, times); } finally { release(); }
}

async function renderLocked(projectId: string, pdir: string, { stills, from, to }: RenderArgs) {
  const outDir = join(pdir, 'output');
  // the clips the film uses are cut into cache/ first (incremental: only what changed): render alone used to play missing clips black
  const { registry } = await projectRegistry(pdir, plugins, parseProject(JSON.parse(readFileSync(join(pdir, 'project.json'), 'utf8'))));
  await prepareProject(pdir, registry, { log: (l) => console.log(l) });
  if (stills) {
    const s = await openPage(playerPath(projectId), '__tellcut');
    try {
      mkdirSync(join(outDir, 'stills'), { recursive: true });
      for (const v of stills) {
        await s.frame(Math.round(v * s.fps));
        writeFileSync(join(outDir, 'stills', `t${v.toFixed(2)}.png`), await s.png());
        console.log('still', v);
      }
    } finally { await s.close(); }
    return;
  }
  // the film goes where the editor's go (review3 R3-H2): exports/<name>-<time>.mp4 and its .log, listed on the page
  const dir = pdir, name = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).meta?.name ?? projectId;
  const base = nextExportBase(dir, name, projectId), lines: string[] = [];
  mkdirSync(dirname(base), { recursive: true });
  const t0 = Date.now();
  try {
    const out = await renderVideo({ target: projectTarget(projectId), from, to,
      out: `${base}.mp4`, log: (l) => { lines.push(l); console.log(l); } });
    lines.push(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log('done →', out);
    if (refreshCredits(dir)) console.log('credits →', join(dir, 'media', 'CREDITS.md'));
  } finally { writeFileSync(`${base}.log`, `${lines.join('\n')}\n`); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
