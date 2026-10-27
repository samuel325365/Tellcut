// The blocks and modes promoted from the baking-steps and baking-sin shorts (2026-10-19): the handwritten recipe card kit
// (paper, notecard, handwrite, progress pencil) and the sin meter kit (gauge, hangtag, strike, timelapse, slam / caption / backdrop options).
import { DEFAULT_THEME, defaultSafe } from '@tellcut/engine';
import { charAt, cardBox, wrapEm, writeTime } from './hand.ts';
import { currentSentence, parseSentences, sentenceCps } from './handwrite.ts';
import { listSlot, parseFields, parseItems, stepTimes } from './notecard.ts';
import { gauge, gaugeBox, gaugeValue, needleAt, parseHits, parseZones } from './gauge.ts';
import { tagScale } from './hangtag.ts';
import { strokesAt } from './strike.ts';
import { hoursAt } from './timelapse.ts';
import { counterText, pencilState } from './progress.ts';
import { glowAt } from './backdrop.ts';
import { lineLand } from './slam.ts';
import { commonItems, commonPlugin } from './index.ts';
import { mixHex, shade } from './color.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default as any;

test('handwriting: characters are written one after another at the pen speed, each wiping in over 0.18 s', () => {
  expect(charAt(0, 0, 0, 10)).toBe(0);
  expect(charAt(0, 0.09, 0, 10)).toBeCloseTo(0.5, 5);
  expect(charAt(2, 0.2, 0, 10)).toBe(0);
  expect(charAt(2, 0.5, 0, 10)).toBe(1);
  expect(writeTime('一二三四', 10)).toBeCloseTo(0.58, 5);
});

test('handwriting: lines wrap by width, balanced, and a closing mark never starts a line', () => {
  expect(wrapEm('鮮奶油加糖，打到濃稠綿密、拉起來有小尖角', 17.3)).toEqual(['鮮奶油加糖，打到濃稠', '綿密、拉起來有小尖角']);
  expect(wrapEm('短句', 10)).toEqual(['短句']);
  for (const l of wrapEm('一二三四五六七八九，十一二三四五六七八九十', 10)) expect('，。、'.includes(l[0])).toBe(false);
  expect(wrapEm('', 10)).toEqual([]);
});

test('handwrite: sentences with a start, or a start and the end of the speech; the pen spreads a sentence over 90 % of its time', () => {
  const s = parseSentences('0.5-2.5|今天的風很溫柔\n3|我們出門\n沒有時間的一句');
  expect(s.map((x) => [x.start, x.end, x.text])).toEqual([[0.5, 2.5, '今天的風很溫柔'], [3, null, '我們出門'], [expect.closeTo(3.81, 2), null, '沒有時間的一句']]);
  expect(sentenceCps(s[0], 12)).toBeCloseTo(7 / 1.8, 5);
  expect(sentenceCps(s[1], 12)).toBe(12);
  // replace: one sentence at a time, fading as the next starts
  expect(currentSentence(s, 0.2, 10).i).toBe(-1);
  expect(currentSentence(s, 1, 10)).toEqual({ i: 0, alpha: 1 });
  expect(currentSentence(s, 2.9, 10).alpha).toBeCloseTo(0.4, 5);
  expect(currentSentence(s, 3.1, 10).i).toBe(1);
});

test('notecard: by default the card sits inside the safe area, its foot on the bottom safe line, on 9:16 and 16:9', () => {
  const p = { x: def(gauge, 'x'), y: -1, w: 0.87, h: 0.5, tilt: 0 };
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const safe = defaultSafe(W, H), b = cardBox(p, W, H, safe);
    expect(b.x0).toBeGreaterThanOrEqual(safe.side * W - 1e-6);
    expect(b.x0 + b.w).toBeLessThanOrEqual((1 - safe.side) * W + 1e-6);
    expect(b.y0 + b.h).toBeCloseTo((1 - safe.bottom) * H, 6);
    expect(b.y0).toBeGreaterThan(safe.top * H);
  }
});

test('notecard: fields and items parsed; a list of more than four goes in two columns; the step parts are written in turn', () => {
  expect(parseFields('用料|濃咖啡\n\n時間|約 3 分鐘\n多的|不要')).toEqual([['用料', '濃咖啡'], ['時間', '約 3 分鐘']]);
  expect(parseItems('a|b\nc')).toEqual(['a', 'b', 'c']);
  expect([listSlot(2, 3), listSlot(5, 8), listSlot(3, 8)]).toEqual([{ col: 0, row: 2 }, { col: 1, row: 1 }, { col: 0, row: 3 }]);
  const t = stepTimes('打發鮮奶油', ['第一行字', '第二行']);
  expect(t.lineAt[0]).toBeGreaterThan(0.2);
  expect(t.lineAt[1]).toBeGreaterThan(t.lineAt[0]);
  expect(t.fieldsAt).toBeGreaterThan(t.lineAt[1]);
  expect(t.fieldsAt).toBeLessThan(2);   // the gallery's 3 s preview shows the fields
});

test('progress pencil: steps start at the given times, an extra time means all done; the counter fills {n} and {N}', () => {
  const st = pencilState('1, 2, 3, 4', 3, 2.5, 10);
  expect([st.cur, st.done]).toEqual([1, false]);
  expect(pencilState('1, 2, 3, 4', 3, 4.1, 10).done).toBe(true);
  expect(pencilState('', 4, 2.6, 4).cur).toBe(2);   // shared evenly
  expect(counterText('準備中|步驟 {n}／{N}|全部完成', 1, 8, false)).toBe('步驟 2／8');
  expect(counterText('準備中|步驟 {n}／{N}|全部完成', -1, 8, false)).toBe('準備中');
  expect(counterText('準備中|步驟 {n}／{N}|全部完成', 7, 8, true)).toBe('全部完成');
});

test('gauge: hits spring the needle and count up the readout; zones get a colour ramp unless they name one', () => {
  const hits = parseHits('2:15, 1:10, x:3, 3：4');
  expect(hits).toEqual([[1, 10], [2, 15], [3, 4]]);
  expect(gaugeValue(hits, 0.5)).toEqual({ v: 0, shown: 0, count: 0 });
  expect(gaugeValue(hits, 9)).toMatchObject({ shown: 29, count: 3 });
  expect(gaugeValue(hits, 9).v).toBeCloseTo(29, 3);
  const z = parseZones('40:有點罪, 0:清白, 85:地獄級:#8e0f1e', 100, ['#ffffff', '#000000']);
  expect(z.map((x) => [x.from, x.to, x.name])).toEqual([[0, 40, '清白'], [40, 85, '有點罪'], [85, 100, '地獄級']]);
  expect(z[0].color).toBe('#ffffff');
  expect(z[2].color).toBe('#8e0f1e');
  expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
});

test('gauge: the needle wanders while scrambling, rests before the boot sweep, and slams past the end when it blows', () => {
  const p = { scramble: 1, boot: 2, danger: -1, boom: 5, max: 100 };
  expect(needleAt(p, 0, 0.5)).not.toBe(0);
  expect(needleAt(p, 30, 1.5)).toBe(0);
  expect(needleAt(p, 30, 2.4)).toBeCloseTo(100, 0);
  expect(needleAt(p, 30, 4)).toBe(30);
  expect(needleAt(p, 30, 7)).toBeGreaterThan(100);
  // the default hits blow it inside the 3 s gallery preview, and the box stays in the safe area
  const hp = parseHits(def(gauge, 'hits'));
  expect(gaugeValue(hp, def(gauge, 'boom')).v).toBeGreaterThan(80);
  expect(def(gauge, 'boom')).toBeLessThan(3);
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const safe = defaultSafe(W, H), b = gaugeBox({ x: 0.5, y: -1, size: def(gauge, 'size') }, W, H, safe);
    expect(b.x0).toBeGreaterThanOrEqual(safe.side * W - 1e-6);
    expect(b.y0).toBeGreaterThanOrEqual(safe.top * H - 1e-6);
  }
});

test('hangtag, strike, timelapse: the slam lands, the marker strikes in two strokes, the hours count from → to', () => {
  expect(tagScale(0, 2)).toBeCloseTo(2.3, 5);
  expect(tagScale(0.5, 2)).toBe(1);
  expect(strokesAt(1, 1)).toEqual([0, 0]);
  expect(strokesAt(1.2, 1)[0]).toBe(1);
  expect(strokesAt(1.14, 1)[1]).toBeCloseTo(0.5, 5);
  expect(hoursAt(0, 4, 0.1, 3)).toBe(0);
  expect(hoursAt(0, 4, 2.8, 3)).toBe(4);
  expect(hoursAt(2, 10, 1.425, 3)).toBeCloseTo(6, 5);
});

test('slam stagger, backdrop glow, paper shade', () => {
  expect(lineLand(0, 0.1, 0.2, 0.4)).toBeCloseTo(0.5, 5);
  expect(lineLand(1, 0.3, 0.2, 0.4)).toBe(0);
  expect(lineLand(1, 0.7, 0.2, 0.4)).toBe(1);
  expect(glowAt('', 0, 1)).toBe(0);
  expect(glowAt('0:0, 1:0.8', 0, 3)).toBeCloseTo(0.8, 5);
  expect(glowAt('0:2', 0, 0)).toBe(1);
  expect(shade('#808080', 0.5)).toBe('rgb(64, 64, 64)');
  expect(shade('#000000', 2)).toBe('rgb(255, 255, 255)');
});

test('the handwriting blocks are registered with a doc, and the plugin declares the handwriting font for npm run fonts', () => {
  const ids = commonItems.map((t) => t.type);
  for (const id of ['paper', 'notecard', 'handwrite', 'gauge', 'hangtag', 'strike', 'timelapse']) expect(ids).toContain(`common.${id}`);
  for (const t of commonItems) expect(t.doc, t.type).toBeTruthy();
  expect(commonPlugin.fonts!.some((f) => typeof f === 'string' && f.startsWith('LXGW WenKai TC'))).toBe(true);
  expect(DEFAULT_THEME.safe.bottom).toBeGreaterThan(0);
});
