// Runs a project's first-cut script (spec 2026-10-14 §9):  npm run cut -- <id> [--force] [--no-transcribe]
// projects/<id>/cut.ts:  import type { Cut } from '../../tools/cut/cut.ts';  export default async function (c: Cut) { … }
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { refreshCredits } from '@tellcut/media-node';
import { Cut, EditedDuringCut, editedSinceCut } from './cut/cut.ts';
import { projectArgOrExit } from './project-arg.ts';
import { parseArgsOrExit } from './args.ts';

const USAGE = '用法：npm run cut -- <專案名> [--force] [--no-transcribe]   （需要 tellcut/projects/<專案名>/cut.ts）';
const args = parseArgsOrExit(process.argv.slice(2), { '--force': 'switch', '--no-transcribe': 'switch' }, USAGE, { maxWords: 1 });
const id = args.words[0], dir = projectArgOrExit(id, USAGE), script = join(dir, 'cut.ts');
if (!existsSync(script)) { console.error(USAGE); process.exit(2); }
const force = args.has('--force');
if (!force && editedSinceCut(dir)) {
  console.error('這個專案在上次初剪後被編輯過（或找不到上次初剪的紀錄 cache/cut-state.json，時間軸上已經有東西），重跑會覆蓋那些修改（舊版會留在 .history/）。確定要重跑請加上 --force');
  process.exit(1);
}
const run = (await import(pathToFileURL(script).href)).default as (c: Cut) => unknown;
const c = await Cut.open(dir, { transcribe: !args.has('--no-transcribe'), log: (s) => console.error(s), force });
await run(c);
const p = await c.save().catch((e) => { if (e instanceof EditedDuringCut) { console.error(e.message); process.exit(1); } throw e; });
for (const n of c.notes) console.log(n);
if (refreshCredits(dir)) console.log('media/CREDITS.md 已照這版初剪重寫（片裡沒用到的素材列在最後）');
console.log(`初剪完成：${p.meta.duration.toFixed(1)} 秒、${p.tracks.reduce((n, t) => n + t.items.length, 0)} 個項目 → ${join(dir, 'project.json')}`);
console.log('編輯器開著的話請重新整理頁面。');
