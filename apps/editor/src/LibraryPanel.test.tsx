// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { createStore, initialState } from './store.ts';
import { LibraryPanel } from './LibraryPanel.tsx';
import { t } from './i18n/index.ts';

test('lists sources with their scene segments, every sound effect and block; click picks, double-click auditions, the button adds', async () => {
  const p = fixture();
  p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 't1', type: 'x.title', start: 0, end: 1, params: {} }] } as any);
  const store = createStore({ ...initialState('t'), project: p, cuts: { s: [12.5] }, peaks: { 'media:m': { rate: 100, peaks: new Array(6000).fill(0) } } });
  const calls: any[] = [];
  const types = [{ type: 'core.flash', label: '閃白', kind: 'overlay' }, { type: 'x.title', label: '標題', kind: 'overlay', unique: true }, { type: 'y.other', label: '別的', kind: 'overlay' }, { type: 'x.block', label: '區塊', kind: 'scene' }];
  const registry = {
    itemTypes: () => types, item: (t: string) => types.find((x) => x.type === t),
    sfxTypes: () => [{ type: 'x.tap', label: '點' }, { type: 'y.boom', label: '爆' }],
  };
  const editor: any = { store, registry, audition: (m: any) => calls.push(['audition', m]), addMaterial: (m: any) => calls.push(['add', m]) };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={editor} s={store.get()} />, root));
  // meta.plugins (empty in every real project) no longer hides anything
  expect([...root.querySelectorAll('[data-add-sfx]')].map((e) => (e as HTMLElement).dataset.addSfx)).toEqual(['x.tap', 'y.boom']);
  expect([...root.querySelectorAll('[data-add-overlay]')].map((e) => (e as HTMLElement).dataset.addOverlay)).toEqual(['core.flash', 'x.title', 'y.other', 'x.block']);
  const segs = [...root.querySelectorAll<HTMLElement>('[data-add-source="s"]')];
  expect(segs.map((e) => e.dataset.range)).toEqual(['0-12.5', '12.5-30']);
  const music = root.querySelector<HTMLElement>('[data-add-music="m"]')!;
  expect(music.textContent).toContain('1:00');
  const add = root.querySelector<HTMLButtonElement>('[data-add-picked]')!;
  expect(add.disabled).toBe(true);                       // nothing picked yet
  // a click only picks (a double-click must not add twice); the button adds what is picked
  await act(() => { segs[1].click(); });
  expect([segs[1].classList.contains('picked'), add.disabled, calls]).toEqual([true, false, []]);
  await act(() => { add.click(); });
  // a double-click auditions
  await act(() => { music.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  expect([music.classList.contains('picked'), segs[1].classList.contains('picked')]).toEqual([true, false]);
  expect([music.classList.contains('lib-item'), segs[0].classList.contains('seg')]).toEqual([true, true]);
  await act(() => { (root.querySelector('[data-add-sfx="x.tap"]') as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  const title = root.querySelector<HTMLButtonElement>('[data-add-overlay="x.title"]')!;
  expect([title.disabled, title.dataset.tip]).toEqual([true, '「標題」在專案裡只能有一個']);
  await act(() => { (root.querySelector('[data-add-overlay="core.flash"]') as HTMLElement).click(); });
  await act(() => { add.click(); });
  expect(calls).toEqual([['add', { kind: 'clip', source: 's', from: 12.5, len: 17.5 }], ['audition', { kind: 'music', media: 'm' }],
    ['audition', { kind: 'sfx', type: 'x.tap' }], ['add', { kind: 'overlay', type: 'core.flash' }]]);
});
test('a pick that is no longer in the library (segments re-cut by the analysis) cannot be added', async () => {
  const store = createStore({ ...initialState('t'), project: fixture(), cuts: { s: [12.5] } });
  const calls: any[] = [];
  const editor: any = { store, registry: { itemTypes: () => [], item: () => undefined, sfxTypes: () => [] }, audition() {}, addMaterial: (m: any) => calls.push(m) };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={editor} s={store.get()} />, root));
  await act(() => { root.querySelector<HTMLElement>('[data-add-source="s"][data-range="12.5-30"]')!.click(); });
  expect(root.querySelector<HTMLButtonElement>('[data-add-picked]')!.disabled).toBe(false);
  await act(() => render(<LibraryPanel editor={editor} s={{ ...store.get(), cuts: { s: [10] } }} />, root));
  expect(root.querySelector<HTMLButtonElement>('[data-add-picked]')!.disabled).toBe(true);
});
test('segments show a thumbnail (once analysed) and their length, so two that start in the same second differ', async () => {
  const thumbs = { s: { interval: 1, width: 160, height: 90, cols: 10, count: 30, url: '/t.jpg' } };
  const store = createStore({ ...initialState('t'), project: fixture(), cuts: { s: [12.5] }, thumbs });
  const editor: any = { store, registry: { itemTypes: () => [], item: () => undefined, sfxTypes: () => [] }, audition() {}, addMaterial() {} };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={editor} s={store.get()} />, root));
  const segs = [...root.querySelectorAll<HTMLElement>('[data-add-source="s"]')];
  expect(segs.map((e) => e.textContent)).toEqual(['0:0012.5s', '0:1217.5s']);
  expect(segs[1].querySelector<HTMLElement>('.seg-thumb')!.style.backgroundImage).toContain('/t.jpg');
});
test('a photo is one Photo entry; music shows its tempo', async () => {
  const p: any = fixture(); p.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' };
  const store = createStore({ ...initialState('t'), project: p, beats: { m: { bpm: 120, offset: 0, beats: [] } } });
  const editor: any = { store, registry: { itemTypes: () => [], item: () => undefined, sfxTypes: () => [] }, audition() {}, addMaterial() {} };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={editor} s={store.get()} />, root));
  expect([...root.querySelectorAll<HTMLElement>('[data-add-source="ph"]')].map((e) => e.textContent)).toEqual(['Photo']);
  expect(root.querySelector('[data-add-music="m"]')!.textContent).toContain('120 BPM');
});

test('blocks come in groups (this project, built-in, the shared categories); the search narrows them and opens the groups', async () => {
  const store = createStore({ ...initialState('t'), project: fixture() });
  const types = [{ type: 'common.slam', label: '大字', kind: 'overlay', category: 'text', doc: '一個字砸進畫面' }, { type: 'core.flash', label: '閃白', kind: 'overlay' },
    { type: 'fx.mine', label: '我的特效', kind: 'overlay' }, { type: 'common.paper', label: '紙', kind: 'scene', category: 'look' }];
  const editor: any = { store, registry: { itemTypes: () => types, item: (t: string) => types.find((x) => x.type === t), sfxTypes: () => [] } };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={editor} s={store.get()} />, root));
  const groups = () => [...root.querySelectorAll<HTMLDetailsElement>('[data-lib-group^="block:"]')].map((d) => [d.dataset.libGroup, d.open]);
  expect(groups()).toEqual([['block:fx', true], ['block:core', true], ['block:text', false], ['block:look', false]]);
  const search = root.querySelector<HTMLInputElement>('[data-lib-search]')!;
  await act(() => { search.value = '砸進'; search.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(groups()).toEqual([['block:text', true]]);
});

test('replace: a picked block takes the place of the selected one of the same kind; a background can only replace', async () => {
  const p: any = fixture();
  p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'a', type: 'core.flash', start: 0, end: 1, params: {} }, { id: 'bg', type: 'x.paper', start: 0, end: 1, params: {} }] });
  const types = [{ type: 'core.flash', label: '閃白', kind: 'overlay', params: [] }, { type: 'x.slam', label: '大字', kind: 'overlay', params: [] }, { type: 'x.paper', label: '紙', kind: 'scene', params: [] }];
  const store = createStore({ ...initialState('t'), project: p, selection: ['a'] });
  const calls: any[] = [];
  const editor: any = { store, registry: { itemTypes: () => types, item: (t: string) => types.find((x) => x.type === t), sfx: () => undefined, sfxTypes: () => [] },
    audition() {}, addMaterial: (m: any) => calls.push(['add', m]), replaceBlock: (id: string, type: string) => calls.push(['replace', id, type]) };
  const root = document.createElement('div');
  const draw = (s = store.get()) => act(() => render(<LibraryPanel editor={editor} s={s} />, root));
  await draw();
  const swap = () => root.querySelector<HTMLButtonElement>('[data-replace-picked]')!, add = () => root.querySelector<HTMLButtonElement>('[data-add-picked]')!;
  expect(swap().disabled).toBe(true);
  await act(() => { root.querySelector<HTMLElement>('[data-add-overlay="x.slam"]')!.click(); });
  await act(() => { swap().click(); });
  // the background: it cannot be added, and cannot replace an overlay, only a background
  await act(() => { root.querySelector<HTMLElement>('[data-add-overlay="x.paper"]')!.click(); });
  expect([add().disabled, swap().disabled]).toEqual([true, true]);
  await draw({ ...store.get(), selection: ['bg'] });
  expect(swap().disabled).toBe(true);           // already this one
  expect(calls).toEqual([['replace', 'a', 'x.slam']]);
});

test('block names in the library are English labels in every language; a project block keeps its own name', async () => {
  const p = fixture();
  p.meta.plugins = ['fx'];
  const store = createStore({ ...initialState('t'), project: p });
  const types = [{ type: 'core.flash', label: '閃白', kind: 'overlay', doc: '' }, { type: 'fx.mine', label: '我的特效', kind: 'overlay' }];
  const editor: any = { store, registry: { itemTypes: () => types, item: (t: string) => types.find((x) => x.type === t), sfxTypes: () => [] } };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={editor} s={store.get()} />, root));
  expect(root.querySelector('[data-add-overlay="core.flash"]')!.textContent).toBe('Flash');
  expect(root.querySelector('[data-add-overlay="fx.mine"]')!.textContent).toBe('我的特效');
});

test('the Import button shows only when this PC can be browsed; it opens the file browser, and the note shows progress and the result', async () => {
  const p = fixture();
  const store = createStore({ ...initialState('t'), project: p });
  const registry = { itemTypes: () => [], item: () => undefined, sfxTypes: () => [] };
  const root = document.createElement('div');
  await act(() => render(<LibraryPanel editor={{ store, registry }} s={store.get()} />, root));
  expect(root.querySelector('[data-import-media]')).toBeNull();
  const fs = { places: async () => ({ places: [] }), fsList: async () => ({ path: 'C:/', parent: null, entries: [] }) };
  await act(() => render(<LibraryPanel editor={{ store, registry, fs }} s={{ ...store.get(), importing: { done: 1, total: 3 } }} />, root));
  const button = root.querySelector<HTMLButtonElement>('[data-import-media]')!;
  expect([button.disabled, root.querySelector('[data-import-note]')!.textContent]).toEqual([true, t('ed.importing', { done: 1, total: 3 })]);
  await act(() => render(<LibraryPanel editor={{ store, registry, fs }} s={{ ...store.get(), importNote: 'Added 2 files.' }} />, root));
  expect(root.querySelector('[data-import-note]')!.textContent).toBe('Added 2 files.');
  await act(() => { root.querySelector<HTMLButtonElement>('[data-import-media]')!.click(); });
  expect(root.querySelector('[data-import]')).not.toBeNull();
});
