// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ImportDialog } from './ImportDialog.tsx';
import { setLang } from './i18n/lang.ts';
import { DICTS, t } from './i18n/index.ts';

afterEach(() => { localStorage.clear(); setLang('zh'); localStorage.clear(); });

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
function fakeFs() {
  const asked: string[] = [];
  const folders: Record<string, any> = {
    'C:\\Users\\u\\Videos': { path: 'C:\\Users\\u\\Videos', parent: 'C:\\Users\\u', entries: [
      { name: '京都', kind: 'dir' }, { name: 'a.mp4', kind: 'video', size: 2_500_000 }, { name: 'notes.txt', kind: 'other', size: 10 }] },
    'C:\\Users\\u\\Videos\\京都': { path: 'C:\\Users\\u\\Videos\\京都', parent: 'C:\\Users\\u\\Videos', entries: [{ name: 'b.jpg', kind: 'image', size: 900 }] },
    'D:\\clips': { path: 'D:\\clips', parent: 'D:\\', entries: [] },
  };
  return {
    asked,
    places: async () => ({ places: [{ label: '影片', path: 'C:\\Users\\u\\Videos', kind: 'home' }, { label: '本機磁碟 D:', path: '/D', kind: 'drive' }] }),
    fsList: async (p: string) => { asked.push(p); if (!folders[p]) throw new Error(`找不到 ${p}`); return folders[p]; },
  };
}

test('a path typed while the first place is still loading wins (a late answer never replaces it)', async () => {
  const api: any = {
    places: async () => ({ places: [{ label: '桌面', path: 'C:\\Users\\u\\Desktop', kind: 'home' }] }),
    fsList: (p: string) => new Promise((res) => setTimeout(() => res({ path: p, parent: null, entries: [] }), p.endsWith('Desktop') ? 80 : 5)),
  };
  const added: any[] = [], root = document.createElement('div');
  await act(() => render(<ImportDialog api={api} onAdd={(a) => added.push(...a)} onClose={() => {}} />, root));
  await tick();
  const box = root.querySelector<HTMLInputElement>('[data-path]')!;
  await act(() => { box.value = 'D:\\mine'; box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  await act(() => { (root.querySelector('[data-pick-folder]') as HTMLElement).click(); });   // one click adds it
  expect(added.map((a) => a.path)).toEqual(['D:\\mine']);
});

test('a path typed before the list of places has come stays: the first place is not opened over it', async () => {
  let placesCame = (_: unknown) => {};
  const api: any = {
    places: () => new Promise((res) => { placesCame = res; }),
    fsList: async (p: string) => ({ path: p, parent: null, entries: [{ name: 'beat.wav', kind: 'audio', size: 1000 }] }),
  };
  const root = document.createElement('div');
  await act(() => render(<ImportDialog api={api} onAdd={() => {}} onClose={() => {}} />, root));
  const box = root.querySelector<HTMLInputElement>('[data-path]')!;
  await act(() => { box.value = 'D:\\more'; box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await tick();
  await act(async () => { placesCame({ places: [{ label: '桌面', path: 'C:\\Users\\u\\Desktop', kind: 'home' }] }); }); await tick();
  expect(box.value).toBe('D:\\more');
  expect([...root.querySelectorAll<HTMLElement>('[data-entry]')].map((r) => r.dataset.entry)).toEqual(['beat.wav']);
  expect(root.querySelectorAll('[data-place]').length).toBe(1);   // the places are still listed
});

test('what the user is typing is never replaced by the first place arriving before they press Enter', async () => {
  const api: any = {
    places: async () => ({ places: [{ label: '桌面', path: 'C:\\Users\\u\\Desktop', kind: 'home' }] }),
    fsList: (p: string) => new Promise((res) => setTimeout(() => res({ path: p, parent: null, entries: [] }), p.endsWith('Desktop') ? 40 : 5)),
  };
  const added: any[] = [], root = document.createElement('div');
  await act(() => render(<ImportDialog api={api} onAdd={(a) => added.push(...a)} onClose={() => {}} />, root));
  await tick();
  const box = root.querySelector<HTMLInputElement>('[data-path]')!;
  await act(() => { box.value = 'D:\\mine'; box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });   // the desktop arrives while the path sits in the box
  expect(box.value).toBe('D:\\mine');
  await act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  await act(() => { (root.querySelector('[data-pick-folder]') as HTMLElement).click(); });
  expect(added.map((a) => a.path)).toEqual(['D:\\mine']);
});

test('"add this folder" never adds a folder the box doesn\u2019t show: the first place arriving after the user typed is dropped', async () => {
  const api: any = {
    places: async () => ({ places: [{ label: '桌面', path: 'C:\\Users\\u\\Desktop', kind: 'home' }] }),
    fsList: (p: string) => new Promise((res) => setTimeout(() => res({ path: p, parent: null, entries: [] }), p.endsWith('Desktop') ? 40 : 5)),
  };
  const added: any[] = [], root = document.createElement('div');
  await act(() => render(<ImportDialog api={api} onAdd={(a) => added.push(...a)} onClose={() => {}} />, root));
  await tick();
  const box = root.querySelector<HTMLInputElement>('[data-path]')!;
  await act(() => { box.value = 'D:\\mine'; box.dispatchEvent(new Event('input', { bubbles: true })); });   // typed, Enter not pressed
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });   // the desktop's answer comes meanwhile
  const pick = root.querySelector<HTMLButtonElement>('[data-pick-folder]')!;
  expect(box.value).toBe('D:\\mine');
  expect(pick.disabled).toBe(true);   // no folder is open: nothing the box doesn't show can go in
  await act(() => { pick.click(); });
  expect(added).toEqual([]);
});

test('a path being typed when the places arrive is not replaced by the first place', async () => {
  const api: any = {
    places: () => new Promise((res) => setTimeout(() => res({ places: [{ label: '桌面', path: 'C:\\Users\\u\\Desktop', kind: 'home' }] }), 20)),
    fsList: (p: string) => new Promise((res) => setTimeout(() => res({ path: p, parent: null, entries: [] }), 5)),
  };
  const root = document.createElement('div');
  await act(() => render(<ImportDialog api={api} onAdd={() => {}} onClose={() => {}} />, root));
  const box = root.querySelector<HTMLInputElement>('[data-path]')!;
  await act(() => { box.value = 'D:\\mine'; box.dispatchEvent(new Event('input', { bubbles: true })); });   // typed, Enter not yet pressed
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  expect(box.value).toBe('D:\\mine');
});

test('the import browser: places, folders, picking files, jumping to a pasted path; the whole folder is added in one click', async () => {
  const api = fakeFs(), added: any[] = [];
  let closed = false;
  const root = document.createElement('div');
  await act(() => render(<ImportDialog api={api as any} onAdd={(a) => added.push(...a)} onClose={() => { closed = true; }} />, root));
  await tick();
  expect([...root.querySelectorAll('[data-place]')].map((x) => x.textContent)).toEqual(['影片', '本機磁碟 D:']);
  expect(api.asked[0]).toBe('C:\\Users\\u\\Videos');                       // opens on the first place
  const rows = () => [...root.querySelectorAll<HTMLElement>('[data-entry]')];
  expect(rows().map((r) => r.dataset.entry)).toEqual(['京都', 'a.mp4', 'notes.txt']);
  expect(rows()[2].querySelector('input')!.disabled).toBe(true);             // not media: cannot be picked
  await act(() => { rows()[1].querySelector('input')!.click(); });
  expect(root.querySelector('[data-add]')!.textContent).toContain('加入 1 項');
  const box = root.querySelector<HTMLInputElement>('[data-path]')!;
  await act(() => { box.value = 'Z:\\nowhere'; box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await tick();
  expect(root.textContent).toContain('找不到 Z:\\nowhere');
  await act(() => { box.value = 'C:\\Users\\u\\Videos\\京都'; box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await tick();
  expect(api.asked.at(-1)).toBe('C:\\Users\\u\\Videos\\京都');
  // one click: this folder (and what was ticked before) goes in, the dialog closes
  const pick = root.querySelector<HTMLElement>('[data-pick-folder]')!;
  expect(pick.textContent).toBe('加入這整個資料夾');
  await act(() => { pick.click(); });
  expect(added).toEqual([
    { path: 'C:\\Users\\u\\Videos\\a.mp4', name: 'a.mp4', kind: 'video' },
    { path: 'C:\\Users\\u\\Videos\\京都', name: '京都', kind: 'dir' },
  ]);
  expect(closed).toBe(true);
});

test('the title and buttons are English on the editor surface; explanations follow the language', async () => {
  const root = document.createElement('div');
  setLang('ja');
  await act(() => render(<ImportDialog api={fakeFs()} surface="editor" onAdd={() => {}} onClose={() => {}} />, root));
  await tick();
  expect(root.querySelector('h3')!.textContent).toBe(DICTS.en['import.title']);
  expect(root.querySelector('[data-add]')!.textContent).toBe(t('import.add', { n: 0 }, 'en'));
  expect(root.querySelector('footer .hint')!.textContent).toBe(DICTS.ja['import.hint']);
  expect(root.querySelector('[data-path]')!.getAttribute('placeholder')).toBe(DICTS.ja['import.pathPh']);
  await act(() => render(<ImportDialog api={fakeFs()} onAdd={() => {}} onClose={() => {}} />, root));
  expect(root.querySelector('h3')!.textContent).toBe(DICTS.ja['import.title']);
  setLang('zh');
});

test('places are worded in the UI language from the server code, not from the Chinese label', async () => {
  setLang('en');
  const api: any = {
    places: async () => ({ places: [
      { key: 'desktop', label: '桌面', path: '/u/Desktop', kind: 'home' }, { key: 'sources', label: '素材資料夾（sources）', path: '/t/sources', kind: 'repo' },
      { key: 'drive', drive: 'D', label: '本機磁碟 D:', path: '/D', kind: 'drive' }, { key: 'root', label: '根目錄', path: '/', kind: 'drive' },
      { label: '舊的', path: '/old', kind: 'home' }] }),
    fsList: async (p: string) => ({ path: p, parent: null, entries: [] }),
  };
  const root = document.createElement('div');
  await act(() => render(<ImportDialog api={api} onAdd={() => {}} onClose={() => {}} />, root));
  await tick();
  const names = [...root.querySelectorAll('[data-place]')].map((x) => x.textContent);
  expect(names.slice(0, 4)).toEqual(['Desktop', 'Sources folder', 'Local disk D:', 'Root']);
  expect(names[4]).toBe('舊的');     // an old server without a code: its own label
});
