import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = () => readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

test('the page brings its own tab icon: the browser does not ask the server for /favicon.ico (a 404 in the console)', () => {
  expect(html()).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/);
});

test('the page has no inline script: the server allows only its own script files (no unsafe-inline)', () => {
  expect(html()).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
});

test('the home page and the gallery pick their theme before the first paint; the editor (?id=) gets none and stays dark', () => {
  // a classic (blocking) script ahead of the stylesheet, served as it is from public/
  const page = html(), tag = /<script src="\.\/theme-first\.js"><\/script>/.exec(page);
  expect(tag).not.toBeNull();
  expect(page.indexOf(tag![0])).toBeLessThan(page.indexOf('<link rel="stylesheet"'));
  const script = readFileSync(join(__dirname, '..', 'public', 'theme-first.js'), 'utf8');
  const run = (search: string, stored: string | null, light: boolean) => {
    const el = { dataset: {} as Record<string, string> };
    new Function('location', 'localStorage', 'matchMedia', 'document', script)(
      { search }, { getItem: () => stored }, () => ({ matches: light }), { documentElement: el });
    return el.dataset.theme;
  };
  expect(run('', 'light', false)).toBe('light');
  expect(run('?gallery', null, true)).toBe('light');
  expect(run('', null, false)).toBe('dark');
  expect(run('?id=demo1', 'light', true)).toBeUndefined();
});
