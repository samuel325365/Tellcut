// common.search (group C2): the word lists, the question list's state at t, the video window and the tap points.
import { askAt, askRowY, listOf, parseAsk, parseFacts, parseRelated, parseSugg, search, searchPoint, searchWindow, tabXs, windowRect } from './search.ts';
import { screenFrame } from './phone.ts';

test('words: suggestions split where the query ends (or at "|"), fact cards, questions with their spans, related rows, tabs', () => {
  expect(parseSugg('週末去哪玩 海邊\n別的\n海邊小鎮| 美食', '週末去哪玩')).toEqual([
    { text: '週末去哪玩 海邊', lead: '週末去哪玩', rest: ' 海邊' }, { text: '別的', lead: '', rest: '別的' }, { text: '海邊小鎮 美食', lead: '海邊小鎮', rest: ' 美食' }]);
  expect(parseSugg('a\\nb', '')).toHaveLength(2);
  expect(parseFacts('2|很容易錯過\n1|人口|3.2|萬人')).toEqual([{ at: 1, label: '人口', big: '3.2', unit: '萬人' }, { at: 2, label: '很容易錯過', big: '', unit: '' }]);
  const qs = parseAsk('1.5|第二題|redact\n0-1.2|第一題|提示\nx|壞的\n3|第三題');
  expect(qs.map((q) => [q.t0, q.t1, q.q, q.hint, q.redact])).toEqual([[0, 1.2, '第一題', '提示', false], [1.5, 3, '第二題', '', true], [3, Infinity, '第三題', '', false]]);
  expect(parseRelated('a, b; c；;')).toEqual([['a', 'b'], ['c']]);
  expect(listOf('全部, 新聞，圖片、影片')).toEqual(['全部', '新聞', '圖片', '影片']);
  const xs = tabXs(['全部', 'AB']);
  expect(xs[0]).toEqual([64, 92]);
  expect(xs[1][0]).toBe(64 + 92 + 52);
  expect(xs[1][1]).toBeCloseTo(1.1 * 46);
});

test('ask: a question opens, closes, the list scrolls a row and the next one takes the window; the last stays open', () => {
  const qs = parseAsk('0-1.5|一\n1.5-3|二\n3|三');
  const s0 = askAt(qs, 0.1);
  expect([s0.cur, s0.scroll, s0.last]).toEqual([0, 0, false]);
  expect(s0.cover).toBeGreaterThan(0.3);
  expect(askAt(qs, 0.6).cover).toBe(0);                                  // open
  const closing = askAt(qs, 1.3);
  expect(closing.close).toBeGreaterThan(0);
  expect(closing.scroll).toBeGreaterThan(0);
  expect(closing.scroll).toBeLessThan(130);
  const s1 = askAt(qs, 1.5 + 0.5);
  expect([s1.cur, s1.scroll]).toEqual([1, 130]);
  // the open question's row sits at the top, the next one under the window
  expect(askRowY(1, s1, 880)).toBe(470);
  expect(askRowY(2, s1, 880)).toBe(470 + 130 + 900);
  const last = askAt(qs, 9);
  expect([last.cur, last.last, last.close, last.cover]).toEqual([2, true, 0, 0]);
});

test('the window and the tap points: 9:16 the page itself, 16:9 inside the phone; home is the whole screen', () => {
  expect(windowRect('results', 'window', 1920)).toEqual([24, 620, 1032, 880]);
  expect(windowRect('ask', 'window', 1920)).toEqual([24, 620, 1032, 880]);
  expect(windowRect('end', 'window', 1920)).toEqual([24, 1000, 1032, 700]);
  expect(windowRect('results', 'full', 1920)).toEqual([0, 0, 1080, 1920]);
  expect(searchWindow({ mode: 'results' })).toEqual([24 / 1080, 620 / 1920, 1032 / 1080, 880 / 1920].map((v) => Math.round(v * 1e5) / 1e5));
  expect(searchWindow({ mode: 'home' }, 1920, 1080)).toEqual(screenFrame(1920, 1080));
  const wide = searchWindow({ mode: 'results' }, 1920, 1080), phone = screenFrame(1920, 1080);
  expect(wide[0]).toBeGreaterThan(phone[0]);
  expect(wide[0] + wide[2]).toBeLessThan(phone[0] + phone[2]);
  // the picked row: home a third down, end under the box at the top
  const home = searchPoint({ mode: 'home', pick: 1 }, 'pick'), end = searchPoint({ mode: 'end', pick: 1 }, 'pick');
  expect(home.y).toBeCloseTo((640 + 112 + 14 + 118 + 59) / 1920, 3);
  expect(end.y).toBeCloseTo((230 + 112 + 14 + 118 + 59) / 1920, 3);
  expect(searchPoint({ mode: 'end' }, 'play')).toEqual({ x: 0.5, y: Math.round(((1000 + 350 + 70) / 1920) * 1e4) / 1e4 });
  const w = searchPoint({ mode: 'results' }, 'bar', 1920, 1080);
  expect(w.x).toBeGreaterThan(phone[0]);
  expect(w.x).toBeLessThan(phone[0] + phone[2]);
});

test('every parameter has a default and the modes are an enum', () => {
  const mode = search.params.find((p) => p.key === 'mode') as { options?: string[] };
  expect(mode.options).toEqual(['home', 'results', 'ask', 'end']);
  for (const p of search.params) expect(p.default, p.key).not.toBeUndefined();
});
