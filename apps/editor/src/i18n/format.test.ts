import { ANALYSIS_STEPS, type ChatErrorCode, type ChatMessage, type Lang, type ToolVerb } from '@tellcut/protocol';
import { DICTS, type Key } from './index.ts';
import { analysisText, chatErrorText, exportProgress, noticeText, toolText } from './format.ts';

const LANGS: Lang[] = ['zh', 'en', 'ja'];
const VERBS: ToolVerb[] = ['run', 'read', 'write', 'list', 'denied'];
const CHAT_CODES: ChatErrorCode[] = ['chat.notFound', 'chat.notLoggedIn', 'chat.startFailed', 'chat.saveFailed', 'chat.exited', 'chat.busy'];
const moved = (others: Array<{ id: string; name: string }> = []): ChatMessage => ({ role: 'assistant', text: '這串對話已移到專案…', time: 't', notice: { kind: 'moved', project: 'trip', name: 'Demo', others } });

test('every code the server sends has words', () => {
  const keys: string[] = [...VERBS.map((v) => `tool.${v}`), ...[...Object.keys(ANALYSIS_STEPS), 'basic', 'extras'].map((s) => `analysis.step.${s}`),
    'export.prepare', 'export.prepareN', 'export.frame', 'chat.moved', 'chat.movedOthers', 'chat.movedItem', 'chat.movedSep', 'chat.autoAnalysis', 'chat.autoAnalysisPartial', 'analysis.running', 'analysis.queued', 'analysis.sep',
    ...CHAT_CODES.map((c) => `err.${c}`), 'chat.recovered'];
  for (const lang of LANGS) for (const k of keys) expect(DICTS[lang][k as Key], `${lang} ${k}`).toBeTruthy();
});

test('a tool line is worded from its verb and argument; without a verb the old label stands', () => {
  expect(toolText({ kind: 'run', verb: 'run', arg: 'ls', label: '執行：ls', detail: 'ls' }, 'zh')).toBe('執行：ls');
  expect(toolText({ kind: 'run', verb: 'run', arg: 'ls', label: '執行：ls', detail: 'ls' }, 'en')).toBe('Running: ls');
  expect(toolText({ kind: 'read', verb: 'read', arg: 'a.png', label: '讀取：a.png', detail: '' }, 'ja')).toBe('読み込み：a.png');
  expect(toolText({ kind: 'run', label: '執行：ls', detail: 'ls' }, 'en')).toBe('執行：ls');
  expect(toolText({ kind: 'other', label: 'WebFetch', detail: '{}' }, 'en')).toBe('WebFetch');
});

test('the moved notice is worded in each language; a message without one keeps its text', () => {
  expect(noticeText(moved(), 'zh')).toContain('已移到專案「Demo」（trip）');
  expect(noticeText(moved(), 'en')).toContain('moved to the project "Demo" (trip)');
  expect(noticeText(moved(), 'en')).not.toContain('{');
  expect(noticeText(moved(), 'ja')).toContain('Demo');
  const others = noticeText(moved([{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }]), 'en');
  expect(others).toContain('"A" (a1)');
  expect(others).toContain('"B" (a2)');
  expect(noticeText({ role: 'assistant', text: '舊的移交訊息', time: 't' }, 'en')).toBe('舊的移交訊息');
});

test('the analysing line names the source, the step and the minutes, and what waits; odd steps stay raw', () => {
  const a = { running: [{ label: '03', step: 'transcript', mins: 12 }], queued: 2 };
  expect(analysisText(a, 'zh')).toBe('03：逐字稿（已 12 分鐘）；還有 2 項排隊');
  expect(analysisText(a, 'en')).toBe('03: transcript (12 min so far); 2 more waiting');
  expect(analysisText(a, 'ja')).toContain('03');
  expect(analysisText({ running: [{ label: '04', step: 'weird', mins: 0 }], queued: 0 }, 'en')).toBe('04: weird (0 min so far)');
  expect(analysisText({ running: [], queued: 1 }, 'en')).toBe('1 more waiting');
});

test('export progress codes become words; anything else is shown as it is', () => {
  expect(exportProgress('prepare', 'en')).toBe(DICTS.en['export.prepare']);
  expect(exportProgress('prepare 3/10', 'en')).toBe('Preparing clips 3 of 10');
  expect(exportProgress('frame 12/300', 'en')).toBe('Rendering frame 12 of 300');
  expect(exportProgress('frame 12/300', 'zh')).toBe('繪製畫面 12 / 300');
  expect(exportProgress('frame 12/300', 'ja')).toContain('12');
  expect(exportProgress('mixing audio', 'en')).toBe('mixing audio');
  expect(exportProgress('', 'en')).toBe('');
});

test('a chat failure is worded from its code with the raw cause; without a code its own words stand', () => {
  const start = { error: '沒辦法開始回覆：ENOENT gone.md', code: 'chat.startFailed' as const, detail: 'ENOENT gone.md' };
  expect(chatErrorText(start, 'zh')).toBe('沒辦法開始回覆：ENOENT gone.md');
  expect(chatErrorText(start, 'en')).toContain('ENOENT gone.md');
  expect(chatErrorText(start, 'en')).not.toMatch(/[\u4e00-\u9fff]/);
  expect(chatErrorText({ error: 'claude 結束（代碼 3）', code: 'chat.exited', detail: '3' }, 'ja')).toContain('3');
  expect(chatErrorText({ error: 'boom' }, 'en')).toBe('boom');
  expect(chatErrorText({ error: 'x', code: 'chat.someday' as any }, 'en')).toBe('x');   // a newer server's code this page does not know
});

test('a reply recovered after a restart says so in each language; its Chinese note is not shown twice', () => {
  const m: ChatMessage = { role: 'assistant', text: '做好了。\n\n（這段回覆是在 Tellcut 伺服器重新啟動時完成的，從 Agent 的紀錄補回。）', time: 't', status: 'done', notice: { kind: 'recovered' } };
  expect(noticeText(m, 'en')).toBe(`做好了。\n\n${DICTS.en['chat.recovered']}`);
  expect(noticeText(m, 'zh')).toBe(m.text);
});
