// Word effects and the newer entrances and exits: the pure parts (which characters a word is, when it is said, what the line does).
import { ANIM_IN, ANIM_OUT, ENGINE_IN, ENGINE_OUT, jitter, lineAnim, wordIn } from './anim.ts';
import { evenWords, wordsOf } from './wordfx.ts';

test('words from the transcript: each step’s characters, the last reaching the end, a leading space given to the word before', () => {
  const plain = 'We walked home';
  expect(wordsOf([[0, 2], [0.5, 9], [1, 13]], [...plain].length, plain)).toEqual([{ a: 0, b: 3, t: 0 }, { a: 3, b: 10, t: 0.5 }, { a: 10, b: 14, t: 1 }]);
  expect(wordsOf([[0, 2], [0.4, 4]], 4)).toEqual([{ a: 0, b: 2, t: 0 }, { a: 2, b: 4, t: 0.4 }]);   // Chinese: no spaces to move
  expect(wordsOf([[0, 0], [0.3, 2]], 2)).toEqual([{ a: 0, b: 2, t: 0.3 }]);                       // an empty step is no word
});

test('a caption typed by hand: its words spread from 0.15 s to 0.5 s before the end, by length, punctuation kept with its word', () => {
  const ws = evenWords('Hello there, world', 3);
  expect(ws.map((w) => [w.a, w.b])).toEqual([[0, 6], [6, 13], [13, 18]]);
  expect(ws[0].t).toBeCloseTo(0.15);
  expect(ws.every((w, i) => !i || w.t > ws[i - 1].t)).toBe(true);
  expect(ws[2].t).toBeLessThan(2.5);
  const zh = evenWords('今天天氣很好', 2);
  expect(zh.length).toBeGreaterThan(1);
  expect(zh[zh.length - 1].b).toBe(6);
  expect(evenWords('', 2)).toEqual([]);
});

test('the engine’s own entrances and exits are left to it: lineAnim is neutral for them', () => {
  for (const a of ENGINE_IN) for (const b of ENGINE_OUT) for (const t of [0, 0.1, 1, 2.9]) expect(lineAnim(a, b, t, 3, 0.3, 80)).toEqual({ opacity: 1, transform: '', filter: '', clip: '', mask: '' });
});

test('every newer entrance moves the line at its start and leaves it still by the end of animDur; every exit at its end', () => {
  for (const a of ANIM_IN.filter((x) => !ENGINE_IN.has(x) && x !== 'drop' && x !== 'scatter')) {
    expect(lineAnim(a, 'none', 0.05, 3, 0.3, 80), a).not.toEqual({ opacity: 1, transform: '', filter: '', clip: '', mask: '' });
    expect(lineAnim(a, 'none', 1.5, 3, 0.3, 80), a).toEqual({ opacity: 1, transform: '', filter: '', clip: '', mask: '' });
  }
  for (const b of ANIM_OUT.filter((x) => !ENGINE_OUT.has(x))) {
    expect(lineAnim('none', b, 2.95, 3, 0.3, 80), b).not.toEqual({ opacity: 1, transform: '', filter: '', clip: '', mask: '' });
    expect(lineAnim('none', b, 1.5, 3, 0.3, 80), b).toEqual({ opacity: 1, transform: '', filter: '', clip: '', mask: '' });
  }
});

test('glitch and scatter are the same at the same moment (draw(t) is a pure function of t)', () => {
  expect(lineAnim('glitch', 'none', 0.1, 3, 0.3, 80)).toEqual(lineAnim('glitch', 'none', 0.1, 3, 0.3, 80));
  expect(wordIn('scatter', 2, 5, 0.2, 80)).toEqual(wordIn('scatter', 2, 5, 0.2, 80));
  expect(jitter(3)).toBeGreaterThanOrEqual(0);
  expect(jitter(3)).toBeLessThan(1);
});

test('drop: the words come down one after another and land; scatter: they gather from around', () => {
  const early = wordIn('drop', 0, 4, 0.05, 80), late = wordIn('drop', 3, 4, 0.05, 80);
  expect(early.y).toBeLessThan(0);
  expect(late.opacity).toBe(0);
  expect(wordIn('drop', 3, 4, 1, 80)).toMatchObject({ opacity: 1 });
  expect(Math.abs(wordIn('drop', 3, 4, 1, 80).y)).toBe(0);
  expect(Math.hypot(wordIn('scatter', 1, 4, 0, 80).x, wordIn('scatter', 1, 4, 0, 80).y)).toBeGreaterThan(40);
  const still = wordIn('scatter', 1, 4, 1, 80);
  expect([still.opacity, Math.abs(still.x), Math.abs(still.y)]).toEqual([1, 0, 0]);
});

test('a caption typed by hand is cut into words in the engine\'s locale, not the machine\'s', async () => {
  const Real = Intl.Segmenter, locales: unknown[] = [];
  (Intl as any).Segmenter = class extends Real { constructor(l?: any, o?: any) { super(l, o); if (o?.granularity === 'word') locales.push(l); } };
  try {
    vi.resetModules();
    const fresh = await import('./wordfx.ts');
    fresh.evenWords('今天帶你去吃台南', 3);
    // the engine's own (reloaded with it) and evenWords': every word segmenter in zh-Hant (graphemes are cut the same in every locale)
    expect(locales.length).toBeGreaterThan(0);
    expect(locales.every((l) => l === 'zh-Hant')).toBe(true);
  } finally { (Intl as any).Segmenter = Real; vi.resetModules(); }
});

test('a boxed look\'s right padding (em) is what the typing caret may hang into', async () => {
  const { rightPadEm } = await import('./index.ts');
  expect([rightPadEm({ padding: '0.18em 0.6em' }), rightPadEm({ padding: '0.28em 0.7em 0.3em 0.95em' }), rightPadEm({ padding: '0.5em' })]).toEqual([0.6, 0.7, 0.5]);
  expect([rightPadEm({ padding: '0 12px' }), rightPadEm({}), rightPadEm(undefined)]).toEqual([0, 0, 0]);
});
