// The project a command line was given, found the way the server finds it (media-node project-dir.ts): only the folder's own
// spelling, so `npm run cut -- Demo` no longer works on projects/demo behind the server's back (which knows it only as demo).
import { join } from 'node:path';
import { projectDirOf, TELLCUT_ROOT } from '@tellcut/media-node';
import { Usage } from './usage.ts';

export const PROJECTS_DIR = join(TELLCUT_ROOT, 'projects');

/** projects/<id>; no id (or a flag where it should be) is a Usage error, an id that is no project under that spelling an Error
 *  that says so (with the folder's real name on a wrong case). `_`-prefixed test projects count. */
export function projectArg(id: string | undefined, usage: string, o: { projectsDir?: string; internal?: boolean } = {}): string {
  if (!id || id.startsWith('-')) throw new Usage(usage);
  return projectDirOf(o.projectsDir ?? PROJECTS_DIR, id, { internal: o.internal ?? true });
}

/** projectArg for a script that runs at its top level: prints the problem and exits (2) instead of throwing */
export function projectArgOrExit(id: string | undefined, usage: string): string {
  try { return projectArg(id, usage); } catch (e) { console.error((e as Error).message); process.exit(2); }
}
