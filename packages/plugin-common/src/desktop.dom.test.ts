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
