// The Editor: Ask Agent (the right-click request: copying it or sending it to the chat).
import { moveItems } from '@tellcut/engine';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';
import { fakes } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('Ask Agent: a right-click on an unselected clip selects it alone; copying stores the request and the message', async () => {
  const copied: string[] = [], sent: any[] = [];
  const { api, bridge } = fakes({ request: async (_id: string, b: any) => { sent.push(b); return { id: 'r1', ...b, range: [4, 8] }; } });   // the server adds the range
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async (t: string) => { copied.push(t); } } });
  await ed.open();
  ed.select(['c1']);
  ed.openAsk('c2');
  expect([ed.store.get().selection, ed.store.get().ask?.selection]).toEqual([['c2'], ['c2']]);
  await ed.sendAsk('換一個"更亮"的\n鏡頭');
  expect(sent).toEqual([{ text: '換一個"更亮"的\n鏡頭', selection: ['c2'], playhead: 0 }]);
  expect(copied[0]).toContain('（選取 c2，4.00–8.00 秒；詳細：npm run tellcut -- request demo）');
  expect(ed.store.get().ask?.state).toBe('copied');
  await vi.advanceTimersByTimeAsync(2000);
  expect(ed.store.get().ask).toBeNull();
});

test('Ask Agent: a refused clipboard shows the text to copy by hand; a failed save keeps the dialog with the reason', async () => {
  const { api, bridge } = fakes({ request: async (_id: string, b: any) => ({ id: 'r1', ...b }) });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => { throw new Error('denied'); } } });
  await ed.open();
  ed.openAsk();
  await ed.sendAsk('加字幕');
  expect(ed.store.get().ask).toMatchObject({ state: 'manual', message: expect.stringContaining('播放頭 0.00 秒附近') });
  const { api: api2 } = fakes({ request: async () => { throw new ApiError(400, '找不到項目 c9'); } });
  const ed2 = new Editor('demo', { api: api2, bridge, clipboard: { writeText: async () => {} } });
  await ed2.open();
  ed2.openAsk();
  await ed2.sendAsk('x');
  expect(ed2.store.get().ask).toMatchObject({ state: 'edit', error: '找不到項目 c9' });
});

test('Ask Agent on empty space hands over the playhead, not an old selection', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => {} } });
  await ed.open();
  ed.select(['c1']);
  ed.seek(12);
  ed.openAsk();
  expect([ed.store.get().ask?.selection, ed.store.get().ask?.playhead]).toEqual([[], 12]);
});

test('Ask Agent saves pending edits before sending (a fresh split exists on disk); closing while sending stays closed', async () => {
  const order: string[] = [];
  let release!: () => void;
  const copied: string[] = [];
  const { api, bridge } = fakes({
    save: async () => { order.push('save'); },
    request: async (_id: string, b: any) => { order.push('request'); await new Promise<void>((r) => (release = r)); return { id: 'r', ...b, range: [0, 4] }; },
  });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async (t: string) => { copied.push(t); } } });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['a1'], dt: 1 }));
  ed.openAsk('c1');
  const sending = ed.sendAsk('x');
  await vi.advanceTimersByTimeAsync(0);
  expect(order).toEqual(['save', 'request']);
  ed.closeAsk();
  release();
  await sending;
  expect([ed.store.get().ask, copied]).toEqual([null, []]);
});

test('Ask Agent 送出: the request is stored, the chat tab opens and the message goes into the project chat', async () => {
  const chatSent: string[] = [];
  const { api, bridge } = fakes({ request: async (_i: string, b: any) => ({ id: 'r', ...b, range: [4, 8] }),
    chat: async () => ({ thread: { messages: [], sessionId: 's', started: false }, running: null }),
    chatSend: async (_t: string, text: string, on: (e: any) => void) => { chatSent.push(text); on({ type: 'done', status: 'done', text: '好' }); } });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => {} } });
  await ed.open();
  ed.openAsk('c2');
  await ed.sendAskToChat('換亮一點');
  expect([ed.store.get().ask, ed.store.get().layout.sideTab]).toEqual([null, 'chat']);
  expect(chatSent[0]).toContain('（選取 c2，4.00–8.00 秒；詳細：npm run tellcut -- request demo）');
});

test('Ask Agent 送出 while the chat is still replying keeps the dialog with the reason (nothing is lost)', async () => {
  const sent: any[] = [];
  const { api, bridge } = fakes({ request: async (_i: string, b: any) => { sent.push(b); return { id: 'r', ...b, range: [4, 8] }; },
    chat: async () => ({ thread: { messages: [] }, running: null }), chatSend: async () => {} });
  const ed = new Editor('demo', { api, bridge, clipboard: { writeText: async () => {} } });
  await ed.open();
  ed.chat.state = { ...ed.chat.state, running: true };
  ed.openAsk('c2');
  await ed.sendAskToChat('換亮一點');
  expect([sent, ed.store.get().ask?.state, ed.store.get().ask?.error]).toEqual([[], 'edit', expect.stringContaining('還在回覆中')]);
});
