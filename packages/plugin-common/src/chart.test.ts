// common.chart (promoted 2026-10-21 from chili-history, parenting-brain, fd-quotes, fd-hakka, fd-caibao): the data parsing, the edge
// values (0, all, negative), the same picture for the same time, every word inside the card on both frame shapes, and every kind
// finished inside the gallery's 3 s preview with its defaults.
import { resolveTheme } from '@tellcut/engine';
import {
  blockCounts, boxAround, boxLoopPts, chart, chartFrame, chartPlan, chartRows, chartSeries, countText, CHART_KINDS, cutAtX, dashes, drawMark, fmtNum, hlIndex, parseNum, peopleGrid,
  ranks, ratioText, tableHl, textW, tipAngle, type ChartKind, type ChartP, type Plan,
} from './chart/index.ts';

const defaults = Object.fromEntries(chart.params.map((d) => [d.key, d.default])) as unknown as ChartP;
const PORTRAIT = { W: 1080, H: 1920 }, WIDE = { W: 1920, H: 1080 };
const themeOf = (W: number, H: number) => resolveTheme(undefined, { width: W, height: H });
const plan = (over: Partial<ChartP>, local: number, { W, H } = PORTRAIT) => chartPlan({ ...defaults, ...over }, W, H, themeOf(W, H), local);

/** sample params for each kind (the golden cases' data, from the source films) */
const SAMPLE: Record<ChartKind, Partial<ChartP>> = {
  bars: {},
  pie: { kind: 'pie', data: '工作|40\n睡覺|35\n吃飯|22\n其他|3', note: '純屬估算' },
  people: { kind: 'people', mark: 'circle' },
  rank: { kind: 'rank', data: '親密關係|5.10\n社交|4.59\n放鬆|4.42\n⋯\n小睡|3.87|11\n照顧孩子|3.86\n上網|3.81\n家事|3.73\n上班|3.62\n通勤|3.45', hl: '6', unit: '', mark: 'circle' },
  balance: { kind: 'balance', data: '開心|3\n壓力|5', note: '人生評分 ≈' },
  table: { kind: 'table', data: '|A 店|B 店|C 店\n價格|35 元|45 元|40 元\n內餡|高麗菜|蘿蔔絲|韭菜', hl: '2,3', mark: 'circle' },
  line: { kind: 'line', data: '當下帳|0.5,0.75,0.3,0.62\n長期帳|0.2,0.4,0.6,0.8', axis: '出生|很多年後', marks: '0.3|1|★\n0.7|2|♥', base: '0.5|基準', note: '還在漲' },
};

test('numbers: grouped and decimal numbers parse, junk is NaN; formatting keeps the decimals and never says -0', () => {
  expect(parseNum('1,200.5')).toEqual({ v: 1200.5, dec: 1, group: true });
  expect(parseNum(' 69 ')).toEqual({ v: 69, dec: 0, group: false });
  expect(parseNum('−3.25').v).toBe(-3.25);
  expect(parseNum('12萬').v).toBeNaN();
  expect(parseNum('').v).toBeNaN();
  expect(fmtNum(1234567.891, 2, true)).toBe('1,234,567.89');
  expect(fmtNum(-0.001, 1)).toBe('0.0');
  expect(fmtNum(-3.5, 0)).toBe('-4');
});

test('data: one item a line, a third field to show, ⋯ is a gap; series and table cells; ranks count on and reset', () => {
  const rows = chartRows('黑胡椒|69\n乾辣椒|463|463 萬噸\n⋯\n壞的|abc');
  expect(rows.map((r) => [r.label, r.value, r.show, r.gap])).toEqual([['黑胡椒', 69, '', false], ['乾辣椒', 463, '463 萬噸', false], ['⋯', NaN, '', true], ['壞的', NaN, '', false]]);
  expect(chartSeries('a|1, 2,3\nb|x\nc|4 5')).toEqual([{ label: 'a', values: [1, 2, 3] }, { label: 'c', values: [4, 5] }]);
  expect(ranks(chartRows('a|5\nb|4\n⋯\nc|3|11\nd|2'))).toEqual([1, 2, 0, 11, 12]);
  expect(tableHl('2,3', 4, 4)).toEqual([2, 2]);
  expect(tableHl('1', 4, 4)).toEqual([1, -1]);
  expect(tableHl('9,1', 4, 4)).toEqual([-1, -1]);
});

test('lit item: max / min / a number from 1 / nothing', () => {
  expect(hlIndex('max', [3, 9, 1])).toBe(1);
  expect(hlIndex('min', [3, 9, 1])).toBe(2);
  expect(hlIndex('3', [3, 9, 1])).toBe(2);
  expect(hlIndex('4', [3, 9, 1])).toBe(-1);
  expect(hlIndex('', [3, 9, 1])).toBe(-1);
});

test('counting up: the 【marked】 number (else the first) at a share of its value, kept grouped and with its decimals', () => {
  expect(countText('約 90.5 萬人', 0.5)).toBe('約 【45.3】 萬人');
  expect(countText('約 90.5 萬人', 1)).toBe('約 【90.5】 萬人');
  expect(countText('2024 年有【1,200】人', 0.5)).toBe('2024 年有【600】人');
  expect(countText('沒有數字', 0.3)).toBe('沒有數字');
  expect(ratioText(463, 69)).toBe('× 6.7');
  expect(ratioText(30, 2)).toBe('× 15');
  expect(ratioText(5, 0)).toBe('');
});

test('people: the grid keeps whole rows when it can (10 as 5 × 2), and k is held to 0…n', () => {
  expect(peopleGrid(10, 700, 500)).toMatchObject({ cols: 5, rows: 2 });
  expect(peopleGrid(1, 700, 500)).toMatchObject({ cols: 1, rows: 1 });
  for (const k of [0, 10, 25, -3]) {
    const pl = plan({ kind: 'people', k }, 2.6), lit = pl.marks.filter((m) => m.t === 'person' && m.fill === defaults.accent).length;
    expect(lit).toBe(Math.max(0, Math.min(10, k)));
    expect(pl.marks.some((m) => m.t === 'loop')).toBe(false);   // nothing to circle when none or all are lit (mark is off by default anyway)
  }
  // circled only when some, not all, are lit
  expect(plan({ kind: 'people', k: 4, mark: 'circle' }, 2.6).marks.some((m) => m.t === 'loop')).toBe(true);
  expect(plan({ kind: 'people', k: 10, mark: 'circle' }, 2.6).marks.some((m) => m.t === 'loop')).toBe(false);
});

test('balance: small whole numbers are the blocks, others share 5; it tips to the heavier side and settles; negatives weigh nothing', () => {
  expect(blockCounts(3, 3)).toEqual([3, 3]);
  expect(blockCounts(69, 463)).toEqual([1, 5]);
  expect(blockCounts(0, 0)).toEqual([0, 0]);
  expect(blockCounts(-2, 4)).toEqual([0, 4]);
  expect(tipAngle(3, 3, 2)).toBe(0);
  expect(tipAngle(2, 5, 0)).toBe(0);
  expect(tipAngle(2, 5, 3)).toBeGreaterThan(0.2);                      // the right side down
  expect(tipAngle(5, 2, 3)).toBeLessThan(-0.2);
  expect(tipAngle(0, 0, 3)).toBe(0);
  expect(Math.abs(tipAngle(1, 100, 99))).toBeLessThanOrEqual(0.26);    // never past its stop
});

test('edge values: all zero, a negative bar, a pie of nothing and a line of one value draw without NaN', () => {
  const finite = (pl: Plan) => JSON.stringify(pl).match(/null|NaN/) === null;
  const zero = plan({ data: 'a|0\nb|0' }, 2.6);
  expect(finite(zero)).toBe(true);
  expect(zero.marks.filter((m) => m.t === 'rect').every((m) => m.t === 'rect' && m.w === 0)).toBe(true);
  // negative values: bars grow from a zero line, the number on the bar's outer end, all inside the card
  const neg = plan({ data: '出口|120\n進口|-80', compare: 'none' }, 2.6);
  const [up, down] = neg.marks.filter((m) => m.t === 'rect') as Array<Extract<Plan['marks'][number], { t: 'rect' }>>;
  expect(up.x).toBeCloseTo(down.x + down.w, 6);
  expect(down.from).toBe('r');
  expect(neg.texts.find((t) => t.id === 'v1')!.text).toBe('-80 萬噸');
  for (const vk of [plan({ data: '出口|120\n進口|-80', dir: 'v' }, 2.6), neg]) inCard(vk, PORTRAIT);
  const nothing = plan({ kind: 'pie', data: 'a|0\nb|-5' }, 2.6);
  expect(finite(nothing)).toBe(true);
  expect(nothing.marks.some((m) => m.t === 'wedge')).toBe(false);
  expect(finite(plan({ kind: 'line', data: 'a|5' }, 2.6))).toBe(true);
  expect(finite(plan({ kind: 'balance', data: 'a|0\nb|0' }, 2.6))).toBe(true);
  expect(finite(plan({ kind: 'rank', data: '只有名字\n第二個' }, 2.6))).toBe(true);
  expect(plan({ data: '' }, 2.6).marks).toEqual([]);
});

/** every word's estimated box inside the card and the frame */
function inCard(pl: Plan, { W, H }: { W: number; H: number }, label = '') {
  const c = pl.card ?? pl.inner;
  for (const t of pl.texts) {
    if (!t.text || (t.a ?? 1) <= 0) continue;
    const w = textW(t.text, t.size, t.em?.scale ?? 1) + (t.bg ? t.size * 0.9 : 0), hh = t.size * 1.2 * (t.em?.scale ?? 1) + (t.bg ? t.size * 0.2 : 0);
    const x0 = t.align === 'l' ? t.x : t.align === 'r' ? t.x - w : t.x - w / 2, y0 = t.y - hh / 2;
    const where = `${label} ${t.id} 「${t.text}」 [${x0.toFixed(0)}, ${y0.toFixed(0)}, ${w.toFixed(0)}, ${hh.toFixed(0)}] card [${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.w.toFixed(0)}, ${c.h.toFixed(0)}]`;
    expect(x0, where).toBeGreaterThanOrEqual(Math.max(0, c.x) - 1);
    expect(x0 + w, where).toBeLessThanOrEqual(Math.min(W, c.x + c.w) + 1);
    expect(y0, where).toBeGreaterThanOrEqual(Math.max(0, c.y) - 1);
    expect(y0 + hh, where).toBeLessThanOrEqual(Math.min(H, c.y + c.h) + 1);
  }
}

test.each(CHART_KINDS.flatMap((k) => [[k, 'portrait'], [k, 'wide']]))('%s (%s): every word inside the card, which sits in the safe area', (kind, shape) => {
  const size = shape === 'wide' ? WIDE : PORTRAIT, theme = themeOf(size.W, size.H);
  for (const look of ['clean', 'hand', 'woodcut'] as const) for (const t of [1.0, 2.6]) inCard(plan({ ...SAMPLE[kind as ChartKind], look }, t, size), size, `${kind} ${look} t=${t}`);
  const c = plan(SAMPLE[kind as ChartKind], 2.6, size).card!;
  expect(c.y).toBeGreaterThanOrEqual(theme.safe.top * size.H - 1);
  expect(c.y + c.h).toBeLessThanOrEqual((1 - theme.safe.bottom) * size.H + 1);
  expect(c.x).toBeGreaterThanOrEqual(theme.safe.side * size.W - 1);
});

test('long labels and many rows shrink to fit instead of spilling out', () => {
  const long = '一個非常非常非常非常非常非常長的名字';
  for (const size of [PORTRAIT, WIDE]) {
    inCard(plan({ data: `${long}|12345678\n短|3`, title: long + long, source: long + long }, 2.6, size), size, 'bars h');
    inCard(plan({ dir: 'v', data: `${long}|1\nb|2\nc|3\nd|4\ne|5\nf|6`, compare: 'gap', note: long }, 2.6, size), size, 'bars v');
    inCard(plan({ kind: 'table', data: `${long}|b|c|d|e\n1|2|3|4|5` }, 2.6, size), size, 'table');
    inCard(plan({ kind: 'rank', data: Array.from({ length: 20 }, (_, i) => `${long}${i}|${i}`).join('\n'), hl: '3' }, 2.6, size), size, 'rank');
    inCard(plan({ kind: 'pie', data: `${long}|90\n${long}|5\n${long}|5` }, 2.6, size), size, 'pie');
  }
});

/** has every motion of the plan come to rest (texts in, shapes drawn and full)? */
function settled(pl: Plan) {
  const t = pl.texts.filter((x) => x.text && ((x.a ?? 1) < 0.99 && (x.a ?? 1) > 0.001 || Math.abs((x.sc ?? 1) - 1) > 0.02)).map((x) => x.id);
  const m = pl.marks.filter((x) => (x.t === 'rect' && (x.reveal ?? 1) < 1) || (x.t === 'path' && (x.prog ?? 1) < 1) || (x.t === 'loop' && x.prog < 1) || (x.t === 'wedge' && x.fp < 1)
    || (x.t === 'person' && x.sx < 0.99)).map((x) => x.t);
  return [...t, ...m];
}

test.each([...CHART_KINDS])('%s: with its defaults (and the sample data) everything has played out inside the 3 s preview, before the fade', (kind) => {
  expect(settled(plan({ kind }, 2.6))).toEqual([]);
  expect(settled(plan(SAMPLE[kind], 2.6))).toEqual([]);
  expect(settled(plan({ ...SAMPLE[kind], look: 'hand' }, 2.6))).toEqual([]);
  // and something is still moving early on (the preview shows it happen)
  expect(settled(plan(SAMPLE[kind], 0.5)).length).toBeGreaterThan(0);
});

/** a canvas context that records every call and property set */
function recorder() {
  const log: string[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, strokeStyle: '#000', fillStyle: '#000' };
  const g = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...a: unknown[]) => { log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(4) : String(x))).join(',')})`); return undefined; };
    },
    set(t, k: string, v) { t[k] = v; log.push(`${k}=${typeof v === 'number' ? v.toFixed(4) : String(v)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, log };
}
const paint = (pl: Plan, look: 'clean' | 'hand' | 'woodcut', t: number, boil = 8) => {
  const r = recorder();
  for (const m of pl.marks) drawMark(r.g, m, { look, pen: 'crayon', u: pl.u, boil: look === 'hand' ? boil : 0, t, ink: '#222222' });
  return r.log.join('\n');
};

test.each([...CHART_KINDS])('%s: the same time gives the same plan and the same strokes; the hand look boils only on its beat', (kind) => {
  for (const t of [0.4, 1.1, 2.6]) {
    expect(plan(SAMPLE[kind], t)).toEqual(plan(SAMPLE[kind], t));
    for (const look of ['clean', 'hand', 'woodcut'] as const) expect(paint(plan(SAMPLE[kind], t), look, t)).toBe(paint(plan(SAMPLE[kind], t), look, t));
  }
  const end = plan(SAMPLE[kind], 2.6);
  expect(paint(end, 'hand', 2.6)).toBe(paint(end, 'hand', 2.61));         // the same eighth of a second
  expect(paint(end, 'hand', 2.6)).not.toBe(paint(end, 'hand', 2.76));     // the next one
  expect(paint(end, 'hand', 2.6, 0)).toBe(paint(end, 'hand', 2.9, 0));    // boil off: fixed
  expect(paint(end, 'clean', 2.6)).toBe(paint(end, 'clean', 2.9));
});

test('helpers: a line cut at the playhead, dashes along a path, the frame on both shapes', () => {
  expect(cutAtX([[0, 0], [10, 10], [20, 0]], 15)).toEqual([[0, 0], [10, 10], [15, 5]]);
  expect(cutAtX([[0, 0], [10, 10]], -1)).toEqual([]);
  const d = dashes([[0, 0], [100, 0]], 16, 12);
  expect(d.length).toBe(4);
  expect(d[0]).toEqual([[0, 0], [16, 0]]);
  expect(d[1][0]).toEqual([28, 0]);
  for (const { W, H } of [PORTRAIT, WIDE]) {
    const f = chartFrame({ ...defaults }, W, H, themeOf(W, H).safe);
    expect(f.body.w).toBeGreaterThan(0.6 * f.card.w);
    expect(f.body.h).toBeGreaterThan(0.5 * f.card.h);
  }
});

const HAKKA = ['桃園市|90.5', '新北市|67.2', '臺中市|49.3'].join('\n'), HAKKA5 = [HAKKA, '新竹縣|39.8', '苗栗縣|35.6'].join('\n');
test('a circled bar: the loop goes round the whole bar and never over a word (h and v, every look, both frame shapes)', () => {
  const cases: Array<Partial<ChartP>> = [
    { title: '桃園市客家人口', stat: '約 90.5 萬人', data: HAKKA, unit: '', hl: '1', note: '全台最多', source: '單位：萬人' },
    { data: HAKKA5, unit: '', hl: '3' },
    { data: ['甲|3', '乙|120', '丙|60'].join('\n'), hl: 'max', compare: 'ratio' },
    { data: ['甲|3', '乙|120', '丙|60'].join('\n'), hl: 'min' },
    { data: ['出口|120', '進口|-80'].join('\n'), hl: '2' },
    { data: ['沒孩子|7.4', '有孩子|6.2'].join('\n'), unit: '', hl: '2', compare: 'gap', note: '快樂落差' },
  ];
  for (const size of [PORTRAIT, WIDE]) for (const dir of ['h', 'v'] as const) for (const look of ['clean', 'hand', 'woodcut'] as const) for (const c of cases) {
    const pl = plan({ ...c, dir, look, mark: 'circle' }, 2.6, size), what = `${dir} ${look} ${size.W}×${size.H} hl ${c.hl}`;
    const lp = pl.marks.find((m) => m.t === 'loop');
    expect(lp, what).toBeTruthy();
    if (lp?.t !== 'loop') continue;
    expect(lp.box, what).toBeDefined();
    const pts = boxLoopPts(lp.cx, lp.cy, lp.rx, lp.ry, lp.seed, lp.box!), reach = lp.lw / 2;
    // round the lit bar: its corners inside the loop
    const bar = pl.marks.find((m) => m.t === 'rect' && m.fill === defaults.accent);
    if (bar?.t === 'rect') for (const [x, y] of [[bar.x, bar.y], [bar.x + bar.w, bar.y], [bar.x, bar.y + bar.h], [bar.x + bar.w, bar.y + bar.h]]) {
      expect(Math.abs((x - lp.cx) / lp.rx) ** 8 + Math.abs((y - lp.cy) / lp.ry) ** 8, `${what} corner`).toBeLessThan(1);
    }
    // and off every word (its estimated box, as tall as 1.2 × its size)
    for (const t of pl.texts) {
      if (!t.text || (t.a ?? 1) <= 0) continue;
      const w = textW(t.text, t.size, t.em?.scale ?? 1) * (t.sc ?? 1), hh = t.size * 1.2 * (t.em?.scale ?? 1);
      const x0 = t.align === 'l' ? t.x : t.align === 'r' ? t.x - w : t.x - w / 2, y0 = t.y - hh / 2;
      const hit = pts.find(([x, y]) => x > x0 - reach && x < x0 + w + reach && y > y0 - reach && y < y0 + hh + reach);
      expect(hit, `${what}: the loop over ${t.id} 「${t.text}」`).toBeUndefined();
      // nor a line (the gap bracket) over the lit bar's number, moved out past the loop
      if (t.id !== `v${pl.marks.filter((m) => m.t === 'rect').findIndex((m) => m === bar)}`) continue;
      for (const m of pl.marks) if (m.t === 'path') for (let i = 1; i < m.pts.length; i++) for (let q = 0; q <= 1; q += 0.02) {
        const x = m.pts[i - 1][0] + (m.pts[i][0] - m.pts[i - 1][0]) * q, y = m.pts[i - 1][1] + (m.pts[i][1] - m.pts[i - 1][1]) * q;
        expect(x > x0 && x < x0 + w && y > y0 && y < y0 + hh, `${what}: a line over ${t.id} 「${t.text}」`).toBe(false);
      }
    }
  }
  // the radii clear the box by the margin and its corners too
  const r = boxAround(400, 50, 14);
  expect(r.rx).toBeGreaterThanOrEqual(414);
  expect(r.ry).toBeGreaterThanOrEqual(64);
  expect((407 / r.rx) ** 8 + (57 / r.ry) ** 8).toBeLessThanOrEqual(1 + 1e-9);
});
