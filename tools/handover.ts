// npm run handover -- <folder> (spec 2026-10-17-studio-handover §9): the tellcut/ to hand over, as committed — no node_modules,
// footage, caches, vendor/ or models/ (the receiver's npm run setup makes those). Writes <folder>/tellcut.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { systemTar } from './setup/vendor.ts';

const target = process.argv[2];
if (!target) { console.error('用法：npm run handover -- <目標資料夾>（會建立 <目標資料夾>/tellcut）'); process.exit(1); }
// npm runs scripts in tellcut/: a relative folder means the one the command was typed in (INIT_CWD)
const base = resolve(process.env.INIT_CWD ?? process.cwd(), target), out = join(base, 'tellcut');
if (existsSync(out) && readdirSync(out).length) { console.error(`${out} 已經有東西：換一個資料夾，或先把它刪掉`); process.exit(1); }

const git = (...args: string[]) => execFileSync('git', ['-C', TELLCUT_ROOT, ...args], { encoding: 'utf8' });
// what is not committed is not handed over: say so before making the copy
const dirty = git('status', '--porcelain', '--', '.').split('\n').filter(Boolean);
if (dirty.length) {
  console.warn(`! tellcut/ 有 ${dirty.length} 個還沒 commit 的變更不會包含在內（交出去的是最後一次 commit）：`);
  for (const l of dirty.slice(0, 10)) console.warn(`    ${l}`);
}
const commit = git('rev-parse', '--short', 'HEAD').trim();
mkdirSync(out, { recursive: true });
const zip = join(base, `.tellcut-${commit}.zip`);
try {
  // HEAD:<prefix> = tellcut/'s content at the zip's root, wherever tellcut/ sits in its repo (a repo of its own: just HEAD).
  // From the top: run inside a subfolder, git archive also keeps only that subfolder *of the tree given*, i.e. nothing.
  const prefix = git('rev-parse', '--show-prefix').trim().replace(/\/$/, ''), top = git('rev-parse', '--show-toplevel').trim();
  execFileSync('git', ['-C', top, 'archive', '--format=zip', '-o', zip, prefix ? `HEAD:${prefix}` : 'HEAD']);
  execFileSync(systemTar(), ['-xf', zip, '-C', out]);
  if (!existsSync(join(out, 'package.json'))) throw new Error(`匯出的副本裡沒有 package.json（${out}）：git archive 沒有拿到 tellcut 的內容`);
} finally { rmSync(zip, { force: true }); }
console.log(`交接用的 tellcut（commit ${commit}）在 ${out}`);
console.log('對方：照 INSTALL.md（英文）做（先裝 Node 24、Chrome、Claude Code，再 npm run setup）。');
