// Cut every clip / still / audio segment a project needs into projects/<id>/cache.
//   npx tsx tools/prepare.ts --project projects/<id> [--force]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { prepareProject, projectRegistry } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = resolve(arg('--project') ?? '');
const t0 = Date.now();
const { registry, fx } = await projectRegistry(dir, plugins, parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))));
for (const e of fx.errors) console.error(`fx 載入失敗 ${e.path}：${e.message}`);
const index = await prepareProject(dir, registry, { force: process.argv.includes('--force'), log: console.log });
console.log(`done: ${Object.keys(index.videos).length} clips, ${Object.keys(index.stills).length} stills, ${Object.keys(index.audio).length} audio (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
