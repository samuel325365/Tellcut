// The editor's side of My blocks (spec 2026-10-29-my-library §3.2, §3.3): the save dialog's states and copying an entry in.
import { ApiError } from '../api.ts';
import { createStore, initialState } from '../store.ts';
import { LibraryFlow } from './library.ts';

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
