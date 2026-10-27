// The one way project.json is written (the server, npm run cut / new, accepting a proposal without the editor): atomic, the previous
// version kept in .history/, only the newest PROJECT_HISTORY_KEEP of them.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject, type Project } from '@tellcut/engine';
import { renameRetry } from './fsutil.ts';

/** Versions kept in .history/. */
export const PROJECT_HISTORY_KEEP = 20;
export const projectHash = (text: string) => createHash('sha1').update(text).digest('hex');

/** sortable and filename-safe; the per-process sequence keeps names in write order within one millisecond */
let seq = 0;
const stamp = () => `${new Date().toISOString().replace(/[:.]/g, '-')}_${String(++seq).padStart(6, '0')}`;

/** Writes project.json (`tag` names who wrote the version it replaces: editor, cut, new…); returns the hash of the text written. */
export function writeProjectFile(dir: string, project: unknown, tag: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'project.json'), hist = join(dir, '.history');
  if (existsSync(file)) {
    mkdirSync(hist, { recursive: true });
    copyFileSync(file, join(hist, `${stamp()}_${tag}.json`));
  }
  const tmp = join(dir, `project.json.${process.pid}.tmp`), text = JSON.stringify(project, null, 2) + '\n';
  writeFileSync(tmp, text);
  renameRetry(tmp, file);
  if (existsSync(hist)) {
    const all = readdirSync(hist).filter((f) => f.endsWith('.json')).sort();
    for (const f of all.slice(0, Math.max(0, all.length - PROJECT_HISTORY_KEEP))) rmSync(join(hist, f));
  }
  return projectHash(text);
}

/** A validated write (spec 2026-10-15-proposals-magnetic §6: accepting a proposal without the editor). Returns the project and the
 *  hash of what was written. */
export function saveProjectFile(dir: string, body: unknown, tag: string): { project: Project; hash: string } {
  const project = parseProject(body);
  return { project, hash: writeProjectFile(dir, body, tag) };
}

/** Read, change and write project.json for a tool that adds to it (assets get): when the file changed between the read and the
 *  write (the editor saved, another tool wrote) the change is made again on the newer version instead of overwriting it. */
export function updateProjectFile(dir: string, mutate: (raw: any) => void, tag: string): { project: Project; hash: string } {
  const file = join(dir, 'project.json');
  for (let i = 0; i < 3; i++) {
    const text = readFileSync(file, 'utf8'), raw = JSON.parse(text);
    mutate(raw);
    if (projectHash(readFileSync(file, 'utf8')) !== projectHash(text)) continue;
    return saveProjectFile(dir, raw, tag);
  }
  throw new Error('project.json 一直被改，稍後再試');
}
