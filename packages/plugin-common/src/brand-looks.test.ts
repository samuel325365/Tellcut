// @vitest-environment jsdom
// The brand film's text and texture looks (spec 2026-10-25-brand-preset §6.2-5): headline look brand, tag look glass, film letterbox.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { film, tile } from './film.ts';
import { headline } from './headline.ts';
import { tag } from './tag.ts';

let texts: Array<{ s: string; x: number; y: number; filter: string; alpha: number; font: string }>;
beforeEach(() => {
  texts = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const g: any = { canvas: this, filter: 'none', globalAlpha: 1, clearRect() {}, fillRect() {}, save() {}, restore() {}, putImageData() {}, drawImage() {},
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: (s: string) => ({ width: s.length * 20 }),
      fillText(s: string, x: number, y: number) { texts.push({ s, x, y, filter: g.filter, alpha: g.globalAlpha, font: g.font }); } };
    return g;
  });
  (document as any).fonts = { load: async () => [] };
});
afterEach(() => vi.restoreAllMocks());

const media = (): any => ({ begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p });
async function stage(type: ItemType, params: Record<string, unknown>, o: { W?: number; H?: number } = {}) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [type] }]), media(), { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: o.W ?? 1920, height: o.H ?? 1080, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: type.type, start: 0, end: 4, params }] }] } as any);
  await st.ready();
  return { root, st };
}

test('headline look brand: lines enter one by one from blurred to sharp, the kicker above, left-aligned in the safe area', async () => {
  const { st } = await stage(headline as ItemType, { look: 'brand', text: 'Every trip.\nEvery first.', sub: 'WHAT WE DO' });
  texts = []; st.draw(0.3);
  const early = texts.find((t) => t.s === 'Every trip.');
  expect(early && parseFloat(early.filter.replace('blur(', ''))).toBeGreaterThan(0.5);
  expect(texts.find((t) => t.s === 'Every first.')).toBeUndefined();   // the second line comes 0.35 s later
  texts = []; st.draw(2);
  const a = texts.find((t) => t.s === 'Every trip.')!, b = texts.find((t) => t.s === 'Every first.')!, k = texts.find((t) => t.s === 'WHAT WE DO')!;
  expect(a.filter).toBe('blur(0.00px)');
  expect(a.x).toBe(b.x);
  expect(a.x).toBeLessThan(1920 * 0.15);
  expect(b.y).toBeGreaterThan(a.y);
  expect(k.y).toBeLessThan(a.y);
  expect(a.y).toBeGreaterThan(1080 * 0.6);   // the lower part of the frame
});

test('headline without look keeps the documentary card (doc): DOM text, no canvas lines', async () => {
  const { root, st } = await stage(headline as ItemType, { text: '一座廣場' });
  texts = []; st.draw(1);
  expect(texts).toEqual([]);
  expect(root.textContent).toContain('一座廣場');
});

test('tag look glass: frosted pills with a hairline edge', async () => {
  const { root, st } = await stage(tag as ItemType, { look: 'glass', tags: 'Street, Tram, Morning light' });
  st.draw(1.5);
  const pills = [...root.querySelectorAll<HTMLElement>('div')].filter((d) => ['Street', 'Tram', 'Morning light'].includes(d.textContent ?? ''));
  expect(pills.length).toBe(3);
  for (const p of pills) {
    expect(p.style.backdropFilter || (p.style as any).webkitBackdropFilter).toMatch(/blur\(/);
    expect(p.style.border).toMatch(/rgba\(255, ?255, ?255/);
  }
});

test('glass tags come one step apart (the spike: every three quarters of a beat)', async () => {
  const { root, st } = await stage(tag as ItemType, { look: 'glass', tags: 'Street, Tram, Morning light', step: 0.5625 });
  const op = () => [...root.querySelectorAll<HTMLElement>('div')].filter((d) => ['Street', 'Tram', 'Morning light'].includes(d.textContent ?? '')).map((d) => Number(d.style.opacity));
  st.draw(0.5);
  const [a, b, c] = op();
  expect(a).toBeGreaterThan(0.95);
  expect(b).toBeLessThan(0.05);
  expect(c).toBe(0);
  st.draw(1.6);
  expect(op().every((x) => x > 0.95)).toBe(true);
});

test('glass stack with check: a column of tags, each ticked in the accent colour check seconds after it appears (the spike\'s checklist)', async () => {
  const { root, st } = await stage(tag as ItemType, { look: 'glass', tags: 'No black frames, No clipped audio', step: 0.5, check: 0.4, stack: true, c1: '#2f8cff' });
  const row = () => [...root.querySelectorAll<HTMLElement>('div')].find((d) => d.style.display === 'flex')!;
  const marks = () => [...root.querySelectorAll<HTMLElement>('[data-tick]')];
  st.draw(0.3);
  expect(row().style.flexDirection).toBe('column');
  const pills = [...root.querySelectorAll<HTMLElement>('div')].filter((d) => ['No black frames', 'No clipped audio'].includes(d.textContent ?? ''));
  expect(pills.length).toBe(2);
  expect(marks().length).toBe(2);
  expect(marks().map((m) => Number(m.dataset.tick))).toEqual([0, 0]);
  st.draw(0.75);   // the first ticked by 0.65, the second appears at 0.5 and ticks from 0.9
  const [a, b] = marks().map((m) => Number(m.dataset.tick));
  expect(a).toBeGreaterThan(0.95);
  expect(b).toBe(0);
  expect(marks()[0].style.background).toMatch(/47, ?140, ?255|#2f8cff/i);
  // without check: no marks, and a row as before
  const plain = await stage(tag as ItemType, { look: 'glass', tags: 'Street, Tram' });
  plain.st.draw(1);
  expect(plain.root.querySelectorAll('[data-tick]').length).toBe(0);
});

test('film letterbox 2.39 on 16:9 draws bars of (H - W/2.39)/2 each; on a frame 2.39 or wider none', async () => {
  const { root, st } = await stage(film as ItemType, { letterbox: 2.39, grain: 0 });
  st.draw(1);
  const bars = [...root.querySelectorAll<HTMLElement>('[data-bar]')];
  expect(bars.length).toBe(2);
  const want = (1080 - 1920 / 2.39) / 2;
  for (const b of bars) { expect(b.style.display).not.toBe('none'); expect(parseFloat(b.style.height)).toBeCloseTo(want, 1); }
  const wide = await stage(film as ItemType, { letterbox: 2.39 }, { W: 2400, H: 1000 });
  wide.st.draw(1);
  expect([...wide.root.querySelectorAll<HTMLElement>('[data-bar]')].every((b) => b.style.display === 'none')).toBe(true);
  const none = await stage(film as ItemType, {});
  none.st.draw(1);
  expect([...none.root.querySelectorAll<HTMLElement>('[data-bar]')].every((b) => b.style.display === 'none')).toBe(true);
});


// brand plan 5: the spike's proof — a big number that counts up, a spaced label under it
test('headline look proof: a big number that counts up to the value, the label spaced out under it', async () => {
  const { st } = await stage(headline as ItemType, { look: 'proof', text: '90+', sub: 'BUILT-IN EFFECTS AND SOUNDS' });
  texts = []; st.draw(0.25);
  const early = texts.find((t) => /^\d+\+$/.test(t.s))!;
  expect(early).toBeTruthy();
  expect(Number(early.s.slice(0, -1))).toBeGreaterThan(0);
  expect(Number(early.s.slice(0, -1))).toBeLessThan(90);
  texts = []; st.draw(1.5);
  const big = texts.find((t) => t.s === '90+')!, label = texts.find((t) => t.s === 'BUILT-IN EFFECTS AND SOUNDS')!;
  expect(big && label).toBeTruthy();
  expect(label.y).toBeGreaterThan(big.y);
  expect(big.x).toBeLessThan(1920 * 0.15);
});

test('a proof that is not a number (Your footage stays…) is shown as it is, from a blur', async () => {
  const { st } = await stage(headline as ItemType, { look: 'proof', text: 'Your footage stays\non your computer.' });
  texts = []; st.draw(1.5);
  expect(texts.map((t) => t.s)).toEqual(expect.arrayContaining(['Your footage stays', 'on your computer.']));
});

// review of brand plan 3: a line too long for the frame shrinks to the safe width (as look doc does), short lines keep their size
test('headline look brand: a line too wide for the safe area shrinks to fit it, the lines together; short lines keep the size', async () => {
  const px = (f: string) => parseFloat(/(\d+(\.\d+)?)px/.exec(f)![1]);
  const long = 'A very long line that would run off the right edge of the frame';   // 20 px a letter in this mock
  const { st } = await stage(headline as ItemType, { look: 'brand', text: `${long}\nShort.`, sub: 'WHAT WE DO' }, { W: 1080, H: 1920 });
  texts = []; st.draw(2);
  const a = texts.find((t) => t.s === long)!, b = texts.find((t) => t.s === 'Short.')!;
  const size = px(a.font), wanted = 60 * (1080 / 1080);
  expect(size).toBeLessThan(wanted);
  // the mock measures at 20 px a letter whatever the size: the shrink is room / width
  expect(a.x + (long.length * 20 * size) / wanted).toBeLessThanOrEqual(1080 - a.x + 0.01);
  expect(px(b.font)).toBeCloseTo(size, 5);
  const short = await stage(headline as ItemType, { look: 'brand', text: 'Every trip.' }, { W: 1080, H: 1920 });
  texts = []; short.st.draw(2);
  expect(px(texts.find((t) => t.s === 'Every trip.')!.font)).toBeCloseTo(wanted, 5);
});

// review of brand plan 3: the spike's grain — grey noise blended by overlay — as an option; the default stays the old grain
test('film blend overlay: the layer blends by overlay and holds only the grain; the vignette and bars stay normal above it', async () => {
  const { root, st } = await stage(film as ItemType, { blend: 'overlay', grain: 0.07, letterbox: 2.39 });
  st.draw(1);
  const layer = root.querySelector<HTMLElement>('.st-item')!, top = root.querySelector<HTMLElement>('.st-top')!;
  expect(layer.style.mixBlendMode).toBe('overlay');
  expect(layer.querySelectorAll('[data-bar]').length).toBe(0);
  expect([...top.querySelectorAll<HTMLElement>('[data-bar]')].filter((b) => b.style.display !== 'none').length).toBe(2);
  expect(layer.querySelectorAll('canvas').length).toBe(1);
  expect(layer.querySelector('canvas')!.style.opacity).toBe('0.07');
  const plain = await stage(film as ItemType, { letterbox: 2.39 });
  plain.st.draw(1);
  const pl = plain.root.querySelector<HTMLElement>('.st-item')!;
  expect(pl.style.mixBlendMode).toBe('');
  expect(pl.querySelectorAll('[data-bar]').length).toBe(2);
});

test('film grain tiles: grey (opaque, 128 ± 60) for overlay, black and white specks for normal, the same for the same tile', () => {
  const g: any = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  const grey = tile(g, 1, true).data, mono = tile(g, 1).data;
  let lo = 255, hi = 0, sum = 0, odd = 0;
  for (let i = 0; i < grey.length; i += 4) { if (grey[i + 3] !== 255 || grey[i] !== grey[i + 1]) odd++; lo = Math.min(lo, grey[i]); hi = Math.max(hi, grey[i]); sum += grey[i]; }
  for (let i = 0; i < mono.length; i += 4) if ((mono[i] !== 0 && mono[i] !== 255) || mono[i + 3] >= 56) odd++;
  expect(odd).toBe(0);
  expect(lo).toBeGreaterThanOrEqual(68); expect(hi).toBeLessThanOrEqual(188);
  expect(Math.abs(sum / (grey.length / 4) - 128)).toBeLessThan(1);
  expect(tile(g, 1, true).data).toEqual(grey);
});
