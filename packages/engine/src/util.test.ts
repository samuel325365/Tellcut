import { prog, eIO3, eBack, fadeWin, win, rng, clamp, scopeIds } from './util.ts';

test('prog clamps to [0,1]', () => {
  expect(prog(-1, 0, 2)).toBe(0);
  expect(prog(1, 0, 2)).toBe(0.5);
  expect(prog(5, 0, 2)).toBe(1);
});

test('easings hit their endpoints', () => {
  for (const f of [eIO3, (p: number) => eBack(p), (p: number) => eBack(p, 1.7)]) {
    expect(f(0)).toBeCloseTo(0, 10);
    expect(f(1)).toBeCloseTo(1, 10);
  }
});

test('fadeWin and win shape a window', () => {
  expect(fadeWin(1, 0, 2, 0.2)).toBe(1);
  expect(fadeWin(0.1, 0, 2, 0.2)).toBeCloseTo(0.5);
  expect(win(1.85, 0, 2, 0.3, 0.3)).toBeCloseTo(0.5);
});

test('rng matches the original Park-Miller generator', () => {
  const r = rng(20241225);
  let s = 20241225;
  const ref = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5; i++) expect(r()).toBe(ref());
  expect(clamp(5, 0, 1)).toBe(1);
});

test('scopeIds prefixes every id and every reference to it', () => {
  const svg = '<defs><linearGradient id="g"/><filter id="g2"/></defs><rect fill="url(#g)" filter="url(#g2)"/><use href="#g"/>';
  expect(scopeIds(svg, 'it1')).toBe('<defs><linearGradient id="it1-g"/><filter id="it1-g2"/></defs><rect fill="url(#it1-g)" filter="url(#it1-g2)"/><use href="#it1-g"/>');
});

test('scoped SVG ids stay valid when the item id has spaces or quotes', () => {
  const out = scopeIds('<g id="a"/><use href="#a"/><rect fill="url(#a)"/>', 'my "clip" 1');
  expect(out).toBe('<g id="my__clip__1-a"/><use href="#my__clip__1-a"/><rect fill="url(#my__clip__1-a)"/>');
});

test('scopeIds keeps uids in other scripts apart (片頭 and 片尾 do not collide)', () => {
  const svg = '<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/>';
  const a = scopeIds(svg, '片頭'), b = scopeIds(svg, '片尾');
  expect(a).not.toBe(b);
  expect(a).toMatch(/id="[A-Za-z0-9_-]+-g"/);
});

test('prog over an empty span is a step at it, never NaN', () => {
  expect([prog(1.9, 2, 2), prog(2, 2, 2), prog(3, 2, 2), prog(0, 0, 0)]).toEqual([0, 1, 1, 1]);
  expect([fadeWin(0.5, 1, 3, 0), fadeWin(1, 1, 3, 0), fadeWin(2.9, 1, 3, 0), fadeWin(3, 1, 3, 0)]).toEqual([0, 1, 1, 0]);
});
