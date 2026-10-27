// Light or dark for the home page, the gallery and the import browser (spec 2026-10-20-home-gallery-refresh §4). index.html picks
// it before the first paint (the same rule as resolveTheme); the editor (?id=) gets none and stays as it always was.
import { useState } from 'preact/hooks';
import { IconMoon, IconSun } from './icons.tsx';
import { t } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'tellcut.theme';

/** a theme chosen in this browser wins, else the system's */
export const resolveTheme = (stored: string | null, prefersLight: boolean): Theme =>
  stored === 'light' || stored === 'dark' ? stored : prefersLight ? 'light' : 'dark';

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* not kept: this visit only */ }
}

export function ThemeToggle() {
  useLang();   // the tip is worded in the chosen language
  const [cur, setCur] = useState(currentTheme);
  const next: Theme = cur === 'dark' ? 'light' : 'dark', tip = t(next === 'light' ? 'theme.toLight' : 'theme.toDark');
  return (
    <button class="icon-btn theme-toggle" data-theme-toggle data-tip={tip} aria-label={tip}
      onClick={() => { setTheme(next); setCur(next); }}>
      {cur === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
    </button>
  );
}
