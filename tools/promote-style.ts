// Promote a project's own music style into the shared library (toolkit phase 3):
//   npm run promote-style -- <專案> <風格 id> [--yes]
// Claude Code only (the page chat cannot run it). Without --yes it only prints what it would do.
// The module moves from projects/<id>/score/ to tellcut/score-library/<風格 id>.js and gets the next MUS handle; music already
// generated with it stays as it is.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadStyles, projectStyleDir, TELLCUT_ROOT, SCORE_LIBRARY } from '@tellcut/media-node';
import { STYLE_PREFIX } from '@tellcut/protocol';
import { fxChecks } from './check/rules.ts';
import { HANDLES_FILE, nextHandle, readHandles, withHandle } from './handle-registry.ts';

/** `handle`: the next MUS handle, given to it in the registry (spec 2026-10-22-block-handles) */
export interface StylePromotion { from: string; to: string; id: string; handle: string; handlesFile: string }

/** What promoting `id` from the project in `dir` would do; throws a sentence saying why not. */
export async function planStylePromotion(o: { dir: string; id: string; library?: string; handlesFile?: string }): Promise<StylePromotion> {
  const library = o.library ?? SCORE_LIBRARY;
  const own = await loadStyles([projectStyleDir(o.dir)]);
  const s = own.styles[o.id];
  if (!s) {
    const err = own.errors.find((e) => e.message.includes(o.id));
    throw new Error(err ? `風格「${o.id}」本身有問題：${err.message}` : `專案裡沒有風格「${o.id}」（在 ${projectStyleDir(o.dir)}）`);
  }
  const siblings = Object.values(own.styles).filter((x) => x.file === s.file && x.id !== o.id);
  if (siblings.length) throw new Error(`${s.file} 裡還有別的風格（${siblings.map((x) => x.id).join('、')}）：先拆成一個風格一個檔案`);
  const bad = fxChecks({ [s.file]: readFileSync(s.file, 'utf8') }).filter((f) => f.level === 'error');
  if (bad.length) throw new Error(`風格「${o.id}」不符合規則：${bad.map((f) => f.msg).join('；')}`);
  const lib = await loadStyles([library]);
  const to = join(library, `${o.id}.js`);
  if (lib.styles[o.id] || existsSync(to)) throw new Error(`風格庫裡已經有「${o.id}」`);
  const handlesFile = o.handlesFile ?? HANDLES_FILE;
  return { from: s.file, to, id: o.id, handle: nextHandle(readHandles(handlesFile), STYLE_PREFIX), handlesFile };
}

export function applyStylePromotion(p: StylePromotion) {
  const handles = withHandle(readHandles(p.handlesFile), p.handle, `style:${p.id}`);
  mkdirSync(join(p.to, '..'), { recursive: true });
  renameSync(p.from, p.to);
  writeFileSync(p.handlesFile, handles);
}

async function main() {
  const [id, style] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!id || !style) { console.error('用法：npm run promote-style -- <專案> <風格 id> [--yes]'); process.exit(2); }
  try {
    const p = await planStylePromotion({ dir: join(TELLCUT_ROOT, 'projects', id), id: style });
    console.log(`把風格「${p.id}」升格進風格庫（圖鑑代號 ${p.handle}）：\n  ${p.from}\n  → ${p.to}\n  （已經用它產生的配樂不受影響；之後每個專案都能用 --style ${p.id}）`);
    if (!process.argv.includes('--yes')) { console.log('\n（只是預覽；確定要做就加 --yes）'); return; }
    applyStylePromotion(p);
    console.log('\n完成。跑一次 npm test（風格庫的每個風格都會被檢查）。');
  } catch (e) { console.error(`無法升格：${(e as Error).message}`); process.exit(1); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
