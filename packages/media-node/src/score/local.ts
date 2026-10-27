// Styles beyond the built-in five (toolkit phase 3), loaded from disk:
//   tellcut/score-library/*.js        the shared library: styles promoted from projects (npm run promote-style)
//   projects/<id>/score/*.js         one project's own styles, written when nothing in the library fits
// Each module default-exports a style (or an array of them): { id, label, doc, defaults: { bpm, key }, swing?, build(ctx), voices? }.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TELLCUT_ROOT } from '../paths.ts';
import { composeEvents, STYLES, type Style } from './styles.ts';
import { rng } from './synth.ts';
import { parseKey } from './theory.ts';

export const SCORE_LIBRARY = join(TELLCUT_ROOT, 'score-library');
export const projectStyleDir = (dir: string) => join(dir, 'score');

export interface StyleIssue { file: string; message: string }
export interface LoadedStyles { styles: Record<string, Style & { file: string }>; errors: StyleIssue[]; warnings: StyleIssue[] }

/** What is wrong with a style object, or undefined. `taken`: ids already in use. */
function problem(s: any, taken: Set<string>): string | undefined {
  if (typeof s?.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s.id)) return `id 必須是小寫英文開頭、只含小寫英數與連字號（收到 ${JSON.stringify(s?.id)}）`;
  if (taken.has(s.id)) return `id「${s.id}」已經有人用了（內建或另一個風格）`;
  if (typeof s.build !== 'function') return `${s.id} 缺 build(ctx)`;
  if (typeof s.label !== 'string' || !s.label) return `${s.id} 缺 label`;
  if (!(s.defaults?.bpm >= 40 && s.defaults.bpm <= 200)) return `${s.id} 的 defaults.bpm 要在 40–200 之間`;
  try { parseKey(String(s.defaults.key)); } catch (e) { return `${s.id} 的 defaults.key：${(e as Error).message}`; }
  if (s.scale !== undefined && !(Array.isArray(s.scale) && s.scale.includes(0) && s.scale.every((n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 12))) return `${s.id} 的 scale 必須是主音以上的半音數（0–11 的整數，含 0），例如希賈茲 [0, 1, 4, 5, 7, 8, 10]`;
  if (s.voices !== undefined && (typeof s.voices !== 'object' || Object.values(s.voices).some((v) => typeof v !== 'function'))) return `${s.id} 的 voices 必須是 { 名稱: 函式 }`;
  return undefined;
}

/** Same seed, same notes: a build that uses chance other than ctx.rng (or the clock) gives itself away here. */
function determinismProblem(s: Style): string | undefined {
  try {
    const once = () => JSON.stringify(composeEvents(s, { bpm: s.defaults.bpm, key: s.defaults.key, bars: 8, rng: rng(11) }));
    const a = once(), b = once();
    if (a !== b) return `${s.id} 同一個 seed 兩次產生的音符不一樣：build 裡只能用 ctx.rng 取隨機`;
    if (a === '[]') return `${s.id} 的 build 沒有產生任何音符`;
  } catch (e) { return `${s.id} 的 build 執行失敗：${(e as Error).message}`; }
  return undefined;
}

/** Load every style module in the folders given (later folders cannot reuse an id of an earlier one or of a built-in). */
export async function loadStyles(dirs: string[]): Promise<LoadedStyles> {
  const out: LoadedStyles = { styles: {}, errors: [], warnings: [] }, taken = new Set(Object.keys(STYLES));
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
      const file = join(dir, name);
      let mod: any;
      try { mod = await import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`); }
      catch (e) { out.errors.push({ file, message: `載入失敗：${(e as Error).message}` }); continue; }
      const list = Array.isArray(mod?.default) ? mod.default : [mod?.default];
      for (const s of list) {
        const bad = problem(s, taken) ?? determinismProblem({ swing: 0, ...s });
        if (bad) { out.errors.push({ file, message: bad }); continue; }
        taken.add(s.id);
        out.styles[s.id] = { swing: 0, ...s, file };
        if (!s.doc) out.warnings.push({ file, message: `${s.id} 沒有 doc（風格清單裡看不到它適合什麼）` });
      }
    }
  }
  return out;
}

/** The library plus, when given, one project's own styles. */
export const loadAllStyles = (projectDir?: string) => loadStyles([SCORE_LIBRARY, ...(projectDir ? [projectStyleDir(projectDir)] : [])]);
