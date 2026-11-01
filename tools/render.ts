// CLI around the shared renderer in @tellcut/media-node.
//   npx tsx tools/render.ts --project <id> [--stills 1.5,3] [--from s --to s]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseProject } from '@tellcut/engine';
import { nextExportBase, openPage, playerPath, prepareProject, projectRegistry, projectTarget, refreshCredits, renderVideo } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { projectArgOrExit } from './project-arg.ts';
export { TELLCUT_ROOT, openPage, playerPath, playerUrl, projectTarget, renderVideo, type PageSession } from '@tellcut/media-node';

async function main() {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const projectId = arg('--project')!, pdir = projectArgOrExit(projectId, '用法：npx tsx tools/render.ts --project <專案> [--stills 1.5,3] [--from 秒 --to 秒]');
  const outDir = join(pdir, 'output');
  const stills = arg('--stills');
  // the clips the film uses are cut into cache/ first (incremental: only what changed): render alone used to play missing clips black
  const { registry } = await projectRegistry(pdir, plugins, parseProject(JSON.parse(readFileSync(join(pdir, 'project.json'), 'utf8'))));
  await prepareProject(pdir, registry, { log: (l) => console.log(l) });
  if (stills) {
    const s = await openPage(playerPath(projectId), '__tellcut');
    try {
      mkdirSync(join(outDir, 'stills'), { recursive: true });
      for (const v of stills.split(',')) {
        await s.frame(Math.round(parseFloat(v) * s.fps));
        writeFileSync(join(outDir, 'stills', `t${parseFloat(v).toFixed(2)}.png`), await s.png());
        console.log('still', v);
      }
    } finally { await s.close(); }
    return;
  }
  const from = arg('--from'), to = arg('--to');
  // the film goes where the editor's go (review3 R3-H2): exports/<name>-<time>.mp4 and its .log, listed on the page
  const dir = pdir, name = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).meta?.name ?? projectId;
  const base = nextExportBase(dir, name, projectId), lines: string[] = [];
  mkdirSync(dirname(base), { recursive: true });
  const t0 = Date.now();
  try {
    const out = await renderVideo({ target: projectTarget(projectId), from: from ? +from : undefined, to: to ? +to : undefined,
      out: `${base}.mp4`, log: (l) => { lines.push(l); console.log(l); } });
    lines.push(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log('done →', out);
    if (refreshCredits(dir)) console.log('credits →', join(dir, 'media', 'CREDITS.md'));
  } finally { writeFileSync(`${base}.log`, `${lines.join('\n')}\n`); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
