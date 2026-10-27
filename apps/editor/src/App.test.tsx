// @vitest-environment jsdom
import { options, render } from 'preact';
import { act } from 'preact/test-utils';
import { parseProject } from '@tellcut/engine';
import { App } from './App.tsx';
import { createStore, initialState, type EditorState } from './store.ts';
import { setLang } from './i18n/lang.ts';

const editorWith = (patch: Partial<EditorState>) => {
  const store = createStore({ ...initialState('demo'), ...patch });
  return { store, open: async () => {}, undo() {}, redo() {}, run(a: string) { (this as any).runs.push(a); }, restore: async () => {}, exportVideo() {}, toggleExports() {}, cancelExport() {}, setQuality() {},
    registry: { grades: {}, item: () => undefined, sfx: () => undefined, itemTypes: () => [], sfxTypes: () => [] },
    setLayout(p: any) { store.set({ layout: { ...store.get().layout, ...p } }); }, runs: [] as string[] } as any;
};

test('a project that fails validation shows its field errors and history versions', async () => {
  const root = document.createElement('div');
  const ed = editorWith({ error: { message: 'Invalid project.json', issues: ['meta.fps: Required'] }, history: ['2026-10-13T01-00-00-000Z_000001.json'] });
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  expect(root.textContent).toContain('meta.fps: Required');
  expect(root.querySelector('[data-restore]')).not.toBeNull();
});

test('the toolbar shows the project name and save status', async () => {
  const root = document.createElement('div');
  const project = parseProject({ version: 1, meta: { name: '京都之旅', width: 320, height: 180, fps: 30, duration: 1, plugins: [],
    mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
    sources: {}, media: {}, grids: [], tracks: [] });
  const ed = editorWith({ project, save: 'saving' });
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  expect(root.textContent).toContain('京都之旅');
  expect(root.querySelector('[data-save="saving"]')!.textContent).toContain('儲存中');
  expect(root.querySelector<HTMLElement>('[data-meter] i')!.style.width).toBe('0%');
  expect(root.querySelector('[data-export]')!.textContent).toContain('Export');
  expect(root.querySelector<HTMLSelectElement>('[data-quality]')!.value).toBe('full');
});

test('playback ticks (playhead, level) re-render only the clock and the meter, not the editor', async () => {
  const root = document.createElement('div');
  const project = parseProject({ version: 1, meta: { name: 'p', width: 320, height: 180, fps: 30, duration: 10, plugins: [],
    mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
    sources: {}, media: {}, grids: [], tracks: [] });
  const ed = editorWith({ project });
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  const clock = () => root.querySelector('.clock')!.textContent;
  const before = clock();
  let renders = 0;
  const prev = (options as any).diffed;
  (options as any).diffed = (v: any) => { if (v.type === App) renders++; prev?.(v); };
  await act(() => ed.store.set({ playhead: 3 }));
  await act(() => ed.store.set({ level: -6 }));
  (options as any).diffed = prev;
  expect(renders).toBe(0);
  expect(clock()).not.toBe(before);
  expect(root.querySelector<HTMLElement>('[data-meter] i')!.style.width).toBe('90%');
});

const projectOf = (width: number, height: number) => parseProject({ version: 1, meta: { name: 'p', width, height, fps: 30, duration: 10, plugins: [],
  mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
  sources: {}, media: {}, grids: [], tracks: [] });
const mountApp = async (width: number, height: number) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const ed = editorWith({ project: projectOf(width, height) });
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  return { root, ed, grid: () => root.querySelector<HTMLElement>('.editor')! };
};

test('landscape: preview over the timeline with a splitter; a closed library leaves an expander strip', async () => {
  const { root, ed, grid } = await mountApp(1920, 1080);
  expect(grid().style.gridTemplateAreas).toContain('lib pv pr');
  expect(root.querySelector('[data-splitter="rows"]')).not.toBeNull();
  await act(() => (root.querySelector('[data-collapse="library"]') as HTMLElement).click());
  expect(ed.store.get().layout.libClosed).toBe(true);
  expect([root.querySelector('.library'), !!root.querySelector('[data-expand="library"]')]).toEqual([null, true]);
});

test('portrait: side tabs | timeline | splitter | full-height preview; the tabs switch panels', async () => {
  const { root, grid } = await mountApp(1080, 1920);
  expect(grid().style.gridTemplateAreas).toContain('sd tl sp pv');
  expect(root.querySelector('[data-splitter="cols"]')).not.toBeNull();
  const shown = () => [...root.querySelectorAll<HTMLElement>('[data-side] .tab-pane')].map((p) => !p.hidden);
  expect(shown()).toEqual([true, false, false]);   // 素材 in front, 屬性 and 對話 mounted but hidden
  await act(() => (root.querySelector('[data-tab="props"]') as HTMLElement).click());
  expect(shown()).toEqual([false, true, false]);
});

test('dragging the splitter restyles only the grid while moving and stores the size on release; a double click resets it', async () => {
  const { root, ed, grid } = await mountApp(1920, 1080);
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, right: 1536, bottom: 864, width: 1536, height: 864 }) as DOMRect;
  const sp = root.querySelector<HTMLElement>('[data-splitter="rows"]')!;
  sp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 400 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientY: 500, buttons: 1 }));
  expect([ed.store.get().layout.split, grid().style.gridTemplateRows]).toEqual([null, '40px minmax(160px, 0.56fr) 6px minmax(80px, 0.44fr)']);
  await act(() => { window.dispatchEvent(new MouseEvent('mouseup', { clientY: 500 })); });
  expect(ed.store.get().layout.split).toBeCloseTo(460 / 818, 3);
  await act(() => { sp.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  expect(ed.store.get().layout.split).toBeNull();
});

test('a splitter drag ends when the window loses focus or the button is found released (Alt+Tab mid-drag)', async () => {
  const { root, ed, grid } = await mountApp(1920, 1080);
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, right: 1536, bottom: 864, width: 1536, height: 864 }) as DOMRect;
  const sp = root.querySelector<HTMLElement>('[data-splitter="rows"]')!;
  sp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 400 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientY: 500, buttons: 1 }));
  await act(() => { window.dispatchEvent(new Event('blur')); });
  expect([document.body.classList.contains('resizing'), ed.store.get().layout.split]).toEqual([false, expect.closeTo(460 / 818, 3)]);
  sp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 400 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientY: 300, buttons: 0 }));    // the button went up outside the window
  expect(document.body.classList.contains('resizing')).toBe(false);
});

test('the toolbar switches track size and the large preview', async () => {
  const { root, ed } = await mountApp(1920, 1080);
  await act(() => (root.querySelector('[data-track-size]') as HTMLElement).click());
  expect(ed.store.get().layout.trackSize).toBe('standard');
  (root.querySelector('[data-max-preview]') as HTMLElement).click();
  expect(ed.runs).toEqual(['maxPreview']);
});

test('switching side tabs keeps the library mounted (its scroll position survives)', async () => {
  const { root } = await mountApp(1080, 1920);
  const lib = root.querySelector('[data-side] .library')!;
  await act(() => (root.querySelector('[data-tab="props"]') as HTMLElement).click());
  await act(() => (root.querySelector('[data-tab="library"]') as HTMLElement).click());
  expect(root.querySelector('[data-side] .library')).toBe(lib);
});

test('a refusal notice shows in the toolbar while the properties panel is hidden', async () => {
  const { root, ed } = await mountApp(1080, 1920);   // portrait, 素材 tab in front
  await act(() => ed.store.set({ notice: '播放頭在專案結尾，無法加入' }));
  expect(root.querySelector('[data-toolbar-notice]')!.textContent).toContain('播放頭在專案結尾');
  await act(() => (root.querySelector('[data-tab="props"]') as HTMLElement).click());
  expect(root.querySelector('[data-toolbar-notice]')).toBeNull();
});
test('the top-left corner has ⌂ (home) then the help button, which opens the help', async () => {
  const { root, ed } = await mountApp(1920, 1080);
  ed.toggleHelp = (open?: boolean) => ed.store.set({ helpOpen: open ?? !ed.store.get().helpOpen });
  const home = root.querySelector('.toolbar')!.firstElementChild as HTMLElement, first = home.nextElementSibling as HTMLElement;
  expect([home.hasAttribute('data-home'), first.hasAttribute('data-help'), first.textContent]).toEqual([true, true, 'Help']);
  await act(() => first.click());
  expect(root.querySelector('[data-help-panel]')).not.toBeNull();
});

const empty = () => parseProject({ version: 1, meta: { name: 'p', width: 320, height: 180, fps: 30, duration: 1, plugins: [],
  mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
  sources: {}, media: {}, grids: [], tracks: [] });

test("a pending proposal shows Claude's bar with accept and reject; an outside change offers a reload", async () => {
  const root = document.createElement('div');
  const ed = editorWith({ project: empty(), proposal: { id: 'p1', label: '剪短', summary: ['c1 end 4.00→3.00'], warnings: [], changed: ['c1'] }, diskChanged: true });
  const done: string[] = [];
  ed.acceptProposal = async () => { done.push('accept'); return true; };
  ed.rejectProposal = async () => { done.push('reject'); };
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  expect(root.textContent).toContain('Agent proposes: 剪短');
  const btn = (t: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === t)!;
  await act(() => { btn('Accept').click(); });
  await act(() => { btn('Reject').click(); });
  expect(done).toEqual(['accept', 'reject']);
  expect(btn('Reload')).toBeTruthy();
});

test('the Ask Agent dialog: Enter sends, an empty text cannot be sent, a manual copy shows the full text', async () => {
  const root = document.createElement('div');
  const sent: string[] = [];
  const ed = editorWith({ project: empty(), ask: { selection: [], playhead: 0, state: 'edit' } });
  ed.sendAskToChat = async (t: string) => { sent.push(t); };   // Enter = 送出 (Plan 18)
  ed.closeAsk = () => {};
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  const ta = root.querySelector<HTMLTextAreaElement>('[data-ask-text]')!;
  const copy = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Copy')!;
  expect(copy.disabled).toBe(true);
  await act(() => { ta.value = '加字幕'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(sent).toEqual(['加字幕']);
  await act(() => { ed.store.set({ ask: { selection: [], playhead: 0, state: 'manual', message: '全文' } }); });
  expect(root.querySelector<HTMLTextAreaElement>('[data-ask-manual]')!.value).toBe('全文');
});

test('the toolbar has a home button; the side panel has a chat tab', async () => {
  const root = document.createElement('div');
  const ed = editorWith({ project: empty() });
  ed.chat = { state: { messages: [], running: false, partial: null, error: '' }, subscribe: () => () => {}, send: async () => {}, stop: async () => {} };
  await act(() => render(<App editor={ed} bridge={{ attach() {}, handle() {} } as any} />, root));
  expect(root.querySelector('[data-home]')!.getAttribute('href')).toBe('/editor/');
  const tab = root.querySelector<HTMLElement>('[data-tab="chat"]')!;
  await act(() => { tab.click(); });
  expect(ed.store.get().layout.sideTab).toBe('chat');
});

test("the editor's labels are English in every language; the tooltips follow the language", async () => {
  const labels = async (lang: 'zh' | 'en' | 'ja') => {
    setLang(lang);
    const { root } = await mountApp(1080, 1920);
    const txt = (sel: string) => root.querySelector(sel)!.textContent;
    const out = { toolbar: [txt('[data-help]'), txt('[data-snap]'), txt('[data-exports]'), txt('[data-export]')],
      tabs: ['library', 'props', 'chat'].map((k) => txt(`[data-tab="${k}"]`)),
      tip: root.querySelector('[data-help]')!.getAttribute('data-tip') };
    await act(() => render(null, root));
    return out;
  };
  const zh = await labels('zh'), en = await labels('en'), ja = await labels('ja');
  setLang('zh');
  expect(zh.toolbar).toEqual(['Help', 'Snap: On', 'Exports', 'Export']);
  expect(zh.tabs).toEqual(['Media', 'Properties', 'Chat']);
  expect([en.toolbar, en.tabs]).toEqual([zh.toolbar, zh.tabs]);
  expect([ja.toolbar, ja.tabs]).toEqual([zh.toolbar, zh.tabs]);
  expect([zh.tip, en.tip, ja.tip]).toEqual(['使用說明與快捷鍵 (? 或 F1)', 'Help and shortcuts (? or F1)', 'ヘルプとショートカット (? または F1)']);
});
