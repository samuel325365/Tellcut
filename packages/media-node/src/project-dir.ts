// Which folder a project id names: the server's ProjectStore.dir and every command line that takes a project resolve it here.
// NTFS finds the folder demo for Demo, and one project under two ids had two chat turns at once (the turn lock is the process's,
// so free to it), a delete that missed the other id's turn and jobs, and a CLI writing under one spelling while the server
// watched the other. So only the folder's own spelling is a project; a junction named otherwise (its target's name unlike the id)
// is left alone.
import { existsSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PROJECT_ID } from './paths.ts';

/** the ids of folders that are not projects of the user's (_home, _gallery…) but which tests and tools give a project.json */
const INTERNAL_ID = /^_[A-Za-z0-9][A-Za-z0-9_-]*$/;

export type ProjectLookup =
  | { dir: string }
  | { error: 'invalid' }                  // not a project id (a path, a dot, a space…)
  | { error: 'missing' }                  // no projects/<id>/project.json
  | { error: 'case'; real: string };      // there is, under another spelling: `real` is the folder's own

/** projects/<id> when it is a project under exactly that spelling. `internal`: an `_`-prefixed id counts too (the command line
 *  runs on test projects such as _srv_test; the server never serves one). */
export function lookupProject(projectsDir: string, id: string, o: { internal?: boolean } = {}): ProjectLookup {
  if (!PROJECT_ID.test(id) && !(o.internal && INTERNAL_ID.test(id))) return { error: 'invalid' };
  const dir = join(projectsDir, id);
  if (!existsSync(join(dir, 'project.json'))) return { error: 'missing' };
  let real = id;
  try { real = basename(realpathSync.native(dir)); } catch { /* unreadable: as it was */ }
  if (real !== id && real.toLowerCase() === id.toLowerCase()) return { error: 'case', real };
  return { dir };
}

/** lookupProject's answer in the words the command line prints (its output is Chinese) */
export function projectLookupMessage(id: string, r: Exclude<ProjectLookup, { dir: string }>): string {
  if (r.error === 'invalid') return `「${id}」不是專案名稱（英文字母、數字、_ 和 -，不能用 _ 或 - 開頭）`;
  if (r.error === 'case') return `沒有專案「${id}」：資料夾叫「${r.real}」，大小寫要一樣（用 ${r.real}）`;
  return `沒有專案「${id}」（projects/${id}/project.json 不存在）`;
}

/** projects/<id> for a command line: throws with the message above when it is not a project under that spelling */
export function projectDirOf(projectsDir: string, id: string, o: { internal?: boolean } = {}): string {
  const r = lookupProject(projectsDir, id, o);
  if ('dir' in r) return r.dir;
  throw Object.assign(new Error(projectLookupMessage(id, r)), { code: r.error === 'case' ? 'EPROJECTCASE' : r.error === 'missing' ? 'ENOPROJECT' : 'EPROJECTID' });
}
