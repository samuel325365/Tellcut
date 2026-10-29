// Runs a project's first-cut script (spec 2026-10-14 §9):  npm run cut -- <id> [--force] [--no-transcribe]
// projects/<id>/cut.ts:  import type { Cut } from '../../tools/cut/cut.ts';  export default async function (c: Cut) { … }
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { refreshCredits, TELLCUT_ROOT } from '@tellcut/media-node';
import { Cut, EditedDuringCut, editedSinceCut } from './cut/cut.ts';

const id = process.argv[2], dir = join(TELLCUT_ROOT, 'projects', id ?? ''), script = join(dir, 'cut.ts');
if (!id || !existsSync(script)) { console.error('用法：npm run cut -- <專案名> [--force] [--no-transcribe]   （需要 tellcut/projects/<專案名>/cut.ts）'); process.exit(2); }
const force = process.argv.includes('--force');
if (!force && editedSinceCut(dir)) {
  console.error('這個專案在上次初剪後被編輯過，重跑會覆蓋那些修改（舊版會留在 .history/）。確定要重跑請加上 --force');
  process.exit(1);
}
const run = (await import(pathToFileURL(script).href)).default as (c: Cut) => unknown;
const c = await Cut.open(dir, { transcribe: !process.argv.includes('--no-transcribe'), log: (s) => console.error(s), force });
await run(c);
const p = await c.save().catch((e) => { if (e instanceof EditedDuringCut) { console.error(e.message); process.exit(1); } throw e; });
for (const n of c.notes) console.log(n);
if (refreshCredits(dir)) console.log('media/CREDITS.md 已照這版初剪重寫（片裡沒用到的素材列在最後）');
console.log(`初剪完成：${p.meta.duration.toFixed(1)} 秒、${p.tracks.reduce((n, t) => n + t.items.length, 0)} 個項目 → ${join(dir, 'project.json')}`);
console.log('編輯器開著的話請重新整理頁面。');
