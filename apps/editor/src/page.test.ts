import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the page brings its own tab icon: the browser does not ask the server for /favicon.ico (a 404 in the console)', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/);
});

test('the home page and the gallery pick their theme before the first paint; the editor (?id=) gets none and stays dark', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  expect(script).not.toBeNull();
  expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<link rel="stylesheet"'));
  const run = (search: string, stored: string | null, light: boolean) => {
    const el = { dataset: {} as Record<string, string> };
    new Function('location', 'localStorage', 'matchMedia', 'document', script![1])(
      { search }, { getItem: () => stored }, () => ({ matches: light }), { documentElement: el });
    return el.dataset.theme;
  };
  expect(run('', 'light', false)).toBe('light');
  expect(run('?gallery', null, true)).toBe('light');
  expect(run('', null, false)).toBe('dark');
  expect(run('?id=kao1', 'light', true)).toBeUndefined();
});

test('settings saved under the old name (studio.*) move to tellcut.* once, before the theme is read; a newer tellcut.* one wins', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const m = new Map([['studio.theme', 'light'], ['studio.layout', '{"a":1}'], ['studio.quality', 'low'], ['tellcut.quality', 'high'], ['other', 'x']]);
  const storage = {
    get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); },
  };
  const el = { dataset: {} as Record<string, string> };
  new Function('location', 'localStorage', 'matchMedia', 'document', script)({ search: '' }, storage, () => ({ matches: false }), { documentElement: el });
  expect(Object.fromEntries(m)).toEqual({ 'tellcut.theme': 'light', 'tellcut.layout': '{"a":1}', 'tellcut.quality': 'high', other: 'x' });
  expect(el.dataset.theme).toBe('light');
});
