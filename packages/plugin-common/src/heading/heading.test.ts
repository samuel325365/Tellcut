// common.heading's pure parts: where each layout puts a title, how full grows it, its own entrances and exits, and which looks it offers.
import { defaultSafe, textEm } from '@tellcut/engine';
import { caption } from '../caption.ts';
import { fitTitleSize, HEADING_LOOKS, TITLE_LAYOUTS, titleAnim, titlePlace } from './index.ts';

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

test('full grows a title until its longest line fills the safe width (at most 30 %); other layouts keep the size', () => {
  const zh = fitTitleSize('七百年', 9, 1080, 1920, 0.06, true);
  expect(zh).toBeGreaterThan(9);
  expect(zh).toBeLessThanOrEqual(30);
  expect(fitTitleSize('一座廣場的七百年', 9, 1080, 1920, 0.06, false)).toBe(9);
  const en = 'We walked all the way to the Colosseum', px = (fitTitleSize(en, 4, 1920, 1080, 0.05, true) / 100) * 1080;
  expect(textEm(en) * px).toBeLessThanOrEqual(1920 * 0.9);
  // markup is not counted, and the longest line decides
  expect(fitTitleSize('【短】\n長一點的第二行', 5, 1080, 1920, 0.06, true)).toBeCloseTo(fitTitleSize('長一點的第二行', 5, 1080, 1920, 0.06, true), 6);
  // a look that draws bigger by itself (giant 1.35×) is fitted smaller, so the line still fits
  expect(fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true, 1.35) * 1.35).toBeCloseTo(fitTitleSize('羅馬', 5, 1080, 1920, 0.12, true), 6);
});

test('the title\'s own entrances and exits', () => {
  const at = (a: string, b: string, t: number) => titleAnim(a, b, t, 3, 0.6);
  expect(parseFloat(at('track', 'none', 0, ).letterSpacing)).toBeGreaterThan(parseFloat(at('track', 'none', 0.3).letterSpacing));
  expect(at('track', 'none', 0.7).letterSpacing).toBe('');
  expect(at('mask', 'none', 0).clip).toBe('inset(100.00% -0.5em -0.5em -0.5em)');
  expect(at('mask', 'none', 1).clip).toBe('');
  expect(at('open', 'none', 0).clip).toBe('inset(-0.5em 50.00% -0.5em 50.00%)');
  expect(at('rule', 'none', 0.12)).toMatchObject({ textOpacity: 0 });
  expect(at('rule', 'none', 0.12).ruleP).toBeGreaterThan(0);
  expect(at('none', 'spread', 3).opacity).toBe(0);
  expect(parseFloat(at('none', 'spread', 2.9).letterSpacing)).toBeGreaterThan(0);
  // anything else is the caption's: neutral here
  expect(at('rise', 'fade', 0.1)).toEqual({ opacity: 1, transform: '', clip: '', filter: '', letterSpacing: '', ruleP: 1, textOpacity: 1 });
});

test('a title\'s own looks: offered to titles only, each with a template', async () => {
  const { LOOKS } = await import('../caption.ts');
  const { TITLE_TEMPLATES } = await import('./templates.ts');
  const own = LOOKS.filter((l) => l.only === 'title').map((l) => l.id);
  expect(own.sort()).toEqual(['giant', 'ribbon', 'script', 'seal', 'serif', 'sign', 'spaced', 'split', 'stack', 'vintage']);
  const styles = (caption.params.find((d) => d.key === 'style') as { options: string[] }).options;
  for (const id of own) { expect(HEADING_LOOKS).toContain(id); expect(styles).not.toContain(id); expect(TITLE_TEMPLATES.some((t) => t.params.style === id), id).toBe(true); }
  expect(TITLE_TEMPLATES.length).toBe(20);
});

test('a title offers every look but the layouts made for talk; a caption never offers a title\'s own looks', () => {
  for (const id of ['qa', 'news', 'chat', 'dialog', 'bar', 'lyric']) expect(HEADING_LOOKS).not.toContain(id);
  for (const id of ['outline', 'heavy', 'neon', 'gold']) expect(HEADING_LOOKS).toContain(id);
  const styles = (caption.params.find((d) => d.key === 'style') as { options: string[] }).options;
  expect(styles).toContain('qa');
  expect(styles.filter((s) => !HEADING_LOOKS.includes(s)).sort()).toEqual(['bar', 'chat', 'dialog', 'lyric', 'news', 'qa']);
});
