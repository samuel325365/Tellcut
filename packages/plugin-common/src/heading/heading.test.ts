// common.heading's pure parts: where each layout puts a title, how full grows it, its own entrances and exits, and which looks it offers.
import { defaultSafe, textEm } from '@tellcut/engine';
import { caption } from '../caption.ts';
import { fitTitleSize, HEADING_LOOKS, TITLE_LAYOUTS, titleAnim, titlePlace, titleSpacing } from './index.ts';

test('every layout stays inside the safe area, in 9:16 and 16:9', () => {
  for (const safe of [defaultSafe(1080, 1920), defaultSafe(1920, 1080)]) {
    for (const l of TITLE_LAYOUTS) {
      const pl = titlePlace(l, safe);
      if (pl.y >= 0) { expect(pl.y, l).toBeGreaterThan(safe.top); expect(pl.y, l).toBeLessThanOrEqual(1 - safe.bottom); }
    }
    expect(titlePlace('lower', safe)).toMatchObject({ align: 'left', position: 'bottom', right: false });
    expect(titlePlace('lower', safe).y).toBeCloseTo(1 - safe.bottom - 0.06, 6);
    expect(titlePlace('corner', safe)).toMatchObject({ position: 'top', right: true, scale: 0.45 });
    expect(titlePlace('center', safe).scale).toBe(1);
    expect(titlePlace('nope', safe)).toEqual(titlePlace('center', safe));
  }
});

test('full sizes a title so its longest line fills the safe width (at most 0.4 of the short side); other layouts keep the size', () => {
  const zh = fitTitleSize('七百年', 9, 1080, 1920, 0.06, true);
  expect(zh).toBeGreaterThan(9);
  // one character: capped at 0.4 × 1080 px of a 9:16 frame; four with giant's 1.35×: smaller than the size asked for, on one line
  expect((fitTitleSize('粉', 9, 1080, 1920, 0.12, true, 1.35) / 100) * 1920).toBeCloseTo(432, 3);
  const four = fitTitleSize('馬拉喀什', 9, 1080, 1920, 0.12, true, 1.35);
  expect(four).toBeLessThan(9);
  expect(4 * 1.04 * 1.35 * (four / 100) * 1920).toBeCloseTo(1080 * 0.76, 3);
  expect(fitTitleSize('一座廣場的七百年', 9, 1080, 1920, 0.06, false)).toBe(9);
  const en = 'We walked all the way to the Colosseum', px = (fitTitleSize(en, 4, 1920, 1080, 0.05, true) / 100) * 1080;
  expect(textEm(en) * px).toBeLessThanOrEqual(1920 * 0.9);
  // markup is not counted, and the longest line decides
  expect(fitTitleSize('【短】\n長一點的第二行', 5, 1080, 1920, 0.06, true)).toBeCloseTo(fitTitleSize('長一點的第二行', 5, 1080, 1920, 0.06, true), 6);
  // a look that draws bigger by itself (giant 1.35×) is fitted smaller, so the line still fits
  expect(fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true, 1.35) * 1.35).toBeCloseTo(fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true), 6);
  // a look's room (a box's padding out, its spacing): the line fills the room the caption will give it, not the whole width
  const padded = (px: number) => 1080 * 0.76 * 0.9 - 1.3 * px, boxed = fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true, 1, padded), P = (boxed / 100) * 1920;
  expect(2 * 1.04 * P).toBeCloseTo(padded(P), 6);
  expect(fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true, 1, () => 1080 * 0.76)).toBeCloseTo(fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true), 6);
});

test('the title\'s own entrances and exits: in the title\'s pixels, clipped to its block', () => {
  // a block 600×200 at (240, 300) in a 1080×1920 frame, words 150 px
  const g = { x: 240, y: 300, w: 600, h: 200, W: 1080, H: 1920, fs: 150 };
  const at = (a: string, b: string, t: number) => titleAnim(a, b, t, 3, 0.6, g);
  expect(titleSpacing('track', 'none', 0, 3, 0.6)).toBeGreaterThan(titleSpacing('track', 'none', 0.3, 3, 0.6));
  expect(titleSpacing('track', 'none', 0.7, 3, 0.6)).toBe(0);
  expect(titleSpacing('none', 'spread', 2.9, 3, 0.6)).toBeGreaterThan(0);
  // mask: the words start a whole block lower, under a window whose bottom edge stays at the block's (moved back by as much)
  expect(at('mask', 'none', 0).clip).toBe('inset(210.00px 150.00px 1620.00px 150.00px)');
  expect(at('mask', 'none', 0).transform).toBe('translateY(200.00px)');
  expect(at('mask', 'none', 1).clip).toBe('');
  // open: from the block's middle (540), not the frame's share
  expect(at('open', 'none', 0).clip).toBe('inset(210.00px 540.00px 1330.00px 540.00px)');
  expect(at('focus', 'none', 0).filter).toBe('blur(30.00px)');
  expect(at('focus', 'none', 0).transformOrigin).toBe('540.00px 400.00px');
  expect(at('none', 'sink', 3).clip).toBe('inset(210.00px 150.00px 1620.00px 150.00px)');
  expect(at('none', 'sink', 3).transform).toBe('translateY(200.00px)');
  expect(at('rule', 'none', 0.12)).toMatchObject({ textOpacity: 0 });
  expect(at('rule', 'none', 0.12).ruleP).toBeGreaterThan(0);
  expect(at('none', 'spread', 3).opacity).toBe(0);
  // anything else is the caption's: neutral here
  expect(at('rise', 'fade', 0.1)).toMatchObject({ opacity: 1, transform: '', clip: '', filter: '', ruleP: 1, textOpacity: 1 });
});

test('a title\'s own looks: offered to titles only, each with a template', async () => {
  const { LOOKS } = await import('../caption.ts');
  const { TITLE_TEMPLATES } = await import('./templates.ts');
  const own = LOOKS.filter((l) => l.only === 'title').map((l) => l.id);
  expect(own.sort()).toEqual(['cycle', 'didone', 'giant', 'pop', 'ribbon', 'scrapbook', 'script', 'seal', 'serif', 'sign', 'spaced', 'split', 'stack', 'storybook', 'vintage']);
  const styles = (caption.params.find((d) => d.key === 'style') as { options: string[] }).options;
  for (const id of own) { expect(HEADING_LOOKS).toContain(id); expect(styles).not.toContain(id); expect(TITLE_TEMPLATES.some((t) => t.params.style === id), id).toBe(true); }
  expect(TITLE_TEMPLATES.length).toBe(47);
});

test('a title offers every look but the layouts made for talk; a caption never offers a title\'s own looks', () => {
  for (const id of ['qa', 'news', 'chat', 'dialog', 'bar', 'lyric']) expect(HEADING_LOOKS).not.toContain(id);
  for (const id of ['outline', 'heavy', 'neon', 'gold']) expect(HEADING_LOOKS).toContain(id);
  const styles = (caption.params.find((d) => d.key === 'style') as { options: string[] }).options;
  expect(styles).toContain('qa');
  expect(styles.filter((s) => !HEADING_LOOKS.includes(s)).sort()).toEqual(['bar', 'chat', 'dialog', 'lyric', 'news', 'qa']);
});
