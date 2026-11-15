import { getShaderColorFromString } from '@paper-design/shaders';
import { withDefaults } from '@tellcut/engine';
import { renderShader, rgba } from './shader-gl.ts';
import { PAPER_VERTEX } from './shader-vertex.ts';
import { ditherPx, LOOKS, shader, shaderColors, shaderFrame } from './shader.ts';

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

const params = (p: Record<string, unknown> = {}) => withDefaults(shader.params, p) as any;

test('mesh stays the default; the same moment gives the same uniforms, a later one only moves the time', () => {
  expect(params().look).toBe('mesh');
  expect(shaderFrame(params({ look: 'nope' }), theme, 1).look).toBe('mesh');
  for (const look of LOOKS) {
    const a = shaderFrame(params({ look }), theme, 1.5), b = shaderFrame(params({ look }), theme, 1.5), c = shaderFrame(params({ look }), theme, 2);
    expect(a).toEqual(b);
    expect(c.uniforms.u_time).toBeGreaterThan(a.uniforms.u_time as number);
    expect({ ...c.uniforms, u_time: 0 }).toEqual({ ...a.uniforms, u_time: 0 });
  }
});

test('every uniform a look sets is one its shader (or the shared vertex shader) declares, so none is dropped silently', () => {
  const missing: string[] = [];
  for (const look of LOOKS) {
    const { frag, uniforms } = shaderFrame(params({ look }), theme, 1);
    for (const name of Object.keys(uniforms)) if (!new RegExp(`uniform [^;]*\\b${name}\\b`).test(frag + PAPER_VERTEX)) missing.push(`${look} ${name}`);
  }
  expect(missing).toEqual([]);
});

test('neuro: lines in the first colour, hot points in the last, on back; amount brightens the crossings', () => {
  const u = shaderFrame(params({ look: 'neuro', colors: '#ff0000,#00ff00,#0000ff', back: '#000000' }), theme, 1).uniforms;
  expect(u.u_colorMid).toEqual([1, 0, 0, 1]); expect(u.u_colorFront).toEqual([0, 0, 1, 1]); expect(u.u_colorBack).toEqual([0, 0, 0, 1]);
  expect(shaderFrame(params({ look: 'neuro', amount: 1 }), theme, 1).uniforms.u_brightness).toBeGreaterThan(u.u_brightness as number);
});

test('cells: back fills the gaps, grain shades inside each cell, amount moves the centres (capped where Paper caps it)', () => {
  const u = shaderFrame(params({ look: 'cells', back: '#000000', grain: 0.6 }), theme, 1).uniforms;
  expect(u.u_colorGap).toEqual([0, 0, 0, 1]); expect(u.u_glow).toBe(0.6); expect(u.u_colorsCount).toBe(4);
  expect(shaderFrame(params({ look: 'cells', amount: 1 }), theme, 1).uniforms.u_distortion).toBe(0.5);
  expect((shaderFrame(params({ look: 'cells', scale: 2 }), theme, 1).uniforms.u_scale as number)).toBeCloseTo(2 * (u.u_scale as number), 9);
});

test('dither: two colours only (the first of the list and back); amount sets the dot size, 2 to 6 px at a 1080 short side', () => {
  const f = shaderFrame(params({ look: 'dither', colors: '#ff0000,#00ff00' }), theme, 1);
  expect(f.names).toEqual(['#ff0000']); expect(f.uniforms.u_colorFront).toEqual([1, 0, 0, 1]);
  expect(f.uniforms.u_pxSize).toBe(4);
  expect(ditherPx(0)).toBe(2); expect(ditherPx(2)).toBe(6);
});
