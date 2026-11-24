// @vitest-environment jsdom
// common.handwrite: how long a "start-end" line stays in replace mode (acceptance films 2026-11-01, X2), and its pens (look).
// jsdom has no layout and no 2D context: the look tests read what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';
import { bandSpan, CRAYONS, crayonColor, currentSentence, handFilter, handwrite, parseSentences } from './handwrite.ts';

test('a line with an end time stays 1.2 s after it by default, then fades out over 0.25 s', () => {
  const s = parseSentences('0.1-1.3|今天的風很溫柔\n6|下一句');
  expect(currentSentence(s, 2.2, 10).alpha).toBe(1);
  expect(currentSentence(s, 2.5 - 0.125, 10).alpha).toBeCloseTo(0.5, 5);
  expect(currentSentence(s, 2.5, 10).alpha).toBe(0);
});

test('hold sets how long it stays after its end; the next line still takes over when it starts', () => {
  const s = parseSentences('0.1-1.3|今天的風很溫柔\n6|下一句');
  expect(currentSentence(s, 2.5, 10, 3).alpha).toBe(1);
  expect(currentSentence(s, 4.3, 10, 3).alpha).toBe(0);
  expect(currentSentence(s, 5.9, 10, 30).alpha).toBeCloseTo(0.4, 5);
  // never before it has been written (12 characters a second)
  expect(currentSentence(parseSentences('0-0.2|今天的風很溫柔，我們沿著河邊慢慢走'), 1.2, 10, 0).alpha).toBe(1);
});

test('the hold parameter and the doc say so', () => {
  expect(handwrite.params.find((p) => p.key === 'hold')).toMatchObject({ type: 'number', default: 1.2 });
  expect(handwrite.doc).toMatch(/hold 秒（預設 1.2）/);
});

describe('common.handwrite looks', () => {
  const anything: any = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
    apply: () => anything, construct: () => anything, set: () => true,
  });
  const real = HTMLCanvasElement.prototype.getContext;
  beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); }; });
  afterAll(() => { HTMLCanvasElement.prototype.getContext = real; });

  /** build and draw the block alone on a 1080×1920 frame at item time `local`; its state and context */
  function run(params: Record<string, unknown>, local: number, id = 'x') {
    const theme = resolveTheme(undefined, { width: 1080, height: 1920 }), root = document.createElement('div');
    const ctx: any = { t: local, local, dur: 4, item: { id, type: handwrite.type, start: 0, end: 4, params }, params: withDefaults(handwrite.params, params, theme), root,
      top: document.createElement('div'), W: 1080, H: 1920, fps: 30, theme, reportText() {} };
    const s = (handwrite as ItemType<any, any>).build(ctx);
    handwrite.draw(ctx, s);
    return { s: s as any, ctx };
  }
  const css = (el: Element | undefined) => ((el as any)?._c ?? {}) as Record<string, string>;
  /** everything a draw left: the group, the paper, the text layer, each line and letter, the band, the filter (its id, which is
   *  the instance's, written as ID) */
  const drawn = (s: any) => JSON.stringify([css(s.group), css(s.note), css(s.small), css(s.txt.el), ...s.txt.slots.flatMap((l: any) => [css(l.box), ...l.chars.map(css)]),
    css(s.band), s.fx?.svg.innerHTML ?? null]).replaceAll(s.fx?.id ?? '\u0000', 'ID');
  const stack = { mode: 'stack', lines: '0.1|一二三\n0.5|四五六\n0.9|七八九\n1.3|十\n1.7|甲乙\n2.1|丙丁' };

  test('each pen draws a pure function of time: a fresh draw and one after another moment agree', () => {
    for (const look of ['pen', 'chalk', 'marker', 'crayon']) for (const t of [0.3, 0.7, 1.5, 3.2]) for (const params of [{ look }, { look, ...stack }, { look, paper: 'note', small: '小字' }]) {
      const a = run(params, t), b = run(params, 2.5);
      handwrite.draw({ ...b.ctx, t, local: t }, b.s);
      expect([look, t, drawn(b.s)]).toEqual([look, t, drawn(a.s)]);
    }
  });

  test('pen is drawn as before: no filter, no band, the paper glow, the ink colour at weight 400', () => {
    const { s, ctx } = run({}, 2);
    expect([s.fx, s.band, css(s.txt.el).filter]).toEqual([undefined, undefined, undefined]);
    expect(s.group.querySelector('svg')).toBeNull();
    expect(css(s.group).textShadow).toBe([0.04, 0.08, 0.14, 0.24].map((r) => `0 0 ${r * 60.48}px ${withAlpha(ctx.params.note, 0.8)}`).join(', '));
    expect([css(s.txt.slots[0].box).color, css(s.txt.slots[0].box).fontWeight, css(s.txt.slots[0].box).webkitTextStroke]).toEqual([ctx.params.color, '400', '0']);
    // another pen on the same state, then pen again: its filter is taken off and the band hidden
    handwrite.draw({ ...ctx, params: { ...ctx.params, look: 'chalk' } }, s);
    handwrite.draw({ ...ctx, params: { ...ctx.params, look: 'marker' } }, s);
    handwrite.draw(ctx, s);
    expect([css(s.txt.el).filter, css(s.band).display]).toEqual(['', 'none']);
    expect(handwrite.variants!.list.map((v) => v.value)).toEqual(['pen', 'chalk', 'marker', 'crayon']);
  });

  test('chalk: written in the paper colour through its own grain filter, a dust halo over a dark shade; on a note, the note is a board', () => {
    const { s, ctx } = run({ look: 'chalk' }, 2);
    expect(css(s.txt.el).filter).toBe(`url(#${s.fx.id})`);
    expect(s.fx.svg.querySelector('filter')!.id).toBe(s.fx.id);
    expect(s.fx.svg.innerHTML).toMatch(/feTurbulence[\s\S]*feDisplacementMap[\s\S]*feComposite/);
    expect(css(s.txt.slots[0].box).color).toBe(ctx.params.note);
    expect(css(s.group).textShadow).toMatch(/^0 [\d.]+px [\d.]+px rgba\(0,0,0,0\.360\), 0 0 [\d.]+px rgba\(255, 248, 236,/);
    const n = run({ look: 'chalk', paper: 'note', small: '黑板' }, 2);
    expect([css(n.s.note).background, css(n.s.group).textShadow]).toEqual([n.ctx.params.color, 'none']);
    expect(css(n.s.small).color).toBe(withAlpha(n.ctx.params.note, 0.62));
    // the grain follows the letters' size, and each instance has an id of its own
    expect(handFilter('f', 'chalk', 120)).not.toBe(handFilter('f', 'chalk', 60));
    expect(run({ look: 'chalk' }, 2, 'x').s.fx.id).not.toBe(run({ look: 'chalk' }, 2, 'x').s.fx.id);
  });

  test('marker: a band canvas under the text, none before the first letter, then following the pen to past the last one', () => {
    const { s } = run({ look: 'marker' }, 2);
    expect(s.band.nextSibling).toBe(s.txt.el);
    expect([css(s.band).display, css(s.txt.el).filter, s.fx]).toEqual(['block', undefined, undefined]);
    expect(css(s.group).textShadow.split('), ').length).toBe(2);   // only the near glow
    const lefts = [0, 60, 120], widths = [60, 60, 60];
    expect(bandSpan(lefts, widths, 0.9, 1, 10, 60)).toBeNull();
    const a = bandSpan(lefts, widths, 1.05, 1, 10, 60)!, b = bandSpan(lefts, widths, 1.15, 1, 10, 60)!, end = bandSpan(lefts, widths, 3, 1, 10, 60)!;
    expect(a[0]).toBeCloseTo(-8.4, 5);
    expect(a[1]).toBeLessThan(b[1]);
    expect(end[1]).toBeCloseTo(180 + 8.4, 5);
  });

  test('crayon: bold waxy letters through its own filter, the paper glow after it, each sentence in the next crayon', () => {
    const { s, ctx } = run({ look: 'crayon', ...stack }, 3.5);
    expect(css(s.txt.el).filter).toMatch(new RegExp(`^url\\(#${s.fx.id}\\) drop-shadow\\(`));
    expect(css(s.group).textShadow).toBe('none');
    expect(s.txt.slots.map((l: any) => css(l.box).color)).toEqual([ctx.params.color, ...CRAYONS, ctx.params.color]);
    expect(s.txt.slots.map((l: any) => css(l.box).fontWeight)).toEqual(Array(6).fill('700'));
    expect(css(s.txt.slots[1].box).webkitTextStroke).toBe(`1.81px ${CRAYONS[0]}`);
    // replace mode: the sentence's own place in the list picks its crayon
    expect(css(run({ look: 'crayon' }, 2).s.txt.slots[0].box).color).toBe(CRAYONS[0]);
    expect([0, 1, 5, 6].map((i) => crayonColor('#123456', i))).toEqual(['#123456', CRAYONS[0], '#123456', CRAYONS[0]]);
    // red words stay red
    const r = run({ look: 'crayon', red: '溫柔', lines: '0.1|今天的風很溫柔' }, 2).s;
    expect(r.txt.slots[0].chars.map((c: Element) => css(c).color)).toEqual(['', '', '', '', '', '#d62f2f', '#d62f2f']);
  });
});
