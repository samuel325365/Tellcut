// t(key, params, lang): the text in the UI language, falling back to English, then Chinese (the same order as pickText).
import type { Lang } from '@tellcut/protocol';
import { getLang } from './lang.ts';
import { zh } from './zh.ts';
import { en } from './en.ts';
import { ja } from './ja.ts';

export type Key = keyof typeof zh;
export const DICTS: Record<Lang, Record<Key, string>> = { zh, en, ja };

/** replaces `{word}` placeholders whose word is in params, in one pass: a replacement's own braces are never scanned again */
export function t(key: Key, params?: Record<string, string | number>, lang: Lang = getLang()): string {
  // a key no dictionary has (an older page meeting a newer server's text): show the key rather than crash
  const text = DICTS[lang][key] || DICTS.en[key] || DICTS.zh[key] || key;
  if (!params) return text;
  return text.replace(/\{([A-Za-z_]\w*)\}/g, (m, w: string) => (Object.hasOwn(params, w) ? String(params[w]) : m));
}

/** a list as the language writes it: "a, b" in English, "a、b" in Chinese and Japanese */
export const listJoin = (items: string[], lang: Lang = getLang()) => items.join(lang === 'en' ? ', ' : '、');
/** names in a sentence, quoted and listed as the language writes them: “a”, “b” in English, 「a」、「b」 in Chinese and Japanese */
export const nameList = (names: string[], lang: Lang = getLang()) =>
  listJoin(names.map((x) => (lang === 'en' ? `“${x}”` : `「${x}」`)), lang);

/** an error in the page's language: a server error's code worded by the dictionaries (err.<code>), else its own words */
export function errText(e: unknown, lang: Lang = getLang()): string {
  const x = e as { message?: unknown; code?: unknown; params?: Record<string, string | number> } | null;
  const key = typeof x?.code === 'string' ? `err.${x.code}` : '';
  if (key && Object.hasOwn(DICTS.zh, key)) return t(key as Key, x?.params, lang);
  return String(x?.message ?? e);
}

/** t() for a count: `<key>.one` when n is 1 (English: "Ran 1 step"), `<key>` otherwise; {n} is filled in */
export function tn(key: Key, n: number, params: Record<string, string | number> = {}, lang: Lang = getLang()): string {
  const one = `${key}.one` as Key;
  return t(n === 1 && one in zh ? one : key, { ...params, n }, lang);
}

/** a label (button text, dialog title...) of a shared component: English in the editor, the chosen language on the home page */
export function uiLabel(key: Key, surface: 'home' | 'editor', params?: Record<string, string | number>): string {
  return surface === 'editor' ? t(key, params, 'en') : t(key, params);
}
