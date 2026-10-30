// Project-local item types for Node tools (toolkit phase 2a): the modules in project.json `meta.fx`, imported from disk.
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRegistry, loadFx, type FxResult, type Plugin, type Registry } from '@tellcut/engine';

/** the query that stamps a load of a project's fx (not `?v=`: vitest's module ids drop that one, see library/save.ts) */
const STAMP = 'fxv';
const STAMPED = new RegExp(`[?&]${STAMP}=([^&#]+)`);
// a module's relative imports (./util.js) carry its stamp on: Node caches a module by its URL, so with the stamp on the entry
// file alone an edited helper kept coming out of the long-running server's cache (export prep, the fxErrors check)
registerHooks({
  resolve(spec, ctx, next) {
    const r = next(spec, ctx), m = ctx.parentURL ? STAMPED.exec(ctx.parentURL) : null;
    if (!m || !/^\.{1,2}\//.test(spec) || !r.url.startsWith('file:') || STAMPED.test(r.url)) return r;
    return { ...r, url: `${r.url}${r.url.includes('?') ? '&' : '?'}${STAMP}=${m[1]}` };
  },
});

/** a module's relative imports and re-exports (`from './x.js'`, `import('./x.js')`, `import './x.js'`): group 1 is the specifier */
export const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"\n]+)['"]/g;
/** `query` (`key=value`) added to each relative import of a module's source: what the server does for the browser, which has no
 *  resolve hook, so a page that imports a project's fx again with a new `?v=` gets its helpers afresh too (projects.ts) */
export const withImportQuery = (src: string, query: string) =>
  src.replace(RELATIVE_IMPORT, (m, spec: string) => m.replace(spec, () => `${spec}${spec.includes('?') ? '&' : '?'}${query}`));

/** what the project's fx/ files are now (path, size, time): any edit there gives the whole module graph a new URL */
function fxState(root: string): string {
  const h = createHash('sha1');
  const walk = (d: string) => {
    let es;
    try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.m?js$/i.test(e.name)) try { const st = statSync(f); h.update(`${f}|${st.size}|${st.mtimeMs}\n`); } catch { /* gone meanwhile */ }
    }
  };
  walk(join(root, 'fx'));
  return h.digest('hex').slice(0, 12);
}

/** Import the fx modules of the project in `dir` (paths relative to it; one that escapes the folder is refused). */
export function loadProjectFx(dir: string, paths: string[] | undefined): Promise<FxResult> {
  const root = resolve(dir), state = paths?.length ? fxState(root) : '';
  return loadFx(paths ?? [], async (p) => {
    const file = resolve(root, p);
    if (!file.startsWith(root + sep)) throw new Error(`${p} 在專案資料夾之外`);
    // the entry's own time too: meta.fx may name a file outside fx/
    return import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}&${STAMP}=${state}`);
  });
}

/** The registry for one project: the shared plugins plus its own fx. Load problems come back in `fx`, never thrown. */
export async function projectRegistry(dir: string, plugins: Plugin[], project: { meta: { fx?: string[] } }): Promise<{ registry: Registry; fx: FxResult }> {
  const fx = await loadProjectFx(dir, project.meta.fx);
  return { registry: createRegistry(fx.plugin.items?.length || fx.plugin.sfx?.length ? [...plugins, fx.plugin] : plugins), fx };
}
