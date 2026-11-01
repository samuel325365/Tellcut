// @vitest-environment jsdom
// common.film's grain, redone 2026-11-01 (the old 270 px tile stretched over the frame read as denim): fine soft noise at the
// frame's own pixels, blended into the picture, a different tile/offset every frame picked from the frame's number only.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { film, grainOpacity, grainPick, grainTile, TILE, TILES, vignetteCss } from './film.ts';

type Op = [string, ...unknown[]];
let ops: Op[];
beforeEach(() => {
  ops = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const cv = this;
    const g: any = { canvas: cv, fillStyle: '',
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
      createPattern: (src: HTMLCanvasElement) => ({ tile: src.dataset.tile }),
      setTransform: (...a: number[]) => { if (cv.width > 1) ops.push(['setTransform', ...a]); },
      clearRect: (...a: number[]) => { if (cv.width > 1) ops.push(['clearRect', ...a]); },
      fillRect(...a: number[]) { if (cv.width > 1) ops.push(['fillRect', JSON.stringify(g.fillStyle), ...a]); } };
    return g;
  });
});
afterEach(() => vi.restoreAllMocks());

const media = (): any => ({ begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p });
async function stage(params: Record<string, unknown>, o: { W?: number; H?: number } = {}) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [film as ItemType] }]), media(), { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: o.W ?? 1080, height: o.H ?? 1920, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: 'common.film', start: 0, end: 8, params }] }] } as any);
  await st.ready();
  return { root, st };
}

const lum = (d: Uint8ClampedArray) => { const v = new Float64Array(d.length / 4); for (let i = 0; i < v.length; i++) v[i] = d[i * 4]; return v; };
/** correlation of the tile with itself shifted dx to the right (wrapping) */
function corr(v: Float64Array, size: number, dx: number) {
  let m = 0; for (const x of v) m += x; m /= v.length;
  let num = 0, den = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const a = v[y * size + x] - m, b = v[y * size + ((x + dx) % size)] - m; num += a * b; den += a * a; }
  return num / den;
}

test('a grain tile: opaque grey around 128, soft clumps of 1–2 px (neighbours alike, 4 px apart not), the same for the same k', () => {
  const d = grainTile(1), v = lum(d);
  let odd = 0, sum = 0, sq = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] !== 255 || d[i] !== d[i + 1] || d[i] !== d[i + 2]) odd++; sum += d[i]; sq += d[i] * d[i]; }
  const n = d.length / 4, mean = sum / n, sd = Math.sqrt(sq / n - mean * mean);
  expect(odd).toBe(0);
  expect(n).toBe(TILE * TILE);
  expect(Math.abs(mean - 128)).toBeLessThan(1);
  expect(sd).toBeGreaterThan(40); expect(sd).toBeLessThan(56);
  expect(corr(v, TILE, 1)).toBeGreaterThan(0.5);
  expect(corr(v, TILE, 4)).toBeLessThan(0.2);
  const same = (x: Uint8ClampedArray, y: Uint8ClampedArray) => Buffer.from(x.buffer).equals(Buffer.from(y.buffer));
  expect(same(grainTile(1), d)).toBe(true);
  expect(same(grainTile(2), d)).toBe(false);
});

test('a grain tile wraps without a seam: across the edge neighbours are as alike as inside', () => {
  const v = lum(grainTile(0)), size = TILE;
  let edge = 0, inner = 0, m = 0;
  for (const x of v) m += x; m /= v.length;
  for (let y = 0; y < size; y++) { edge += (v[y * size + size - 1] - m) * (v[y * size] - m); inner += (v[y * size + 100] - m) * (v[y * size + 101] - m); }
  expect(edge / inner).toBeGreaterThan(0.6);
  expect(edge / inner).toBeLessThan(1.6);
});

test('grain opacity: none at 0, growing with grain; normal (soft-light) about twice overlay\'s; 1 is fully on for normal', () => {
  expect(grainOpacity(0, 'normal')).toBe(0);
  expect(grainOpacity(0, 'overlay')).toBe(0);
  let last = 0;
  for (const g of [0.02, 0.07, 0.1, 0.3, 0.6, 1]) { const o = grainOpacity(g, 'normal'); expect(o).toBeGreaterThan(last); last = o; }
  expect(grainOpacity(1, 'normal')).toBe(1);
  expect(grainOpacity(0.07, 'overlay')).toBeCloseTo(grainOpacity(0.07, 'normal') * 0.55, 6);
  // the presets' light grain stays light: well under a fifth of the overlay layer
  expect(grainOpacity(0.07, 'overlay')).toBeLessThan(0.2);
  expect(grainOpacity(Number.NaN as any, 'normal')).toBe(0);
});

test('the frame pick: the frame\'s number at the grain rate only; at 30 a second every frame of a 30 fps film differs', () => {
  for (let k = 0; k < 300; k++) expect(grainPick(k / 30, 30).n).toBe(k);
  for (let k = 1; k < 300; k++) {
    const a = grainPick((k - 1) / 30, 30), b = grainPick(k / 30, 30);
    expect(b.tile).not.toBe(a.tile);
    expect(a.tile).toBeGreaterThanOrEqual(0); expect(a.tile).toBeLessThan(TILES);
    expect(a.ox).toBeGreaterThanOrEqual(0); expect(a.ox).toBeLessThan(TILE);
  }
  expect(grainPick(1.234, 12)).toEqual(grainPick(1.234, 12));
  expect(grainPick(1 / 30, 12).n).toBe(grainPick(2 / 30, 12).n);   // 12 a second: held over two or three frames
});

test('film draw is pure: the same time draws the same grain (tile, offset) whatever was drawn before', async () => {
  const { root, st } = await stage({});
  const cv = root.querySelector<HTMLElement>('.st-item')!.querySelector('canvas')!;
  const at = (t: number) => { ops = []; st.draw(t); return ops.slice(); };
  const first = at(1);
  expect(first.length).toBeGreaterThan(0);
  expect(cv.width).toBe(1080); expect(cv.height).toBe(1920);
  at(2.5); at(0.1);
  expect(at(1)).toEqual(first);
  // the next frame shows other grain
  expect(at(1 + 1 / 30)).not.toEqual(first);
  // drawn once per grain frame: a second draw of the same time does nothing more
  at(3); expect(at(3)).toEqual([]);
});

test('film: the layer holds only the grain and blends (soft-light for normal, overlay for overlay); the vignette goes above it', async () => {
  for (const [blend, mode] of [['normal', 'soft-light'], ['overlay', 'overlay']]) {
    const { root, st } = await stage({ blend });
    st.draw(1);
    const layer = root.querySelector<HTMLElement>('.st-item')!, top = root.querySelector<HTMLElement>('.st-top')!;
    expect(layer.style.mixBlendMode).toBe(mode);
    expect(layer.querySelectorAll('*').length).toBe(1);
    expect(top.querySelectorAll('div[style*="radial-gradient"]').length).toBe(1);
  }
  const off = await stage({ grain: 0 });
  off.st.draw(1);
  expect(off.root.querySelector<HTMLElement>('.st-item canvas')!.style.display).toBe('none');
});

test('film hidden gives back its frame-sized canvas and draws the grain again when it comes back', async () => {
  const { root, st } = await stage({});
  const cv = root.querySelector<HTMLElement>('.st-item')!.querySelector('canvas')!;
  st.draw(1); st.draw(9);
  expect(cv.width).toBe(1);
  ops = []; st.draw(1);
  expect(cv.width).toBe(1080);
  expect(ops.some((o) => o[0] === 'fillRect')).toBe(true);
});

test('the vignette eases in: clear to 30%, then darker step by step, about 0.7 of its colour at a corner', () => {
  const css = vignetteCss('#1a1a1a'), a = [...css.matchAll(/rgba\(26, 26, 26, ([\d.]+)\) (\d+)%/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(a[0]).toEqual([0, 30]);
  for (let i = 1; i < a.length; i++) expect(a[i][0]).toBeGreaterThanOrEqual(a[i - 1][0]);
  // no edge where it starts: the first step is small next to the last ones
  expect(a[1][0]).toBeLessThan(0.05);
  expect(a.find(([, p]) => p === 100)![0]).toBeGreaterThan(0.6);
  expect(a.find(([, p]) => p === 100)![0]).toBeLessThan(0.8);
  expect(Math.max(...a.map(([x]) => x))).toBeLessThanOrEqual(1);
});
