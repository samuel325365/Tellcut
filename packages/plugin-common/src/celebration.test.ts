// The looks and modes promoted from the katie-sweet16 and todo-vlog shorts (2026-10-27, group C): their defaults leave the blocks as
// they were, and their pure parts.
import { ambient, flashAt, skyMood, SKY_MOODS } from './ambient.ts';
import { headline, nameLetter, nameShimmer } from './headline.ts';
import { creditIn, creditLine, outro } from './outro.ts';
import { goldFill, slam } from './slam.ts';
import { notecard, tickSlide, tickState } from './notecard.ts';
import { caption, stripTilt } from './caption.ts';
import { dayTimes, tag } from './tag.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default;
const opts = (t: { params: Array<{ key: string }> }, key: string) => (t.params.find((p) => p.key === key) as unknown as { options: string[] }).options;

test('the new looks are opt-in: every block keeps its old default', () => {
  expect([def(ambient, 'look'), def(headline, 'look'), def(outro, 'look'), def(slam, 'look'), def(notecard, 'tick'), def(caption, 'style'), def(tag, 'look')])
    .toEqual(['ramp', 'doc', 'cta', 'plain', 0, 'outline', 'pill']);
  expect(opts(ambient, 'look')).toContain('sky');
  expect(opts(headline, 'look')).toContain('name');
  expect(opts(outro, 'look')).toContain('credits');
  expect(opts(slam, 'look')).toContain('gold');
  expect(opts(caption, 'style')).toContain('strip');
  expect(opts(tag, 'look')).toContain('day');
});

test('ambient sky: the moods are the stops, fractions blend, out-of-range values clamp; lightning pulses twice and dies within 0.7 s', () => {
  expect(skyMood(1).rain).toBe(1);
  expect(skyMood(0).top).toEqual(SKY_MOODS[0].top);
  expect(skyMood(5).stars).toBe(1);
  expect(skyMood(9)).toEqual(skyMood(5));
  expect(skyMood(-2)).toEqual(skyMood(0));
  expect(skyMood(Number.NaN)).toEqual(skyMood(0));
  expect(skyMood(1.5).rain).toBeCloseTo(0.5);
  expect(skyMood(2.5).sun).toBeCloseTo((SKY_MOODS[2].sun + SKY_MOODS[3].sun) / 2);
  expect(flashAt('', 1)).toBe(0);
  expect(flashAt('2', 1.9)).toBe(0);
  expect(flashAt('2', 2)).toBeCloseTo(0.6);
  expect(flashAt('2', 2.15)).toBe(0);              // between the two pulses
  expect(flashAt('2', 2.25)).toBeCloseTo(0.4);      // the second pulse
  expect(flashAt('2', 2.7)).toBe(0);
  expect(flashAt('1, 2', 1)).toBeCloseTo(0.6);
});

test('headline name: the letters rise one after another, one shimmer passes from 1.3 to 2.5 s', () => {
  expect(nameLetter(0, 0.15)).toBe(0);
  expect(nameLetter(0, 0.85)).toBeCloseTo(1);
  expect(nameLetter(3, 0.5)).toBeLessThan(nameLetter(0, 0.5));
  expect(nameShimmer(1)).toBeNull();
  expect(nameShimmer(1.9)).toBeCloseTo(0.5);
  expect(nameShimmer(3)).toBeNull();
});

test('outro credits: *italic*, _small_ and plain names; one line a beat', () => {
  expect(creditLine('*With love*')).toEqual({ kind: 'italic', text: 'With love' });
  expect(creditLine(' _Music: original score_ ')).toEqual({ kind: 'small', text: 'Music: original score' });
  expect(creditLine('Mom & Dad')).toEqual({ kind: 'name', text: 'Mom & Dad' });
  expect(creditLine('**')).toEqual({ kind: 'name', text: '**' });
  expect(creditIn(0, 0.3, 0.6)).toBe(0);
  expect(creditIn(0, 1.2, 0.6)).toBeCloseTo(1);
  expect(creditIn(2, 1.5, 0.6)).toBe(0);
  expect(creditIn(2, 2.4, 0.6)).toBeCloseTo(1);
});

test('slam gold: a gradient clipped to the letters with a landing flash that dies by 0.8 s; the other looks clear it', () => {
  const g = goldFill(true, 0, 1);
  expect(g.webkitBackgroundClip).toBe('text');
  expect(g.filter).toMatch(/drop-shadow.*drop-shadow/);
  expect(goldFill(true, 1, 1).filter).not.toMatch(/drop-shadow.*drop-shadow/);
  expect(goldFill(false, 0, 1)).toEqual({ backgroundImage: 'none', webkitBackgroundClip: 'border-box', backgroundClip: 'border-box', filter: 'none' });
});

test('notecard tick: earlier items done, this one ticked at 0.45 s then highlighted, later ones empty; the card slides in and out', () => {
  expect(tickState(0, 2, 0)).toEqual({ k1: 1, k2: 1, marker: 1 });
  expect(tickState(3, 2, 2)).toEqual({ k1: 0, k2: 0, marker: 0 });
  expect(tickState(2, 2, 0.4)).toEqual({ k1: 0, k2: 0, marker: 0 });
  expect(tickState(2, 2, 1.2)).toEqual({ k1: 1, k2: 1, marker: 1 });
  expect(tickSlide(0, 3, 500)).toBeCloseTo(-500);
  expect(tickSlide(1.5, 3, 500)).toBeCloseTo(0);
  expect(tickSlide(3, 3, 500)).toBeCloseTo(-500);
});

test('caption strip and tag day: strips tilt in turn; the day label pops in, underlines from 0.2 s and fades in the last 0.25 s', () => {
  expect(stripTilt(0)).toBeLessThan(0);
  expect(stripTilt(1)).toBeGreaterThan(0);
  expect(dayTimes(0, 3).pop).toBe(0);
  expect(dayTimes(0.34, 3).pop).toBeCloseTo(1);
  expect(dayTimes(0.2, 3).line).toBe(0);
  expect(dayTimes(0.5, 3).line).toBeCloseTo(1);
  expect(dayTimes(2.7, 3).out).toBe(0);
  expect(dayTimes(3, 3).out).toBe(1);
});
