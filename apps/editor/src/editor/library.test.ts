// The editor's side of My blocks (spec 2026-10-29-my-library §3.2, §3.3): the save dialog's states and copying an entry in.
import { ApiError } from '../api.ts';
import { createStore, initialState } from '../store.ts';
import { LibraryFlow, liveLinks } from './library.ts';

const PREVIEW = { dry: true as const, files: ['fx/chalk.js', 'media/fonts/Chalk.ttf'], skipped: [], group: ['fx.chalk-line'], conflict: null };

function flow(over: Record<string, any> = {}) {
  const calls: any[] = [], sent: any[] = [], layouts: any[] = [];
  const api: any = {
    library: async () => { calls.push(['library']); return { blocks: [], styles: [] }; },
    projectLibrary: async () => { calls.push(['project']); return { links: [], savedFiles: [], savedStyles: [], styles: [] }; },
    saveBlockPreview: async (b: any) => { calls.push(['dry', b]); return PREVIEW; },
    saveBlock: async (b: any) => { calls.push(['save', b]); return { entry: { slug: 'chalk-title' }, skipped: [] }; },
    saveStyle: async (b: any) => { calls.push(['style', b]); return { entry: { slug: 'jazz' } }; },
    useLibrary: async (_id: string, b: any) => { calls.push(['use', b]); return { file: 'fx/lib/chalk-title/chalk.js', types: ['fx.chalk-title'], copied: [] }; },
    ...over,
  };
  const store = createStore(initialState('p1'));
  const chat: any = { state: { running: false }, send: async (...a: any[]) => { sent.push(a); } };
  const f = new LibraryFlow({ id: 'p1', api, store, chat, setLayout: (l) => layouts.push(l) });
  return { f, store, calls, sent, layouts, s: () => store.get().library };
}

test('opening the dialog fills it from the block and asks what would be saved with it', async () => {
  const { f, s, calls } = flow();
  await f.openBlock('fx.chalk-title', { name: 'Chalk', desc: 'd', category: 'text' });
  expect(s().saving).toMatchObject({ kind: 'block', target: 'fx.chalk-title', name: 'Chalk', desc: 'd', category: 'text', generalize: false, preview: PREVIEW, conflict: null });
  expect(calls).toContainEqual(['dry', { project: 'p1', type: 'fx.chalk-title' }]);
});

test('a 409 shows the conflict, and keep-both sends again with onConflict', async () => {
  let n = 0;
  const { f, s, calls } = flow({ saveBlock: async (b: any) => {
    calls.push(['save', b]);
    if (n++ === 0) throw new ApiError(409, 'x', [], 'library.conflict', { name: '粉筆' });
    return { entry: { slug: 'chalk-title-2' }, skipped: [] };
  } });
  await f.openBlock('fx.chalk-title', { name: 'Chalk', desc: '' });
  expect(await f.save()).toBe(false);
  expect(s().saving?.conflict).toBe('粉筆');
  expect(await f.save('keep-both')).toBe(true);
  expect(calls.filter((c) => c[0] === 'save').map((c) => c[1].onConflict)).toEqual([undefined, 'keep-both']);
  expect(s().saving).toBeNull();
  expect(s().toast).toMatchObject({ name: 'Chalk' });
  expect(calls.filter((c) => c[0] === 'library')).toHaveLength(1);   // reloaded after the save
});

test('make generic sends a chat task instead of saving, and opens the chat', async () => {
  const { f, s, calls, sent, layouts } = flow();
  await f.openBlock('fx.chalk-title', { name: 'Chalk', desc: 'd' });
  f.patch({ generalize: true, category: 'text' });
  expect(await f.save()).toBe(true);
  expect(calls.some((c) => c[0] === 'save')).toBe(false);
  expect(sent[0][2]).toEqual({ kind: 'library-save', type: 'fx.chalk-title', name: 'Chalk', desc: 'd', category: 'text' });
  expect(sent[0][0]).toContain('Chalk');
  expect(layouts).toContainEqual({ sideTab: 'chat', libClosed: false });
  expect(s().saving).toBeNull();
});

test('a style is saved by its id', async () => {
  const { f, calls } = flow();
  f.openStyle('street-jazz', '街頭爵士');
  expect(await f.save()).toBe(true);
  expect(calls).toContainEqual(['style', { project: 'p1', id: 'street-jazz', name: '街頭爵士', desc: '' }]);
});

test('use copies the entry in and reloads what the project has from the library', async () => {
  const { f, calls } = flow();
  expect(await f.use('chalk-title')).toMatchObject({ file: 'fx/lib/chalk-title/chalk.js' });
  expect(calls.slice(-2)).toEqual([['use', { slug: 'chalk-title' }], ['project']]);
});

test('a copy counts as linked only while meta.fx loads it (an undone or failed add leaves the copy, not the link)', () => {
  const link = (slug: string) => ({ slug, file: `fx/lib/${slug}/_entry.js`, types: [`fx.${slug}`], outdated: false, gone: false });
  const s: any = { project: { meta: { fx: ['fx/own.js', 'fx/lib/box/_entry.js'] } }, library: { project: { links: [link('box'), link('chalk')] } } };
  expect(liveLinks(s).map((l) => l.slug)).toEqual(['box']);
  expect(liveLinks({ project: null, library: { project: null } } as any)).toEqual([]);
});

test('my caption and title templates: listed from the library, which is fetched again after a save or a delete (a failed one too)', async () => {
  let index: any = { blocks: [], styles: [], captions: [{ slug: 'pink', name: 'Pink', desc: '', params: { style: 'neon' }, savedAt: '' }], titles: [] };
  const { f, calls } = flow({
    library: async () => { calls.push(['library']); return index; },
    saveCaption: async (b: any, shelf: string) => { calls.push(['saveCaption', b, shelf]); index = { ...index, titles: [{ slug: 'gold', name: 'Gold', desc: '', params: b.params, savedAt: '' }] }; return { entry: { slug: 'gold' } }; },
    deleteLibrary: async (kind: string, slug: string) => { calls.push(['delete', kind, slug]); throw new ApiError(404, 'x', [], 'library.noTitle'); },
  });
  await f.load();
  expect(f.templates('caption').map((m) => m.slug)).toEqual(['pink']);
  expect(f.templates('title')).toEqual([]);
  calls.length = 0;
  await f.saveTemplate('title', { name: 'Gold', params: { style: 'gold' } });
  expect(calls).toEqual([['saveCaption', { name: 'Gold', params: { style: 'gold' } }, 'titles'], ['library']]);
  expect(f.templates('title').map((m) => m.slug)).toEqual(['gold']);
  calls.length = 0;
  await expect(f.deleteTemplate('title', 'gold')).rejects.toMatchObject({ code: 'library.noTitle' });
  expect(calls).toEqual([['delete', 'titles', 'gold'], ['library']]);
});

test('the built-in templates’ pictures are the gallery’s, asked for once (again after a failure)', async () => {
  let n = 0;
  const { f, s } = flow({ gallery: async () => { if (n++ === 0) throw new Error('down'); return { captions: [{ id: 'clean', thumb: '/t/tpl-clean.png' }, { id: 'none' }], titles: [{ id: 'doc', thumb: '/t/ttl-doc.png' }] }; } });
  await f.loadTemplateThumbs();
  expect(s().templateThumbs).toBeNull();
  await f.loadTemplateThumbs();
  await f.loadTemplateThumbs();
  expect(n).toBe(2);
  expect(s().templateThumbs).toEqual({ caption: { clean: '/t/tpl-clean.png' }, title: { doc: '/t/ttl-doc.png' } });
});

test('the shared blocks’ pictures (for the media panel’s Effects page) are the gallery’s, asked for once (again after a failure)', async () => {
  let n = 0;
  const { f, s } = flow({ gallery: async () => { if (n++ === 0) throw new Error('down'); return { blocks: [{ type: 'common.paper', thumb: '/api/gallery/thumb/paper.png' }, { type: 'core.text' }], sfx: [], styles: [], recipes: [] }; } });
  await f.loadBlockThumbs();
  expect(s().blockThumbs).toBeNull();
  await f.loadBlockThumbs();
  await f.loadBlockThumbs();
  expect(n).toBe(2);
  expect(s().blockThumbs).toEqual({ 'common.paper': '/api/gallery/thumb/paper.png' });
});
