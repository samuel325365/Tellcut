// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { ACTIONS, keyAction } from './keys.ts';
import { SECTIONS, SHORTCUTS } from './help.ts';
import { HelpPanel } from './HelpPanel.tsx';
import { setLang } from './i18n/lang.ts';

test('every keyboard action is in the help, and every key the help lists does what it says', () => {
  expect([...new Set(SHORTCUTS.map((s) => s.action))].sort()).toEqual([...ACTIONS].sort());
  for (const s of SHORTCUTS) expect(keyAction({ code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...s.ev })).toBe(s.action);
});

test('the help panel lists the sections and the shortcuts, and closes', async () => {
  const root = document.createElement('div');
  let closed = 0;
  await act(() => render(<HelpPanel onClose={() => closed++} />, root));
  expect([...root.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([...SECTIONS.map((s) => s.title), 'Shortcuts']);
  expect(root.querySelectorAll('[data-shortcut]').length).toBe(SHORTCUTS.length);
  (root.querySelector('[data-help-close]') as HTMLElement).click();
  (root.querySelector('[data-help-panel]') as HTMLElement).click();      // the backdrop
  expect(closed).toBe(2);
});

test('the help panel: English headings, explanations in the chosen language', async () => {
  const root = document.createElement('div');
  const heads = [...SECTIONS.map((s) => s.title), 'Shortcuts'];
  const texts = async (lang: 'zh' | 'ja') => {
    setLang(lang);
    await act(() => render(<HelpPanel onClose={() => {}} />, root));
    return { h3: [...root.querySelectorAll('h3')].map((h) => h.textContent), dt: [...root.querySelectorAll('dt')].map((d) => d.textContent),
      dd: [...root.querySelectorAll('dd')].map((d) => d.textContent), desc: [...root.querySelectorAll('[data-shortcut] td:last-child')].map((d) => d.textContent) };
  };
  const ja = await texts('ja');
  expect(ja.h3).toEqual(heads);
  expect(heads).toContain('Layout');
  expect(heads).toContain('Playback');
  expect(ja.dd.length).toBeGreaterThan(30);
  for (const d of ja.dd) expect(d).toMatch(/[぀-ヿ]/);                            // every explanation has kana
  const zh = await texts('zh');
  expect(zh.h3).toEqual(heads);
  expect(zh.dt).toEqual(ja.dt);                                                            // item names are labels: the same in both
  expect(zh.desc[0]).toBe('播放／暫停（試看中：結束試看）');
  for (const d of zh.dd) expect(d).toMatch(/[一-鿿]/);
  expect(zh.dd).not.toEqual(ja.dd);
  zh.desc.forEach((d, i) => expect(d).not.toBe(ja.desc[i]));                                // shortcut texts differ too (some Japanese is all kanji)
});
