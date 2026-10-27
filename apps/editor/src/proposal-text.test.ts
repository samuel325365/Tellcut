import { lineText } from './proposal-text.ts';
import { setLang } from './i18n/lang.ts';

afterEach(() => setLang('zh'));

test('a proposal line in the page language; blocks named by their gallery handle, as the gallery shows them', () => {
  setLang('en');
  expect(lineText({ k: 'num', id: 'c1', key: 'end', from: '4.00', to: '3.00' })).toBe('c1 end 4.00→3.00');
  expect(lineText({ k: 'add', id: 'cap2', track: 'text', type: 'common.caption' })).toBe('Added cap2 TXT-02 caption (text)');
  expect(lineText({ k: 'edit', id: 'cap2', key: 'type', from: 'common.caption', to: 'common.burst' })).toBe('cap2: block TXT-02 caption → TXT-01 burst');
  expect(lineText({ k: 'edit', id: 'c1', key: 'crop' })).toBe('c1: crop changed');
  expect([lineText({ k: 'shift', n: 1, by: '+0.50' }), lineText({ k: 'shift', n: 3, by: '-1.00' })]).toEqual(['1 item moved +0.50 s', '3 items moved -1.00 s']);
  setLang('zh');
  // word for word the Chinese summary media-node writes (namedSummary)
  expect(lineText({ k: 'add', id: 'cap2', track: 'text', type: 'common.caption' })).toBe('新增 cap2 TXT-02 caption（text）');
  expect(lineText({ k: 'del', id: 'c3' })).toBe('刪除 c3');
});
