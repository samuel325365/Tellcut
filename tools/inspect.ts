// What a project's material is, with every analysis done (spec 2026-10-14 §8).
//   npm run inspect -- <id> [--json] [--no-transcribe]
//   npm run inspect -- <id> --source <素材>                    one source in detail: scenes, sentences with times, big sheets
//   npm run inspect -- <id> --source <素材> --range 5:00-6:30   one stretch: a frame every few seconds with its time, its scenes and sentences
// Everything is cached: running it again is quick.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TELLCUT_ROOT, tellcutUrl } from '@tellcut/media-node';
import { busyFromJobs, formatInventory, formatSource, formatSourceRange, inventory, parseRange, type ServerBusy } from './cut/inventory.ts';

/** what the Tellcut server (if it runs) is analysing for this project: inspect neither waits for it nor does it again */
async function serverBusy(project: string): Promise<ServerBusy> {
  try {
    const r = await fetch(`${tellcutUrl()}/api/jobs`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? busyFromJobs(await r.json(), project) : {};
  } catch { return {}; }
}

const id = process.argv[2], dir = join(TELLCUT_ROOT, 'projects', id ?? '');
if (!id || !existsSync(join(dir, 'project.json'))) { console.error('用法：npm run inspect -- <專案名> [--source <素材> [--range 開始-結束]] [--json] [--no-transcribe]'); process.exit(2); }
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] ?? '' : undefined; };
try {
  const range = arg('--range') !== undefined ? parseRange(arg('--range')!) : undefined;
  const inv = await inventory(dir, { transcribe: !process.argv.includes('--no-transcribe'), log: (s) => console.error(s), busy: await serverBusy(id) });
  const source = arg('--source');
  if (source !== undefined) console.log(range ? await formatSourceRange(inv, source, range) : formatSource(inv, source));
  else if (range) throw new Error('--range 要配合 --source <素材>');
  else if (process.argv.includes('--json')) {
    const { project: _p, ...rest } = inv;
    console.log(JSON.stringify(rest, null, 2));
  } else console.log(formatInventory(inv));
} catch (e) { console.error((e as Error).message); process.exit(1); }
