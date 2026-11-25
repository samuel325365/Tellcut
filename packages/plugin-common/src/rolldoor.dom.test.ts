// @vitest-environment jsdom
// common.rolldoor's sign: unset, or one of the block's own Chinese words, it is written in the film's language (a film made by
// cut.ts never gets the editor's values.en/ja, and c.combo's closing has no words to pass); words of the item's own stay.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { rolldoor, signOf } from './rolldoor.ts';

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };

test('signOf: unset is the closed sign, the Chinese closed and open words follow the language, anything else is the item\'s own', () => {
  expect(['zh', 'en', 'ja'].map((l) => signOf(undefined, l as never))).toEqual(['今日打烊', 'Closed today', '本日閉店']);
  expect(signOf('今日打烊', 'en')).toBe('Closed today');
  expect(signOf('營業中', 'ja')).toBe('営業中');
  expect(signOf('營業中', 'zh')).toBe('營業中');
  expect(signOf('Back at 9', 'zh')).toBeUndefined();
  expect(signOf('', 'en')).toBeUndefined();
});

/** the sign's words on the door at 2 s, with `others` the other items' params (their words say the film's language) */
function signShown(params: Record<string, unknown>, others: Array<Record<string, unknown>> = []): string {
  const root = document.createElement('div'), st = new Stage(root, createRegistry([{ id: 'x', items: [rolldoor as ItemType] } as any]), media);
  // the other items come later in the film, so only their words are in play at 2 s
  const item = (id: string, p: Record<string, unknown>, start = 0) => ({ id, type: 'common.rolldoor', start, end: start + 3, params: p });
  st.load({
    version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 8, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [item('door', params)] }, { id: 'p', kind: 'overlay', items: others.map((p, i) => item(`o${i}`, p, 5)) }],
  } as any);
  st.draw(2);
  const shown = [...root.querySelectorAll<HTMLElement>('*')].filter((e) => e.style.display === 'flex' && e.textContent);
  return shown[0]?.textContent ?? '';
}

test('the door draws its sign in the film\'s language: unset or the stock words follow it, the item\'s own words stay', () => {
  const english = [{ sign: 'See you tomorrow' }], japanese = [{ sign: 'また明日ね' }];
  expect(signShown({})).toBe('今日打烊');
  expect(signShown({}, english)).toBe('Closed today');
  expect(signShown({}, japanese)).toBe('本日閉店');
  expect(signShown({ sign: '今日打烊' }, english)).toBe('Closed today');
  expect(signShown({ sign: 'Gone fishing' })).toBe('Gone fishing');
  expect(signShown({ sign: '公休' }, english)).toBe('公休');
  expect(signShown({ sign: '' }, english)).toBe('');
});
