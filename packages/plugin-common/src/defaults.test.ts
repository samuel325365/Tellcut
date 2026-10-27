// Defaults that must work as they are (review 2, C1 C2 C7): a block dropped in without params looks right.
import { DEFAULT_THEME, defaultSafe, resolveTheme, withDefaults } from '@tellcut/engine';
import { ambient } from './ambient.ts';
import { badge, badgeCenter } from './badge.ts';
import { header, headerTop } from './header.ts';
import { progress, TOP_LANE } from './progress.ts';
import { levelAt, parseLevels } from './levels.ts';
import { meter, meterBaseline } from './meter.ts';
import { list } from './list.ts';
import { routeboard } from './routeboard.ts';
import { mapjump } from './mapjump.ts';
import { ticket } from './ticket.ts';
import { snap } from './snap.ts';
import { stations } from './stations.ts';
import { mapcam } from './mapcam.ts';

const def = (t: { params: Array<{ key: string; default: unknown; theme?: string }> }, key: string) => t.params.find((p) => p.key === key)!;

test('meter: by default the number sits right under the top safe margin of the frame shape; a y of its own wins', () => {
  const y = def(meter, 'y').default as number, size = def(meter, 'size').default as number;
  for (const safe of [DEFAULT_THEME.safe, defaultSafe(1920, 1080)]) expect(meterBaseline(y, size, safe.top) - size / 100).toBeCloseTo(safe.top, 6);
  expect(meterBaseline(0.3, size, 0.115)).toBe(0.3);
});

test('meter and ambient: the default stops reach their last value inside the 3 s gallery preview', () => {
  for (const t of [meter, ambient]) {
    const levels = parseLevels(def(t, 'stops').default as string), ease = def(t, 'ease').default as number;
    expect(levelAt(levels, 0, ease)).not.toBe(levels.at(-1)!.v);
    expect(levelAt(levels, 2.6, ease)).toBeCloseTo(levels.at(-1)!.v, 0);
  }
});

test('header title and meter number: white with an outline in the theme ink, readable on light backgrounds too', () => {
  for (const t of [header, meter]) expect(def(t, 'outline')).toMatchObject({ theme: 'palette.ink' });
});

test('header: by default it sits under a progress bar or row of dots at the top, on any frame shape; a y of its own wins', () => {
  const th = def(progress, 'thickness').default as number, iconSize = def(progress, 'iconSize').default as number;
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const k = Math.min(W, H) / 1080, safeTop = defaultSafe(W, H).top;
    // the biggest default top progress: dots with emoji, the current one 1.35× (progress.ts), centred on the bar line
    const dotsBottom = safeTop * H + (th * k) / 2 + (th * k * 3.2 * iconSize * 1.35) / 2;
    expect(headerTop(def(header, 'y').default as number, safeTop) * H).toBeGreaterThan(dotsBottom);
  }
  expect(headerTop(0.4, 0.115)).toBe(0.4);
  expect(TOP_LANE).toBeLessThan(0.05);
});

test('badge: by default its top touches the top safe margin on any frame shape; a y of its own wins', () => {
  const size = def(badge, 'size').default as number;
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const r = ((size / 100) * Math.min(W, H)) / 2, safeTop = defaultSafe(W, H).top;
    expect(badgeCenter(def(badge, 'y').default as number, r, H, safeTop) - r).toBeCloseTo(safeTop * H, 6);
  }
  expect(badgeCenter(0.3, 50, 1000, 0.1)).toBe(300);
});

test('the mono params keep JetBrains Mono unless the project theme itself sets fonts.mono (the theme default Consolas does not apply)', () => {
  for (const t of [list, routeboard, mapjump, ticket, snap, stations, mapcam]) {
    expect(def(t, 'mono')).toMatchObject({ default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true });
    expect(withDefaults(t.params, {}, resolveTheme()).mono).toBe('JetBrains Mono');
    expect(withDefaults(t.params, {}, resolveTheme({ fonts: { mono: 'Fira Code' } })).mono).toBe('Fira Code');
  }
});
