// @vitest-environment jsdom
// common.desktop / common.window / common.popup and common.touch's look cursor (2026-11-05, the retro desktop pilot film's fx.retro*).
// jsdom has no canvas: the geometry is tested through the helpers, the window's own clip through media().
import { resolveTheme, withDefaults } from '@tellcut/engine';
import { deskChapters, deskSlot, deskWindow, desktop, popup, popupButton, sheetButton, windowRect, windowRef } from './desktop.ts';
import { cursorAt, parseTouches, touch } from './touch.ts';

const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
const winParams = (p: Record<string, unknown> = {}) => withDefaults(deskWindow.params, p, theme) as any;

describe('common.desktop', () => {
  test('a phone-screen scene; chapters read "seconds|name|top|bottom" and fill missing colours', () => {
    expect([desktop.kind, desktop.category, deskWindow.category, popup.category]).toEqual(['scene', 'phone', 'phone', 'phone']);
    expect(deskChapters('0|準備\n4.8|佈置|#bff0dd|#cdb8f5\n\n')).toEqual([
      { t: 0, name: '準備', top: '#ffd6b8', bottom: '#cdb8f5' }, { t: 4.8, name: '佈置', top: '#bff0dd', bottom: '#cdb8f5' }]);
  });

  test('taskbar buttons sit in a row at the bottom, left to right, inside the frame', () => {
    const a = deskSlot(1, 5, 1080, 1920), e = deskSlot(5, 5, 1080, 1920);
    expect(a.y).toBe(1880);
    expect(a.x).toBeLessThan(e.x);
    expect(a.x - a.w / 2).toBeGreaterThanOrEqual(190 - 1e-6);
    expect(e.x + e.w / 2).toBeCloseTo(1062, 6);
    expect(deskSlot(9, 5, 1080, 1920)).toEqual(e);   // clamped
  });
});

describe('common.window', () => {
  test('a media window declares its own clip for its whole time; a photo is a still; other contents need nothing', () => {
    const item = (params: Record<string, unknown>) => ({ id: 'w', type: deskWindow.type, start: 2, end: 5, params }) as any;
    const project = { sources: { v: { kind: 'video' }, p: { kind: 'image' } } } as any;
    expect(deskWindow.media!(item({ content: 'media', source: 'v', in: 10 }), project)).toEqual({ videos: [{ source: 'v', in: 10, out: 13, speed: 1, interp: 'none' }], stills: [] });
    expect(deskWindow.media!(item({ content: 'media', source: 'p', in: 0 }), project)).toEqual({ videos: [], stills: [{ source: 'p', t: 0, w: 1080 }] });
    expect(deskWindow.media!(item({ content: 'search', source: 'v' }), project)).toEqual({ videos: [], stills: [] });
    expect(windowRef({ source: 'v', in: 1.5 }, 2)).toEqual({ source: 'v', in: 1.5, out: 3.5, speed: 1, interp: 'none' });
  });

  test('settled it is where x, y, w, h say; min ends shrunk onto its taskbar button', () => {
    const p = winParams({ x: 0.1, y: 0.2, w: 0.8, h: 0.25, exit: 'min', slot: 3, slots: 5 });
    const mid = windowRect(p, 1.5, 3, 1080, 1920, 1);
    expect([mid.left, mid.top, mid.w, mid.h]).toEqual([108, 384, 864, 480]);
    const end = windowRect(p, 3, 3, 1080, 1920, 1), sl = deskSlot(3, 5, 1080, 1920);
    expect(end.left + end.w / 2).toBeCloseTo(sl.x, 6);
    expect(end.top + end.h / 2).toBeCloseTo(sl.y, 6);
    expect(end.w).toBeCloseTo(864 * 0.05, 6);
    expect(end.alpha).toBe(0);
  });

  test('max grows over the top of the frame and lets the chrome go', () => {
    const p = winParams({ exit: 'max', maxAt: 0.5, maxH: 0.72 });
    const r = windowRect(p, 2, 4, 1080, 1920, 1);
    expect(r.left).toBe(-14); expect(r.top).toBe(-50); expect(r.w).toBe(1108); expect(r.h).toBeCloseTo(0.72 * 1920 + 50, 6);
    expect(r.chromeA).toBe(0);
  });
});

describe('common.popup', () => {
  test('popupButton points at the dialog\'s buttons: the second right of the first, both on one row', () => {
    const a = popupButton(1, { y: 0.47, w: 0.84, buttons: '取消|再等等' }), b = popupButton(2, { y: 0.47, w: 0.84, buttons: '取消|再等等' });
    expect(a[1]).toBe(b[1]);
    expect(a[0]).toBeLessThan(0.5); expect(b[0]).toBeGreaterThan(0.5);
    expect(b[0]).toBeCloseTo(0.686, 3); expect(b[1]).toBeCloseTo(0.513, 3);   // where the pilot film's cursor clicked
    expect(sheetButton({ y: 0.72 })).toEqual([0.5, 0.8544]);
  });
});

describe('common.touch look cursor', () => {
  const gs = parseTouches('1|tap|0.2,0.2\n3-4|drag|0.5,0.5>0.8,0.5');
  test('waits at the first point, clicks, then glides to the next gesture over the 0.7 s before it', () => {
    expect(cursorAt(gs, 0, 1080, 1920)).toEqual({ at: [0.2, 0.2], down: false });
    expect(cursorAt(gs, 1.05, 1080, 1920).down).toBe(true);
    expect(cursorAt(gs, 2, 1080, 1920)).toEqual({ at: [0.2, 0.2], down: false });   // still resting: the glide starts at 2.3
    const mid = cursorAt(gs, 2.65, 1080, 1920);
    expect(mid.at[0]).toBeGreaterThan(0.2); expect(mid.at[0]).toBeLessThan(0.5);
    expect(cursorAt(gs, 3.5, 1080, 1920).down).toBe(true);
    expect(cursorAt(gs, 9, 1080, 1920)).toEqual({ at: [0.8, 0.5], down: false });
  });
  test('cursor is one of the looks', () => {
    expect((touch.params.find((q) => q.key === 'look') as any).options).toContain('cursor');
  });
});

describe('the desktop kit on a canvas', () => {
  // jsdom has no 2D context: a stand-in that keeps every fillText with the font it was drawn in, and measures a line as one em a character
  type Drawn = { text: string; px: number; x: number; y: number };
  let drawn: Drawn[] = [];
  const px = (font: string) => Number(/(\d*\.?\d+)px/.exec(font)?.[1] ?? 10);
  const fake = () => {
    const g: any = { font: '10px sans-serif', globalAlpha: 1,
      measureText: (t: string) => ({ width: [...t].length * px(g.font) }),
      fillText: (text: string, x: number, y: number) => drawn.push({ text, px: px(g.font), x, y }),
      createLinearGradient: () => ({ addColorStop() {} }), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
    return new Proxy(g, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  };
  const real = HTMLCanvasElement.prototype.getContext;
  beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = fake; });
  afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });
  const run = (type: any, params: Record<string, unknown>, local: number, W = 1080, H = 1920) => {
    drawn = [];
    const said: string[] = [], ctx: any = { t: local, local, dur: 4, W, H, params: withDefaults(type.params, params, theme), root: document.createElement('div'),
      motion: { spring: () => () => 1 }, media: {}, project: { sources: {} }, reportText: (_g: unknown, text: string) => said.push(text) };
    type.draw(ctx, type.build(ctx));
    return said;
  };

  test('a long question and long button labels shrink to fit the dialog and their buttons', () => {
    const text = '派對要不要改到下個星期六的晚上再一起舉行呢？', labels = '好啊我們就這麼決定吧|再讓我想一想好了';
    run(popup, { text, buttons: labels, w: 0.84 }, 2);
    const w = 0.84 * 1080, q = drawn.find((d) => d.text === text)!;
    expect([...text].length * q.px).toBeLessThanOrEqual(w - 80 + 1e-6);
    const bwid = Math.min(300, (w - 120) / 2);
    for (const l of labels.split('|')) { const d = drawn.find((x) => x.text === l)!; expect([...l].length * d.px).toBeLessThanOrEqual(bwid - 28 + 1e-6); }
    // a short one keeps its size
    run(popup, { text: '好嗎？', buttons: '好|不' }, 2);
    expect(drawn.find((d) => d.text === '好嗎？')!.px).toBe(54);
  });

  test('the sheet line keeps one size, fitted to the whole line, while it is typed', () => {
    const text = '謝謝大家今天一起來參加我十六歲的生日派對，下次再見';
    run(popup, { mode: 'sheet', text, typeAt: 0, press: -1, y: 0.7 }, 0.5);
    const part = drawn.find((d) => text.startsWith(d.text) && d.text.length < text.length)!;
    run(popup, { mode: 'sheet', text, typeAt: 0, press: -1, y: 0.7 }, 3.9);
    const whole = drawn.find((d) => d.text === text)!;
    expect(part.px).toBe(whole.px);
    expect([...text].length * whole.px).toBeLessThanOrEqual(1080 - 120 + 1e-6);
  });

  test('the words drawn on the canvas are reported: the window title, the menu, the app name, start and the chapter buttons', () => {
    expect(run(deskWindow, { content: 'search', text: '', title: 'party_01.jpg' }, 1.5)).toContain('party_01.jpg');
    expect(run(popup, { title: 'notice' }, 2)).toContain('notice');
    const said = run(desktop, { chapters: '0|準備\n1|派對', menu: '檔案,編輯', start: '開始', app: 'PARTY.EXE' }, 0.5);
    expect(said).toEqual(expect.arrayContaining(['★  檔案   編輯', '♥ PARTY.EXE', '★ 開始', '準備.exe', '派對.exe']));
  });

  test('a long window title shrinks to stay clear of the three buttons', () => {
    const title = 'a_very_long_file_name_from_the_party.jpg';
    run(deskWindow, { content: 'search', text: '', title, w: 0.5, exit: 'none' }, 1.5);
    const d = drawn.find((x) => x.text === title)!;
    expect(d.x + [...title].length * d.px).toBeLessThanOrEqual(0.5 * 1080 - 114 - 12 + 1e-6);
  });

  test('chapter colours mix as CSS colours: #fff is white, not blue', () => {
    const stops: string[] = [];
    (HTMLCanvasElement.prototype as any).getContext = function () { const g = fake(); g.createLinearGradient = () => ({ addColorStop: (_: number, c: string) => stops.push(c) }); return g; };
    try { run(desktop, { chapters: '0|a|#fff|#000' }, 0.5); } finally { (HTMLCanvasElement.prototype as any).getContext = fake; }
    expect(stops).toEqual(['#ffffff', '#000000']);
  });
});
