// @vitest-environment jsdom
import { corePlugin } from './core.ts';
import { withDefaults } from './registry.ts';
import { resolveTheme } from './theme.ts';
import { animState, fitLines, textEm } from './text.ts';

const type = (t: string) => corePlugin.items.find((x) => x.type === t)!;
/** the main line of a text item: the first element in its box */
const main = (root: HTMLElement) => root.firstElementChild!.firstElementChild as HTMLElement;
const run = (t: string, params: Record<string, unknown>, local: number, dur = 4, W = 1920, H = 1080, input?: any) => {
  const ty = type(t), root = document.createElement('div'), theme = resolveTheme(input, { width: W, height: H });
  const ctx: any = { root, top: root, params: withDefaults(ty.params, params, theme), local, dur, t: local, W, H, theme, fps: 30, item: {}, project: {}, media: {} };
  const s = ty.build(ctx);
  ty.draw(ctx, s);
  return root;
};

test('text widths are estimated (CJK 1 em, others 0.55 em); long text wraps, then shrinks to fit the line limit', () => {
  expect([textEm('京都'), textEm('ab')]).toEqual([2, 1.1]);
  expect(fitLines('hello world foo', 6, 3)).toEqual({ lines: ['hello', 'world foo'], scale: 1 });
  // ICU reads 一一 as a word: a line breaks only between pairs, so 50 of them need 26 + 24 at 75 %
  expect(fitLines('一'.repeat(50), 20, 2)).toEqual({ lines: ['一'.repeat(26), '一'.repeat(24)], scale: 0.75 });
  expect(fitLines('一'.repeat(90), 20, 2).scale).toBe(0.7);                      // never below 70 %
  expect(fitLines('第一行\n第二行', 20, 2).lines).toEqual(['第一行', '第二行']);
});

test('fade in and out over animDur; rise moves up while it fades in; a typewriter shows part of the text', () => {
  const p = { animIn: 'fade', animOut: 'fade', animDur: 0.4 };
  expect([animState(p, 0, 4, 1920, 1080).opacity, animState(p, 2, 4, 1920, 1080).opacity, animState(p, 4, 4, 1920, 1080).opacity]).toEqual([0, 1, 0]);
  const r = animState({ ...p, animIn: 'rise' }, 0.2, 4, 1920, 1080);
  expect(r.y).toBeGreaterThan(0);
  expect(animState({ ...p, animIn: 'typewriter' }, 0.2, 4, 1920, 1080).typed).toBeCloseTo(0.5);
});

test('the four text items: title, caption (box, two lines), lower third (two lines), end card (one row per line)', () => {
  expect(corePlugin.items.map((t) => t.type)).toEqual(['core.flash', 'core.title', 'core.caption', 'core.lowerThird', 'core.endCard']);
  expect(run('core.title', { text: '京都之旅', sub: '2026 春' }, 2).textContent).toBe('京都之旅2026 春');
  const cap = run('core.caption', { text: '一'.repeat(80) }, 2);
  expect(main(cap).textContent!.split('\n').length).toBe(2);
  expect(run('core.lowerThird', { text: '伏見稻荷', sub: '3 月 7 日' }, 2).textContent).toBe('伏見稻荷3 月 7 日');
  const end = run('core.endCard', { text: '感謝觀看\n導演　小明\n攝影　小華' }, 0.35);
  const rows = [...end.querySelectorAll<HTMLElement>('[data-line]')];
  expect(rows.map((r) => r.textContent)).toEqual(['感謝觀看', '導演　小明', '攝影　小華']);
  expect(Number(rows[0].style.opacity)).toBeGreaterThan(Number(rows[2].style.opacity));   // lines come in one after another
  expect(main(run('core.title', { text: '打字機', animIn: 'typewriter', animDur: 1 }, 0.3)).textContent).toBe('打');
});

test('two lines are balanced: no lone character on the second line', () => {
  // words stay whole (toolkit phase 5): 咖啡色 is not split, even if the lines come out less even; 的 stays with it, not at a line start
  expect(fitLines('門口那個咖啡色的美人魚', 10.5, 2).lines).toEqual(['門口那個', '咖啡色的美人魚']);
  expect(fitLines('其實你從中立火車這樣走過來了', 7, 2).lines).toEqual(['其實你從中立火車', '這樣走過來了']);
  expect(fitLines('比出發還早抵達的城市', 7.8, 2).lines).toEqual(['比出發還早', '抵達的城市']);
  expect(fitLines('短短一行', 10, 2).lines).toEqual(['短短一行']);
});

test('a closing mark never starts a line and a run of bleep symbols is not split', () => {
  const lines = fitLines('這家店超好吃，老闆說的配方', 6, 3).lines;
  expect(lines.every((l) => !/^[，。！？、]/.test(l))).toBe(true);
  expect(lines.join('')).toBe('這家店超好吃，老闆說的配方');
  expect(fitLines('老闆說的＊＃％＠配方', 6, 3).lines.some((l) => l.includes('＊＃％＠'))).toBe(true);
});

test('the core text items keep to the theme: captions on the bottom safe margin, the lower third above them, the theme fonts', () => {
  const box = (t: string, W: number, H: number, input?: any) => run(t, { text: 'x' }, 2, 4, W, H, input).firstElementChild as HTMLElement;
  expect(box('core.caption', 1920, 1080).style.bottom).toBe('12%');
  expect(box('core.caption', 1080, 1920).style.bottom).toBe('22%');
  expect(box('core.caption', 1080, 1920, { safe: { bottom: 0.3 } }).style.bottom).toBe('30%');
  // above the captions' zone (up to two lines): both can show at once
  expect([box('core.lowerThird', 1920, 1080).style.left, box('core.lowerThird', 1920, 1080).style.bottom]).toEqual(['5%', '26%']);
  expect(box('core.lowerThird', 1080, 1920).style.bottom).toBe('36%');
  const fonts = Object.fromEntries(['core.title', 'core.caption', 'core.lowerThird', 'core.endCard'].map((t) => [t, type(t).params.find((p) => p.key === 'font')!.theme]));
  expect(fonts).toEqual({ 'core.title': 'fonts.display', 'core.caption': 'fonts.body', 'core.lowerThird': 'fonts.body', 'core.endCard': 'fonts.display' });
  expect(main(run('core.caption', { text: 'x' }, 2, 4, 1920, 1080, { fonts: { body: 'Noto Serif TC' } })).style.fontFamily).toContain('Noto Serif TC');
});

test('a particle or a measure word never starts a line: 的 了 嗎 側 邊… stay with the word before them', () => {
  for (const s of ['我們現在在日本海這一側', '這裡有很多小的魚在游', '日本海這一側的海浪比較大', '你今天吃飽了嗎我們走吧']) {
    for (let em = 3; em <= 10; em++) {
      const lines = fitLines(s, em, 3, 0.5).lines;
      expect([s, em, lines.slice(1).filter((l) => /^[的了著過嗎呢吧啊呀啦喔哦嘛們側邊面裡]/.test(l))]).toEqual([s, em, []]);
      expect([s, em, lines.some((l) => l.endsWith('這一'))]).toEqual([s, em, false]);
    }
  }
});
