import { render } from 'preact';
import './styles.css';
import { createRegistry } from '@tellcut/engine';
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

const q = new URLSearchParams(location.search), id = q.get('id');
const root = document.getElementById('app')!;
initDocumentLang();
// one tooltip layer for data-tip, on every page
const tipRoot = document.createElement('div');
document.body.appendChild(tipRoot);
render(<TooltipLayer />, tipRoot);
if (q.has('gallery')) {
  // the block gallery (spec 2026-10-17-block-gallery)
  render(<Gallery load={api.gallery} library={{ load: api.library, renameBlock: api.renameLibraryBlock, renameStyle: api.renameLibraryStyle, usage: api.libraryUsage, remove: api.deleteLibrary }} />, root);
} else if (!id) {
  // no project chosen: the home page — projects and the home chat (spec 2026-10-16-in-editor-chat §2.1)
  render(<Home api={api as any} />, root);
} else {
  const bridge = new PlayerBridge(location.origin);
  const editor = new Editor(id, { api, bridge, registry: createRegistry(plugins), registryFor: async (p) => registryWith(plugins, await importFx(new URL(`/api/projects/${encodeURIComponent(id)}/files/project.json`, location.href).href, p.meta.fx, Date.now())) });
  render(<App editor={editor} bridge={bridge} />, root);
  addEventListener('beforeunload', (e) => { if (editor.store.get().save !== 'saved') e.preventDefault(); });
}
