// The golden samples (samples.ts) only use values their blocks' params allow: the editor refuses a number outside a ParamDef's
// min / max or an enum value not in its options, so a sample outside them draws a picture (and a gallery card) no one can make.
// And the cards of the blocks marked over a picture are derived over the street (streetSamples, cardSample).
import { clipPreviewClips, createRegistry, OLD_BLOCKS, type ItemType } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { CLIP_FX } from '@tellcut/protocol';
import { cardSample, clipSampleName, samples, streetSample, streetSamples, templateSample } from './samples.ts';

test('every sample param is within its ParamDef: numbers inside min / max, enum values among the options', () => {
  const registry = createRegistry(plugins), bad: string[] = [];
  // a combo's sample draws several blocks: each of its items is checked; a clip effect's card draws no block
  for (const s of samples.filter((x) => !x.clips)) for (const it of s.items ?? [{ type: s.type, params: s.params }]) {
    const t = registry.item(it.type);
    if (!t) { bad.push(`${s.name}: no block ${it.type}`); continue; }
    for (const [key, v] of Object.entries(it.params ?? {})) {
      const def = t.params.find((d) => d.key === key);
      if (!def) continue;
      if (def.type === 'number' && typeof v === 'number') {
        if (def.min !== undefined && v < def.min) bad.push(`${s.name}: ${key} ${v} < min ${def.min}`);
        if (def.max !== undefined && v > def.max) bad.push(`${s.name}: ${key} ${v} > max ${def.max}`);
      } else if (def.type === 'enum' && !def.options.includes(String(v))) bad.push(`${s.name}: ${key} "${String(v)}" not in ${def.options.join('|')}`);
    }
  }
  expect(bad).toEqual([]);
});

test('a block marked over a picture has its card and each template card drawn again over the street, derived, after the originals', () => {
  const over = (plugins.flatMap((p) => p.items ?? []) as ItemType[]).filter((t) => t.over === 'picture' && !OLD_BLOCKS[t.type]);
  expect(over.length).toBeGreaterThan(10);
  const byName = new Map(samples.map((s) => [s.name, s]));
  expect(byName.size).toBe(samples.length);   // names stay unique: a -street sibling never takes another sample's name
  for (const t of over) {
    const first = samples.find((s) => s.type === t.type && !s.street)!;
    for (const own of [first, ...(t.templates ?? []).map((x) => byName.get(templateSample(t.type, x.id))!)]) {
      const card = cardSample(t.type, own === first ? undefined : own.name.slice(templateSample(t.type, '').length))!;
      if (own.photo) { expect(card, own.name).toBe(own); expect(byName.has(`${own.name}-street`), own.name).toBe(false); continue; }
      // the sibling: the same case over the street, the block alone (no plain ground, no stand-in items), named after its sample
      expect(card, own.name).toMatchObject({ name: `${own.name}-street`, street: own.name, type: own.type, at: expect.any(Array), photo: 'ref', sources: expect.objectContaining({ ref: expect.anything() }) });
      expect([card.params, card.bg, card.items], own.name).toEqual([own.params, undefined, undefined]);
      expect(samples.indexOf(card)).toBeGreaterThan(samples.indexOf(own));
    }
  }
  // the first sample of a block is never a sibling, and the template samples the admission tests read are the originals
  for (const t of over) expect(samples.find((s) => s.type === t.type)!.street, t.type).toBeUndefined();
  expect(cardSample('common.slam')).toBe(samples.find((s) => s.type === 'common.slam'));
  expect(cardSample('common.slam', 'nope')).toBeUndefined();
  // an unmarked block, an old one (common.wash) and a combo get none
  const marked = new Set(over.map((t) => t.type));
  expect(samples.filter((s) => s.street && !marked.has(s.type)).map((s) => s.name)).toEqual([]);
});

test('every clip effect with a preview has its card, drawn from the very clips its preview plays; nothing else reads them as a block', () => {
  const cards = samples.filter((s) => s.clips), reg = createRegistry(plugins);
  expect(cards.map((s) => s.type)).toEqual(CLIP_FX.filter((f) => f.preview).map((f) => f.key));
  expect(cards.length).toBe(26);   // 12 transitions, 13 shapes, the shake
  for (const f of CLIP_FX.filter((x) => x.preview)) {
    const s = cards.find((x) => x.type === f.key)!;
    expect(s, f.key).toMatchObject({ name: clipSampleName(f.key), clips: clipPreviewClips(f.preview!), len: 3 });
    expect(s.name, f.key).toMatch(/^clip-(transition|shape)-[a-z]+$|^clip-shake$/);
    // no block, no block's fields, at one moment inside the film; and no block of that name exists
    expect([s.params, s.items, s.photo, s.street, s.combo, reg.item(s.type)], f.key).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(s.at.length).toBe(1);
    expect(s.at[0]).toBeGreaterThan(0); expect(s.at[0]).toBeLessThan(3);
  }
  // a transition's card falls inside its overlap, where both pictures show
  for (const s of cards.filter((x) => x.clips![1]?.transitionIn)) expect(s.at[0] > s.clips![1].start && s.at[0] < s.clips![0].end, s.name).toBe(true);
  // they come after every block's samples and before the combos'
  const last = Math.max(...samples.map((s, i) => (!s.clips && !s.combo ? i : -1)));
  expect(samples.findIndex((s) => s.clips)).toBeGreaterThan(last);
  expect(samples.findIndex((s) => s.combo)).toBeGreaterThan(samples.length - 1 - [...samples].reverse().findIndex((s) => s.clips));
  // a block's card is never one of them
  for (const t of plugins.flatMap((p) => p.items ?? [])) expect(cardSample(t.type)?.clips, t.type).toBeUndefined();
});

test('streetSample keeps the case but its ground: the sources it reads stay, the street is added', () => {
  const s = streetSample({ name: 'x', type: 'common.x', params: { a: 1 }, at: [1], len: 2, bg: '#000', wide: true, sources: { pic: { file: 'f.png', width: 1, height: 1 } },
    items: [{ type: 'common.backdrop', start: 0, end: 2, layer: 'under' }] });
  expect(s).toEqual({ name: 'x-street', street: 'x', type: 'common.x', params: { a: 1 }, at: [1], len: 2, wide: true, photo: 'ref',
    sources: { pic: { file: 'f.png', width: 1, height: 1 }, ref: { file: 'fixtures/colour-ref.png', width: 360, height: 640 } } });
  expect(streetSamples([{ name: 'a', type: 'common.x', at: [1] }, { name: 'b', type: 'common.x', at: [1] }, { name: 'c', type: 'common.y', at: [1] }],
    [{ type: 'common.x', label: '', kind: 'overlay', params: [], over: 'picture' } as unknown as ItemType]).map((x) => x.name)).toEqual(['a-street']);
});
