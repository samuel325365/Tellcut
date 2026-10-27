import { plugins } from './index.ts';

// whenReady() waits for document.fonts, which only tracks @font-face fonts; with system fonts nothing can be missing.
// A webfont used only inside a hidden layer would not be loaded before the first capture (Plan 1 M-7).
test('plugin styles use system fonts only', () => {
  for (const p of plugins) expect(p.css ?? '').not.toMatch(/@font-face|@import|url\([^)]*\.(woff2?|ttf|otf)/i);
});

test('an fx outside the project folder (another site, ../) is refused before anything is fetched: it would run as the page', async () => {
  const { importFx } = await import('./browser-fx.ts');
  const r = await importFx('http://127.0.0.1:5174/api/projects/a/files/project.json', ['https://evil.example/x.js', '../../b/files/fx/y.js', '//evil.example/z.js']);
  expect(r.errors.map((e) => e.message)).toEqual(['https://evil.example/x.js 在專案資料夾之外', '../../b/files/fx/y.js 在專案資料夾之外', '//evil.example/z.js 在專案資料夾之外']);
});
