import { readFileSync } from 'node:fs';

test('the page switches its Chinese face to Noto Sans JP when the interface is Japanese (<html lang="ja">)', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  expect(css).toMatch(/:root:lang\(ja\)\s*\{[^}]*--cjk:\s*"Noto Sans JP"/);
  // every rule names the face through the variable: one written out would stay Chinese under ja
  expect(css.replace(/--cjk:\s*"Noto Sans TC"/, '')).not.toContain('"Noto Sans TC"');
});
