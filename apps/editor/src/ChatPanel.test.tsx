// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ChatPanel } from './ChatPanel.tsx';
import { setLang } from './i18n/lang.ts';
import { DICTS, t } from './i18n/index.ts';

afterEach(() => { localStorage.clear(); setLang('zh'); localStorage.clear(); });

function session(over: any = {}) {
  const sent: string[] = [];
  const s: any = { state: { messages: [], running: false, partial: null, error: '', ...over }, subscribe: () => () => {}, send: async (t: string) => { sent.push(t); }, stop: async () => { sent.push('STOP'); }, sent };
  return s;
}

test('Enter sends, Shift+Enter and IME composition do not; the hint shows on an empty chat; running shows stop', async () => {
  const root = document.createElement('div'), s = session();
  await act(() => render(<ChatPanel session={s} hint="例如：…" />, root));
  expect(root.textContent).toContain('例如：…');
  const ta = root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
  await act(() => { ta.value = '剪短'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
  await act(() => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); });
  expect(s.sent).toEqual([]);
  await act(() => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(s.sent).toEqual(['剪短']);
  const r = session({ running: true, partial: { text: '回覆中', tools: [{ kind: 'run', label: '執行：x', detail: 'x' }] } });
  await act(() => render(<ChatPanel session={r} />, root));
  expect(root.textContent).toContain('回覆中');
  expect(root.textContent).toContain('執行：x');
  await act(() => { root.querySelector<HTMLElement>('[data-chat-stop]')!.click(); });
  expect(r.sent).toEqual(['STOP']);
});

test('a finished reply folds its steps into one line that opens; a running reply shows the current step', async () => {
  const root = document.createElement('div');
  const tools = [{ kind: 'run', label: '執行：a', detail: 'a' }, { kind: 'denied', label: '已拒絕：b', detail: 'b' }, { kind: 'read', label: '讀取：c.png', detail: 'c' }];
  const s = session({ messages: [{ role: 'user', text: 'x', time: 't' }, { role: 'assistant', text: '好', time: 't', tools, status: 'done' }] });
  await act(() => render(<ChatPanel session={s} />, root));
  const fold = root.querySelector<HTMLElement>('[data-steps]')!;
  expect(fold.textContent).toContain('3 個步驟（1 個被拒絕）');
  expect(root.textContent).not.toContain('讀取：c.png');
  await act(() => { fold.click(); });
  expect(root.textContent).toContain('讀取：c.png');
});

test('attached material shows as chips above the words and goes out with them; the welcome suggestions fill the box', async () => {
  const root = document.createElement('div'), s = session();
  let atts = [{ path: 'D:\\旅遊\\京都', name: '京都', kind: 'dir' }];
  const draw = () => render(<ChatPanel session={s} welcome={{ title: '今天想剪什麼？', suggestions: ['看看現在有哪些專案'] }}
    attachments={atts as any} onAttach={() => {}} onDetach={(i: number) => { atts = atts.filter((_, k) => k !== i); draw(); }} />, root);
  await act(() => draw());
  expect(root.textContent).toContain('今天想剪什麼？');
  expect(root.querySelector('[data-chip]')!.textContent).toContain('京都');
  await act(() => { (root.querySelector('[data-suggest]') as HTMLElement).click(); });
  expect(root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!.value).toBe('看看現在有哪些專案');
  await act(() => { (root.querySelector('[data-chat-send]') as HTMLElement).click(); });
  expect(s.sent).toEqual(['看看現在有哪些專案\n\n素材：\n- D:\\旅遊\\京都']);
  expect(root.querySelector('[data-attach]')).not.toBeNull();
});

test('a reply shows the tokens it used (total, details on hover); a reply without usage shows none', async () => {
  const root = document.createElement('div');
  const s = session({ messages: [
    { role: 'user', text: '剪', time: 't' },
    { role: 'assistant', text: '好', time: 't', status: 'done', usage: { input: 30, cacheWrite: 2400, cacheRead: 9570, output: 300 } },
    { role: 'assistant', text: '停', time: 't', status: 'stopped' },
  ] });
  await act(() => render(<ChatPanel session={s} />, root));
  const u = [...root.querySelectorAll<HTMLElement>('[data-usage]')];
  expect(u.length).toBe(1);
  expect(u[0].textContent).toBe('≈ 1.2 萬 token');
  expect(u[0].getAttribute('data-tip')).toBe('新輸入 30、快取寫入 2,400、快取讀取 9,570、輸出 300');
});

test('a reply shows only its tokens (the Claude API price is in its tooltip); the thread total says what it would cost at API prices', async () => {
  const root = document.createElement('div');
  const s = session({ messages: [
    { role: 'user', text: '剪', time: 't' },
    { role: 'assistant', text: '舊', time: 't', status: 'done', usage: { input: 0, cacheWrite: 0, cacheRead: 10000, output: 0 } },
    { role: 'user', text: '再剪', time: 't' },
    { role: 'assistant', text: '好', time: 't', status: 'done', usage: { input: 30, cacheWrite: 2400, cacheRead: 9570, output: 300, cost: 0.4567 } },
    { role: 'assistant', text: '好', time: 't', status: 'done', usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 100, cost: 0.004 } },
  ] });
  await act(() => render(<ChatPanel session={s} />, root));
  const u = [...root.querySelectorAll<HTMLElement>('[data-usage]:not([data-thread-total])')];
  expect(u.map((e) => e.textContent)).toEqual(['≈ 1.0 萬 token', '≈ 1.2 萬 token', '≈ 100 token']);
  expect(u[1].getAttribute('data-tip')).toBe('新輸入 30、快取寫入 2,400、快取讀取 9,570、輸出 300\n改用 Claude API 約 US$0.46\n用訂閱方案（Pro／Max）時不另外收費，只算進用量額度；這個金額是同樣用量改走 Claude API 計價時大約的價錢');
  expect(u[0].getAttribute('data-tip')).not.toContain('US$');
  expect(root.querySelector('[data-thread-total]')!.textContent).toBe('這串對話合計 ≈ 2.2 萬 token · 改用 Claude API 約 US$0.46（1 則較早的回覆沒有 API 換算紀錄）');
});

const TRAVEL: any = { id: 'travel', order: 1, mine: false, color: '#2f8cff', name: { zh: '旅行精華', en: 'Travel Highlights' }, summary: { zh: 's' },
  fit: {}, facts: {}, styles: [{ id: 'map', name: { zh: '地圖' }, desc: { zh: 'd' } }, { id: 'chat', name: { zh: '聊天' }, desc: { zh: 'd' } }], poster: null, preview: null };

test('a preset tag sits with the attachments, can be removed, and lets an empty box send', async () => {
  const root = document.createElement('div'), calls: any[] = [];
  const s = session(); s.send = async (t: string, p: any) => { calls.push([t, p]); };
  let sent = 0, cleared = 0;
  await act(() => render(<ChatPanel session={s} preset={{ info: TRAVEL, styles: ['map', 'chat'] }} onClearPreset={() => cleared++} onSent={() => sent++} />, root));
  const tag = root.querySelector<HTMLElement>('[data-preset-tag]')!;
  expect(tag.textContent).toContain('旅行精華');
  expect(tag.textContent).toContain('2 種風格');
  const btn = root.querySelector<HTMLButtonElement>('[data-chat-send]')!;
  expect(btn.disabled).toBe(false);
  await act(() => { btn.click(); });
  expect(calls).toEqual([['', { id: 'travel', styles: ['map', 'chat'] }]]);
  expect(sent).toBe(1);
  await act(() => { tag.querySelector<HTMLElement>('.chip-x')!.click(); });
  expect(cleared).toBe(1);
  await act(() => render(<ChatPanel session={session()} />, root));
  expect(root.querySelector<HTMLButtonElement>('[data-chat-send]')!.disabled).toBe(true);
});

test("a preset's form: the tag counts the options set, and they go with the message", async () => {
  const root = document.createElement('div'), calls: any[] = [];
  const s = session(); s.send = async (t: string, p: any) => { calls.push([t, p]); };
  await act(() => render(<ChatPanel session={s} preset={{ info: TRAVEL, styles: [], fields: { ratio: '9:16', length: '45' } }} />, root));
  expect([...root.querySelectorAll('[data-preset-tag] small')].map((e) => e.textContent)).toEqual(['2 項設定']);
  await act(() => { root.querySelector<HTMLElement>('[data-chat-send]')!.click(); });
  expect(calls).toEqual([['', { id: 'travel', styles: [], fields: { ratio: '9:16', length: '45' } }]]);
  await act(() => render(<ChatPanel session={session()} preset={{ info: TRAVEL, styles: ['map'], fields: {} }} />, root));
  expect([...root.querySelectorAll('[data-preset-tag] small')].map((e) => e.textContent)).toEqual(['1 種風格']);
  await act(() => render(<ChatPanel session={session()} preset={{ info: TRAVEL, styles: ['map'], fields: { ratio: '1:1' } }} />, root));
  expect([...root.querySelectorAll('[data-preset-tag] small')].map((e) => e.textContent)).toEqual(['1 種風格', '1 項設定']);
});

test('a past message that used a preset shows its tag, not the prompt', async () => {
  const root = document.createElement('div');
  const s = session({ messages: [{ role: 'user', text: '京都', time: 't', preset: { id: 'travel', styles: [] } }, { role: 'user', text: 'x', time: 't', preset: { id: 'gone', styles: [] } }] });
  await act(() => render(<ChatPanel session={s} presetNames={{ travel: '旅行精華' }} />, root));
  const tags = [...root.querySelectorAll('[data-msg-preset]')].map((e) => e.textContent);
  expect(tags).toEqual(['旅行精華', 'gone']);
  expect(root.textContent).toContain('京都');
});

test("the server's own message shows in the page's language, not the English it told the agent", async () => {
  const root = document.createElement('div');
  const s = session({ messages: [{ role: 'user', text: '(Automatic message) The footage analysis is done', time: 't', auto: 'analysis' },
    { role: 'user', text: '(Automatic message) The footage analysis is over, but part of it did not finish: …', time: 't', auto: 'analysis-partial' }] });
  await act(() => render(<ChatPanel session={s} />, root));
  expect([...root.querySelectorAll('.msg.user')].map((e) => e.textContent)).toEqual([DICTS.zh['chat.autoAnalysis'], DICTS.zh['chat.autoAnalysisPartial']]);
});

test('the welcome takes what goes under the composer', async () => {
  const root = document.createElement('div');
  await act(() => render(<ChatPanel session={session()} welcome={{ title: 't', below: <div data-x /> }} />, root));
  const composer = root.querySelector('.composer')!, x = root.querySelector('[data-x]')!;
  expect(composer.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(root.querySelector('.suggest')).toBeNull();
});

test('on the editor surface labels are English and explanations follow the language', async () => {
  const messages = [{ role: 'user', text: 'x', time: 't' }, { role: 'assistant', text: 'ok', time: 't', status: 'done', tools: [{ kind: 'run', label: 'a', detail: 'a' }], usage: { input: 1, cacheWrite: 0, cacheRead: 0, output: 1 } }];
  setLang('ja');
  for (const surface of ['editor', 'home'] as const) {
    const root = document.createElement('div');
    await act(() => render(<ChatPanel session={session({ messages })} surface={surface} onAttach={() => {}} />, root));
    expect(root.querySelector('[data-chat-send]')!.getAttribute('data-tip')).toBe(DICTS.ja['chat.send']);
    expect(root.querySelector('[data-attach]')!.getAttribute('aria-label')).toBe(DICTS.ja[surface === 'editor' ? 'chat.attachEditor' : 'chat.attach']);
    expect(root.querySelector('[data-chat-input]')!.getAttribute('placeholder')).toBe(DICTS.ja['chat.phReply']);
    expect(root.querySelector('[data-steps]')!.textContent).toContain(t('chat.steps', { n: 1 }));
    expect(root.querySelector('[data-steps]')!.textContent).toMatch(/[ぁ-ヿ]/);
  }
});

test('the status notes and the token line speak the language', async () => {
  setLang('en');
  const root = document.createElement('div');
  const s = session({ analyzing: 'a.mp4', messages: [{ role: 'assistant', text: 'x', time: 't', status: 'stopped' }, { role: 'assistant', text: 'y', time: 't', status: 'interrupted' },
    { role: 'assistant', text: 'z', time: 't', status: 'done', usage: { input: 30000, cacheWrite: 0, cacheRead: 0, output: 0 } }] });
  await act(() => render(<ChatPanel session={s} />, root));
  expect(root.textContent).not.toMatch(/[一-鿿]/);
  expect(root.textContent).toContain('≈ 30.0k token');
});

test('old threads without verb or notice still show their words', async () => {
  setLang('en');
  const root = document.createElement('div');
  const tools = [{ kind: 'run', label: '執行：old', detail: 'old' }, { kind: 'run', verb: 'run', arg: 'ls', label: '執行：ls', detail: 'ls' }];
  const s = session({ messages: [
    { role: 'assistant', text: '這串對話已移到專案「Demo」（trip）：舊訊息', time: 't', status: 'done' },
    { role: 'assistant', text: '好', time: 't', tools, status: 'done' },
    { role: 'assistant', text: '搬家了', time: 't', status: 'done', notice: { kind: 'moved', project: 'trip', name: 'Demo', others: [] } }] });
  await act(() => render(<ChatPanel session={s} />, root));
  expect(root.textContent).toContain('這串對話已移到專案「Demo」（trip）：舊訊息');
  await act(() => { root.querySelector<HTMLElement>('[data-steps]')!.click(); });
  expect(root.textContent).toContain('執行：old');
  expect(root.textContent).toContain('Running: ls');
  expect(root.textContent).not.toContain('執行：ls');
  expect(root.textContent).not.toContain('搬家了');
  expect(root.textContent).toContain('moved to the project "Demo" (trip)');
  const r = session({ running: true, partial: { text: '', tools: [{ kind: 'read', verb: 'read', arg: 'a.png', label: '讀取：a.png', detail: '' }] } });
  await act(() => render(<ChatPanel session={r} />, root));
  expect(root.querySelector('.working')!.textContent).toBe('Reading: a.png');
  const a = session({ analysis: { running: [{ label: '03', step: 'proxy', mins: 1 }], queued: 0 }, analyzing: '03：代理檔（已 1 分鐘）' });
  await act(() => render(<ChatPanel session={a} />, root));
  expect(root.querySelector('[data-analyzing]')!.textContent).toContain('03: proxy file (1 min so far)');
});

const ROWS = [
  { id: 'wikimedia', label: 'Wikimedia Commons', category: 'media', kinds: ['image'], data: true, unofficial: false, available: true },
  { id: 'pexels', label: 'Pexels', category: 'media', kinds: ['image'], data: false, unofficial: false, available: false, reason: 'key', keyEnv: 'PEXELS_API_KEY' },
  { id: 'freesound', label: 'Freesound', category: 'sound', kinds: ['audio'], data: false, unofficial: false, available: true },
  { id: 'pokeapi', label: 'PokeAPI', category: 'fandom', kinds: ['image'], data: true, unofficial: false, available: true },
  { id: 'steam', label: 'Steam', category: 'fandom', kinds: ['image', 'video'], data: true, unofficial: true, available: true },
];
/** a session that can show the API menu: the ticks it was asked to save, in order */
function picking(sources: string[] = []) {
  const s = session({ sources });
  s.picksSources = true;
  s.saved = [] as string[][];
  s.listSources = async () => ({ sources: ROWS });
  s.setSources = async (ids: string[]) => { s.saved.push(ids); s.state = { ...s.state, sources: ids }; };
  return s;
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

test('the API button opens the menu in groups; a tick takes effect at once; one that cannot be used is greyed out with its reason', async () => {
  const root = document.createElement('div'), s = picking(['freesound']);
  document.body.append(root);
  await act(() => render(<ChatPanel session={s} onAttach={() => {}} />, root));
  await flush();
  const btn = root.querySelector<HTMLElement>('[data-api]')!;
  // right of ＋, with the count of what is ticked
  expect(btn.previousElementSibling!.hasAttribute('data-attach')).toBe(true);
  expect(btn.textContent).toBe('API1');
  expect(root.querySelector('[data-api-picker]')).toBeNull();
  await act(() => { btn.click(); });
  const pop = root.querySelector('[data-api-picker]')!;
  expect([...pop.querySelectorAll('[data-api-group]')].map((g) => g.getAttribute('data-api-group'))).toEqual(['media', 'sound', 'fandom']);
  expect(pop.querySelector('[data-api-group="media"] h6')!.textContent).toBe('圖片／影片0/1');
  // one pill per source: its name, a tick when on; what it gives in its tip
  const pill = (id: string) => pop.querySelector<HTMLElement>(`[data-source="${id}"]`)!;
  expect(pill('wikimedia').textContent).toBe('Wikimedia');
  expect(pill('freesound').classList.contains('on')).toBe(true);
  expect(pill('steam').getAttribute('data-tip')).toBe('遊戲介紹、截圖、預告片、同時在線排行\n圖・影片・資料・非官方');
  expect(pill('pexels').classList.contains('off')).toBe(true);
  expect(pill('pexels').textContent).toBe('Pexels缺 key');
  expect(pill('pexels').getAttribute('data-tip')).toContain('PEXELS_API_KEY');
  expect(pill('pexels').querySelector('input')!.disabled).toBe(true);
  await act(() => { pill('pokeapi').querySelector('input')!.click(); });
  expect(s.saved).toEqual([['freesound', 'pokeapi']]);
  await act(() => { pop.querySelector<HTMLElement>('[data-api-clear]')!.click(); });
  expect(s.saved.at(-1)).toEqual([]);
  root.remove();
});

test('nothing is added above the words when sources are ticked (the welcome would jump): the button counts them and names them in its tip', async () => {
  const root = document.createElement('div'), s = picking(['wikimedia', 'freesound', 'pokeapi']);
  document.body.append(root);
  await act(() => render(<ChatPanel session={s} />, root));
  await flush();
  expect(root.querySelector('.chips')).toBeNull();
  const btn = root.querySelector<HTMLElement>('[data-api]')!;
  expect(btn.textContent).toBe('API3');
  expect(btn.getAttribute('data-tip')).toBe('這次對話勾的 API：點一下修改\nWikimedia、Freesound、寶可夢');
  await act(() => { btn.click(); });
  // two quick clicks both count: each toggles against the latest list
  const pop = root.querySelector('[data-api-picker]')!;
  pop.querySelector<HTMLInputElement>('[data-source="steam"] input')!.click();
  pop.querySelector<HTMLInputElement>('[data-source="wikimedia"] input')!.click();
  await flush();
  expect(s.saved).toEqual([['wikimedia', 'freesound', 'pokeapi', 'steam'], ['freesound', 'pokeapi', 'steam']]);
  // Esc closes it
  await act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(root.querySelector('[data-api-picker]')).toBeNull();
  root.remove();
});

test('a click outside closes the menu; the editor\'s opens upward with English labels; a page without the sources API shows no button', async () => {
  const root = document.createElement('div'), s = picking();
  document.body.append(root);
  await act(() => render(<ChatPanel session={s} surface="editor" />, root));
  await flush();
  await act(() => { root.querySelector<HTMLElement>('[data-api]')!.click(); });
  const pop = root.querySelector('[data-api-picker]')!;
  expect(pop.classList.contains('up')).toBe(true);
  expect(pop.querySelector('.pop-head b')!.textContent).toBe('APIs to use');
  expect(pop.querySelector('[data-source="pokeapi"] .nm')!.textContent).toBe('Pokémon');
  await act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(root.querySelector('[data-api-picker]')).toBeNull();
  await act(() => render(<ChatPanel session={session()} />, root));
  expect(root.querySelector('[data-api]')).toBeNull();
  root.remove();
});

test('words the server refused come back into the box', async () => {
  const root = document.createElement('div'), s = session({ unsent: '把開頭剪短', error: '還在回覆中' });
  s.takeUnsent = () => { const x = s.state.unsent; s.state.unsent = undefined; return x; };
  await act(() => render(<ChatPanel session={s} />, root));
  expect(root.querySelector<HTMLTextAreaElement>('[data-chat-input]')!.value).toBe('把開頭剪短');
});

test('a failed reply and a recovered one are worded in the page language from their codes', async () => {
  setLang('en');
  const root = document.createElement('div');
  const s = session({ messages: [{ role: 'user', text: 'x', time: 't' },
    { role: 'assistant', text: '', time: 't', status: 'error', error: '對話紀錄寫不進去：EBUSY', code: 'chat.saveFailed', detail: 'EBUSY' },
    { role: 'assistant', text: '好了\n\n（這段回覆是在 Tellcut 伺服器重新啟動時完成的，從 Agent 的紀錄補回。）', time: 't', status: 'done', notice: { kind: 'recovered' } }] });
  await act(() => render(<ChatPanel session={s} />, root));
  const err = root.querySelector('.note.err')!.textContent!;
  expect(err).toContain('EBUSY');
  expect(err).not.toContain('寫不進去');
  expect(root.textContent).toContain(DICTS.en['chat.recovered']);
  expect(root.textContent).not.toContain('伺服器重新啟動');
});
