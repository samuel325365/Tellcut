// Admission rule 2 of the block templates (spec 2026-11-16-block-templates): a template's picture must differ enough from the
// block's default picture (its first sample) and from every other template of the block. The pictures are the golden ones,
// compared as media-node's likeness.ts prints them: shrunk to 64 × 64 grey, then their edge maps (unit spread), mean absolute
// difference. A template's sample is <block>-tpl-<id> (samples/fixtures.ts templateSample); each of its times is compared with the
// other sample's nearest time, and either time passing is enough. A template made for horizontal films has a 16:9 sample: it is
// compared with the block's first sample drawn 16:9 (wide-<name>) and with the block's other 16:9 templates only.
//
// The threshold was calibrated on the 23 looks of 2026-11-15 (glitch scan/rgb/block, leak prism/bokeh/flare, film super8/print,
// speedlines focus/streak, sparkle confetti/glint, countdown flip/leader, backdrop halftone/sunburst/waves, shader neuro/cells/dither,
// wipe iris/blinds/ink), measured 2026-11-16 (the test below keeps both sides true):
//   - each look against its new siblings and its block's earlier looks (tall samples): 136 pairs, the nearest 0.244 (countdown flip
//     against the default countdown), median about 0.98;
//   - each look against itself turned colour-only in memory (its chroma rotated 60°, 120°, 180°; tinted blue, tinted warm): 115
//     variants, the farthest 0.172 (film print tinted blue), median about 0.005.
// 0.21 sits between the two. Plain grey values, as first planned, could not: the looks came as near as 4.2 of 255 (sparkle glint
// against the default burst) while a colour-only variant went as far as 79 (backdrop sunburst), so grey values are not compared.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { chromaRotate, meanAbsDiff, printOf, readPng, sampleDistance, TELLCUT_ROOT, TEMPLATE_LIKENESS, tintBy, type Rgba, type TimedPrint } from '@tellcut/media-node';
import type { ItemType } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { samples, templateSample, type Sample } from '../src/samples.ts';


const GOLDEN = join(TELLCUT_ROOT, 'packages/plugin-common/golden');
const fileOf = (s: Sample, t: number) => join(GOLDEN, `${s.name}-t${t.toFixed(2)}.png`);
const pictures = new Map<string, Rgba>();
const picture = (f: string) => { if (!pictures.has(f)) pictures.set(f, readPng(f)); return pictures.get(f)!; };
/** a sample's golden prints (a missing picture fails: npm run golden -- --update <name>) */
function printsOf(s: Sample): TimedPrint[] {
  const missing = s.at.map((t) => fileOf(s, t)).filter((f) => !existsSync(f));
  if (missing.length) throw new Error(`沒有 golden 圖：${missing.join('、')}（npm run golden -- --update ${s.name}）`);
  return s.at.map((t) => ({ t, print: printOf(picture(fileOf(s, t))) }));
}
const sample = (name: string) => { const s = samples.find((x) => x.name === name); if (!s) throw new Error(`沒有樣本 ${name}`); return s; };
/** a sample's frame: 9:16, 16:9 or square */
const shapeOf = (s: Sample) => (s.wide ? 'wide' : s.square ? 'square' : 'tall');
/** the block's default picture in a template sample's frame: its first sample, or, for a 16:9 template (one made for horizontal
 *  films) when the first is 9:16, that first sample's 16:9 copy wide-<name>; squeezed into the square, a 16:9 picture and a 9:16 one
 *  would differ by the frame alone */
function defaultFor(first: Sample, s: Sample): Sample {
  if (shapeOf(s) === shapeOf(first)) return first;
  if (shapeOf(s) === 'wide' && shapeOf(first) === 'tall') return sample(`wide-${first.name}`);
  throw new Error(`${s.name} 的畫面比例和 ${first.name} 不同，沒有同比例的預設樣子可以比`);
}

test('admission rule 2: every template\'s picture differs from its block\'s default and from the block\'s other templates', () => {
  const near: string[] = [];
  for (const t of plugins.flatMap((p) => p.items ?? []) as ItemType[]) {
    if (!t.templates?.length) continue;
    const first = samples.find((s) => s.type === t.type)!;
    const own = t.templates.map((x) => { const s = sample(templateSample(t.type, x.id)); return { id: x.id, s, prints: printsOf(s) }; });
    for (const a of own) {
      const base = defaultFor(first, a.s), d = sampleDistance(a.prints, printsOf(base));
      if (d <= TEMPLATE_LIKENESS) near.push(`${t.type}/${a.id} 和預設的樣子（${base.name}）太像：${d.toFixed(3)}`);
      for (const b of own) {
        // two templates drawn in different frames (a 16:9 one beside 9:16 ones) are not compared: the frame alone would set them apart
        if (a === b || shapeOf(a.s) !== shapeOf(b.s)) continue;
        const e = sampleDistance(a.prints, b.prints);
        if (e <= TEMPLATE_LIKENESS) near.push(`${t.type}/${a.id} 和 ${b.id} 太像：${e.toFixed(3)}`);
      }
    }
  }
  expect(near).toEqual([]);
});

describe('the threshold, calibrated on the 2026-11-15 looks', () => {
  const LOOKS = ['glitch-scan', 'glitch-rgb', 'glitch-block', 'leak-prism', 'leak-bokeh', 'leak-flare', 'film-super8', 'film-print', 'speedlines-focus', 'speedlines-streak',
    'sparkle-confetti', 'sparkle-glint', 'countdown-flip', 'countdown-leader', 'backdrop-halftone', 'backdrop-sunburst', 'backdrop-waves', 'shader-neuro', 'shader-cells',
    'shader-dither', 'wipe-iris', 'wipe-blinds', 'wipe-ink'];
  // the earlier looks of their blocks: the tall samples that are not these looks, nor a variant of one of them (cells shaded, the
  // ring's long end word), nor a template
  const SAME_LOOK = new Set(['shader-cells-shade', 'countdown-ring-long']);
  const earlier = (type: string) => samples.filter((s) => s.type === type && !s.wide && !s.square && !LOOKS.includes(s.name) && !SAME_LOOK.has(s.name) && !s.name.includes('-tpl-'));

  test('each look is farther than the threshold from its siblings and from its block\'s earlier looks', () => {
    const near: string[] = [];
    let pairs = 0;
    for (const name of LOOKS) {
      const s = sample(name), own = printsOf(s);
      for (const o of [...LOOKS.filter((x) => x !== name && sample(x).type === s.type).map(sample), ...earlier(s.type)]) {
        const d = sampleDistance(own, printsOf(o));
        pairs++;
        if (d <= TEMPLATE_LIKENESS) near.push(`${name} ~ ${o.name}: ${d.toFixed(3)}`);
      }
    }
    expect(near).toEqual([]);
    expect(pairs).toBeGreaterThan(100);
  });

  test('a look turned colour-only (chroma rotated, tinted) stays nearer than the threshold', () => {
    const far: string[] = [];
    const variants: Array<[string, (p: Rgba) => Rgba]> = [['chroma 60°', (p) => chromaRotate(p, 60)], ['chroma 120°', (p) => chromaRotate(p, 120)], ['chroma 180°', (p) => chromaRotate(p, 180)],
      ['blue tint', (p) => tintBy(p, [0.5, 0.7, 1])], ['warm tint', (p) => tintBy(p, [1, 0.85, 0.6])]];
    for (const name of LOOKS) {
      const s = sample(name);
      for (const [v, make] of variants) {
        // either time apart would let it in: the farthest of its times
        const d = Math.max(...s.at.map((t) => { const p = picture(fileOf(s, t)); return meanAbsDiff(printOf(make(p)), printOf(p)); }));
        if (d >= TEMPLATE_LIKENESS) far.push(`${name} ${v}: ${d.toFixed(3)}`);
      }
    }
    expect(far).toEqual([]);
  });
});
