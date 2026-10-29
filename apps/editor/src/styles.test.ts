import { readFileSync } from 'node:fs';

test('the page switches its Chinese face to Noto Sans JP when the interface is Japanese (<html lang="ja">)', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  expect(css).toMatch(/:root:lang\(ja\)\s*\{[^}]*--cjk:\s*"Noto Sans JP"/);
  // every rule names the face through the variable: one written out would stay Chinese under ja
  expect(css.replace(/--cjk:\s*"Noto Sans TC"/, '')).not.toContain('"Noto Sans TC"');
});

// the black and cream theme (spec 2026-10-30-showcase-films §1)
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const tokens = (body: string | undefined) => Object.fromEntries([...(body ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const DARK = tokens(/:root \{\n([^}]*--s-bg[^}]*)\}/.exec(css)?.[1]), LIGHT = tokens(/:root\[data-theme="light"\] \{([^}]*)\}/.exec(css)?.[1]);
const ED = tokens(/:root \{ (color-scheme: dark;[^}]*)\}/.exec(css)?.[1]), CHAT = tokens(/\.chat-tab \{(\s*--h-bg[^}]*)\}/.exec(css)?.[1]);
const lum = (hex: string) => {
  const c = hex.replace('#', ''), v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the theme is black and cream; the selection stays yellow', () => {
  expect(DARK['--s-accent']).toBe('#d8b88a');
  expect(LIGHT['--s-accent']).toBe('#161412');
  expect(ED['--accent']).toBe('#d8b88a');
  expect(ED['--sel']).toBe('#ffd60a');
  expect(CHAT['--h-accent']).toBe('#d8b88a');
  expect(css).not.toMatch(/#0a84ff|#a855f7|#9333ea|#7c4dff|#d97757|168,\s*85,\s*247|147,\s*51,\s*234/i);
});
test.each([['dark', DARK], ['light', LIGHT]])('home %s: text reads on the page and on the accent (WCAG AA)', (_, t) => {
  expect(contrast(t['--s-text'], t['--s-bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(t['--s-dim'], t['--s-bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(t['--s-on-accent'], t['--s-accent'])).toBeGreaterThanOrEqual(4.5);
});
test('editor and its chat: text reads on the panels and on the accent', () => {
  expect(contrast(ED['--text'], ED['--panel'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(ED['--on-accent'], ED['--accent'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(CHAT['--h-on-accent'], CHAT['--h-accent'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(ED['--playhead'], ED['--bg'])).toBeGreaterThanOrEqual(3);
});
test('no rule puts white text on the accent or the gradient', () => {
  const rules = css.split('}').filter((r) => /background:\s*var\(--(s-accent|s-grad|accent|h-accent)\b/.test(r));
  expect(rules.length).toBeGreaterThan(5);
  expect(rules.filter((r) => /(^|[;{\s])color:\s*#fff\b/.test(r)).map((r) => r.trim().slice(0, 80))).toEqual([]);
});

// final review of the black and cream theme (C1, I2, M3)
test('every rule that paints the accent as a background sets the matching on-accent text colour', () => {
  const rules = css.split('}').filter((r) => /background:\s*var\(--(s-accent|s-grad|accent|h-accent)\)/.test(r) && /(button|\.on\b|primary|picked|aria-selected|\.mark|\.logo)/.test(r) && !/::(after|before)/.test(r));   // a dot or a bar has no text
  expect(rules.length).toBeGreaterThan(8);
  expect(rules.filter((r) => !/color:\s*var\(--(s-|h-)?on-accent\)/.test(r)).map((r) => r.trim().slice(0, 70))).toEqual([]);
  // the small counts inside a picked segment or page read on the accent too
  for (const sel of ['.library .lib-pages button[aria-selected="true"] small', '.library .seg.picked small'])
    expect(css).toContain(`${sel} { color: var(--on-accent)`);
});
test('the playhead has a dark edge, so it reads on brown clips and bright thumbnails', () => {
  expect(/\.playhead \{[^}]*box-shadow:[^}]*rgba\(0,\s*0,\s*0/.test(css)).toBe(true);
  expect(/\.playhead-razor \{[^}]*#ff375f/.test(css)).toBe(false);
});
test('no blue is left (the audition banner, transitions)', () => {
  expect(css).not.toMatch(/rgba\(10,\s*132,\s*255/);
});
