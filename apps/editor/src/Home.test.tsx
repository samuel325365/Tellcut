// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Home } from './Home.tsx';
import { ApiError } from './api.ts';
import { setLang } from './i18n/lang.ts';
import { DICTS } from './i18n/index.ts';

const api = () => {
  const a: any = {
    asked: [] as string[], sent: [] as Array<[string, string, string | undefined]>,
    projects: async () => [{ id: 'seattle', name: '西雅圖', duration: 76.3, width: 1080, height: 1920, poster: { source: 's1', t: 1 }, missing: 9 }, { id: 'bad', error: '格式錯誤' }],
    chat: async (t: string) => { a.asked.push(t); return { thread: { messages: [], sessionId: 's', started: false }, running: null }; },
    chatSend: async (t: string, text: string, on: (e: any) => void, from?: string, preset?: any) => { a.sent.push([t, text, from]); a.sentPreset = preset; on({ type: 'done', status: 'done', text: '好' }); },
    places: async () => ({ places: [] }), fsList: async () => ({ path: 'C:/', parent: null, entries: [] }),
  };
  return a;
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });
afterEach(() => { try { localStorage.clear(); } catch { /* none */ } });

test('home: project cards with a thumbnail, length and orientation; the welcome; no 新專案 button (the chat box imports material)', async () => {
  const root = document.createElement('div');
  await act(async () => { render(<Home api={api()} />, root); });
  await settle();
  const cards = [...root.querySelectorAll<HTMLAnchorElement>('[data-home-projects] ul a')];
  expect(root.querySelector('[data-gallery-link]')!.getAttribute('href')).toBe('?gallery');
  expect(cards.map((a) => a.getAttribute('href'))).toEqual(['?id=seattle', '?id=bad']);
  expect(cards[0].textContent).toContain('西雅圖');
  expect(cards[0].querySelector('[data-missing]')!.textContent).toContain('缺素材（9 支）');
  expect(cards[1].querySelector('[data-missing]')).toBeNull();
  expect(cards[0].textContent).toContain('1:16 · 直式');
  expect(cards[0].querySelector('img')!.getAttribute('src')).toBe('/api/projects/seattle/media/still?source=s1&t=1&w=192');
  expect(root.textContent).toContain('格式錯誤');
  expect(root.textContent).toContain('今天想剪什麼？');
  expect(root.querySelector('[data-new-project]')).toBeNull();
  await act(() => { (root.querySelector('[data-attach]') as HTMLElement).click(); });
  expect(root.querySelector('[data-import]')).not.toBeNull();
});

test("the chat box switches to a project's conversation and works there (told the editor is not open); the choice is kept", async () => {
  const a = api(), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  const pickEl = root.querySelector<HTMLSelectElement>('[data-thread]')!;
  expect([...pickEl.options].map((o) => [o.value, o.textContent])).toEqual([['home', '主頁'], ['seattle', '西雅圖']]);   // a broken project is left out
  await act(() => { pickEl.value = 'seattle'; pickEl.dispatchEvent(new Event('change')); });
  await settle();
  expect(a.asked.at(-1)).toBe('seattle');
  expect(root.querySelector('[data-open-editor]')!.getAttribute('href')).toBe('?id=seattle');
  expect(root.textContent).toContain('「西雅圖」的對話');
  const box = root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
  await act(() => { box.value = '第二段剪短'; box.dispatchEvent(new Event('input')); });
  await act(async () => { (root.querySelector('[data-chat-send]') as HTMLElement).click(); });
  expect(a.sent).toEqual([['seattle', '第二段剪短', 'home']]);
  expect(localStorage.getItem('tellcut.homeThread')).toBe('seattle');
});

test('when the home chat makes a project and hands the conversation over, the chat box follows it there', async () => {
  const a = api(), root = document.createElement('div');
  a.chatSend = async (t: string, text: string, on: (e: any) => void) => { a.sent.push([t, text, undefined]); on({ type: 'done', status: 'done', text: '建好了', moved: 'seattle' }); };
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  const box = root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
  await act(() => { box.value = '用素材剪一支'; box.dispatchEvent(new Event('input')); });
  await act(async () => { (root.querySelector('[data-chat-send]') as HTMLElement).click(); });
  await settle();
  expect(root.querySelector<HTMLSelectElement>('[data-thread]')!.value).toBe('seattle');
  expect(a.asked.at(-1)).toBe('seattle');
});

test('主頁 is this browser’s own draft conversation; 新對話 starts another; after a hand-over 主頁 starts afresh', async () => {
  const a = api(), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  const first = a.asked.at(-1);
  expect(first).toMatch(/^home-[a-z0-9]{6,24}$/);
  await act(() => { (root.querySelector('[data-new-chat]') as HTMLElement).click(); });
  await settle();
  const second = a.asked.at(-1);
  expect(second).toMatch(/^home-/);
  expect(second).not.toBe(first);
  expect(localStorage.getItem('tellcut.homeDraft')).toBe(second);
});

test('a kept choice of a project that was deleted since falls back to 主頁 without asking for its conversation (a 404)', async () => {
  localStorage.setItem('tellcut.homeThread', 'trip');
  const a = api(), root = document.createElement('div');
  await act(() => render(<Home api={a} />, root));
  await settle(); await settle();
  expect(a.asked).not.toContain('trip');
  expect(a.asked.some((t: string) => t.startsWith('home-'))).toBe(true);
  expect(localStorage.getItem('tellcut.homeThread')).toBe('home');
});

const deletable = (preview: any, del?: (id: string) => Promise<unknown>) => {
  const a = api();
  a.deleted = [] as string[]; a.loads = 0;
  const projects = a.projects;
  a.projects = async () => { a.loads++; return a.deleted.includes('seattle') ? [] : projects(); };
  a.deletePreview = async () => preview;
  a.deleteProject = del ?? (async (id: string) => { a.deleted.push(id); return { ok: true }; });
  return a;
};
const click = (root: Element, sel: string) => act(async () => { (root.querySelector(sel) as HTMLElement).click(); });

test('a project card has a delete button that asks first: what goes with it, then deletes and reloads the list', async () => {
  const a = deletable({ videos: 3, fx: 2, busy: null }), root = document.body.appendChild(document.createElement('div'));
  try {
    await act(async () => { render(<Home api={a} />, root); });
    await settle();
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { root.querySelector('[data-delete="seattle"]')!.dispatchEvent(ev); });
    await settle();
    expect(ev.defaultPrevented).toBe(true);   // the card's link is not followed
    const dlg = root.querySelector('[data-delete-dialog]')!;
    expect(dlg.textContent).toContain('永久刪除「西雅圖」？');
    expect(dlg.textContent).toContain('已輸出的影片 3 支');
    expect(dlg.textContent).toContain('專案自己的特效 2 個');
    expect(dlg.textContent).toContain('無法復原');
    expect(document.activeElement).toBe(root.querySelector('[data-delete-cancel]'));
    await click(root, '[data-delete-cancel]');
    expect(root.querySelector('[data-delete-dialog]')).toBeNull();
    expect(a.deleted).toEqual([]);
    await click(root, '[data-delete="seattle"]'); await settle();
    const loads = a.loads;
    await click(root, '[data-delete-confirm]'); await settle();
    expect(a.deleted).toEqual(['seattle']);
    expect(a.loads).toBeGreaterThan(loads);
    expect(root.querySelector('[data-delete-dialog]')).toBeNull();
    expect(root.querySelector('[data-delete="seattle"]')).toBeNull();
  } finally { render(null, root); root.remove(); }
});

test('the delete dialog leaves out zero counts and says why it cannot delete now', async () => {
  const a = deletable({ videos: 0, fx: 0, busy: 'Agent 正在處理這個專案（對話還在回覆中），等它回完再刪' }), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  await click(root, '[data-delete="seattle"]'); await settle();
  const dlg = root.querySelector('[data-delete-dialog]')!;
  expect(dlg.textContent).not.toContain('已輸出的影片');
  expect(dlg.textContent).not.toContain('特效');
  expect(dlg.textContent).toContain('Agent 正在處理這個專案');
  expect((root.querySelector('[data-delete-confirm]') as HTMLButtonElement).disabled).toBe(true);
});

test('a refused delete keeps the dialog open with the reason', async () => {
  const a = deletable({ videos: 1, fx: 0, busy: null }, async () => { throw new ApiError(409, '這個專案還有工作在進行（01.mp4），等它結束或取消後再刪', []); });
  const root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  await click(root, '[data-delete="seattle"]'); await settle();
  await click(root, '[data-delete-confirm]'); await settle();
  expect(root.querySelector('[data-delete-dialog]')!.textContent).toContain('這個專案還有工作在進行（01.mp4）');
});

test('the theme toggle sits in the sidebar', async () => {
  const root = document.createElement('div');
  await act(async () => { render(<Home api={api()} />, root); });
  expect(root.querySelector('[data-home-projects] [data-theme-toggle]')).not.toBeNull();
});

const PRESET = (id: string, name: string, o: any = {}): any => ({ id, order: 0, mine: false, color: '#123456', name: { zh: name }, summary: { zh: name },
  fit: {}, facts: {}, styles: [{ id: 'map', name: { zh: '地圖' }, desc: { zh: 'd' } }], poster: null, preview: null, ...o });
const withPresets = (list: any[]) => { const a = api(); a.presets = async () => ({ presets: list }); return a; };
const pickPreset = async (root: HTMLElement, id: string) => {
  await act(() => { root.querySelector<HTMLElement>(`[data-preset="${id}"]`)!.click(); });
  await act(() => { root.querySelector<HTMLElement>('[data-confirm]')!.click(); });
};
const motion = (reduce: boolean) => { (window as any).matchMedia = (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }); };

test('the welcome shows the presets instead of the suggestions; picking one tags the composer', async () => {
  const a = withPresets([PRESET('travel', '旅行精華'), PRESET('auto', 'Auto', { styles: [] })]), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  expect([...root.querySelectorAll('[data-preset]')].map((e) => e.getAttribute('data-preset'))).toEqual(['travel', 'auto']);
  expect(root.querySelector('[data-suggest]')).toBeNull();
  await pickPreset(root, 'travel');
  expect(root.querySelector('[data-preset-tag]')!.textContent).toContain('旅行精華');
  expect(root.querySelector('[data-preset="travel"]')!.getAttribute('aria-pressed')).toBe('true');
  await pickPreset(root, 'auto');
  expect(root.querySelector('[data-preset-tag]')!.textContent).toContain('Auto');
  await act(async () => { root.querySelector<HTMLElement>('[data-chat-send]')!.click(); });
  await settle();
  expect(a.sent.at(-1)[1]).toBe('');
  expect(a.sentPreset).toEqual({ id: 'auto', styles: [] });
  expect(root.querySelector('[data-preset-tag]')).toBeNull();
});

const CUSTOM = PRESET('custom', '自定義', { styles: [], examples: [{ zh: '復古底片感' }, { zh: '黑底白字' }],
  fields: [{ id: 'ratio', name: { zh: '比例' }, options: [{ id: '9:16', name: { zh: '9:16' } }, { id: '1:1', name: { zh: '1:1' } }] }] });
const openHome = async () => {
  const a = withPresets([CUSTOM]), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  const box = () => root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
  const type = async (v: string) => { box().value = v; await act(() => { box().dispatchEvent(new Event('input', { bubbles: true })); }); };
  const open = async () => { await act(() => { root.querySelector<HTMLElement>('[data-preset="custom"]')!.click(); }); return root.querySelector<HTMLElement>('[data-preset-dialog]')!; };
  const click = async (sel: string, i = 0) => { await act(() => { root.querySelectorAll<HTMLElement>(sel)[i].click(); }); };
  return { a, root, box, type, open, click };
};

test("the custom preset's form tags the composer and goes with the message", async () => {
  const { a, root, open, click } = await openHome();
  await open();
  await click('[data-option="9:16"]');
  await click('[data-confirm]');
  expect(root.querySelector('[data-preset-tag]')!.textContent).toContain('1 項設定');
  await click('[data-chat-send]');
  await settle();
  expect(a.sentPreset).toEqual({ id: 'custom', styles: [], fields: { ratio: '9:16' } });
});

test('picked examples go into the chat box after what is there', async () => {
  const { box, type, open, click } = await openHome();
  await type('做一支片');
  await open();
  await click('[data-example]', 1);
  await click('[data-confirm]');
  expect(box().value).toBe('做一支片\n黑底白字');
  await open();
  await click('[data-confirm]');                                   // examples start unpicked: nothing added again
  expect(box().value).toBe('做一支片\n黑底白字');
  await open();
  await click('[data-example]', 0);
  await click('[data-cancel]');
  expect(box().value).toBe('做一支片\n黑底白字');
  await click('[data-preset-tag] .chip-x');                          // clearing the preset leaves the words alone
  expect(box().value).toBe('做一支片\n黑底白字');
  await type('');
  await open();
  await click('[data-example]', 0);
  await click('[data-confirm]');
  expect(box().value).toBe('復古底片感');
});

test('examples go in once: another chat panel (a project picked, or back home) does not get them again', async () => {
  const { root, box, open, click } = await openHome();
  await open();
  await click('[data-example]', 0);
  await click('[data-confirm]');
  expect(box().value).toBe('復古底片感');
  const pickThread = async (id: string) => {
    const sel = root.querySelector<HTMLSelectElement>('[data-thread]')!;
    sel.value = id;
    await act(() => { sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
  };
  await pickThread('seattle');
  expect(box().value).toBe('');
  await pickThread('home');
  expect(box().value).toBe('');
});

test('after sending, the form starts on auto again', async () => {
  const { root, open, click } = await openHome();
  await open();
  await click('[data-option="9:16"]');
  await click('[data-confirm]');
  await open();
  expect(root.querySelector('[data-option="9:16"]')!.getAttribute('aria-pressed')).toBe('true');   // kept while the tag is on
  await click('[data-confirm]');
  await click('[data-chat-send]');
  await settle();
  await click('[data-new-chat]');                                   // the strip is only on a new conversation
  await settle();
  await open();
  expect(root.querySelector('[data-option="auto"]')!.getAttribute('aria-pressed')).toBe('true');
});

test('a preset with no poster draws its own; the preview plays only on hover', async () => {
  motion(false);
  const a = withPresets([PRESET('a', 'A'), PRESET('b', 'B', { poster: '/p.jpg', preview: '/v.webm' })]), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  const ca = root.querySelector<HTMLElement>('[data-preset="a"]')!, cb = root.querySelector<HTMLElement>('[data-preset="b"]')!;
  expect(ca.querySelector('img')).toBeNull();
  expect(ca.querySelector<HTMLElement>('[data-poster-fallback]')!.getAttribute('style')).toContain('#123456');
  expect(cb.querySelector('img')!.getAttribute('src')).toBe('/p.jpg');
  expect(cb.querySelector('video')).toBeNull();
  await act(() => { cb.dispatchEvent(new MouseEvent('mouseenter')); });
  const v = cb.querySelector<HTMLVideoElement>('video')!;
  expect([v.getAttribute('src'), v.muted, v.loop, v.autoplay]).toEqual(['/v.webm', true, true, true]);
  await act(() => { cb.dispatchEvent(new MouseEvent('mouseleave')); });
  expect(cb.querySelector('video')).toBeNull();
  motion(true);
  await act(() => { cb.dispatchEvent(new MouseEvent('mouseenter')); });
  expect(cb.querySelector('video')).toBeNull();
  delete (window as any).matchMedia;
});

test("using a preset ticks its APIs in the menu; switching to another takes off the ones it added; the ticks go with the message", async () => {
  const a = withPresets([PRESET('travel', '旅行精華', { sources: ['maps', 'freesound'] }), PRESET('food', '美食', { sources: ['freesound'] })]), sent: any[] = [];
  a.sources = async () => ({ sources: [{ id: 'maps', available: true }, { id: 'freesound', available: true }] });
  a.chatSend = async (_t: string, _text: string, on: (e: any) => void, _f: any, _p: any, _l: any, sources: any) => { sent.push(sources); on({ type: 'done', status: 'done', text: '好' }); };
  const root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  await pickPreset(root, 'travel');
  await settle();
  await pickPreset(root, 'food');                                  // travel's maps comes off
  await settle();
  await act(async () => { root.querySelector<HTMLElement>('[data-chat-send]')!.click(); });
  await settle();
  expect(sent).toEqual([['freesound']]);
});

const sourcesHome = (moved?: string) => {
  const a = withPresets([PRESET('travel', '旅行精華', { sources: ['maps', 'freesound'] })]), sent: Array<[string, any]> = [];
  a.sources = async () => ({ sources: [{ id: 'maps', available: true }, { id: 'freesound', available: true }] });
  a.chatSend = async (t: string, _text: string, on: (e: any) => void, _f: any, _p: any, _l: any, sources: any) => {
    sent.push([t, sources]); on({ type: 'done', status: 'done', text: '好', ...(moved && sent.length === 1 ? { moved } : {}) });
  };
  return { a, sent };
};
const typeAndSend = async (root: HTMLElement, text: string) => {
  const box = root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
  await act(() => { box.value = text; box.dispatchEvent(new Event('input')); });
  await act(async () => { root.querySelector<HTMLElement>('[data-chat-send]')!.click(); });
  await settle();
};

test("when the conversation moves to the project it made, its ticks go along: the next message there keeps the preset's APIs", async () => {
  const { a, sent } = sourcesHome('seattle'), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  await pickPreset(root, 'travel');
  await settle();
  await act(async () => { root.querySelector<HTMLElement>('[data-chat-send]')!.click(); });
  await settle();
  expect(root.querySelector<HTMLSelectElement>('[data-thread]')!.value).toBe('seattle');
  await typeAndSend(root, '加一張路線地圖');
  expect(sent.map(([, s]) => s)).toEqual([['maps', 'freesound'], ['maps', 'freesound']]);
  expect(sent[1][0]).toBe('seattle');
});

test("a picked preset's ticks come back with its tag: after looking at another conversation, and on a new draft", async () => {
  const { a, sent } = sourcesHome(), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  await pickPreset(root, 'travel');
  await settle();
  const pickThread = async (id: string) => {
    const sel = root.querySelector<HTMLSelectElement>('[data-thread]')!;
    sel.value = id;
    await act(() => { sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
  };
  await pickThread('seattle');
  await pickThread('home');
  expect(tag(root)).not.toBeNull();
  expect(root.querySelector('[data-api] .n')?.textContent).toBe('2');
  await act(() => { root.querySelector<HTMLElement>('[data-new-chat]')!.click(); });
  await settle();
  expect(tag(root)).not.toBeNull();
  await typeAndSend(root, '剪一支');
  expect(sent.map(([, s]) => s)).toEqual([['maps', 'freesound']]);
});

test("a user's preset is marked as theirs", async () => {
  const a = withPresets([PRESET('a', 'A'), PRESET('my-x', '我的', { mine: true })]), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  expect(root.querySelector('[data-preset="a"] [data-mine]')).toBeNull();
  expect(root.querySelector('[data-preset="my-x"] [data-mine]')).not.toBeNull();
});

test('the strip is only on a new home conversation', async () => {
  const a = withPresets([PRESET('a', 'A')]), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  expect(root.querySelector('[data-preset]')).not.toBeNull();
  const pickEl = root.querySelector<HTMLSelectElement>('[data-thread]')!;
  await act(() => { pickEl.value = 'seattle'; pickEl.dispatchEvent(new Event('change')); });
  await settle();
  expect(root.querySelector('[data-preset]')).toBeNull();
});

const tag = (root: HTMLElement) => root.querySelector('[data-preset-tag]');
const box = (root: HTMLElement) => root.querySelector<HTMLInputElement>('[data-preset-dialog] input[type=checkbox]')!;
const open = async (list: any[]) => {
  const a = withPresets(list), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  return { a, root };
};

test('clicking a thumbnail opens its dialog and tags nothing yet; there is no info button', async () => {
  const { root } = await open([PRESET('travel', '旅行精華')]);
  expect(root.querySelector('[data-preset-info]')).toBeNull();
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  expect(root.querySelector('[data-preset-dialog]')).not.toBeNull();
  expect(tag(root)).toBeNull();
  expect(root.querySelector('[data-preset="travel"]')!.getAttribute('aria-pressed')).toBe('false');
});

test('Enter or Space on a thumbnail opens the dialog', async () => {
  const { root } = await open([PRESET('travel', '旅行精華')]);
  const th = root.querySelector<HTMLElement>('[data-preset="travel"]')!;
  await act(() => { th.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  expect(root.querySelector('[data-preset-dialog]')).not.toBeNull();
  await act(() => { root.querySelector<HTMLElement>('[data-cancel]')!.click(); });
  await act(() => { th.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); });
  expect(root.querySelector('[data-preset-dialog]')).not.toBeNull();
});

test('confirm tags the composer with the ticked styles; no ticks = Claude picks', async () => {
  const { root } = await open([PRESET('travel', '旅行精華'), PRESET('b', 'B')]);
  await pickPreset(root, 'b');
  expect(tag(root)!.textContent).toContain('B');
  expect(tag(root)!.textContent).not.toContain('種風格');
  expect(root.querySelector('[data-preset-dialog]')).toBeNull();
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  await act(() => { box(root).click(); });
  await act(() => { root.querySelector<HTMLElement>('[data-confirm]')!.click(); });
  expect(root.querySelector('[data-preset-dialog]')).toBeNull();
  expect(tag(root)!.textContent).toContain('旅行精華');
  expect(tag(root)!.textContent).toContain('1 種風格');
});

test('cancel, Esc or a click outside changes nothing', async () => {
  const { root } = await open([PRESET('travel', '旅行精華')]);
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  await act(() => { box(root).click(); });
  await act(() => { root.querySelector<HTMLElement>('[data-confirm]')!.click(); });
  const before = tag(root)!.textContent;
  expect(before).toContain('1 種風格');
  const closers: Array<() => void> = [
    () => root.querySelector<HTMLElement>('[data-cancel]')!.click(),
    () => { root.querySelector('[data-preset-dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
    () => { root.querySelector('.modal-back')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); },
  ];
  for (const close of closers) {
    await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
    await act(() => { box(root).click(); });
    expect(box(root).checked).toBe(false);
    await act(close);
    expect(root.querySelector('[data-preset-dialog]')).toBeNull();
    expect(tag(root)!.textContent).toBe(before);
  }
  // cancelling a first look at another preset does not tag it either
  const { root: r2 } = await open([PRESET('x', 'X')]);
  await act(() => { r2.querySelector<HTMLElement>('[data-preset="x"]')!.click(); });
  await act(() => { r2.querySelector<HTMLElement>('[data-cancel]')!.click(); });
  expect(tag(r2)).toBeNull();
});

test('reopening a picked preset shows its ticks', async () => {
  const { root } = await open([PRESET('travel', '旅行精華')]);
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  await act(() => { box(root).click(); });
  await act(() => { root.querySelector<HTMLElement>('[data-confirm]')!.click(); });
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  expect(box(root).checked).toBe(true);
});

test('Enter in the dialog confirms and does not send the message', async () => {
  const { a, root } = await open([PRESET('travel', '旅行精華')]);
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  await act(() => { box(root).click(); });
  const sent = a.sent.length, asked = a.asked.length;
  await act(() => { box(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  expect(root.querySelector('[data-preset-dialog]')).toBeNull();
  expect(tag(root)!.textContent).toContain('1 種風格');
  expect(a.sent.length).toBe(sent);
  expect(a.asked.length).toBe(asked);
});

const PRESET3 = (): any => PRESET('travel', '旅行精華', { name: { zh: '旅行精華', en: 'Travel Highlights', ja: '旅のハイライト' }, summary: { zh: 's', en: 's', ja: 's' } });

test('the home page speaks the chosen language', async () => {
  const a = withPresets([PRESET3()]);
  a.projects = async () => [{ id: 'seattle', name: 'Seattle', duration: 76.3, width: 1080, height: 1920, missing: 9 }];
  const root = document.createElement('div'), cjk = /[一-鿿]/, kana = /[ぁ-ヿ]/;
  setLang('en');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  expect(root.textContent).toContain('What are we cutting today?');
  expect(root.textContent).toContain('Travel Highlights');
  expect(root.querySelector('[data-lang="en"]')!.getAttribute('aria-pressed')).toBe('true');
  const noSwitch = () => root.textContent!.replace(root.querySelector('.lang-switch')!.textContent!, '').replace('Seattle', '');
  expect(noSwitch()).not.toMatch(cjk);
  expect(noSwitch()).not.toMatch(kana);
  expect(root.querySelector('[data-thread] option')!.textContent).toBe('Home');
  expect(root.querySelector('[data-missing]')!.textContent).toContain('9');
  await act(() => { setLang('ja'); });
  expect(root.textContent).toContain(DICTS.ja['home.welcome']);
  expect(root.textContent).toContain('旅のハイライト');
  expect(root.textContent).not.toContain('Travel Highlights');
  expect(root.querySelector('[data-lang="ja"]')!.getAttribute('aria-pressed')).toBe('true');
  await act(() => { root.querySelector<HTMLElement>('[data-preset="travel"]')!.click(); });
  expect(root.querySelector('[data-confirm]')!.textContent).toBe(DICTS.ja['preset.confirm']);
  expect(root.querySelector('[data-cancel]')!.textContent).toBe(DICTS.ja['preset.cancel']);
});

test('switching language keeps the conversation and the draft', async () => {
  const a = api();
  a.chat = async (t: string) => { a.asked.push(t); return { thread: { messages: [{ role: 'user', text: 'hello', time: 't' }], sessionId: 's', started: false }, running: null }; };
  const root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  const box = root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
  await act(() => { box.value = 'abc'; box.dispatchEvent(new Event('input')); });
  const calls = a.asked.length;
  await act(() => { root.querySelector<HTMLElement>('[data-lang="ja"]')!.click(); });
  await settle();
  expect(a.asked.length).toBe(calls);
  expect(root.textContent).toContain('hello');
  expect(root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!.value).toBe('abc');
});

test('a request handed over from the gallery is sent in the home chat, even when a project\u2019s conversation was open', async () => {
  localStorage.setItem('tellcut.homeThread', 'seattle');
  sessionStorage.setItem('tellcut.pendingTask', JSON.stringify({ text: '修改我的積木「粉筆」：字大一點', task: { kind: 'library-edit', slug: 'chalk', type: 'fx.chalk', request: '字大一點' } }));
  const a = api(), root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle(); await settle();
  expect(a.sent.map((x: any) => x[1])).toEqual(['修改我的積木「粉筆」：字大一點']);
  expect(a.sent[0][0]).toMatch(/^home-/);
  expect(sessionStorage.getItem('tellcut.pendingTask')).toBeNull();
});

test('a handed-over request waits while the home chat is still replying, then goes', async () => {
  sessionStorage.setItem('tellcut.pendingTask', JSON.stringify({ text: '改一下', task: { kind: 'library-edit', slug: 'chalk', type: 'fx.chalk', request: '改一下' } }));
  const a = api();
  let finish = () => {};
  a.chat = async () => ({ thread: { messages: [], sessionId: 's', started: false }, running: { text: '', tools: [] } });
  a.chatAttach = (_t: string, on: (e: any) => void) => new Promise<void>((done) => { finish = () => { on({ type: 'done', status: 'done', text: '好' }); done(); }; });
  const root = document.createElement('div');
  await act(async () => { render(<Home api={a} />, root); });
  await settle();
  expect(a.sent).toEqual([]);
  expect(sessionStorage.getItem('tellcut.pendingTask')).not.toBeNull();
  await act(async () => { finish(); });
  await settle(); await settle();
  expect(a.sent.map((x: any) => x[1])).toEqual(['改一下']);
});
