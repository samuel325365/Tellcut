// Group B1 (2026-10-23): the shared phone pieces (phone.ts), common.notify and common.lockscreen.
import { defaultSafe, prog, eOut3 } from '@tellcut/engine';
import { caretOn, fmtCount, glyphSvg, ICON_KINDS, initialOf, parseSteps, phoneScreen, rippleAt, screenFrame, stackAt, stackLayout, statusIconsSvg, stepAt, timeSpan, typed, typedSpan, type StackItem } from './phone.ts';
import { roundRectUrl } from './window.ts';
import { noteLayout, notify, parseNotes } from './notify.ts';
import { clockAt, liveAt, liveSpans, lockscreen } from './lockscreen.ts';

test('phone screen: the whole frame on 9:16; a 9:16 phone inside the safe area on wide and square frames; px moves it, never out', () => {
  expect(phoneScreen(1080, 1920, defaultSafe(1080, 1920))).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, k: 1, body: false, full: true });
  for (const [W, H] of [[1920, 1080], [1080, 1080], [1080, 1350]]) {
    const safe = defaultSafe(W, H), s = phoneScreen(W, H, safe);
    expect(s.w / s.h).toBeCloseTo(9 / 16, 6);
    expect(s.body).toBe(true);
    expect(s.y - s.bezel).toBeGreaterThanOrEqual(safe.top * H - 1e-6);
    expect(s.y + s.h + s.bezel).toBeLessThanOrEqual((1 - safe.bottom) * H + 1e-6);
    expect(s.x + s.w / 2).toBeCloseTo(W / 2, 6);
    expect(s.k).toBeCloseTo(s.w / 1080, 9);
  }
  const wide = defaultSafe(1920, 1080), left = phoneScreen(1920, 1080, wide, 'auto', 0.2), edge = phoneScreen(1920, 1080, wide, 'auto', 0);
  expect(left.x + left.w / 2).toBeCloseTo(384, 6);
  expect(edge.x - edge.bezel).toBeCloseTo(wide.side * 1920, 6);
  expect(phoneScreen(1920, 1080, wide, 'bare')).toMatchObject({ body: false, bezel: 0 });
  expect(phoneScreen(1080, 1920, defaultSafe(1080, 1920), 'phone').body).toBe(true);   // phone draws the body on 9:16 too
  const f = screenFrame(1920, 1080), s = phoneScreen(1920, 1080, wide);
  expect(f[0]).toBeCloseTo(s.x / 1920, 4); expect(f[3]).toBeCloseTo(s.h / 1080, 4);
});

test('typing: erase the old text twice as fast, then type; typed spans in and out; the caret blinks', () => {
  expect(typed('搜尋', 0.1, { at: 0.2, cps: 0.1 })).toEqual({ s: '', typing: false });
  expect(typed('搜尋中', 0.25, { at: 0.2, cps: 0.1 })).toEqual({ s: '搜', typing: true });
  expect(typed('搜尋中', 9, { at: 0.2, cps: 0.1 })).toEqual({ s: '搜尋中', typing: false });
  expect(typed('新', 0.06, { at: 0, cps: 0.1, erase: '舊字' }).s).toBe('');   // two old characters go in 0.1 s
  expect(typed('新', 0.02, { at: 0, cps: 0.1, erase: '舊字' }).s).toBe('舊');
  expect(typed('新', 0.11, { at: 0, cps: 0.1, erase: '舊字' }).s).toBe('新');
  expect(typedSpan('abcd', 0.5, 0, 1)).toBe('ab');
  expect(typedSpan('abcd', 0.75, 0, 1, 'delete')).toBe('a');
  expect(typedSpan('abcd', 1.05, 0, 1)).toBe('abcd');
  expect(typedSpan('abcd', 1.05, 0, 1, 'delete')).toBeNull();
  expect(typedSpan('abcd', -0.1, 0, 1)).toBeNull();
  expect([caretOn(0), caretOn(0.45), caretOn(0.9)]).toEqual([true, false, true]);
});

test('counts: 萬 / 万 / K, one decimal rounded down, the trailing .0 dropped', () => {
  expect(fmtCount(8000)).toBe('8,000');
  expect(fmtCount(12345)).toBe('1.2萬');
  expect(fmtCount(19999)).toBe('1.9萬');
  expect(fmtCount(30000)).toBe('3萬');
  expect(fmtCount(123456789)).toBe('1.2億');
  expect(fmtCount(12345, 'ja')).toBe('1.2万');
  expect(fmtCount(999, 'en')).toBe('999');
  expect(fmtCount(1530, 'en')).toBe('1.5K');
  expect(fmtCount(2_400_000, 'en')).toBe('2.4M');
  expect(fmtCount(12345, 'plain')).toBe('12,345');
  expect([initialOf('mia_travel'), initialOf('慢慢吃'), initialOf('123'), initialOf('')]).toEqual(['M', '慢', '·', '·']);
});

test('stack: the newest on top pushes the others down, the ones past `full` pile up, an entry that leaves keeps its place', () => {
  const items: StackItem[] = [{ at: 0, h: 100 }, { at: 1, h: 100 }, { at: 2, h: 100, out: 4 }];
  const o = { grow: 'down' as const, top: 200, bottom: 1500, gap: 20, full: 2, peek: 22 };
  const rest = stackLayout(items, 2, o);
  expect(rest.get(2)).toEqual({ y: 200, lvl: 0, h: 100 });
  expect(rest.get(1)).toEqual({ y: 320, lvl: 0, h: 100 });
  expect(rest.get(0)).toEqual({ y: 342, lvl: 1, h: 100 });   // in the pile: its bottom peeks 22 px under the last full card
  const at = (t: number) => Object.fromEntries(stackAt(items, t, o).map((q) => [q.i, q]));
  expect(at(0.5)[0].y).toBe(200);
  expect(at(1)[0].y).toBe(200);                         // the move starts when the new entry comes in…
  expect(at(1.2)[0].y).toBeGreaterThan(200);
  expect(at(1.6)[0].y).toBeCloseTo(320, 6);             // …and is done after 0.45 s
  expect(at(3)[0].lvl).toBeCloseTo(1, 6);
  expect(at(4.2)[2].y).toBeCloseTo(200, 6);             // going out: it keeps its place while it slides away
  expect(at(4.2)[2].out).toBeGreaterThan(0);
  expect(at(5)[2]).toBeUndefined();
  expect(at(5)[1].y).toBeCloseTo(200, 6);               // and the others close up
  expect(at(5)[0].lvl).toBeCloseTo(0, 6);
  expect(at(-1)).toEqual({});
});

test('stack: a button unfolding makes its entry taller; growing up stacks from the bottom and fades near the top', () => {
  const grown = stackAt([{ at: 0, h: 100, more: [[1, 50]] }], 2, { grow: 'down', top: 0, bottom: 2000, gap: 10, full: 2, peek: 22 });
  expect(grown[0].h).toBeCloseTo(150, 6);
  const o = { grow: 'up' as const, top: 300, bottom: 1500, gap: 20, full: 9, peek: 22, fade: 200 };
  const up = Object.fromEntries(stackAt([{ at: 0, h: 400 }, { at: 1, h: 400 }, { at: 2, h: 400 }, { at: 3, h: 400 }], 5, o).map((q) => [q.i, q]));
  expect(up[3].y).toBeCloseTo(1100, 6);
  expect(up[2].y).toBeCloseTo(680, 6);
  expect(up[1].y).toBeCloseTo(260, 6);
  expect(up[1].fade).toBe(0);                           // pushed past the top: gone
  expect(up[2].fade).toBe(1);
});

test('ripple: the same ring common.touch draws (0.85 R + 70 px, fading over 0.45 s)', () => {
  expect(rippleAt(0.9, 1, 40, 1)).toBeNull();
  expect(rippleAt(1.5, 1, 40, 1)).toBeNull();
  const r = rippleAt(1.2, 1, 40, 0.5)!, u = prog(1.2, 1, 1.45);
  expect(r.r).toBeCloseTo(40 * 0.85 + 70 * 0.5 * eOut3(u), 9);
  expect(r.a).toBeCloseTo(0.8 * (1 - u), 9);
  expect(r.w).toBe(3);
});

test('status bar icons: the bars lit up to the signal, the wifi arcs only with wifi, a low battery in red', () => {
  const a = statusIconsSvg(2, true, 80, '#fff');
  expect((a.svg.match(/opacity="1"/g) ?? []).length).toBe(2);
  expect(a.svg).toContain('<path');
  const b = statusIconsSvg(4, false, 10, '#fff');
  expect(b.svg).not.toContain('<path');
  expect(b.svg).toContain('#ff453a');
  expect(b.w).toBeLessThan(a.w);
});

test('icons: every glyph is drawn here, in the colour asked; notify\'s doc lists them all; the rounded window mask', () => {
  for (const k of ICON_KINDS) expect(glyphSvg(k, '#123456')).toContain('#123456');
  for (const k of ICON_KINDS) expect(notify.doc).toMatch(new RegExp(`[（ ]${k}[ ）]`));
  expect(glyphSvg('nope')).toBe(glyphSvg('app'));
  expect(decodeURIComponent(roundRectUrl(300, 200, 40))).toContain("rx='40.00'");
  expect(decodeURIComponent(roundRectUrl(300, 60, 40))).toContain("rx='30.00'");   // never more than half the short side
});

test('notify lines: time span, icon, app, title, body lines, extras in any order; junk dropped', () => {
  const [a, b, c] = parseNotes('0.2-2.5|work|老闆||在嗎？\n1|bell|提醒|重點|第一行/第二行|accent|lock|sub=A gloss, with commas|when=9:41|chip=好|press=2|who=#d6336c\nnope|x\n3|msg|訊息||嗨|tone=dark|chipAt=4|chip=回覆');
  expect(a).toMatchObject({ at: 0.2, out: 2.5, icon: 'work', app: '老闆', title: '', body: ['在嗎？'], tone: 'plain', lock: false, chip: '', press: -1 });
  expect(b).toMatchObject({ at: 1, out: undefined, tone: 'accent', lock: true, body: ['第一行', '第二行'], sub: 'A gloss, with commas', when: '9:41', chip: '好', chipAt: 1.6, press: 2, who: '#d6336c' });
  expect(c).toMatchObject({ tone: 'dark', chip: '回覆', chipAt: 4 });
  expect(parseNotes('1|||||')).toMatchObject([{ icon: 'bell', body: [] }]);
  expect(timeSpan('2-1')).toEqual([2, 2]);
  expect(timeSpan('x')).toBeNull();
});

test('notify card: rows stack under the head (title, body lines in the tone size, gloss wrapped); the button adds its own height', () => {
  const [n] = parseNotes('0|bell|App|標題|一/二|accent|sub=Man is born tired and lives to rest, and then some more words|chip=好');
  const L = noteLayout(n, 864);
  expect(L.title).toBe(34 + 66 + 32);
  expect(L.rows).toEqual([164 + 38, 164 + 76 + 38]);
  expect(L.sub.length).toBeGreaterThan(1);
  expect(L.base).toBe(164 + 2 * 76 + 12 + L.sub.length * 58 + 34);
  expect(L.chip).toBe(104);
  expect(noteLayout(parseNotes('0|bell|App||一')[0], 864)).toMatchObject({ base: 34 + 66 + 64 + 34, chip: 0, title: -1 });
});

test('notify and lockscreen defaults play out inside the 3 s gallery preview', () => {
  const def = (t: { params: Array<{ key: string; default: unknown }> }, k: string) => String(t.params.find((p) => p.key === k)!.default);
  const notes = parseNotes(def(notify, 'items'));
  expect(notes.length).toBeGreaterThanOrEqual(3);
  for (const n of notes) { expect(n.at).toBeLessThan(2); if (n.press >= 0) expect(n.press).toBeLessThan(2.8); }
  const clock = parseSteps(def(lockscreen, 'clock'));
  expect(clock.at(-1)!.t).toBeLessThan(2.5);
  expect(parseSteps(def(lockscreen, 'mode')).at(-1)!.t).toBeLessThan(2.5);
});

test('lockscreen: steps by time, the clock flips the changed characters, live spans ease in and out', () => {
  const steps = parseSteps('1.2|15:00\n0|14:59\nx|bad');
  expect(steps.map((s) => s.t)).toEqual([0, 1.2]);
  expect(stepAt(steps, 0.5).cur!.v[0]).toBe('14:59');
  expect(stepAt(steps, 1.3).prev!.v[0]).toBe('14:59');
  expect(stepAt(steps, -1).cur).toBeNull();
  expect(clockAt(steps, 0.5)).toEqual({ cur: '14:59', old: '14:59', p: 1 });
  const mid = clockAt(steps, 1.4);
  expect(mid.cur).toBe('15:00'); expect(mid.old).toBe('14:59'); expect(mid.p).toBeGreaterThan(0); expect(mid.p).toBeLessThan(1);
  expect(clockAt(steps, 2).old).toBe('15:00');
  expect(clockAt(steps, -1).cur).toBe('14:59');
  const spans = liveSpans('1-3, 5-6\nx\n7');
  expect(spans).toEqual([[1, 3], [5, 6]]);
  expect(liveAt(spans, 0.5)).toBe(0);
  expect(liveAt(spans, 1.2)).toBeCloseTo(0.5, 9);
  expect(liveAt(spans, 2)).toBe(1);
  expect(liveAt(spans, 2.9)).toBeCloseTo(0.25, 9);
});
