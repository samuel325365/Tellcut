import { render } from 'preact';
import './styles.css';
import { createRegistry, parseProject } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { importFx, registryWith } from '@tellcut/plugins/browser-fx';
import { api } from './api.ts';
import { App } from './App.tsx';
import { Editor } from './editor.ts';
import { PlayerBridge } from './bridge.ts';
import { Home } from './Home.tsx';
import { Gallery } from './Gallery.tsx';
import { TooltipLayer } from './Tooltip.tsx';
import { initDocumentLang } from './i18n/lang.ts';
import { answerGallery, askEditor } from './gallery-link.ts';
import { ownBlocks } from './gallery.ts';

const q = new URLSearchParams(location.search), id = q.get('id');
const root = document.getElementById('app')!;
initDocumentLang();
// one tooltip layer for data-tip, on every page
const tipRoot = document.createElement('div');
document.body.appendChild(tipRoot);
render(<TooltipLayer />, tipRoot);
/** a project's own modules, from its folder (`version`: a fresh fetch of an edited one) */
const projectFx = (pid: string, paths: string[] | undefined) => importFx(new URL(`/api/projects/${encodeURIComponent(pid)}/files/project.json`, location.href).href, paths, Date.now());
if (q.has('gallery')) {
  // the block gallery (spec 2026-10-17-block-gallery); opened from a project's editor (?gallery&project=<id>) it also lists that
  // project's own blocks and adds to it through the editor tab that opened it (gallery-link.ts)
  const pid = q.get('project');
  const project = pid ? { id: pid, add: (a: Parameters<typeof askEditor>[2]) => askEditor(window.opener as Window | null, pid, a), load: async () => {
    const p = parseProject(await api.project(pid)), fx = await projectFx(pid, p.meta.fx);
    return { name: p.meta.name, blocks: ownBlocks(fx.plugin.items ?? []), meta: { plugins: p.meta.plugins, fx: p.meta.fx, theme: p.meta.theme as Record<string, unknown> | undefined } };
  } } : undefined;
  render(<Gallery load={api.gallery} project={project} library={{ load: api.library, renameBlock: api.renameLibraryBlock, renameStyle: api.renameLibraryStyle, usage: api.libraryUsage, remove: api.deleteLibrary }} />, root);
} else if (!id) {
  // no project chosen: the home page — projects and the home chat (spec 2026-10-16-in-editor-chat §2.1)
  render(<Home api={api as any} />, root);
} else {
  const bridge = new PlayerBridge(location.origin);
  const editor = new Editor(id, { api, bridge, registry: createRegistry(plugins), registryFor: async (p) => registryWith(plugins, await projectFx(id, p.meta.fx)) });
  render(<App editor={editor} bridge={bridge} />, root);
  answerGallery(editor);   // "Add to project" from a gallery this tab opened
  addEventListener('beforeunload', (e) => { if (editor.store.get().save !== 'saved') e.preventDefault(); });
}
