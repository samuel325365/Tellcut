// @vitest-environment jsdom
// common.popcard / common.sticker, backdrop's pattern words and bits, wipe's mode stripes, badge's shape box and the title look pop
// (2026-11-06, the Dopamine Colors pilot film). jsdom has no canvas: the parsers, timings, declared media, path and DOM styles are tested.
import { springPopAt } from './dopamine-kit.ts';
import { parseShots, popcard, shotAt } from './popcard.ts';
import { sticker, stickerPath, stickerWobble } from './sticker.ts';
import { textEm, withDefaults, resolveTheme } from '@tellcut/engine';
import { bitAt } from './backdrop.ts';
import { stripeSpan } from './wipe.ts';
import { badge } from './badge.ts';
import { pop } from './caption/looks/title.ts';

describe('common.popcard', () => {
  test('an overlay frame; shots read seconds|source|from|crop|label|still and run until the next one', () => {
    expect([popcard.kind, popcard.category, sticker.kind, sticker.category]).toEqual(['overlay', 'photo', 'overlay', 'mark']);
    const shots = parseShots('1.5|b|9|0.5,0.4,1.6|包|still\n0|a|2.1||白T', 3);
    expect(shots.map((s) => [s.t, s.source, s.from, s.crop, s.label, s.still, s.len])).toEqual([
      [0, 'a', 2.1, { x: 0.5, y: 0.5, zoom: 1 }, '白T', false, 1.5],
      [1.5, 'b', 9, { x: 0.5, y: 0.4, zoom: 1.6 }, '包', true, 1.5],
    ]);
  });
  test('a line with no source is dropped before the lengths: the shot before it runs on to the next; an empty crop part keeps its default', () => {
    const shots = parseShots('0|a|2|,0.3,1.5|x\n1|||\n2|b|5', 3);
    expect(shots.map((s) => [s.t, s.source, s.len, s.crop])).toEqual([[0, 'a', 2, { x: 0.5, y: 0.3, zoom: 1.5 }], [2, 'b', 1, { x: 0.5, y: 0.5, zoom: 1 }]]);
    // the declared piece is as long as the shot shows: to the item's end, not to the dropped line
    const item = { id: 'c', type: popcard.type, start: 0, end: 3, params: { shots: '0|a|2\n1.5||9' } } as any;
    expect(popcard.media!(item, {} as any).videos).toEqual([{ source: 'a', in: 2, out: 5, speed: 1, interp: 'none' }]);
  });
  test('a video for each playing shot, a still for each held one', () => {
    const item = { id: 'c', type: popcard.type, start: 0, end: 3, params: { shots: '0|a|2|0.5,0.5,1|x\n1|b|5|0.5,0.5,1|y|still' } } as any;
    expect(popcard.media!(item, {} as any)).toEqual({ videos: [{ source: 'a', in: 2, out: 3, speed: 1, interp: 'none' }], stills: [{ source: 'b', t: 5, w: 1080 }] });
  });
  test('the shot showing, and where its run of one label began (its pill pops once)', () => {
    const shots = parseShots('0|a|0||HAUL\n1|a|5||HAUL\n2|a|9||NEW', 3);
    expect([shotAt(shots, 0.5), shotAt(shots, 1.5), shotAt(shots, 2.5)]).toEqual([{ i: 0, labelFrom: 0 }, { i: 1, labelFrom: 0 }, { i: 2, labelFrom: 2 }]);
  });
  test('the pop: nothing before its time, past 1 once (the overshoot), settling at 1', () => {
    expect(springPopAt(0.9, 1)).toBe(0);
    expect(Math.max(...[0.15, 0.2, 0.25, 0.3].map((t) => springPopAt(t, 0)))).toBeGreaterThan(1);
    expect(springPopAt(3, 0)).toBeCloseTo(1, 3);
  });
});

describe('common.popcard drawn', () => {
  const theme = resolveTheme(undefined, { width: 1080, height: 1920 });
  const run = (params: Record<string, unknown>, local = 1) => {
    const root = document.createElement('div'), ctx: any = { t: local, local, dur: 3, W: 1080, H: 1920, root, params: withDefaults(popcard.params, params, theme),
      media: { stillUrl: () => 'x.jpg', place() {}, video: () => document.createElement('video') }, project: { sources: {} } };
    popcard.draw(ctx, popcard.build(ctx));
    return root;
  };
  test('a long item label shrinks to stay on the card; a short one keeps 44', () => {
    const label = 'OVERSIZED VINTAGE DENIM JACKET', root = run({ w: 0.4, shots: `0|a|0|0.5,0.5,1|${label}|still` });
    const pill = [...root.querySelectorAll('div')].find((d) => !d.children.length && d.textContent === label)!, fs = parseFloat(pill.style.fontSize);
    expect(fs * (textEm(label) + 1.2)).toBeLessThanOrEqual(0.92 * 0.4 * 1080 + 1e-6);
    const short = run({ shots: '0|a|0|0.5,0.5,1|WHITE TEE|still' });
    expect(parseFloat([...short.querySelectorAll('div')].find((d) => !d.children.length && d.textContent === 'WHITE TEE')!.style.fontSize)).toBe(44);
  });
  test('with no shots the card shows the painted stand-in, not a dark box', () => {
    const root = run({ shots: '' });
    const ph = [...root.querySelectorAll('div')].find((d) => d.style.inset === '0' && d.parentElement?.querySelector('img'))!;
    expect(ph.parentElement!.style.display).not.toBe('none');
    expect([...root.querySelectorAll('div')].some((d) => d.style.background === 'rgb(34, 34, 34)')).toBe(false);
  });
});

describe('common.sticker', () => {
  test('the wobble after the pop starts from still, with no jump at 0.4 s', () => {
    expect(stickerWobble(0.3 + 0.4, 0.3)).toBe(0);
    expect(Math.abs(stickerWobble(0.3 + 0.401, 0.3) - stickerWobble(0.3 + 0.399, 0.3))).toBeLessThan(0.05);
    expect(Math.max(...[1, 1.2, 1.4, 1.6].map((t) => Math.abs(stickerWobble(t, 0.3))))).toBeGreaterThan(2);
  });
  test('every shape draws a closed path; the heart and the smile use curves', () => {
    for (const shape of ['heart', 'bolt', 'star', 'smile'] as const) {
      const calls: string[] = [];
      const g = { beginPath: () => calls.push('begin'), moveTo: () => calls.push('move'), lineTo: () => calls.push('line'), bezierCurveTo: () => calls.push('curve'), arc: () => calls.push('arc'), closePath: () => calls.push('close') };
      stickerPath(g, shape, 50);
      expect([calls[0], calls.at(-1)]).toEqual(['begin', 'close']);
      if (shape === 'heart') expect(calls.filter((c) => c === 'curve')).toHaveLength(2);
      if (shape === 'star') expect(calls.filter((c) => c === 'line')).toHaveLength(10);
    }
  });
});

describe('backdrop words and bits', () => {
  test('a bit is the same for one seed, near one side, of one of four kinds', () => {
    expect(bitAt(3, 4)).toEqual(bitAt(3, 4));
    for (let i = 0; i < 20; i++) {
      const b = bitAt(7, i);
      expect(b.x < 0.12 || b.x > 0.88).toBe(true);
      expect([0, 1, 2, 3]).toContain(b.kind);
    }
  });
});

describe('wipe stripes', () => {
  test('nothing at the ends; the last stripe covers it all at the middle, then the stripes leave last-first', () => {
    const n = 4, span = (u: number, i: number) => stripeSpan(u, i, n);
    for (let i = 0; i < n; i++) { const [l, r] = span(0, i); expect(r).toBeLessThanOrEqual(l <= -2 ? -1 : l); }
    expect(span(0.5, n - 1)).toEqual([-1, 1]);
    const [l3] = span(0.75, n - 1), [l0] = span(0.75, 0);
    expect(l3).toBeGreaterThan(l0);
    for (let i = 0; i < n; i++) { const [l, r] = span(1, i); expect(l).toBeGreaterThanOrEqual(r); }
  });
});

describe('badge box', () => {
  test('a tilted block of the colour with the number in italic, its plate the same colour, placed by its left edge', () => {
    const root = document.createElement('div'), ctx: any = { root, W: 1080, H: 1920, local: 1, dur: 3, theme: { stroke: 6, safe: { top: 0.06, bottom: 0.2, side: 0.05 } },
      params: { label: 'No.1', plate: '米白休閒', shape: 'box', x: 0.08, y: 0.125, size: 26, color: '#111111', textColor: '#ffffff', ink: '#111111', plateColor: '#ffe14d', font: 'Playfair Display' } };
    const s = badge.build(ctx);
    badge.draw(ctx, s);
    expect([s.badge.style.background, s.badge.style.transform, s.num.style.fontStyle, s.num.style.color]).toEqual(['rgb(17, 17, 17)', 'rotate(-3deg)', 'italic', 'rgb(255, 255, 255)']);
    expect([s.plate.style.background, s.plate.style.display, s.box.style.left]).toEqual(['rgb(17, 17, 17)', 'block', '86.4px']);
    expect(s.svg.style.display).toBe('none');
    // back to a star: the svg shows and the block's look is gone
    ctx.params.shape = 'star';
    badge.draw(ctx, s);
    expect([s.svg.style.display, s.badge.style.background, s.num.style.fontStyle]).toEqual(['block', 'none', 'normal']);
  });
});

describe('title look pop', () => {
  test('lines side by side; the last on the accent colour in the words\' colour, those before on the ink in the highlight; Latin in italic', () => {
    const lines = ['平價', '穿搭清單'].map((t) => Object.assign(document.createElement('div'), { textContent: t }));
    const e: any = { p: { accent: '#3b4cf0', outline: '#111111', color: '#ffffff', hl: '#c6f03a' }, theme: { palette: { accent: '#ff0000' } } };
    pop.lines!(lines, e);
    expect(lines.map((l) => [l.style.display, l.style.background, l.style.color])).toEqual([
      ['inline-block', 'rgb(17, 17, 17)', 'rgb(198, 240, 58)'], ['inline-block', 'rgb(59, 76, 240)', 'rgb(255, 255, 255)']]);
    const no = [Object.assign(document.createElement('div'), { textContent: 'No.1' })];
    pop.lines!(no, { ...e, p: { ...e.p, accent: '' } });
    expect([no[0].style.fontStyle, no[0].style.background]).toEqual(['italic', 'rgb(255, 0, 0)']);
    expect(pop.kicker!({ color: '#fff', hl: '#c6f03a', outline: '#111111', accent: '#3b4cf0', kickerColor: '' }, 40)).toMatchObject({ background: '#111111', color: '#ffffff' });
  });
});
