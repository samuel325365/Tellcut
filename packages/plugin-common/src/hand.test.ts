// @vitest-environment jsdom
// hand.ts: line breaking for the handwritten blocks (handwrite, notecard) and the text layer they write on.
import { drawTexts, textLayer, wrapEm } from './hand.ts';

// How Chinese lines broke before Latin words were kept whole: these must never move (the films already made with them).
const CHINESE: Array<[string, Record<string, string>]> = [
  ["今天的風很溫柔", {"3":"今天|的風|很溫柔","5":"今天的風|很溫柔","8":"今天的風很溫柔","10":"今天的風很溫柔","12":"今天的風很溫柔","20":"今天的風很溫柔","6.5":"今天的風|很溫柔","13.57":"今天的風很溫柔","17.3":"今天的風很溫柔"}],
  ["我們沿著河邊慢慢走", {"3":"我們沿|著河邊|慢慢走","5":"我們沿著河|邊慢慢走","8":"我們沿著河|邊慢慢走","10":"我們沿著河邊慢慢走","12":"我們沿著河邊慢慢走","20":"我們沿著河邊慢慢走","6.5":"我們沿著河|邊慢慢走","13.57":"我們沿著河邊慢慢走","17.3":"我們沿著河邊慢慢走"}],
  ["朱槿從四月開到現在", {"3":"朱槿從|四月開|到現在","5":"朱槿從四月|開到現在","8":"朱槿從四月|開到現在","10":"朱槿從四月開到現在","12":"朱槿從四月開到現在","20":"朱槿從四月開到現在","6.5":"朱槿從四月|開到現在","13.57":"朱槿從四月開到現在","17.3":"朱槿從四月開到現在"}],
  ["親愛的你：", {"3":"親愛的|你：","5":"親愛的你：","8":"親愛的你：","10":"親愛的你：","12":"親愛的你：","20":"親愛的你：","6.5":"親愛的你：","13.57":"親愛的你：","17.3":"親愛的你："}],
  ["倫敦今天又下雨了", {"3":"倫敦今|天又下|雨了","5":"倫敦今天|又下雨了","8":"倫敦今天又下雨了","10":"倫敦今天又下雨了","12":"倫敦今天又下雨了","20":"倫敦今天又下雨了","6.5":"倫敦今天|又下雨了","13.57":"倫敦今天又下雨了","17.3":"倫敦今天又下雨了"}],
  ["但咖啡很好喝", {"3":"但咖啡|很好喝","5":"但咖啡|很好喝","8":"但咖啡很好喝","10":"但咖啡很好喝","12":"但咖啡很好喝","20":"但咖啡很好喝","6.5":"但咖啡很好喝","13.57":"但咖啡很好喝","17.3":"但咖啡很好喝"}],
  ["從中壢車站走路三分鐘", {"3":"從中壢|車站走|路三分|鐘","5":"從中壢車站|走路三分鐘","8":"從中壢車站|走路三分鐘","10":"從中壢車站走路三分鐘","12":"從中壢車站走路三分鐘","20":"從中壢車站走路三分鐘","6.5":"從中壢車站|走路三分鐘","13.57":"從中壢車站走路三分鐘","17.3":"從中壢車站走路三分鐘"}],
  ["鮮奶油加糖，打到濃稠綿密、拉起來有小尖角", {"3":"鮮奶油|加糖，|打到濃|稠綿密、|拉起來|有小尖|角","5":"鮮奶油加糖，|打到濃稠綿|密、拉起來|有小尖角","8":"鮮奶油加糖，打|到濃稠綿密、拉|起來有小尖角","10":"鮮奶油加糖，打到濃稠|綿密、拉起來有小尖角","12":"鮮奶油加糖，打到濃稠|綿密、拉起來有小尖角","20":"鮮奶油加糖，打到濃稠綿密、拉起來有小尖角","6.5":"鮮奶油加糖，|打到濃稠綿|密、拉起來|有小尖角","13.57":"鮮奶油加糖，打到濃稠|綿密、拉起來有小尖角","17.3":"鮮奶油加糖，打到濃稠|綿密、拉起來有小尖角"}],
  ["一二三四五六七八九，十一二三四五六七八九十", {"3":"一二三|四五六|七八九，|十一二|三四五|六七八|九十","5":"一二三四|五六七八|九，十一|二三四五|六七八九十","8":"一二三四五六七|八九，十一二三|四五六七八九十","10":"一二三四五六七|八九，十一二三|四五六七八九十","12":"一二三四五六七八九，十|一二三四五六七八九十","20":"一二三四五六七八九，十|一二三四五六七八九十","6.5":"一二三四五|六七八九，|十一二三四|五六七八九十","13.57":"一二三四五六七八九，十|一二三四五六七八九十","17.3":"一二三四五六七八九，十|一二三四五六七八九十"}],
  ["等待的時候……", {"3":"等待|的時|候……","5":"等待的|時候……","8":"等待的時候……","10":"等待的時候……","12":"等待的時候……","20":"等待的時候……","6.5":"等待的時候……","13.57":"等待的時候……","17.3":"等待的時候……"}],
  ["把手指餅乾快速沾一下咖啡，不要泡太久，不然會軟爛", {"3":"把手指|餅乾快|速沾一|下咖啡，|不要泡|太久，|不然會|軟爛","5":"把手指餅乾|快速沾一下|咖啡，不要|泡太久，不|然會軟爛","8":"把手指餅乾快速沾|一下咖啡，不要泡|太久，不然會軟爛","10":"把手指餅乾快速沾|一下咖啡，不要泡|太久，不然會軟爛","12":"把手指餅乾快速沾一下咖啡，|不要泡太久，不然會軟爛","20":"把手指餅乾快速沾一下咖啡，|不要泡太久，不然會軟爛","6.5":"把手指餅乾快|速沾一下咖啡，|不要泡太久，|不然會軟爛","13.57":"把手指餅乾快速沾一下咖啡，|不要泡太久，不然會軟爛","17.3":"把手指餅乾快速沾一下咖啡，|不要泡太久，不然會軟爛"}],
  ["最後撒上一層厚厚的可可粉，冷藏一晚就完成了！", {"3":"最後撒|上一層|厚厚的|可可粉，|冷藏一|晚就完|成了！","5":"最後撒上|一層厚厚|的可可粉，|冷藏一晚|就完成了！","8":"最後撒上一層厚|厚的可可粉，冷|藏一晚就完成了！","10":"最後撒上一層厚|厚的可可粉，冷|藏一晚就完成了！","12":"最後撒上一層厚厚的可可|粉，冷藏一晚就完成了！","20":"最後撒上一層厚厚的可可|粉，冷藏一晚就完成了！","6.5":"最後撒上一層|厚厚的可可粉，|冷藏一晚就完|成了！","13.57":"最後撒上一層厚厚的可可|粉，冷藏一晚就完成了！","17.3":"最後撒上一層厚厚的可可|粉，冷藏一晚就完成了！"}],
];

test('wrapEm: Chinese breaks between any two characters exactly as before', () => {
  for (const [s, byW] of CHINESE) for (const [w, lines] of Object.entries(byW)) expect(wrapEm(s, Number(w)), `${s} @ ${w}`).toEqual(lines.split('|'));
});

test('wrapEm: a Latin word is never cut in the middle, and the space at a break is dropped', () => {
  const lines = wrapEm('Whisk the cream with sugar until soft peaks form', 12);
  expect(lines.join(' ')).toBe('Whisk the cream with sugar until soft peaks form');
  for (const l of lines) { expect(l).toBe(l.trim()); expect(l.length).toBeGreaterThan(0); }
  const words = new Set('Whisk the cream with sugar until soft peaks form'.split(' '));
  for (const l of lines) for (const w of l.split(' ')) expect(words.has(w), w).toBe(true);
  expect(wrapEm('Tiramisù déjà vu café crème brûlée', 8)).toEqual(['Tiramisù', 'déjà vu café', 'crème brûlée']);
  // numbers stay whole inside Chinese too
  for (const l of wrapEm('時間約 3 分鐘，記得每 30 秒攪拌一次', 8)) expect(l).not.toMatch(/^0/);
  expect(wrapEm('烤箱預熱到 180 度，烤 25 分鐘', 5).some((l) => l.includes('180'))).toBe(true);
});

test('wrapEm: lines stay within the width when the words allow it, and a word wider than any line still breaks', () => {
  const text = 'Pour the espresso over the ladyfingers and let them soak for a moment';
  for (const w of [8, 10, 14, 20]) for (const l of wrapEm(text, w)) expect(l.length * 0.55, `${l} @ ${w}`).toBeLessThanOrEqual(w + 1e-9);
  expect(wrapEm('Supercalifragilisticexpialidocious', 6).every((l) => l.length * 0.55 <= 6.5)).toBe(true);
  expect(wrapEm('Supercalifragilisticexpialidocious', 6).join('')).toBe('Supercalifragilisticexpialidocious');
});

test('drawTexts: one span per letter as the eye counts them, so an emoji made of several code points is one span', () => {
  const L = textLayer(document.createElement('div'));
  drawTexts(L, [{ text: '家👨‍👩‍👧', x: 0, y: 0, px: 40, color: '#000', family: 'serif' }], 1, 1);
  expect(L.slots[0].chars.map((s) => s.textContent)).toEqual(['家', '👨‍👩‍👧']);
});

test('drawTexts: maxW shrinks a line that would not fit; a line that fits, or no maxW, keeps its size', () => {
  const L = textLayer(document.createElement('div'));
  const t = { x: 0, y: 100, px: 50, color: '#000', family: 'serif' };
  drawTexts(L, [{ ...t, text: '十個字的一行字寫在這' }, { ...t, text: '十個字的一行字寫在這', maxW: 600 }, { ...t, text: '十個字的一行字寫在這', maxW: 250 }], 1, 2);
  const size = (i: number) => parseFloat(L.slots[i].box.style.fontSize);
  expect(size(0)).toBe(100);
  expect(size(1)).toBe(100);
  expect(size(2)).toBeCloseTo(50, 5);   // 10 em into 250 units: 25 units a letter, 50 px at u = 2
  expect(parseFloat(L.slots[2].box.style.top)).toBeCloseTo(100 * 2 - 50 * 1.07, 5);
});
