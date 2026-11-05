// Render through a queue (several renders started at once, e.g. by agents making films side by side): waits for one of the shared render slots, then runs the same
// render as by hand (which cuts the clips into cache/ itself, under the project's export lock), and frees the slot.
//   npm run batch:render -- <id> [--slots 2] [any render option, e.g. --stills 1.5,3]
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportBusy, pause, shellQuoter, TELLCUT_ROOT } from '@tellcut/media-node';
import { holders, keepSlot, releaseSlot, takeSlot } from './queue.ts';
import { projectArgOrExit } from '../project-arg.ts';
import { parseArgs as parseArgs_, printFailure, type FlagSpec } from '../args.ts';
import { Usage } from '../usage.ts';
export const LOCK_DIR = join(TELLCUT_ROOT, '.cache', 'batch-render-slots');
const USAGE = '用法：npm run batch:render -- <專案> [--slots 2] [render 的選項]';

/** render's own options, passed on (tools/render.ts RENDER_FLAGS without --project, whose value is our id; batch.test.ts keeps
 *  the two in step — written out here so the queue does not load every block's code to read its command line) */
export const PASSED = ['--stills', '--from', '--to'];
const SPEC: FlagSpec = { '--slots': 'value', ...Object.fromEntries(PASSED.map((f) => [f, 'value' as const])) };

/** `<id> [--slots n] [render options]` in any order; a flag render does not take is refused here, before waiting for a slot.
 *  null when there is not exactly one project id; Usage for a wrong flag, or --slots that is no whole number from 1 up (0 and
 *  abc used to be read as the default 2). */
export function parseArgs(argv: string[]): { id: string; slots: number; extra: string[] } | null {
  const a = parseArgs_(argv, SPEC, USAGE);
  const given = a.get('--slots'), slots = given === undefined ? 2 : Number(given);
  if (given !== undefined && (!given.trim() || !Number.isInteger(slots) || slots < 1)) throw new Usage(`--slots 要是 1 以上的整數（給的是「${given}」）\n${USAGE}`);
  const extra = PASSED.flatMap((f) => (a.has(f) ? [f, a.get(f)!] : []));
  return a.words.length === 1 ? { id: a.words[0], slots, extra } : null;
}

// one command string for the shell (shellQuoter). cmd.exe takes no \" escape inside quotes and expands %VAR% there, and npm runs
// the script through it once more, so an argument with a character cmd.exe acts on is refused, not passed on half-quoted
// (project ids and render options never have one); the same ones on every platform, so a batch line works on either. sh's
// single quotes need no refusal of their own.
const UNSAFE = /["%^&|<>\r\n]/;
export const npmCommand = (args: string[], platform: NodeJS.Platform = process.platform) => {
  const quote = shellQuoter(platform);
  return `npm run -s ${args.map((a) => { if (UNSAFE.test(a)) throw new Error(`參數不能有 " % ^ & | < > 或換行：${JSON.stringify(a)}`); return quote(a); }).join(' ')}`;
};

/** the npm scripts a queued render runs, in order. Only render: it takes the project's export lock and then prepares the clips
 *  itself. A prepare:project run first, as a step of its own, cut into cache/ outside the lock, while a server or another render
 *  could be exporting the project (and its own lock would leave a gap before render's). */
export const renderSteps = (id: string, extra: string[]): string[][] => [['render', '--', '--project', id, ...extra]];

async function main() {
  let args: ReturnType<typeof parseArgs>;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { process.exit(printFailure(e)); }
  if (!args) { console.error(USAGE); process.exit(2); }
  const { id, slots, extra } = args;
  const pdir = projectArgOrExit(id, USAGE);   // the server's spelling of it, before waiting for a slot (render.ts would refuse another)
  // a project being exported elsewhere (a server, another render) is refused now, not after waiting for a slot (render.ts takes
  // the lock itself and would refuse it then; prepare:project would have run beside that export meanwhile)
  const busy = exportBusy(pdir);
  if (busy) { console.error(busy); process.exit(2); }
  try { for (const s of renderSteps(id, extra)) npmCommand(s); } catch (e) { console.error((e as Error).message); process.exit(2); }   // before taking a slot
  let slot: string | null = null, waited = 0;
  while (!(slot = takeSlot(LOCK_DIR, slots, id))) {
    if (waited % 60 === 0) console.log(`[排隊] ${id}：等待輸出位置（${waited} 秒；使用中：${holders(LOCK_DIR, slots).join('、')}）`);
    await pause(5000); waited += 5;
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
  let code = 0;
  try {
    for (const step of renderSteps(id, extra)) if ((code = await npm(step)) !== 0) break;
  } finally { free(); }
  process.exit(code);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
