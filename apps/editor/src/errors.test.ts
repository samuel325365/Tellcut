import { api, ApiError } from './api.ts';
const DICT_EN_BUSY = 'A reply is still running in this conversation; wait for it or stop it';
import { errText } from './i18n/index.ts';
import { setLang } from './i18n/lang.ts';

afterEach(() => { vi.unstubAllGlobals(); setLang('zh'); });
const json = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });

test('a server error with a code is worded in the page language; without a known one the server\u2019s own words stay', () => {
  setLang('en');
  expect(errText(new ApiError(409, '還在回覆中', [], 'chat.busy'))).toBe(DICT_EN_BUSY);
  expect(errText(new ApiError(404, '找不到 D:/x', [], 'fs.notFound', { dir: 'D:/x' }))).toContain('D:/x');
  expect(errText(new ApiError(500, '別的錯', [], 'no.such.code'))).toBe('別的錯');
  expect(errText(new Error('plain'))).toBe('plain');
  setLang('zh');
  expect(errText(new ApiError(409, '還在回覆中', [], 'chat.busy'))).toBe('還在回覆中');
});

test('the code and its params come back on the ApiError a request throws', async () => {
  vi.stubGlobal('fetch', async () => json(409, { error: '專案在別的地方被改過（另一個分頁或 Agent）', code: 'project.conflict', conflict: true }));
  const e = await api.save('demo', {} as any).catch((x) => x);
  expect([e instanceof ApiError, e.status, e.code]).toEqual([true, 409, 'project.conflict']);
});
