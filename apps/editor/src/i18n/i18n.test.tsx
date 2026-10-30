// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { DICTS, listJoin, nameList, t, tn } from './index.ts';
import { LANG_KEY, defaultLang, getLang, onLang, setLang } from './lang.ts';
import { LangSwitch } from '../LangSwitch.tsx';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); setLang('zh'); localStorage.clear(); });

describe('i18n', () => {
  it('the three dictionaries have the same keys and no empty text', () => {
    const zhKeys = Object.keys(DICTS.zh).sort();
    expect(Object.keys(DICTS.en).sort()).toEqual(zhKeys);
    expect(Object.keys(DICTS.ja).sort()).toEqual(zhKeys);
    for (const d of Object.values(DICTS)) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });

  it('defaultLang follows the browser', () => {
    expect(defaultLang({ language: 'zh-TW' })).toBe('zh');
    expect(defaultLang({ language: 'ja-JP' })).toBe('ja');
    expect(defaultLang({ language: 'fr' })).toBe('en');
    expect(defaultLang({})).toBe('en');
  });

  it("a blocked or odd stored language falls back to the browser's", () => {
    localStorage.setItem(LANG_KEY, 'fr');
    expect(getLang()).toBe(defaultLang());
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getLang()).toBe(defaultLang());
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    setLang('ja');
    expect(getLang()).toBe('ja');
  });

  it('setLang notifies and persists', () => {
    const seen: string[] = [];
    const off = onLang((l) => seen.push(l));
    setLang('en');
    off();
    expect(seen).toEqual(['en']);
    expect(localStorage.getItem(LANG_KEY)).toBe('en');
  });

  it("params are replaced once and their own braces are left alone", () => {
    expect(t('home.chatOf', { name: '{旅行}' }, 'zh')).toContain('「{旅行}」');
    expect(t('home.chatOf', { name: '{name}' }, 'en')).toContain('"{name}"');
  });

  it('t falls back to English then Chinese', () => {
    const keep = DICTS.ja['home.chatOf'];
    try {
      DICTS.ja['home.chatOf'] = '';
      expect(t('home.chatOf', { name: 'x' }, 'ja')).toBe(t('home.chatOf', { name: 'x' }, 'en'));
      DICTS.en['home.chatOf'] = '';
      expect(t('home.chatOf', { name: 'x' }, 'ja')).toBe(t('home.chatOf', { name: 'x' }, 'zh'));
    } finally { DICTS.ja['home.chatOf'] = keep; DICTS.en['home.chatOf'] = enOrig; }
  });

  it('LangSwitch switches and marks the current one', () => {
    const host = document.createElement('div');
    document.body.append(host);
    act(() => { render(<LangSwitch />, host); });
    const ja = host.querySelector<HTMLElement>('[data-lang="ja"]')!;
    act(() => { ja.click(); });
    expect(getLang()).toBe('ja');
    expect(host.querySelector('[data-lang="ja"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-lang="zh"]')!.getAttribute('aria-pressed')).toBe('false');
    act(() => { render(null, host); });
    host.remove();
  });
});

const enOrig = DICTS.en['home.chatOf'];

describe('i18n robustness', () => {
  it('an unknown key comes back as itself, with or without params', () => {
    expect(t('no.such.key' as any)).toBe('no.such.key');
    expect(t('no.such.key' as any, { n: 1 })).toBe('no.such.key');
  });

  it('<html lang> follows the UI language', () => {
    setLang('ja'); expect(document.documentElement.lang).toBe('ja');
    setLang('en'); expect(document.documentElement.lang).toBe('en');
    setLang('zh'); expect(document.documentElement.lang).toBe('zh-Hant');
  });

  it('English counts read right for one', () => {
    expect(tn('chat.steps', 1, {}, 'en')).toBe('Ran 1 step');
    expect(tn('chat.steps', 3, {}, 'en')).toBe('Ran 3 steps');
    expect(tn('chat.styleCount', 1, {}, 'en')).toBe('1 style');
    expect(tn('chat.noPrice', 1, {}, 'en')).toContain('1 earlier reply has');
  });
});

// showcase films (spec 2026-10-30 part 2): the English UI shows no Chinese brackets around names
describe('nameList', () => {
  it('quotes names the way each language does', () => {
    expect(nameList(['softtitle', 'palette'], 'en')).toBe('“softtitle”, “palette”');
    expect(nameList(['softtitle', 'palette'], 'zh')).toBe('「softtitle」、「palette」');
    expect(nameList(['softtitle', 'palette'], 'ja')).toBe('「softtitle」、「palette」');
  });
});

describe('listJoin', () => {
  it('lists with a comma in English and 、 in Chinese and Japanese', () => {
    expect(listJoin(['Pixabay', 'Freesound'], 'en')).toBe('Pixabay, Freesound');
    expect(listJoin(['Pixabay', 'Freesound'], 'zh')).toBe('Pixabay、Freesound');
  });
});
