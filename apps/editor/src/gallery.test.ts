import { PREVIEW_BG, PREVIEW_GROUND } from '@tellcut/engine';
import { handleOf } from '@tellcut/protocol';
import { plugins } from '@tellcut/plugins';
import { blockProject, filterGallery, lookHit, lookHits, looksOf, matches, ownBlocks, pickedVariant, THEMES, type GalleryBlock, type GalleryIndex } from './gallery.ts';
import { blockText } from './i18n/blocks.ts';

const progress: GalleryBlock = {
  plugin: 'common', group: '共用積木', type: 'common.progress', label: '進度條', doc: '片子走到哪裡', kind: 'overlay', needsMedia: false, category: 'chapter',
  params: [{ key: 'mode', label: '樣子', type: 'enum', options: ['bar', 'dots', 'ring'], default: 'bar' }, { key: 'size', label: '大小', type: 'number', default: 4 }],
  bg: '#203040',
  variants: { param: 'mode', list: [
    { value: 'bar', label: '長條', doc: '一條', thumb: '/api/gallery/thumb/progress-t1.50.png', params: { mode: 'bar' }, bg: '#203040' },
    { value: 'dots', label: '圓點', doc: '一排點', thumb: '/api/gallery/thumb/progress-dots-t1.50.png', params: { mode: 'dots' }, theme: { palette: { accent: '#ff0000' } }, aspect: 'wide' },
    { value: 'ring', label: '圓環', doc: '一圈', thumb: '/api/gallery/thumb/progress-ring-t1.50.png', params: { mode: 'ring', label: '第一章' }, local: { en: { mode: 'ring', label: 'Part one' } } },
  ] },
};
const magazine: GalleryBlock = {
  plugin: 'common', group: '共用積木', type: 'common.magazine', label: '雜誌', doc: '雜誌版面', kind: 'overlay', needsMedia: true, category: 'frame', params: [],
  variants: { param: 'layout', list: [{ value: 'feature', label: '專題', doc: '大圖', params: { cells: 'pic|0' }, stand: ['pic'] }] },
};
const camcorder: GalleryBlock = {
  plugin: 'common', group: '共用積木', type: 'common.camcorder', label: '攝影機', doc: '錄影畫面', kind: 'overlay', needsMedia: false, category: 'frame', over: 'picture', params: [],
  variants: { param: 'mode', list: [{ value: 'rew', label: '倒帶', doc: '倒帶', params: { mode: 'rew' }, stand: ['pic'], bg: '#123456' }] },
};
const variant = (b: GalleryBlock, value: string) => b.variants!.list.find((v) => v.value === value)!;

test('a Latin query is found only where a word starts; one with any other character anywhere', () => {
  const m = (q: string, ...f: string[]) => matches(q, undefined, ...f);
  for (const f of ['ring', 'a ring in a corner', 'ringing', 'common.ring', '圓環ring', 'Ring', '(ring)', 'x-ring']) expect([f, m('ring', f)]).toEqual([f, true]);
  for (const f of ['during', 'coloring', 'string', 'Spring']) expect([f, m('ring', f)]).toEqual([f, false]);
  // a second hit at a word start counts even when the first is inside a word
  expect(m('ring', 'during the ring')).toBe(true);
  // typing a word as far as it goes keeps finding it; case does not matter either way
  expect([m('prog', 'common.progress'), m('PROG', 'common.progress'), m('Common.Prog', 'common.progress'), m('ring', 'RINGS')]).toEqual([true, true, true, true]);
  expect([m('ogress', 'common.progress'), m('mon.prog', 'common.progress')]).toEqual([false, false]);
  // several words: the query as a whole at a word start
  expect([m('a ring', 'draw a ring'), m('a ring', 'a tiara ring'), m("don't", 'I don\'t'), m('step-2', 'go step-2')]).toEqual([true, false, true, true]);
  // a query starting with punctuation keeps the substring test
  expect(m('.progress', 'common.progress')).toBe(true);
  // CJK, or Latin mixed with it: anywhere in the field
  expect([m('圓環', '角落一個圓環'), m('環', '圓環'), m('圓ring', '大圓ring'), m('é', 'café')]).toEqual([true, true, true, true]);
  // the empty query matches everything; the handle rule is unchanged (mrk3 finds MRK-03, and so does its prefix)
  expect([m('', 'x'), m('  ', 'x')]).toEqual([true, true]);
  expect([matches('mrk3', 'MRK-03', 'x'), matches('mrk-0', 'MRK-03', 'x'), matches('rk', 'MRK-03', 'x')]).toEqual([true, true, false]);
});

test('searching "ring" over the real blocks no longer finds one only by "during", "appearing" or "scoring"', () => {
  const found = (q: string) => plugins.flatMap((p) => p.items ?? []).filter((i) => {
    const en = blockText(i.type, { label: i.label, doc: i.doc ?? '' }, 'en');
    return matches(q, handleOf(i.type), i.type, i.label, i.doc ?? '', en.label, en.doc);
  }).map((i) => i.type);
  const list = plugins.flatMap((p) => p.items ?? []).find((i) => i.type === 'common.list')!;
  expect(blockText('common.list', { label: list.label, doc: list.doc ?? '' }, 'en').doc).toMatch(/during/);
  expect(found('ring')).toContain('common.progress');
  expect(found('ring')).not.toContain('common.list');
  expect(found('ring')).not.toContain('common.digits');
  expect(found('dur')).toContain('common.list');
});

test('a variant picked: the preview plays on its card\'s ground and shape, in its sample\'s look unless the theme menu picks another', () => {
  const dots = blockProject(progress, { mode: 'dots' }, 'none', undefined, variant(progress, 'dots'));
  expect(dots.meta).toMatchObject({ width: 1920, height: 1080, background: PREVIEW_BG, theme: { palette: { accent: '#ff0000' } } });
  expect(dots.tracks.at(-1)!.items[0]).toMatchObject({ type: 'common.progress', params: { mode: 'dots' } });
  // the theme menu's own pick wins over the sample's
  expect(blockProject(progress, { mode: 'dots' }, 'warm', undefined, variant(progress, 'dots')).meta.theme).toEqual(THEMES.warm.theme);
  // a variant's card on the block's ground keeps it; one on the plain ground plays on the plain ground, tall
  expect(blockProject(progress, { mode: 'bar' }, 'none', undefined, variant(progress, 'bar')).meta).toMatchObject({ width: 1080, height: 1920, background: '#203040' });
  expect(blockProject(progress, { mode: 'ring' }, 'none', undefined, variant(progress, 'ring')).meta).toMatchObject({ width: 1080, height: 1920, background: PREVIEW_BG });
  expect('theme' in blockProject(progress, { mode: 'ring' }, 'none', undefined, variant(progress, 'ring')).meta).toBe(false);
  // without one, as before: the block's own ground
  expect(blockProject(progress, {}).meta.background).toBe('#203040');
});

test('a variant whose sample shows a picture: the gallery street stands in for its source; over the street, the ground stays too', () => {
  const m = blockProject(magazine, { cells: 'pic|0' }, 'none', undefined, variant(magazine, 'feature'));
  expect(Object.keys(m.sources)).toEqual(['pic']);
  expect(m.sources.pic).toMatchObject({ kind: 'image', path: `${PREVIEW_GROUND}.png`, width: 1080, height: 1920 });
  expect(m.tracks.map((t) => t.kind)).toEqual(['overlay']);
  const c = blockProject(camcorder, { mode: 'rew' }, 'none', undefined, variant(camcorder, 'rew'));
  expect(Object.keys(c.sources).sort()).toEqual(['pic', PREVIEW_GROUND].sort());
  expect(c.tracks[0].items[0]).toMatchObject({ source: PREVIEW_GROUND });
  // a block marked over plays over the street: a stray ground is not its
  expect(c.meta.background).toBe(PREVIEW_BG);
});

test('the picked variant is the one whose value is the only thing set', () => {
  expect(pickedVariant(progress, { mode: 'ring' })?.value).toBe('ring');
  expect(pickedVariant(progress, { mode: 'bar' })?.value).toBe('bar');
  // anything else set beside it, nothing set, or a value no variant has: none
  expect(pickedVariant(progress, { mode: 'ring', size: 6 })).toBeUndefined();
  expect(pickedVariant(progress, {})).toBeUndefined();
  expect(pickedVariant(progress, { mode: 'nope' })).toBeUndefined();
  expect(pickedVariant(progress, { size: 6 })).toBeUndefined();
  expect(pickedVariant(magazine, { mode: 'feature' })).toBeUndefined();
  const { variants: _v, ...plain } = progress;
  expect(pickedVariant(plain, { mode: 'ring' })).toBeUndefined();
});

test('a project\'s own block keeps its variants, names and docs only (no pictures)', () => {
  const [b] = ownBlocks([{ type: 'fx.t', label: 't', kind: 'overlay', params: [{ key: 'look', label: 'look', type: 'enum', options: ['a', 'b'], default: 'a' }],
    variants: { param: 'look', list: [{ value: 'a', label: 'A', doc: 'one', sample: 'x' }, { value: 'b', label: 'B', doc: 'two' }] } }]);
  expect(b.variants).toEqual({ param: 'look', list: [{ value: 'a', label: 'A', doc: 'one' }, { value: 'b', label: 'B', doc: 'two' }] });
  expect(ownBlocks([{ type: 'fx.u', label: 'u', kind: 'overlay', params: [] }])[0].variants).toBeUndefined();
});

test('a card\'s looks: its variants first, then its templates, each with what picking it sets', () => {
  const b: GalleryBlock = { ...progress, templates: [{ id: 'race', label: '賽跑', doc: '一路跑', params: { mode: 'dots', size: 6 }, thumb: '/api/gallery/thumb/progress-tpl-race-t1.50.png' }] };
  expect(looksOf(b).map((l) => [l.key, l.kind, l.id, l.label, l.thumb, l.set])).toEqual([
    ['variant:bar', 'variant', 'bar', '長條', '/api/gallery/thumb/progress-t1.50.png', { mode: 'bar' }],
    ['variant:dots', 'variant', 'dots', '圓點', '/api/gallery/thumb/progress-dots-t1.50.png', { mode: 'dots' }],
    ['variant:ring', 'variant', 'ring', '圓環', '/api/gallery/thumb/progress-ring-t1.50.png', { mode: 'ring' }],
    ['template:race', 'template', 'race', '賽跑', '/api/gallery/thumb/progress-tpl-race-t1.50.png', { mode: 'dots', size: 6 }],
  ]);
  expect(looksOf(magazine).map((l) => l.key)).toEqual(['variant:feature']);
  expect(looksOf({ ...magazine, variants: undefined })).toEqual([]);
});

test('search finds a block by a variant or template; lookHit names the first when the block itself does not match', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const b: GalleryBlock = { ...progress, doc: '片子走到哪裡；ring 和 bar 的走法相同', templates: [{ id: 'race', label: '賽跑', doc: '一路跑到終點', params: { mode: 'dots', size: 6 } }] };
  const g: GalleryIndex = { blocks: [b, magazine], sfx: [], styles: [], recipes: [] };
  const found = (q: string) => filterGallery(g, 'blocks', q).map((x: any) => x.type);
  // a variant's Chinese name and doc, a template's: the block is found, and its card shows the look found
  expect([found('圓環'), lookHit(b, '圓環')]).toEqual([['common.progress'], { variant: 'ring' }]);
  expect(lookHit(b, '一排')).toEqual({ variant: 'dots' });
  expect([found('終點'), lookHit(b, '終點')]).toEqual([['common.progress'], { template: 'race' }]);
  // its English name and doc, in any UI language (blocks.en.ts has common.progress@ring)
  expect(lookHit(b, 'percentage')).toEqual({ variant: 'ring' });
  // every look the query hits is marked; the block's own fields matching: no look shown in its place
  expect(lookHits(b, '一')).toEqual(['variant:bar', 'variant:dots', 'variant:ring', 'template:race']);
  expect([found('片子'), lookHit(b, '片子')]).toEqual([['common.progress'], undefined]);
  // but a look's own name typed in full wins over a block doc that names it in passing
  expect([lookHit(b, 'ring'), lookHit(b, 'RING'), lookHit(b, 'Ring')]).toEqual([{ variant: 'ring' }, { variant: 'ring' }, { variant: 'ring' }]);
  expect(lookHit(b, '')).toBeUndefined();
  expect(found('nothing-like-it')).toEqual([]);
  try {
    // the UI language's own names
    setLang('ja');
    expect([found('隅の輪'), lookHit(b, '隅の輪')]).toEqual([['common.progress'], { variant: 'ring' }]);
  } finally { setLang('zh'); }
});
