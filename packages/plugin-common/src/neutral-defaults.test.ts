// Blocks promoted from one film kept that film's words and look as their defaults (a sin meter, a recipe's doodles, one podcast's
// line sizes). A block dropped in without params should look like the plain version of itself; the film's look stays one param away.
import { DEFAULT_THEME, resolveTheme, withDefaults } from '@tellcut/engine';
import { quote, quoteSizes } from './quote.ts';
import { gauge, gaugeLook, neutralOf } from './gauge.ts';
import { paper } from './paper.ts';
import { notecard, parseChecklist } from './notecard.ts';
import tokenBlocks from './token.ts';
import { healthbar } from './healthbar.ts';
import { burst } from './burst.ts';
import { slam } from './slam.ts';
import { bounce } from './bounce.ts';
import { postage } from './postage.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!;

test('quote: line sizes and serif lines are automatic by default (the hit line big, no serif line)', () => {
  expect(def(quote, 'sizes').default).toBe('');
  expect(def(quote, 'serif').default).toBe('');
  expect(quoteSizes('', 5, 4, false)).toEqual([118, 118, 118, 118, 232]);
});

test('gauge: the default look is neutral, so a gauge dropped in has no sin zones, halo, alarm or blow-up', () => {
  const P = Object.fromEntries(gauge.params.map((d) => [d.key, d.default])) as any;
  expect(P.look).toBe('neutral');
  const n = gaugeLook(P);
  expect([n.zones, n.halo, n.danger, n.boom]).toEqual([neutralOf(100).zones, false, -1, -1]);
  expect(gauge.doc).toMatch(/look: guilt/);
});

test('paper: no doodles and no signature by default; the doodle sets are still there when asked for', () => {
  expect(def(paper, 'doodles').default).toBe(false);
  expect(def(paper, 'sign').default).toBe('');
  expect(paper.doc).not.toMatch(/預設是食譜的/);
});

test('notecard: the default list is not a recipe’s ingredients', () => {
  const items = parseChecklist(def(notecard, 'items').default as string);
  expect(items.length).toBe(3);
  for (const w of ['濃咖啡', '鮮奶油', '可可']) expect(items.join('|')).not.toContain(w);
  expect(def(notecard, 'count').default).toBe('{n} 項');
});

test('token and healthbar are offered to the agent only when the user names them', () => {
  expect(tokenBlocks[0]).toMatchObject({ type: 'common.token', onRequest: true });
  expect(healthbar).toMatchObject({ type: 'common.healthbar', onRequest: true });
});

test('hl and ink take the theme field every other block takes (palette.hl, palette.ink), only when the project sets it', () => {
  for (const t of [burst, slam, bounce]) expect(def(t, 'hl')).toMatchObject({ theme: 'palette.hl', themeIfSet: true });
  expect(def(burst, 'ink')).toMatchObject({ theme: 'palette.ink' });
  expect(def(postage, 'ink')).toMatchObject({ theme: 'palette.ink', themeIfSet: true });
  // a project without a theme keeps each block's own colour (the built-in yellow highlight would recolour every old film)
  for (const t of [burst, slam, bounce]) expect(withDefaults(t.params, {}, resolveTheme()).hl).toBe('#ff4d4f');
  expect(withDefaults(postage.params, {}, resolveTheme()).ink).toBe('#b2382c');
  expect(DEFAULT_THEME.palette.hl).not.toBe('#ff4d4f');
  // a project that sets them gets its own
  const own = resolveTheme({ palette: { hl: '#00ff00', ink: '#123456', accent: '#ff00ff' } });
  for (const t of [burst, slam, bounce]) expect(withDefaults(t.params, {}, own).hl).toBe('#00ff00');
  expect(withDefaults(postage.params, {}, own).ink).toBe('#123456');
});
