// @vitest-environment jsdom
import { loadFonts } from './fonts.ts';

test('adds the font stylesheet when it exists', async () => {
  const f = async () => new Response('/* fonts */', { status: 200 });
  const p = loadFonts(document, 'http://x/player/index.html', f as any);
  await new Promise((r) => setTimeout(r, 0));
  const link = document.head.querySelector<HTMLLinkElement>('link[data-fonts]')!;
  expect(link.href).toBe('http://x/player/fonts/fonts.css');
  link.dispatchEvent(new Event('load'));
  expect(await p).toBe(true);
});

test('without downloaded fonts the player starts and warns once', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const f = async () => new Response('', { status: 404 });
  expect(await loadFonts(document, 'http://y/index.html', f as any)).toBe(false);
  expect(await loadFonts(document, 'http://y/index.html', f as any)).toBe(false);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('npm run fonts');
  warn.mockRestore();
});
