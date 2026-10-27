// The UI language (spec 2026-10-23 languages-b §8): zh / en / ja, kept in this browser's localStorage. Absent or odd: the browser's
// own language decides (zh* -> zh, ja* -> ja, else en). Every storage access is guarded; when it is blocked the choice lives in memory.
import { useEffect, useState } from 'preact/hooks';
import type { Lang } from '@tellcut/protocol';

export const LANG_KEY = 'tellcut.lang';

const isLang = (x: unknown): x is Lang => x === 'zh' || x === 'en' || x === 'ja';

export function defaultLang(nav: { language?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator): Lang {
  const l = (nav?.language ?? '').toLowerCase();
  return l.startsWith('zh') ? 'zh' : l.startsWith('ja') ? 'ja' : 'en';
}

// set only when the choice could not be stored: then it is the only place it is kept
let memory: Lang | undefined;
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  if (memory) return memory;
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (isLang(s)) return s;
  } catch { /* blocked: the browser's language */ }
  return defaultLang();
}

const HTML_LANG: Record<Lang, string> = { zh: 'zh-Hant', en: 'en', ja: 'ja' };
/** keeps <html lang> in step with the choice (screen readers, hyphenation, CJK font selection) */
function markDocument(l: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[l];
}

export function setLang(l: Lang): void {
  try { localStorage.setItem(LANG_KEY, l); memory = undefined; } catch { memory = l; }
  markDocument(l);
  for (const f of [...listeners]) f(l);
}

/** called once at start: the page's lang attribute follows the stored language */
export function initDocumentLang(): void { markDocument(getLang()); }

export function onLang(f: (l: Lang) => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

export function useLang(): Lang {
  const [l, setL] = useState(getLang);
  useEffect(() => { setL(getLang()); return onLang(setL); }, []);
  return l;
}
