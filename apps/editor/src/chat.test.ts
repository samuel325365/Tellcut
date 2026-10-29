import { ChatSession } from './chat.ts';
import { setLang } from './i18n/lang.ts';

function fakeApi(o: { events?: any[]; running?: boolean } = {}) {
  const calls: any[] = [];
  return {
    calls,
    chat: async () => ({ thread: { messages: [{ role: 'user', text: '舊', time: 't' }], sessionId: 's', started: true }, running: o.running ? { text: '進行中', tools: [] } : null }),
    chatSend: async (_t: string, text: string, on: (e: any) => void) => { calls.push(['send', text]); for (const e of o.events ?? []) on(e); },
    chatAttach: async (_t: string, on: (e: any) => void) => { calls.push(['attach']); on({ type: 'done', status: 'done', text: '進行中，完成' }); },
    chatStop: async () => { calls.push(['stop']); }, chatClear: async () => { calls.push(['clear']); },
  };
}

test('sending shows the message at once, streams the reply, and keeps it when the turn ends', async () => {
  const api = fakeApi({ events: [{ type: 'text', delta: '好' }, { type: 'tool', tool: { kind: 'run', label: '執行：x', detail: 'x' } }, { type: 'text', delta: '的' }, { type: 'done', status: 'done', text: '好的', usage: { input: 1, cacheWrite: 2, cacheRead: 3, output: 4 } }] });
  const s = new ChatSession('demo', api as any), seen: any[] = [];
  s.subscribe(() => seen.push(s.state.partial?.text));
  let ended = 0; s.onTurnEnd = () => ended++;
  await s.load();
  await s.send('剪短一點');
  expect(seen).toContain('好');
  expect(s.state.messages.map((m) => [m.role, m.text])).toEqual([['user', '舊'], ['user', '剪短一點'], ['assistant', '好的']]);
  expect(s.state.messages[2].usage).toEqual({ input: 1, cacheWrite: 2, cacheRead: 3, output: 4 });
  expect([s.state.messages[2].tools![0].label, s.state.running, s.state.partial, ended]).toEqual(['執行：x', false, null, 1]);
});

test('a page opened during a reply attaches to it; an error is shown', async () => {
  const s = new ChatSession('demo', fakeApi({ running: true }) as any);
  await s.load();
  expect(s.state.messages.at(-1)).toMatchObject({ role: 'assistant', text: '進行中，完成' });
  const e = new ChatSession('demo', fakeApi({ events: [{ type: 'done', status: 'error', text: '', error: '找不到 claude 指令' }] }) as any);
  await e.load(); await e.send('hi');
  expect([e.state.error, e.state.running]).toEqual(['找不到 claude 指令', false]);
});

test('a dropped stream reads the saved thread back; a second load while this tab streams does not attach twice', async () => {
  let loads = 0, attaches = 0;
  const api: any = {
    chat: async () => { loads++; return { thread: { messages: [{ role: 'user', text: 'x', time: 't' }, { role: 'assistant', text: '存好的', time: 't', status: 'done' }] }, running: loads === 2 ? { text: '', tools: [] } : null }; },
    chatSend: async (_t: string, _x: string, on: (e: any) => void) => { on({ type: 'text', delta: '一' }); throw new TypeError('Failed to fetch'); },
    chatAttach: async () => { attaches++; },
    chatStop: async () => {}, chatClear: async () => {},
  };
  const s = new ChatSession('demo', api);
  await s.send('x');
  expect([s.state.running, s.state.messages.at(-1)?.text, loads]).toEqual([false, '存好的', 1]);
  let release!: () => void;
  api.chatSend = async (_t: string, _x: string, on: (e: any) => void) => { await new Promise<void>((r) => (release = r)); on({ type: 'done', status: 'done', text: '好' }); };
  const sending = s.send('y');
  await s.load();                     // e.g. the editor re-opened while this tab streams the turn
  release(); await sending;
  expect([attaches, s.state.messages.filter((m) => m.text === '好').length]).toEqual([0, 1]);
});

test('a reply whose conversation moved to a new project reloads the home chat (it now holds just the note)', async () => {
  const api: any = fakeApi({ events: [{ type: 'done', status: 'done', text: '專案建好了', moved: 'trip' }] });
  let loads = 0;
  api.chat = async () => { loads++; return { thread: { messages: loads === 1 ? [] : [{ role: 'assistant', text: '這串對話已移到專案「旅行」（trip），點左邊的專案繼續。', time: 't', status: 'done' }] }, running: null }; };
  const s = new ChatSession('home', api);
  let ended = 0; s.onTurnEnd = () => ended++;
  await s.load();
  await s.send('建專案');
  expect(s.state.messages.map((m) => m.text)).toEqual(['這串對話已移到專案「旅行」（trip），點左邊的專案繼續。']);
  expect([loads, ended, s.state.running]).toEqual([2, 1, false]);
});

test('while the material is analysed and nobody replies, the page looks again; the reply the server then starts is followed; close stops it', async () => {
  const old = ChatSession.POLL; ChatSession.POLL = 20;
  try {
    let n = 0;
    const api: any = {
      ...fakeApi(),
      // analysing twice, then the server's automatic turn is running
      chat: async () => { n++; return { thread: { messages: [], sessionId: 's', started: true }, running: n >= 3 ? { text: '分析好了，', tools: [] } : null, analyzing: n < 3 }; },
    };
    const s = new ChatSession('demo', api);
    await s.load();
    expect(s.state.analyzing).toBe('素材分析中');                                       // the server's words, or this when it sends none
    await new Promise((r) => setTimeout(r, 120));
    expect(n).toBe(3);
    expect(s.state.messages.at(-1)).toMatchObject({ role: 'assistant', text: '進行中，完成' });   // attached to the automatic turn
    const quiet: any = { ...fakeApi(), chat: async () => { n++; return { thread: { messages: [] }, running: null, analyzing: true }; } };
    const q = new ChatSession('demo', quiet);
    await q.load(); q.close();
    const before = n;
    await new Promise((r) => setTimeout(r, 80));
    expect(n).toBe(before);
  } finally { ChatSession.POLL = old; }
});

test('send passes the preset and the optimistic message shows it', async () => {
  const calls: any[] = [];
  const api: any = { ...fakeApi(), chatSend: async (_t: string, text: string, on: (e: any) => void, _from: string, preset: any) => {
    calls.push([text, preset]); on({ type: 'done', status: 'done', text: '好' }); } };
  const s = new ChatSession('home-abcdef', api, 'home');
  const seen: any[] = [];
  s.subscribe(() => { if (s.state.running) seen.push(s.state.messages.at(-1)); });
  await s.send('', { id: 'travel', styles: [] });
  expect(calls).toEqual([['', { id: 'travel', styles: [] }]]);
  expect(seen[0]).toMatchObject({ role: 'user', text: '', preset: { id: 'travel', styles: [] } });
  await s.send('');
  expect(calls).toHaveLength(1);
});

test('the session sends the current language', async () => {
  const langs: any[] = [];
  const api: any = { ...fakeApi(), chatSend: async (_t: string, _x: string, on: (e: any) => void, _from: string, _preset: any, lang: any) => {
    langs.push(lang); on({ type: 'done', status: 'done', text: '好' }); } };
  setLang('ja');
  try { await new ChatSession('demo', api, 'editor').send('x'); } finally { setLang('zh'); }
  expect(langs).toEqual(['ja']);
});

test('the ticks live only on the page: a load does not bring any back, and they go with each message', async () => {
  const sent: any[] = [];
  const api: any = { ...fakeApi(), chat: async () => ({ thread: { messages: [], sessionId: 's', started: false, sources: ['wikimedia'] }, running: null }),
    sources: async () => ({ sources: [] }),
    chatSend: async (_t: string, _x: string, on: (e: any) => void, _from: string, _preset: any, _lang: any, sources: any) => { sent.push(sources); on({ type: 'done', status: 'done', text: '好' }); } };
  const s = new ChatSession('demo', api);
  expect(s.picksSources).toBe(true);
  await s.load();
  expect(s.state.sources).toBeUndefined();                       // what the thread last used is not ticked again
  await s.send('一');
  s.setSources(['nasa']);
  expect(s.state.sources).toEqual(['nasa']);
  await s.send('二');
  expect(sent).toEqual([[], ['nasa']]);
  // a page without the API menu sends none, so the server keeps the thread's last ones (a script)
  const plain: any[] = [], p: any = { ...fakeApi(), chatSend: async (...a: any[]) => { plain.push(a[6]); a[2]({ type: 'done', status: 'done', text: '好' }); } };
  const q = new ChatSession('demo', p);
  expect(q.picksSources).toBe(false);
  await q.send('三');
  expect(plain).toEqual([undefined]);
});

function presetApi() {
  return { ...fakeApi(), sources: async () => ({ sources: ['nasa', 'maps', 'freesound', 'incompetech'].map((id) => ({ id, available: true })).concat([{ id: 'carto', available: false, reason: 'key' } as any]) }) } as any;
}

test("a preset's APIs are added to the ticks: the ones there are and not ticked yet", async () => {
  const s = new ChatSession('home', presetApi());
  s.setSources(['nasa']);
  await s.presetSources(['maps', 'carto', 'nasa', 'gone']);
  expect(s.state.sources).toEqual(['nasa', 'maps']);             // carto has no key, gone is no source, nasa was ticked already
  await new ChatSession('home', fakeApi() as any).presetSources(['maps']);   // a page without the API menu: nothing to do
});

test("switching or removing the preset takes off only the ticks the previous preset added; the user's own stay", async () => {
  const s = new ChatSession('home', presetApi());
  s.setSources(['nasa']);
  await s.presetSources(['maps', 'freesound', 'incompetech']);    // travel-like
  expect(s.state.sources).toEqual(['nasa', 'maps', 'freesound', 'incompetech']);
  await s.presetSources(['freesound', 'incompetech']);            // switched to food-like: maps comes off, nasa (the user's) stays
  expect(s.state.sources).toEqual(['nasa', 'freesound', 'incompetech']);
  await s.presetSources([]);                                      // the preset taken off
  expect(s.state.sources).toEqual(['nasa']);
});

test("a preset tick the user touches becomes theirs; after a message is sent the preset's ticks stay", async () => {
  const s = new ChatSession('home', presetApi());
  await s.presetSources(['maps', 'freesound']);
  s.setSources(['freesound']);                                    // the user unticks maps…
  s.setSources(['freesound', 'maps']);                            // …and ticks it again: now it is the user's
  await s.presetSources([]);
  expect(s.state.sources).toEqual(['maps']);
  await s.presetSources(['incompetech']);
  s.keepPresetSources();                                          // sent with that preset
  await s.presetSources(['nasa']);                                // the next preset adds; the sent one's ticks are not taken off
  expect(s.state.sources).toEqual(['maps', 'incompetech', 'nasa']);
});

test('a message the server refuses (a reply already running there) is not lost: the reason shows and the words come back', async () => {
  const api: any = { ...fakeApi(), chatSend: async () => { throw Object.assign(new Error('還在回覆中'), { status: 409 }); } };
  const s = new ChatSession('demo', api);
  await s.load();
  await s.send('把開頭剪短');
  // it used to vanish: the thread was read back without it and an error showed only on an empty chat
  expect([s.state.error, s.state.unsent, s.state.messages.map((m) => m.text)]).toEqual(['還在回覆中', '把開頭剪短', ['舊']]);
  expect(s.takeUnsent()).toBe('把開頭剪短');
  expect(s.state.unsent).toBeUndefined();
});

test('a conversation the page let go of stops following its reply, and its old callbacks no longer fire', async () => {
  let signal: AbortSignal | undefined, push: ((e: any) => void) | undefined;
  const api: any = { ...fakeApi({ running: true }), chatAttach: (_t: string, on: (e: any) => void, sig?: AbortSignal) => {
    signal = sig; push = on;
    return new Promise<void>((ok) => sig?.addEventListener('abort', () => ok()));   // a reply that runs for minutes
  } };
  const s = new ChatSession('home-a', api, 'home');
  let ended = 0, moved = 0;
  s.onTurnEnd = () => ended++; s.onMoved = () => moved++;
  const loading = s.load();
  await Promise.resolve(); await Promise.resolve();
  // the home page switched threads: each flip back to a running one used to open another stream, and a stale draft's
  // "moved" pulled the picker away from the thread being looked at
  s.close();
  await loading;
  expect(signal?.aborted).toBe(true);
  push?.({ type: 'done', status: 'done', text: '好', moved: 'kyoto' });
  expect([ended, moved]).toEqual([0, 0]);
});

test('a failed turn keeps its code and cause on the message and words the error in the page language', async () => {
  setLang('en');
  try {
    const s = new ChatSession('demo', fakeApi({ events: [{ type: 'done', status: 'error', text: '', error: '找不到 claude 指令：請先安裝 Claude Code', code: 'chat.notFound' }] }) as any);
    await s.load(); await s.send('hi');
    expect(s.state.messages.at(-1)).toMatchObject({ status: 'error', error: '找不到 claude 指令：請先安裝 Claude Code', code: 'chat.notFound' });
    expect(s.state.error).toMatch(/Claude Code/);
    expect(s.state.error).not.toMatch(/找不到/);
  } finally { setLang('zh'); }
});

test("a button's task goes with the message, and the message shown is only the words", async () => {
  const sent: any[] = [];
  const api: any = { ...fakeApi(), chatSend: async (...a: any[]) => { sent.push(a[7]); a[2]({ type: 'done', status: 'done', text: '好' }); } };
  const s = new ChatSession('demo', api);
  await s.send('存成我的片型', undefined, { kind: 'preset-draft' });
  expect(sent).toEqual([{ kind: 'preset-draft' }]);
  expect(s.state.messages[0]).toMatchObject({ role: 'user', text: '存成我的片型' });
  expect(s.state.messages[0]).not.toHaveProperty('task');
});
