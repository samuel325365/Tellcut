// @vitest-environment jsdom
import * as THREE from 'three';
import { makeKit } from './kit.ts';

afterEach(() => vi.restoreAllMocks());

test('a video texture goes through a 2D canvas: update() copies the current picture, then uploads it', () => {
  // headless Chrome gives WebGL a black picture for a hardware-decoded <video>; drawn on a 2D canvas first it is right
  const copies: unknown[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: (src: unknown) => copies.push(src) }) as any);
  const v = document.createElement('video');
  Object.defineProperty(v, 'videoWidth', { value: 1280 }); Object.defineProperty(v, 'videoHeight', { value: 720 });
  Object.defineProperty(v, 'readyState', { value: 4 });
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  const t = kit.mediaTexture(v), before = t.texture.version;
  expect(t.texture.image).toBeInstanceOf(HTMLCanvasElement);
  t.update();
  expect(copies).toEqual([v]);
  expect([(t.texture.image as HTMLCanvasElement).width, (t.texture.image as HTMLCanvasElement).height]).toEqual([1280, 720]);
  expect(t.texture.version).toBeGreaterThan(before);
});

test('a media texture is mipmapped, so a receding frame does not shimmer', () => {
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  for (const el of [document.createElement('video'), document.createElement('img')]) {
    const { texture } = kit.mediaTexture(el);
    expect([texture.generateMipmaps, texture.minFilter, texture.magFilter]).toEqual([true, THREE.LinearMipmapLinearFilter, THREE.LinearFilter]);
    expect(texture.anisotropy).toBeGreaterThan(1);
  }
});

test('a photo texture uses the picture itself', () => {
  const img = document.createElement('img');
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  expect(kit.mediaTexture(img).texture.image).toBe(img);
});

test('a video with no picture yet is not uploaded (three would keep a 1×1 texture)', () => {
  const copies: unknown[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: (src: unknown) => copies.push(src) }) as any);
  const v = document.createElement('video');   // readyState 0, videoWidth 0
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  const t = kit.mediaTexture(v), before = t.texture.version;
  t.update();
  expect(copies).toEqual([]);
  expect(t.texture.version).toBe(before);
});

test('a video whose picture size changes gets its texture storage freed before the new upload', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage() {} }) as any);
  const v = document.createElement('video');
  let w = 1280, h = 720;
  Object.defineProperty(v, 'readyState', { value: 4 });
  Object.defineProperty(v, 'videoWidth', { get: () => w }); Object.defineProperty(v, 'videoHeight', { get: () => h });
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  const t = kit.mediaTexture(v), freed = vi.spyOn(t.texture, 'dispose');
  t.update();
  expect(freed).not.toHaveBeenCalled();
  w = 1920; h = 1080;
  t.update();
  expect(freed).toHaveBeenCalledTimes(1);
  expect([(t.texture.image as HTMLCanvasElement).width, (t.texture.image as HTMLCanvasElement).height]).toEqual([1920, 1080]);
});
