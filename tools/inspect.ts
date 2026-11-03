// What a project's material is, with every analysis done (spec 2026-10-14 §8); when the timeline has clips, which source each one plays.
//   npm run inspect -- <id> [--json] [--no-transcribe]
//   npm run inspect -- <id> --source <素材>                    one source in detail: scenes, sentences with times, big sheets
//   npm run inspect -- <id> --source <素材> --range 5:00-6:30   one stretch: a frame every few seconds with its time, its scenes and sentences
// Everything is cached: running it again is quick.
import { tellcutUrl } from '@tellcut/media-node';
import { formatClips, timelineClips } from './inspect-clips.ts';
import { projectArgOrExit } from './project-arg.ts';
import { parseArgsOrExit } from './args.ts';
import { busyFromJobs, formatInventory, formatSource, formatSourceRange, inventory, parseRange, type ServerBusy } from './cut/inventory.ts';

/** what the Tellcut server (if it runs) is analysing for this project: inspect neither waits for it nor does it again */
async function serverBusy(project: string): Promise<ServerBusy> {
  try {
    const r = await fetch(`${tellcutUrl()}/api/jobs`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? busyFromJobs(await r.json(), project) : {};
  } catch { return {}; }
}

const USAGE = '用法：npm run inspect -- <專案名> [--source <素材> [--range 開始-結束]] [--json] [--no-transcribe]';
const args = parseArgsOrExit(process.argv.slice(2), { '--source': 'value', '--range': 'value', '--json': 'switch', '--no-transcribe': 'switch' }, USAGE);
const id = args.words[0], dir = projectArgOrExit(id, USAGE);
try {
  const r = args.get('--range'), range = r !== undefined ? parseRange(r) : undefined;
  const inv = await inventory(dir, { transcribe: !args.has('--no-transcribe'), log: (s) => console.error(s), busy: await serverBusy(id) });
  const source = args.get('--source');
  if (source !== undefined) console.log(range ? await formatSourceRange(inv, source, range) : formatSource(inv, source));
  else if (range) throw new Error('--range 要配合 --source <素材>');
  else if (args.has('--json')) {
    const { project: _p, ...rest } = inv;
    console.log(JSON.stringify({ ...rest, clips: timelineClips(inv.project) }, null, 2));
  } else {
    const clips = formatClips(inv.project);
    console.log(formatInventory(inv) + (clips.length ? `\n\n${clips.join('\n')}` : ''));
  }
} catch (e) { console.error((e as Error).message); process.exit(1); }
