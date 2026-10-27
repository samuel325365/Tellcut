// Project-local item types for Node tools (toolkit phase 2a): the modules in project.json `meta.fx`, imported from disk.
import { statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRegistry, loadFx, type FxResult, type Plugin, type Registry } from '@tellcut/engine';

/** Import the fx modules of the project in `dir` (paths relative to it; one that escapes the folder is refused). */
export function loadProjectFx(dir: string, paths: string[] | undefined): Promise<FxResult> {
  const root = resolve(dir);
  return loadFx(paths ?? [], async (p) => {
    const file = resolve(root, p);
    if (!file.startsWith(root + sep)) throw new Error(`${p} 在專案資料夾之外`);
    return import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`);   // the stamp keeps an edited file from coming out of Node's module cache
  });
}

/** The registry for one project: the shared plugins plus its own fx. Load problems come back in `fx`, never thrown. */
export async function projectRegistry(dir: string, plugins: Plugin[], project: { meta: { fx?: string[] } }): Promise<{ registry: Registry; fx: FxResult }> {
  const fx = await loadProjectFx(dir, project.meta.fx);
  return { registry: createRegistry(fx.plugin.items?.length || fx.plugin.sfx?.length ? [...plugins, fx.plugin] : plugins), fx };
}
