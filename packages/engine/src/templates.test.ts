import { applyTemplate, isColourParam, paramValueProblem, templateName } from './templates.ts';

const block = { type: 'common.leak', templates: [
  { id: 'prism-sweep', label: '彩虹光帶橫掃', doc: '音樂段落', params: { look: 'prism', travel: 0.9, size: 0.8 } },
  { id: 'bokeh-night', label: '夜景光斑', doc: '夜景', params: { look: 'bokeh', travel: 0 } },
] };

test('applyTemplate: the template\'s params with the caller\'s own over them', () => {
  expect(applyTemplate(block, 'prism-sweep')).toEqual({ look: 'prism', travel: 0.9, size: 0.8 });
  expect(applyTemplate(block, 'prism-sweep', { size: 0.5, peak: 0.3 })).toEqual({ look: 'prism', travel: 0.9, size: 0.5, peak: 0.3 });
  // the template's own object is never handed out (an edit of the result must not change it)
  const p = applyTemplate(block, 'bokeh-night');
  p.look = 'x';
  expect(block.templates[1].params.look).toBe('bokeh');
});

test('applyTemplate: an unknown id names the block and the ids it has; a block without templates says so', () => {
  expect(() => applyTemplate(block, 'prism')).toThrow('common.leak 沒有「prism」這個範本；它有：prism-sweep、bokeh-night');
  expect(() => applyTemplate({ type: 'common.film' }, 'x')).toThrow('common.film 沒有範本（「x」）');
});

test('names, colours and values', () => {
  expect(templateName('common.leak', 'prism-sweep')).toBe('leak/prism-sweep');
  expect(templateName('fx.glow', 'soft')).toBe('fx.glow/soft');
  expect(['color', 'colors', 'textColor', 'color2'].map((key) => isColourParam({ key, label: '', type: 'string', default: '' }))).toEqual([true, true, true, true]);
  expect(isColourParam({ key: 'streak', label: '', type: 'color', default: '#fff' })).toBe(true);
  expect(isColourParam({ key: 'look', label: '', type: 'string', default: '' })).toBe(false);
  expect(paramValueProblem({ key: 'n', label: '', type: 'number', min: 0, max: 1, default: 0 }, 0.5)).toBeUndefined();
  expect(paramValueProblem({ key: 'n', label: '', type: 'number', default: 0 }, '1')).toMatch(/數字/);
  expect(paramValueProblem({ key: 's', label: '', type: 'text', default: '' }, 3)).toMatch(/文字/);
  expect(paramValueProblem({ key: 'j', label: '', type: 'json', default: null }, { a: 1 })).toBeUndefined();
});
