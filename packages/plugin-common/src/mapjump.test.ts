// @vitest-environment jsdom
// common.mapjump with no city it can read (review 4, R4-C3): the paper and the heading, not an exception that aborts the export.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { defaultSafe } from '@tellcut/engine';
import { mapjump, mapLayout } from './mapjump.ts';

let calls: string[];
beforeEach(() => {
  calls = [];
  const g: any = new Proxy(function () {}, { get: (_t, k) => (typeof k === 'symbol' ? undefined : (...a: unknown[]) => { calls.push(String(k)); return k === 'measureText' ? { width: 10 } : g; }), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
});
afterEach(() => vi.restoreAllMocks());

const media: any = { begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p };
function frameAt(params: Record<string, unknown>, t: number) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [mapjump as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'm', type: 'common.mapjump', start: 0, end: 2, params }] }] } as any);
  st.draw(t);
  return root;
}

test('no cities, or none readable (a typo in the numbers): the paper and the heading, nothing drawn on the map, no throw', () => {
  for (const cities of ['', '巴黎|PARIS|2.35', '巴黎|PARIS|2.35|4x8.85, 克拉科夫|KRAKÓW|abc|50.06'])
    for (const mode of ['leg', 'all']) {
      calls = [];
      const root = frameAt({ cities, mode, title: '克拉科夫' }, 0.6);
      expect(root.textContent).toContain('克拉科夫');
      expect(calls).not.toContain('stroke');
      expect(calls).not.toContain('fill');
    }
});

test('one readable city among typos still draws it', () => {
  frameAt({ cities: '巴黎|PARIS|2.35|48.85, 克拉科夫|KRAKÓW|abc|50.06', from: 0, to: 1 }, 0.6);
  expect(calls).toContain('fill');
});

test('ready loads the mono face the stop numbers are drawn in (2026-11-03)', async () => {
  const loads: string[] = [], was = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: async (f: string) => { loads.push(f); return []; } } });
  try {
    const s = mapjump.build({ params: { mono: 'Space Mono' }, root: document.createElement('div') } as any);
    await mapjump.ready!(s);
  } finally { was ? Object.defineProperty(document, 'fonts', was) : delete (document as any).fonts; }
  expect(loads).toEqual(["700 30px 'Space Mono'", "700 30px 'JetBrains Mono'"]);
});

// a 2D context that keeps the state it is given, recording what each stroke and fill was drawn with
function recorder() {
  const log: Array<{ op: string; lineWidth: number; lineCap: string; globalAlpha: number; args: unknown[] }> = [];
  const st: Record<string, unknown> = { lineWidth: 1, lineCap: 'butt', globalAlpha: 1 };
  const g: any = new Proxy({}, {
    get: (_t, k) => (typeof k === 'symbol' ? undefined : k in st ? st[k as string]
      : (...args: unknown[]) => { log.push({ op: String(k), lineWidth: st.lineWidth as number, lineCap: st.lineCap as string, globalAlpha: st.globalAlpha as number, args }); return k === 'measureText' ? { width: 10 } : undefined; }),
    set: (_t, k, v) => { st[k as string] = v; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
  return log;
}
function frameSized(W: number, H: number, params: Record<string, unknown>, t: number) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [mapjump as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: W, height: H, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'm', type: 'common.mapjump', start: 0, end: 2, params }] }] } as any);
  st.draw(t);
  return { root, st };
}
const widths = (log: ReturnType<typeof recorder>) => [...new Set(log.filter((c) => c.op === 'stroke').map((c) => +c.lineWidth.toFixed(3)))].sort((a, b) => a - b);
const labelPx = (root: HTMLElement) => [...root.querySelectorAll('div')].find((d) => d.textContent === '巴黎' && d.style.fontSize)!.style.fontSize, px = (v: string) => parseFloat(v);

test('the default 9:16 frame keeps its marker sizes: k is exactly u, the pins, names and lines as they were', () => {
  const L = mapLayout(1080, 1920, defaultSafe(1080, 1920));
  expect(L.f).toBeLessThan(1);   // its map is a few px short of 820 wide, yet nothing on it shrinks
  expect(L.k).toBe(1);
  const log = recorder(), { root } = frameSized(1080, 1920, {}, 0.6);
  expect(widths(log)).toEqual([2, 4, 6, 9]);
  expect(labelPx(root)).toBe('46px');
});

test('a wide frame\'s small map gets smaller pins, names, arcs and lines (down to 0.6 of the 9:16 size)', () => {
  const L = mapLayout(1920, 1080, defaultSafe(1920, 1080));
  expect(L.f).toBeCloseTo(0.4284, 3);
  expect(L.k).toBeCloseTo(0.6, 10);
  const log = recorder(), { root } = frameSized(1920, 1080, {}, 0.6);
  expect(widths(log)).toEqual([1.2, 2.4, 3.6, 5.4]);
  expect(px(labelPx(root))).toBeCloseTo(27.6, 6);
});

test('the first frame on a fresh canvas draws its lines with the caps every later frame has (land and graticule included)', () => {
  const log = recorder(), { st } = frameSized(1080, 1920, { land: true }, 0.6);
  const first = log.filter((c) => c.op === 'stroke').map((c) => c.lineCap);
  log.length = 0;
  st.draw(0.6);
  expect(first.length).toBeGreaterThan(5);
  expect(first).toEqual(log.filter((c) => c.op === 'stroke').map((c) => c.lineCap));
});

test('the spaced kicker and latin line are moved right by their spacing so the letters, not the box, are centred', () => {
  recorder();
  const { root } = frameSized(1080, 1920, { kicker: '下一站', latin: 'KRAKÓW' }, 0.6);
  const kick = [...root.querySelectorAll('div')].find((d) => d.textContent === '下一站')!;
  const latin = [...root.querySelectorAll('div')].find((d) => d.textContent === 'KRAKÓW')!;
  expect([kick.style.letterSpacing, kick.style.paddingLeft]).toEqual(['14px', '14px']);
  expect([latin.style.letterSpacing, latin.style.paddingLeft]).toEqual(['8px', '8px']);
});
