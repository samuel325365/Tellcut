// @vitest-environment jsdom
import { render } from 'preact';
import { renderMarkdown } from './markdown.tsx';

const FENCE = '`'.repeat(3);

test('basic markdown renders as elements and never as raw HTML', () => {
  const root = document.createElement('div');
  render(renderMarkdown(`**粗**與\`碼\`\n\n- 一\n- 二\n\n${FENCE}\nnpm run tellcut\n${FENCE}\n\n<img src=x onerror=alert(1)>`), root);
  expect(root.querySelector('strong')!.textContent).toBe('粗');
  expect(root.querySelector('code')!.textContent).toBe('碼');
  expect([...root.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['一', '二']);
  expect(root.querySelector('pre')!.textContent).toBe('npm run tellcut');
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
});

test('a markdown table becomes a table', () => {
  const root = document.createElement('div');
  render(renderMarkdown('| 專案 | 長度 |\n|---|---|\n| **西雅圖** | 76 秒 |\n| 歸土 | 68 秒 |'), root);
  expect([...root.querySelectorAll('th')].map((x) => x.textContent)).toEqual(['專案', '長度']);
  expect([...root.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((x) => x.textContent))).toEqual([['西雅圖', '76 秒'], ['歸土', '68 秒']]);
  expect(root.querySelector('td strong')!.textContent).toBe('西雅圖');
});
