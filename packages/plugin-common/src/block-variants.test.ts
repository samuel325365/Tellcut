// The variants of every shared block (engine variants.ts, spec 2026-11-23-block-variants): well formed, and the doc of a block
// that declares them short, since what only one look needs is said in that look's own doc.
import { corePlugin, OLD_BLOCKS, VARIANT_BLOCK_DOC, VARIANT_PARAMS, variantProblems, type ItemType } from '@tellcut/engine';
import { THUMB_PARAMS } from '@tellcut/plugin-common/thumbs';
import { commonPlugin } from './index.ts';
import { cardSample, samples, streetSamples, templateSample, variantCard, variantSample } from './samples.ts';

const blocks = [...(corePlugin.items ?? []), ...(commonPlugin.items ?? [])] as ItemType[];
const withVariants = blocks.filter((t) => t.variants);

test('some blocks declare variants (progress at least)', () => {
  expect(withVariants.map((t) => t.type)).toContain('common.progress');
});

test('every shared block\'s variants are well formed: an enum param, every option once and in order, each with a label and a doc', () => {
  expect(blocks.flatMap((t) => variantProblems(t))).toEqual([]);
});

// blocks kept only for older projects (OLD_BLOCKS: common.frame, behind common.flatlay) are not offered anywhere and need none
/** shared blocks that have a look-picking enum of 3+ options but declare no variants, and why */
const EXEMPT: Record<string, string> = {
  'common.caption': 'its looks are its own list of caption templates (the template param, catalog CAP), not variants',
  'common.heading': 'its looks are its own list of title templates (the template param, catalog TTL), not variants',
};

/** the enum params named like a look-picker (VARIANT_PARAMS) with 3 or more options */
const lookParams = (t: ItemType) => t.params.filter((d) => d.type === 'enum' && (VARIANT_PARAMS as readonly string[]).includes(d.key) && d.options.length >= 3).map((d) => d.key);

test('a shared block with a look-picking enum of 3+ options declares its variants, or is exempt with a reason', () => {
  const missing = blocks.filter((t) => !t.variants && !EXEMPT[t.type] && !OLD_BLOCKS[t.type] && lookParams(t).length).map((t) => `${t.type} (${lookParams(t).join(', ')})`);
  expect(missing).toEqual([]);
});

test('the exemptions name only blocks that exist, declare no variants and would otherwise need them', () => {
  const byType = new Map(blocks.map((t) => [t.type, t]));
  const stale = Object.keys(EXEMPT).filter((type) => { const t = byType.get(type); return !t || t.variants || !lookParams(t).length; });
  expect(stale).toEqual([]);
  expect(Object.values(EXEMPT).every((why) => why.trim().length > 0)).toBe(true);
});

test(`a block that declares variants keeps its own doc to ${VARIANT_BLOCK_DOC} characters`, () => {
  const long = withVariants.filter((t) => (t.doc ?? '').length > VARIANT_BLOCK_DOC).map((t) => `${t.type}: ${t.doc!.length}`);
  expect(long).toEqual([]);
});

// the gallery shows every variant by its own golden sample (spec 2026-11-23-block-variants part 3)
test('every declared variant has a golden sample of its own block that sets its param to it (its default when unset)', () => {
  const missing: string[] = [], wrong: string[] = [];
  for (const t of withVariants) {
    const { param, list } = t.variants!, def = t.params.find((d) => d.key === param)!.default;
    for (const v of list) {
      const s = variantSample(t.type, v.value);
      if (!s) { missing.push(`${t.type}@${v.value}`); continue; }
      // a template's or a street sibling's sample never stands for a variant; one a variant names itself may set the param otherwise
      if (s.type !== t.type || s.street || s.name.startsWith(templateSample(t.type, ''))) wrong.push(`${t.type}@${v.value}: ${s.name}`);
      else if (!v.sample && String(s.params?.[param] ?? def) !== v.value) wrong.push(`${t.type}@${v.value}: ${s.name} sets ${param} ${String(s.params?.[param] ?? def)}`);
    }
  }
  expect(missing).toEqual([]);
  expect(wrong).toEqual([]);
  expect(variantSample('common.progress', 'ring')?.name).toBe('progress-ring');
  expect([variantSample('common.progress', 'nope'), variantSample('common.nope', 'bar'), variantCard('common.nope', 'bar')]).toEqual([undefined, undefined, undefined]);
});

test('a block\'s default variant is shown by its first sample, the one its gallery card is drawn from', () => {
  for (const t of withVariants) {
    const def = String(t.params.find((d) => d.key === t.variants!.param)!.default);
    expect(variantSample(t.type, def), t.type).toBe(samples.find((s) => s.type === t.type && !s.street));
  }
});

test('a variant\'s card is its sample, over the street for a block marked over a picture (unless the sample is drawn over one)', () => {
  const byName = new Map(samples.map((s) => [s.name, s]));
  for (const t of withVariants) for (const v of t.variants!.list) {
    const own = variantSample(t.type, v.value)!, card = variantCard(t.type, v.value);
    if (t.over !== 'picture' || OLD_BLOCKS[t.type] || own.photo) { expect(card, `${t.type}@${v.value}`).toBe(own); continue; }
    // the sibling: the same case over the street, the block alone, after the original
    expect(card, `${t.type}@${v.value}`).toBe(byName.get(`${own.name}-street`));
    expect(card).toMatchObject({ street: own.name, type: own.type, photo: 'ref' });
    expect([card!.params, card!.bg, card!.items]).toEqual([own.params, undefined, undefined]);
    expect(samples.indexOf(card!)).toBeGreaterThan(samples.indexOf(own));
  }
  // the default variant's card is the block's own card
  for (const t of withVariants) expect(variantCard(t.type, String(t.params.find((d) => d.key === t.variants!.param)!.default)), t.type).toBe(cardSample(t.type));
  expect(variantCard('common.lens', 'fisheye')?.name).toBe('lens-fisheye-street');
  expect(variantCard('core.flash', 'glow')?.photo).toBe('ref');
  // streetSamples derives exactly these: a variant of a block marked over gets its sibling once, beside its card's and its templates'
  const fake = { type: 'common.x', label: '', kind: 'overlay', over: 'picture', params: [{ key: 'look', type: 'enum', options: ['a', 'b', 'c'], default: 'a' }],
    variants: { param: 'look', list: ['a', 'b', 'c'].map((value) => ({ value, label: value, doc: value })) } } as unknown as ItemType;
  expect(streetSamples([{ name: 'x', type: 'common.x', at: [1] }, { name: 'x-b', type: 'common.x', params: { look: 'b' }, at: [1] }, { name: 'x-b2', type: 'common.x', params: { look: 'b' }, at: [1] },
    { name: 'x-c', type: 'common.x', params: { look: 'c' }, at: [1], photo: 'ref' }], [fake]).map((s) => s.name)).toEqual(['x-street', 'x-b-street']);
});

test('the English and Japanese words of the gallery\'s pictures are shared from the package (the gallery\'s previews play them)', () => {
  expect(Object.keys(THUMB_PARAMS)).toEqual(['en', 'ja']);
  expect(THUMB_PARAMS.en['badge-star']).toMatchObject({ plate: expect.any(String) });
});
