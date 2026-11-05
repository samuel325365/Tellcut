// The Cut API in a panel layout: captions nobody placed go right under the panel (under-panel.ts), rows reserved with underPanel
// stay clear of them, and what the author placed is left alone.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cut } from './cut.ts';
import { base, fresh, inv, items } from './cut-test-kit.ts';
import { captionHeight, UNDER_GAP } from './under-panel.ts';

/** a 9:16 film (the kit's base is 16:9) */
const tall = () => { const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base(); p.meta.width = 1080; p.meta.height = 1920; return new Cut(p, inv(dir), dir); };
const GAP = UNDER_GAP / 1920, MARGIN = 1 - 0.22;   // 9:16: 40 px under the border, the bottom safe margin at 0.78
const byId = (c: Cut, id: string) => items(c, 'text').find((i) => i.id === id);

test('captions with no place of their own hang right under the panel: common.caption by its y, core.caption moved up from the margin', async () => {
  const c = tall();
  c.panel({ frame: [0.04, 0.15, 0.92, 0.45] });                                  // its lower edge at 0.6
  c.clip('v', { from: 0, len: 4 });
  const bubble = c.effect('common.caption', { at: 0, len: 1, text: '好香', style: 'bubble' });
  const plain = c.effect('core.caption', { at: 1, len: 1, text: '出發' });   // the old block: an older cut.ts may still ask for it
  await c.save();
  const hb = captionHeight('common.caption', { style: 'bubble', size: 4.6 }, 1080, 1920, 8);
  expect(byId(c, bubble).params.y).toBeCloseTo(0.6 + GAP + hb, 4);
  expect(byId(c, bubble).params.y).toBeLessThanOrEqual(MARGIN);
  const hc = captionHeight('core.caption', { size: 4.5 }, 1080, 1920, 8);
  expect(byId(c, plain).transform).toMatchObject({ x: 0, scale: 1 });
  expect(MARGIN + byId(c, plain).transform.y).toBeCloseTo(0.6 + GAP + hc, 4);      // its lower edge, moved from the margin
  expect(c.notes.join('\n')).not.toMatch(/c\.panel/);
});

test('a caption the author placed keeps its place: a y, a position, a transform (given or set later with c.update)', async () => {
  const c = tall();
  c.panel({ frame: [0.04, 0.15, 0.92, 0.45] });
  c.clip('v', { from: 0, len: 4 });
  const y = c.effect('common.caption', { at: 0, len: 1, text: 'a', y: 0.9 });
  const top = c.effect('common.caption', { at: 1, len: 1, text: 'b', position: 'top' });
  const moved = c.effect('common.caption', { at: 2, len: 1, text: 'c', transform: { x: 0.1, y: 0, scale: 1 } });
  const later = c.caption('d', { at: 3, len: 1 });
  c.update(later, { transform: { x: 0, y: -0.3, scale: 1 } });
  await c.save();
  expect(byId(c, y).params.y).toBe(0.9);
  expect(byId(c, top).params.y).toBeUndefined();
  expect(byId(c, moved).params.y).toBeUndefined();
  expect(byId(c, later).transform.y).toBe(-0.3);
});

test('rows reserved with underPanel come first; captions that no longer fit stay on the margin, a note only when they cover the panel', async () => {
  const c = tall();
  c.panel({ frame: [0.04, 0.15, 0.92, 0.4] });
  c.clip('v', { from: 0, len: 4 });
  expect(c.underPanel(0.03)).toBeCloseTo(0.55, 9);
  expect(c.underPanel(0.02)).toBeCloseTo(0.58, 9);                                 // the next row under the first
  const cap = c.effect('common.caption', { at: 0, len: 1, text: '好香', style: 'bubble' });
  await c.save();
  expect(byId(c, cap).params.y).toBeCloseTo(0.6 + GAP + captionHeight('common.caption', { style: 'bubble', size: 4.6 }, 1080, 1920, 8), 4);
  // the default tall panel ends at 0.74: two lines do not fit above 0.78, so the caption stays there and covers the panel's edge
  const d = tall();
  d.panel();
  d.clip('v', { from: 0, len: 2 });
  const low = d.effect('common.caption', { at: 0, len: 1, text: '好香' });
  await d.save();
  expect(byId(d, low).params.y).toBeUndefined();
  expect(d.notes.join('\n')).toMatch(/c\.panel：面板下緣 0\.740 到畫面安全區下緣 0\.780 之間放不下兩行字幕，1 張/);
  // a reserved row the captions cannot clear is not the panel: no note (the hook's tall stack)
  const h = tall();
  h.panel({ frame: [0.04, 0.2, 0.92, 0.42] });
  h.clip('v', { from: 0, len: 2 });
  h.underPanel(0.08);
  const under = h.effect('common.caption', { at: 0, len: 1, text: '好香', style: 'bubble' });
  await h.save();
  expect(byId(h, under).params.y).toBeUndefined();
  expect(h.notes.join('\n')).not.toMatch(/c\.panel/);
  expect(() => tall().underPanel(0.05)).toThrow('先呼叫 c.panel()');
});

test("a 16:9 film's default panel keeps its captions over the picture's lower edge without a note; no panel, no placing", async () => {
  const w = fresh();                                                                // 1920×1080
  w.panel();
  w.clip('v', { from: 0, len: 2 });
  const cap = w.effect('common.caption', { at: 0, len: 1, text: 'x' });
  await w.save();
  expect(byId(w, cap).params.y).toBeUndefined();
  expect(w.notes.join('\n')).not.toMatch(/c\.panel/);
  const plain = fresh();
  plain.clip('v', { from: 0, len: 2 });
  const a = plain.effect('common.caption', { at: 0, len: 1, text: 'x' }), b = plain.caption('y', { at: 0, len: 1 });
  await plain.save();
  expect([byId(plain, a).params.y, byId(plain, b).transform]).toEqual([undefined, undefined]);
});

test('captionHeight counts what a caption draws besides its two lines: the name and tag chips, the translation, a big style', () => {
  const h = (p: Record<string, unknown>) => captionHeight('common.caption', { size: 4.6, ...p }, 1080, 1920, 8);
  expect(h({ style: 'outline' })).toBeCloseTo((2.5 * 0.046 * 1920) / 1920, 6);
  expect(h({ style: 'bubble' })).toBeGreaterThan(h({ style: 'outline' }));
  expect(h({ style: 'outline', name: 'A' })).toBeGreaterThan(h({ style: 'outline' }));
  expect(h({ style: 'outline', name: 'A', tag: '店' })).toBeGreaterThan(h({ style: 'outline', name: 'A' }));
  expect(h({ style: 'outline', gloss: 'hi' })).toBeGreaterThan(h({ style: 'outline' }));
  expect(h({ style: 'big' })).toBeCloseTo(h({ style: 'outline' }) * 1.25, 6);
  expect(captionHeight('core.caption', { size: 4.5 }, 1080, 1920, 8)).toBeCloseTo(2.8 * 0.045, 6);
});
