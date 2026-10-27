// @vitest-environment jsdom
// The 3D fx example is what agents copy (guides/workflow.md): it must come back after it hides, survive no WebGL, and draw its
// text only once the font is loaded.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// @ts-expect-error a plain JS example (it is what agents copy), no declarations
import spin from './spin3d.js';

const [type] = spin as any[];
let texts: string[], fills: number;
beforeEach(() => {
  texts = []; fills = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    clearRect() {}, drawImage() {}, fillRect: () => { fills++; }, fillText: (t: string) => texts.push(t),
    set fillStyle(_v: unknown) {}, set font(_v: unknown) {}, set textAlign(_v: unknown) {}, set textBaseline(_v: unknown) {},
  }) as any);
  (document as any).fonts = { load: vi.fn(async () => []) };
});
afterEach(() => vi.restoreAllMocks());

const kit = (gl = true) => ({ THREE, addons: { RoundedBoxGeometry }, render: () => (gl ? document.createElement('canvas') : null) });
const ctx = (three: unknown, local = 0.5) => ({ root: document.createElement('div'), W: 640, H: 360, local, dur: 2, params: { text: 'Hi', color: '#ff6b2c' }, three });

test('it draws again at full size after it was hidden', async () => {
  const c = ctx(kit()), s = type.build(c);
  await type.ready(s);
  type.draw(c, s);
  type.hide(s);
  expect(s.c.width).toBe(0);
  type.draw(c, s);
  expect([s.c.width, s.c.height]).toEqual([640, 360]);
});

test('the word is drawn once its font is loaded, not in build', async () => {
  const c = ctx(kit()), s = type.build(c);
  expect(texts).toEqual([]);
  await type.ready(s);
  expect((document as any).fonts.load).toHaveBeenCalledWith(expect.stringContaining('700'), 'Hi');
  expect(texts).toEqual(['Hi']);
});

test('without WebGL it still draws something flat instead of failing', async () => {
  const c = ctx(kit(false)), s = type.build(c);
  await type.ready(s);
  fills = 0;
  expect(() => type.draw(c, s)).not.toThrow();
  expect(fills).toBeGreaterThan(0);
});
