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

test('a loose numbered list stays one list; a list after a code block keeps its number (EP13)', () => {
  const root = document.createElement('div');
  render(renderMarkdown('1. 開場\n\n2. 中段\n\n3. 結尾\n\n收尾的話'), root);
  expect(root.querySelectorAll('ol').length).toBe(1);
  expect([...root.querySelectorAll('ol li')].map((x) => x.textContent)).toEqual(['開場', '中段', '結尾']);
  expect(root.querySelector('p')!.textContent).toBe('收尾的話');
  const steps = document.createElement('div');
  render(renderMarkdown(`1. 先跑\n${FENCE}\nnpm run cut\n${FENCE}\n2. 再看`), steps);
  expect([...steps.querySelectorAll('ol')].map((o) => o.getAttribute('start'))).toEqual([null, '2']);
  const mixed = document.createElement('div');
  render(renderMarkdown('- 一\n\n1. 二'), mixed);                // another kind after the blank line: a list of its own
  expect([mixed.querySelectorAll('ul li').length, mixed.querySelectorAll('ol li').length]).toEqual([1, 1]);
});

test('a heading is a bold line without its hashes (EP13)', () => {
  const root = document.createElement('div');
  render(renderMarkdown('## 計畫\n先剪開頭\n### **第二步** ##\n#不是標題'), root);
  const ps = [...root.querySelectorAll('p')];
  expect(ps.map((p) => p.textContent)).toEqual(['計畫', '先剪開頭', '第二步', '#不是標題']);
  expect(ps[0].querySelector('strong')!.textContent).toBe('計畫');
  expect(root.textContent).not.toContain('##');
});
