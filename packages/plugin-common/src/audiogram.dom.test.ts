// @vitest-environment jsdom
// common.audiogram's params from the acceptance films (P1, P3, 2026-11-01): holding the last speaker through a gap between two
// c.audio pieces (it flashed back to the idle colour and the name tag went), covers by time, the name tag's place, following one
// speaker, and a fade in and out. Without a sound clip the block plays its made-up levels, whose seconds are the item's own.
import { createRegistry, Stage } from '@tellcut/engine';
import { artAt, audiogram, heardAt, heldSpeaker } from './audiogram.ts';

// a 2D context that records the bars it is asked to draw (jsdom has none)
let bars: number[] = [];
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function () {
    const g: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => g), set: (t: any, k, v) => { t[k] = v; return true; } });
    g.roundRect = (_x: number, _y: number, _w: number, hh: number) => { bars.push(hh); };
    g.createLinearGradient = () => ({ addColorStop() {} });
    return g;
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video: () => document.createElement('video'), place() {}, stillUrl: () => '', fileUrl: (f: string) => `/p/${f}`, sync: async () => {}, image() {} };
const W = 1080, H = 1920;
const theme = { palette: { ink: '#111111', paper: '#ffffff', accent: '#ff0000', accent2: '#00ff00', hl: '#0000ff' } };
const SP = [[0, 1.5, 1], [1.5, 60, 2]], NAMES = ['', 'Mia', 'Leo'];
function stage(params: Record<string, unknown>, o: { audio?: unknown[]; end?: number } = {}) {
  const root = document.createElement('div');
  const project: any = {
    version: 1, meta: { width: W, height: H, fps: 30, duration: 10, background: '#000', plugins: [], theme }, media: {}, grids: [],
    sources: { s1: { path: 'a.mp4', duration: 600, width: 1920, height: 1080, kind: 'video', audio: true } },
    tracks: [
      ...(o.audio ? [{ id: 'a1', kind: 'audio', items: o.audio }] : []),
      { id: 'o', kind: 'overlay', items: [{ id: 'g', type: 'common.audiogram', start: 0, end: o.end ?? 6, params }] },
    ],
  };
  const st = new Stage(root, createRegistry([{ id: 'common', items: [audiogram] } as any]), media);
  st.load(project);
  const pill = () => [...root.querySelectorAll('div')].find((d) => d.style.borderRadius === '999px') as HTMLElement;
  const cv = () => root.querySelector('canvas') as HTMLCanvasElement;
  const shown = () => [...root.querySelectorAll('img')].filter((i) => (i.parentElement as HTMLElement).style.display === 'block').map((i) => i.getAttribute('src'));
  return { at: (t: number) => { bars = []; st.draw(t); return pill(); }, cv, shown, root };
}
const audio = (id: string, start: number, end: number, inS: number) => ({ id, source: 's1', in: inS, rate: 1, start, end, gain: 0, fadeIn: 0, fadeOut: 0 });

test('hold: the last speaker stays through a gap shorter than hold, not through a longer one or one with nobody after it', () => {
  const who = (u: number) => (u >= 0 && u < 2 ? 1 : u >= 2.5 && u < 4 ? 2 : 0);
  expect(heldSpeaker(who, 2.2, 0)).toBe(0);      // today: nobody in the gap
  expect(heldSpeaker(who, 2.2, 1)).toBe(1);
  expect(heldSpeaker(who, 2.45, 1)).toBe(1);
  expect(heldSpeaker(who, 2.2, 0.3)).toBe(0);    // the 0.5 s gap is longer than 0.3
  expect(heldSpeaker(who, 4.3, 5)).toBe(0);      // the end: nobody comes after
  expect(heldSpeaker(who, 3, 1)).toBe(2);
  // in the block: two c.audio pieces with 0.4 s of nothing between (film 2–2.4); speakers in source seconds
  const pieces = [audio('l1', 0, 2, 100), audio('l2', 2.4, 5, 102.4)], sp = [[100, 102, 1], [102.4, 110, 2]];
  const today = stage({ speakers: sp, names: NAMES, colors: ['#777777', '#aa0000', '#00aa00'] }, { audio: pieces });
  expect(today.at(2.2).textContent).toBe('');                              // the flash this param is for
  const held = stage({ speakers: sp, names: NAMES, colors: ['#777777', '#aa0000', '#00aa00'], hold: 1 }, { audio: pieces });
  const p = held.at(2.2);
  expect(p.textContent).toBe('Mia');
  expect(p.style.display).toBe('block');
  expect(p.style.background).toMatch(/#aa0000|rgb\(170, 0, 0\)/);
  expect(held.at(3).textContent).toBe('Leo');
});

test('arts: the cover changes by source second like speakers, every one loaded from the start; a gap keeps the last one heard', () => {
  const arts = [[0, 1.5, 'media/a.jpg'], [1.5, 60, ' media/b.jpg '], ['x', 2, 'media/c.jpg'], [0, 1]];
  expect(artAt(arts, 1)).toBe('media/a.jpg');
  expect(artAt(arts, 1.5)).toBe('media/b.jpg');
  expect(artAt(arts, 99)).toBe('');
  expect(artAt('nope', 1)).toBe('');
  const spans = [{ source: 's', start: 0, end: 2, in: 10, rate: 1 }, { source: 's', start: 3, end: 4, in: 50, rate: 1 }];
  expect(heardAt(spans, 2.5)).toEqual({ source: 's', s: 12 });   // the gap: where the last span stopped
  expect(heardAt(spans, -1)).toBeNull();
  for (const look of ['ring', 'bars']) {
    const g = stage({ look, art: 'media/base.jpg', arts: [[0, 1.5, 'media/a.jpg'], [1.5, 3, 'media/b.jpg']] });
    const all = [...g.root.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(all).toEqual(expect.arrayContaining(['/p/media/a.jpg', '/p/media/b.jpg']));
    g.at(1); expect(g.shown()).toEqual(['/p/media/a.jpg']);
    g.at(2); expect(g.shown()).toEqual(['/p/media/b.jpg']);
    g.at(4); expect(g.shown()).toEqual(['/p/media/base.jpg']);   // past the list: art
  }
});

test('nameX / nameY put the tag\'s centre where asked; -1 keeps today\'s place', () => {
  const g = stage({ speakers: SP, names: NAMES });
  const a = g.at(1);
  expect(a.style.left).toBe('540px');
  expect(a.style.transform).toBe('translate(-50%, -100%)');
  const b = stage({ speakers: SP, names: NAMES, nameX: 0.25, nameY: 0.3 }).at(1);
  expect([b.style.left, b.style.top, b.style.transform]).toEqual(['270px', '576px', 'translate(-50%, -50%)']);
  const c = stage({ speakers: SP, names: NAMES, nameX: 0.25 }).at(1);
  expect([c.style.left, c.style.top]).toEqual(['270px', a.style.top]);
});

test('only: it moves only while that speaker talks, in their colour with their name throughout', () => {
  const all = stage({ speakers: SP, names: NAMES });
  all.at(1);
  const lively = Math.max(...bars), flat = Math.min(...bars);
  expect(lively).toBeGreaterThan(flat * 1.5);                           // speaker 1 talking: the bars move
  const one = stage({ speakers: SP, names: NAMES, only: 2 });
  const p = one.at(1);
  expect(Math.max(...bars)).toBeCloseTo(Math.min(...bars), 6);          // speaker 1's turn: silent for speaker 2's meter
  expect(p.textContent).toBe('Leo');
  expect(p.style.background).toMatch(/#00ff00|rgb\(0, 255, 0\)/);
  one.at(3);
  expect(Math.max(...bars)).toBeGreaterThan(Math.min(...bars) * 1.5);   // their own turn
});

test('fadeIn / fadeOut fade the whole item; 0 (the default) does not', () => {
  const g = stage({ speakers: SP, names: NAMES, art: 'media/c.jpg', fadeIn: 0.5, fadeOut: 1 });
  const p = g.at(0.25);
  expect(+p.style.opacity).toBe(0.5);
  expect(+g.cv().style.opacity).toBe(0.5);
  expect(+g.at(5.5).style.opacity).toBe(0.5);
  expect(+g.at(3).style.opacity).toBe(1);
  expect(+stage({ speakers: SP, names: NAMES }).at(0).style.opacity).toBe(1);
  for (const k of ['hold', 'only', 'fadeIn', 'fadeOut']) expect(audiogram.params.find((x) => x.key === k)!.default).toBe(0);
  for (const k of ['nameX', 'nameY']) expect(audiogram.params.find((x) => x.key === k)!.default).toBe(-1);
  expect(audiogram.params.find((x) => x.key === 'arts')!.default).toEqual([]);
});
