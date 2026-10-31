// Render through a queue (several renders started at once, e.g. by agents making films side by side): waits for one of the shared render slots, then runs the same
// prepare:project + render as by hand, and frees the slot.
//   npm run batch:render -- <id> [--slots 2] [any render option, e.g. --stills 1.5,3]
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { holders, keepSlot, releaseSlot, takeSlot } from './queue.ts';

export const LOCK_DIR = join(TELLCUT_ROOT, '.cache', 'batch-render-slots');
const USAGE = '用法：npm run batch:render -- <專案> [--slots 2] [render 的選項]';

/** `<id> [--slots n] [render options]` in any order; a flag takes the next word as its value unless that is a flag too
 *  (render's options all take one). null when there is not exactly one project id. */
export function parseArgs(argv: string[]): { id: string; slots: number; extra: string[] } | null {
  const pos: string[] = [], extra: string[] = [];
  let slots = 2;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const v = i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : undefined;
    if (a === '--slots') slots = Math.max(1, Math.floor(Number(v)) || 2);
    else extra.push(a, ...(v === undefined ? [] : [v]));
  }
  return pos.length === 1 ? { id: pos[0], slots, extra } : null;
}

// one command string for the shell (an args array with shell: true is DEP0190 on Node 24). cmd.exe takes no \" escape inside
// quotes and expands %VAR% there, so an argument with a character it acts on is refused (project ids and render options never have one)
const UNSAFE = /["%^&|<>\r\n]/;
const quote = (a: string) => { if (UNSAFE.test(a)) throw new Error(`參數不能有 " % ^ & | < > 或換行：${JSON.stringify(a)}`); return `"${a}"`; };
export const npmCommand = (args: string[]) => `npm run -s ${args.map(quote).join(' ')}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) { console.error(USAGE); process.exit(2); }
  const { id, slots, extra } = args;
  try { npmCommand([id, ...extra]); } catch (e) { console.error((e as Error).message); process.exit(2); }   // before taking a slot
  let slot: string | null = null, waited = 0;
  while (!(slot = takeSlot(LOCK_DIR, slots, id))) {
    if (waited % 60 === 0) console.log(`[排隊] ${id}：等待輸出位置（${waited} 秒；使用中：${holders(LOCK_DIR, slots).join('、')}）`);
    await new Promise((r) => setTimeout(r, 5000)); waited += 5;
  }
  const beat = setInterval(() => { if (slot) keepSlot(slot); }, 60_000);
  const free = () => { clearInterval(beat); if (slot) releaseSlot(slot); slot = null; };
  // async spawn keeps our event loop running, so Ctrl+C (which also reaches npm in the same console) frees the slot
  process.on('SIGINT', () => { free(); process.exit(130); });
  process.on('SIGTERM', () => { free(); process.exit(143); });
  console.log(`[排隊] ${id}：開始輸出`);
  const npm = (a: string[]) => new Promise<number>((res) => {
    const c = spawn(npmCommand(a), { cwd: TELLCUT_ROOT, stdio: 'inherit', shell: true });
    c.on('error', () => res(1)); c.on('close', (code) => res(code ?? 1));
  });
  let code = 1;
  try {
    code = await npm(['prepare:project', '--', '--project', `projects/${id}`]);
    if (code === 0) code = await npm(['render', '--', '--project', id, ...extra]);
  } finally { free(); }
  process.exit(code);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
