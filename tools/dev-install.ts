// The developers' Claude Code tools (batch-videos skill, video-maker subagent; review3 R3-L1). Their text lives once, in
// tellcut/dev/claude/; Claude Code only finds skills and agents in the .claude folder of the folder a session starts in (agents are
// not looked up in folders below it). Developers start sessions in the folder above tellcut/ (Video-Editing/), so the copies go
// there, out of any repo. Not into tellcut/.claude by default: a session above that touches tellcut files would load the skill a
// second time from there. --here also writes them into tellcut/.claude (git ignores them) for sessions started in tellcut/.
//   npm run dev:install [-- --here] [--check]     (--check: say which copies are missing or stale, change nothing; exit 1 if any)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TELLCUT_ROOT } from '@tellcut/media-node';

export const DEV_DIR = join(TELLCUT_ROOT, 'dev', 'claude');
export const ABOVE = join(dirname(TELLCUT_ROOT), '.claude'), HERE = join(TELLCUT_ROOT, '.claude');

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)).map((x) => join(f, x)) : [f]));

/** the copy of one source file: its frontmatter (Claude Code needs it first), a line saying where it comes from, then the text */
export function generated(source: string, rel: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source);
  const note = `<!-- ${NOTE}${rel.replace(/\\/g, '/')} 產生：改那一份，再跑一次 -->\n`;
  return m ? `${m[0]}${note}${source.slice(m[0].length)}` : `${note}${source}`;
}

const NOTE = '由 npm run dev:install 從 tellcut/dev/claude/';
/** why the copies must not go to `target`: the user's own ~/.claude (tellcut kept in the home folder) would give every session
 *  these skills and agents; null when it is fine */
export function refusal(target: string, home = homedir()): string | null {
  return resolve(target).toLowerCase() === resolve(home, '.claude').toLowerCase() ? `不寫進 ~/.claude（${target}）：tellcut 放在使用者資料夾裡時，上一層就是使用者自己的設定，每個 session 都會載入這些工具。把 tellcut 放進一個專用的資料夾再跑` : null;
}
/** a file there that dev:install did not write (the user's own skill or agent of the same name): left alone */
export const foreign = (file: string) => existsSync(file) && !readFileSync(file, 'utf8').includes(NOTE);

/** every copy that should exist: [target path, content] */
export function plan(devDir = DEV_DIR, targets = [ABOVE]): Array<[string, string]> {
  return walk(devDir).flatMap((rel) => {
    const text = generated(readFileSync(join(devDir, rel), 'utf8'), rel);
    return targets.map((t) => [join(t, rel), text] as [string, string]);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check'), targets = process.argv.includes('--here') ? [ABOVE, HERE] : [ABOVE];
  for (const t of targets) { const why = refusal(t); if (why) { console.error(why); process.exit(1); } }
  const stale = plan(DEV_DIR, targets).filter(([f, text]) => !existsSync(f) || readFileSync(f, 'utf8') !== text);
  const show = (f: string) => relative(dirname(TELLCUT_ROOT), f);
  if (check) {
    if (stale.length) { console.error(`開發者工具的複本過期或不在：\n  ${stale.map(([f]) => show(f)).join('\n  ')}\n執行 npm run dev:install`); process.exit(1); }
    console.log('開發者工具的複本都是最新的');
  } else {
    for (const [f, text] of stale) {
      if (foreign(f)) { console.error(`略過 ${show(f)}：這個檔不是 dev:install 寫的（同名的個人設定？），沒有蓋掉`); continue; }
      mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); console.log(`寫入 ${show(f)}`);
    }
    if (!stale.length) console.log('開發者工具的複本都是最新的');
  }
}
