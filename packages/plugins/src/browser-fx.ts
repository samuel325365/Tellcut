// Project-local item types in the browser (toolkit phase 2a): the modules in project.json `meta.fx`, imported from the project folder.
import { createRegistry, loadFx, type FxResult, type Plugin, type Registry } from '@tellcut/engine';

/** `version` stamps the URL so an edited module is fetched again (a fresh page needs none); the server puts the same stamp on each
 *  relative import of the module it serves (apps/server projects.ts), so its helpers are fetched again too. A path that leaves the project's
 *  folder (another site, ../) is refused, as media-node's loadProjectFx refuses one outside it: an fx runs as this page. */
export function importFx(projectUrl: string, paths: string[] | undefined, version: number | string = ''): Promise<FxResult> {
  const folder = new URL('./', projectUrl).href;
  return loadFx(paths ?? [], async (p) => {
    const url = new URL(p, projectUrl).href;
    if (!url.startsWith(folder)) throw new Error(`${p} 在專案資料夾之外`);
    return import(/* @vite-ignore */ `${url}?v=${version}`);
  });
}

/** The shared plugins plus the project's own fx. */
export function registryWith(plugins: Plugin[], fx: FxResult): Registry {
  return createRegistry(fx.plugin.items?.length || fx.plugin.sfx?.length ? [...plugins, fx.plugin] : plugins);
}
