import { getShaderColorFromString } from '@paper-design/shaders';
import { renderShader, rgba } from './shader-gl.ts';
import { LOOKS, shader, shaderColors } from './shader.ts';

const theme = { palette: { accent: '#ff0000', accent2: '#00ff00', hl: '#ffff00', ink: '#000000', paper: '#ffffff' } };

test('the colours are the param list, or the theme accent, accent2, highlight and paper; never more than the shader takes', () => {
  expect(shaderColors('', theme, 10)).toEqual(['#ff0000', '#00ff00', '#ffff00', '#ffffff']);
  expect(shaderColors('#111, #222，#333', theme, 10)).toEqual(['#111', '#222', '#333']);
  expect(shaderColors('', theme, 2)).toEqual(['#ff0000', '#00ff00']);
});

test('every look is offered as a choice', () => {
  expect((shader.params.find((p) => p.key === 'look') as { options?: string[] }).options).toEqual([...LOOKS]);
  expect(shader.kind).toBe('scene');
});

test('without WebGL2 the renderer says so (the block then draws a plain gradient)', () => {
  const doc = (globalThis as any).document;
  (globalThis as any).document = { createElement: () => ({ getContext: () => null, addEventListener() {} }) };
  try { expect(renderShader('x', '', {}, 10, 10, 1)).toBeNull(); } finally { (globalThis as any).document = doc; }
});

test('shader colours go through the shared parser: hex as Paper Shaders read it, rgb() with spaces too, mid grey when unreadable', () => {
  for (const c of ['#ff4d4f', '#2ec4b6', '#0d0f14', '#fff', '#1a2b3c80']) expect(rgba(c)).toEqual(getShaderColorFromString(c));
  expect(rgba('rgb(255 0 0 / 50%)')).toEqual([1, 0, 0, 0.5]);
  expect(rgba('not a colour')).toEqual([0.5, 0.5, 0.5, 1]);
});
