// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { resolveTheme, setTheme, ThemeToggle } from './theme.tsx';

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } delete document.documentElement.dataset.theme; });

test('a theme chosen here wins; otherwise the system decides; anything else is dark', () => {
  expect(resolveTheme('light', false)).toBe('light');
  expect(resolveTheme('dark', true)).toBe('dark');
  expect(resolveTheme(null, true)).toBe('light');
  expect(resolveTheme('bogus', false)).toBe('dark');
});

test('the toggle switches the page and remembers it in this browser', async () => {
  document.documentElement.dataset.theme = 'dark';
  const root = document.createElement('div');
  await act(async () => { render(<ThemeToggle />, root); });
  const btn = root.querySelector<HTMLButtonElement>('[data-theme-toggle]')!;
  expect(btn.getAttribute('data-tip')).toBe('切換成亮色');
  await act(() => { btn.click(); });
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('tellcut.theme')).toBe('light');
  expect(btn.getAttribute('data-tip')).toBe('切換成暗色');
});

test('a browser that keeps nothing still switches', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => setTheme('light')).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe('light');
  spy.mockRestore();
});
