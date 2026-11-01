// Cut every clip / still / audio segment a project needs into projects/<id>/cache.
//   npx tsx tools/prepare.ts --project projects/<id> [--force]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseProject } from '@tellcut/engine';
import { exportBusy, prepareProject, projectRegistry, tryExportLock } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const dir = resolve(arg('--project') ?? '');
  if (!existsSync(join(dir, 'project.json'))) { console.error('用法：npx tsx tools/prepare.ts --project projects/<專案> [--force]'); process.exit(2); }   // before the lock makes a cache/ there
  // the project's export lock, as render and the server's export take it for their own prepare step: cutting into cache/ beside
  // an export of the project does the same cuts twice, and --force renames new cuts over files that export is reading
  const release = tryExportLock(dir);
  if (!release) { console.error(exportBusy(dir) ?? '這個專案正在別處輸出：等它結束再準備'); process.exit(2); }
  try {
    const t0 = Date.now();
    const { registry, fx } = await projectRegistry(dir, plugins, parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))));
    for (const e of fx.errors) console.error(`fx 載入失敗 ${e.path}：${e.message}`);
    const index = await prepareProject(dir, registry, { force: process.argv.includes('--force'), log: console.log });
    console.log(`done: ${Object.keys(index.videos).length} clips, ${Object.keys(index.stills).length} stills, ${Object.keys(index.audio).length} audio, ${Object.keys(index.peaks ?? {}).length} sound levels (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } finally { release(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
