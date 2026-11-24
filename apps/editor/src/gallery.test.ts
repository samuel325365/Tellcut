import { OLD_BLOCKS, PREVIEW_BG, PREVIEW_GROUND } from '@tellcut/engine';
import { aliasText, CLIP_FX, handleOf } from '@tellcut/protocol';
import { plugins } from '@tellcut/plugins';
import { blockFinder, blockProject, foundIn, libraryBlock, clipMatches, filterGallery, idFields, lookHit, lookHits, looksOf, matches, ownBlocks, pickedVariant, THEMES, valueFields, type GalleryBlock, type GalleryIndex, type SearchBlock } from './gallery.ts';
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

test('a Latin query is found in a prose field only where a word starts; one with any other character anywhere', () => {
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

test('an identifier field, read in its own case: a Latin query where one of its parts starts (camelCase humps too); any other anywhere', () => {
  const id = (q: string, ...f: string[]) => matches(q, undefined, ...idFields(...f));
  expect([id('dur', 'fadeDur'), id('DUR', 'fadeDur'), id('icon', 'startIcon'), id('bar', 'common.HealthBar'), id('corner', 'ring-corner')]).toEqual([true, true, true, true, true]);
  // the same text as prose: only where a word starts (the prose field is lower-cased first, so no hump)
  expect([matches('dur', undefined, 'fadeDur'), matches('bar', undefined, 'common.HealthBar')]).toEqual([false, false]);
  // not inside one lower-case part
  expect([id('bar', 'common.healthbar'), id('art', 'heart'), id('ogress', 'common.progress'), id('ar', 'common.healthbar')]).toEqual([false, false, false, false]);
  expect([id('co', 'common.healthbar'), id('he', 'common.healthbar')]).toEqual([true, true]);
  // CJK, and a query starting with punctuation: anywhere, as in prose
  expect([id('環', 'x.圓環'), id('.health', 'common.healthbar')]).toEqual([true, true]);
  // prose and identifier fields together: either one is enough
  expect([matches('dur', undefined, 'a meter', ...idFields('fadeDur')), matches('meter', undefined, 'a meter', ...idFields('fadeDur'))]).toEqual([true, true]);
  // a template's param values: an option or colour is an identifier, words with a space are prose
  expect(valueFields({ anim: 'popIn', color: '#ff0000', size: 6, text: 'during the day' })).toEqual([{ id: 'popIn' }, { id: '#ff0000' }, { id: '6' }, 'during the day']);
});

test('searching "ring" over the real blocks no longer finds one only by "during", "appearing" or "scoring"; a compound type by its alias', () => {
  const found = (q: string) => plugins.flatMap((p) => p.items ?? []).filter((i) => {
    const en = blockText(i.type, { label: i.label, doc: i.doc ?? '' }, 'en');
    return matches(q, handleOf(i.type), ...idFields(i.type), i.label, i.doc ?? '', en.label, en.doc, aliasText(i.type));
  }).map((i) => i.type);
  const list = plugins.flatMap((p) => p.items ?? []).find((i) => i.type === 'common.list')!;
  expect(blockText('common.list', { label: list.label, doc: list.doc ?? '' }, 'en').doc).toMatch(/during/);
  expect(found('ring')).toContain('common.progress');
  expect(found('ring')).not.toContain('common.list');
  expect(found('ring')).not.toContain('common.digits');
  expect(found('dur')).toContain('common.list');
  // an all-lower-case compound type id hides its second word, which its search alias gives (protocol SEARCH_ALIASES)
  expect(found('bar')).toContain('common.healthbar');
  expect(found('ogress')).not.toContain('common.progress');
});

test('the gallery reads a look\'s value, a combo\'s parts and a clip effect\'s key and cut.ts line as identifiers', () => {
  // a camelCase variant value by its second part; its prose has no Latin word
  const slide: GalleryBlock = { ...progress, type: 'fx.slide', variants: { param: 'mode', list: [{ value: 'slideIn', label: '滑入', doc: '滑進來' }, { value: 'dots', label: '圓點', doc: '一排點' }] } };
  expect([lookHits(slide, 'in'), lookHits(slide, 'ots')]).toEqual([['variant:slideIn'], []]);
  const g: GalleryIndex = { blocks: [], sfx: [], styles: [], recipes: [], combos: [
    { id: 'impact', label: '重擊', doc: '打臉', parts: [{ name: 'flash', kind: 'effect', type: 'core.flash', template: 'bloom-pop', at: 0, len: 0.5 }] },
  ] } as unknown as GalleryIndex;
  expect([filterGallery(g, 'combos', 'pop'), filterGallery(g, 'combos', 'flash'), filterGallery(g, 'combos', 'loom'), filterGallery(g, 'combos', 'pact')].map((xs) => xs.length)).toEqual([1, 1, 0, 0]);
  // a transition's cut.ts line says dur: found by "dur" and its key's last part; a shape's `outline: true` is not "line"
  const dissolve = CLIP_FX.find((f) => /type: 'dissolve'/.test(f.code))!, circle = CLIP_FX.find((f) => f.key === 'clip.shape.circle')!;
  expect([clipMatches(dissolve, 'dur'), clipMatches(dissolve, 'dissolve'), clipMatches(dissolve, 'issolve'), clipMatches(circle, 'line')]).toEqual([true, true, false, false]);
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

test('the preview plays a block for its card\'s length: the picked variant\'s, else the picked template\'s, else the block\'s', () => {
  const wipe: GalleryBlock = {
    plugin: 'common', group: '共用積木', type: 'common.wipe', label: '轉場', doc: '一道轉場', kind: 'overlay', needsMedia: false, category: 'transition', params: [], len: 1.6,
    templates: [{ id: 'slow', label: '慢', doc: '慢', params: { mode: 'ink' }, len: 4 }, { id: 'plain', label: '普通', doc: '普通', params: { mode: 'iris' } }],
    variants: { param: 'mode', list: [{ value: 'hand', label: '手', doc: '手', params: { mode: 'hand' }, len: 0.8 }, { value: 'cut', label: '切', doc: '切', params: { mode: 'cut' } }] },
  };
  const block = (p: ReturnType<typeof blockProject>) => p.tracks.at(-1)!.items[0] as { start: number; end: number };
  const [slow, plain] = wipe.templates!, hand = variant(wipe, 'hand'), cut = variant(wipe, 'cut');
  // the variant over the template over the block, each one's own length: one without a length is its own 3 s sample's
  expect([blockProject(wipe, {}, 'none', slow, hand), blockProject(wipe, {}, 'none', slow, cut)].map((p) => [p.meta.duration, block(p).start, block(p).end])).toEqual([[3, 1.1, 1.9], [3, 0, 3]]);
  expect([blockProject(wipe, {}, 'none', slow), blockProject(wipe, {}, 'none', plain)].map((p) => [p.meta.duration, block(p).start, block(p).end])).toEqual([[4, 0, 4], [3, 0, 3]]);
  const own = blockProject(wipe, {});
  expect([own.meta.duration, block(own).start, block(own).end]).toEqual([3, 0.7, 2.3]);
  // a block whose card has no length: the plain 3 s film
  expect(block(blockProject(progress, {}))).toMatchObject({ start: 0, end: 3 });
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

test('search finds a block by its search aliases and a look by its own; a look\'s alias typed in full shows that look', () => {
  // protocol SEARCH_ALIASES: common.countdown has 計時器, common.pen@heart 心形 and 紅心, common.pen@thumb 大拇指
  const pen: GalleryBlock = {
    plugin: 'common', group: '共用積木', type: 'common.pen', label: '手繪標記', doc: '筆畫上去的標記；紅心、星星都畫得出來', kind: 'overlay', needsMedia: false, category: 'mark',
    params: [{ key: 'kind', label: '畫什麼', type: 'enum', options: ['circle', 'heart', 'thumb'], default: 'circle' }],
    variants: { param: 'kind', list: [{ value: 'circle', label: '圈', doc: '一個圈' }, { value: 'heart', label: '愛心', doc: '一顆愛心' }, { value: 'thumb', label: '讚', doc: '比讚的手' }] },
  };
  const countdown: GalleryBlock = { plugin: 'common', group: '共用積木', type: 'common.countdown', label: '倒數', doc: '數字往下數', kind: 'overlay', needsMedia: false, category: 'chapter', params: [] };
  const g: GalleryIndex = { blocks: [progress, pen, countdown], sfx: [], styles: [], recipes: [] };
  const found = (q: string) => filterGallery(g, 'blocks', q).map((x: any) => x.type);
  // a block's alias: the block, its own card
  expect([found('計時器'), lookHit(countdown, '計時器')]).toEqual([['common.countdown'], undefined]);
  // a look's alias: the block, and its card shows that look
  expect([found('心形'), lookHits(pen, '心形'), lookHit(pen, '心形')]).toEqual([['common.pen'], ['variant:heart'], { variant: 'heart' }]);
  expect([found('大拇指'), lookHit(pen, '大拇指')]).toEqual([['common.pen'], { variant: 'thumb' }]);
  // typed in full it wins over a block doc that says the word in passing, as a look's name does
  expect([found('紅心'), lookHit(pen, '紅心')]).toEqual([['common.pen'], { variant: 'heart' }]);
  // a Latin alias is found at a word's start, in any UI language
  expect([found('stopwatch'), found('stopw'), found('watch')]).toEqual([['common.countdown'], ['common.countdown'], []]);
  // another block's aliases are not this one's
  expect(lookHits(progress, '心形')).toEqual([]);
});

test('search finds a block by a param: a key\'s part or a whole name, listed after the blocks found by their own words; common keys never', () => {
  const p = (key: string, label: string) => ({ key, label, type: 'number' as const, default: 1 });
  const card = (type: string, label: string, doc: string, params: ReturnType<typeof p>[]): GalleryBlock =>
    ({ plugin: 'common', group: '共用積木', type, label, doc, kind: 'overlay', needsMedia: false, category: 'text', params });
  // ten blocks with `size`, so it is a key more than a tenth, and more than five, of them have (nothing finds them by it)
  const filler = Array.from({ length: 10 }, (_, i) => card(`fx.filler${i}`, `填充${i}`, '', [p('size', '大小')]));
  const burst = card('fx.burst', '爆炸', '一團煙', [p('outDur', '退場秒數'), p('size', '大小')]);
  const dur = card('fx.durable', '耐久', 'dur 寫在名字裡', []);
  const g: GalleryIndex = { blocks: [burst, dur, ...filler], sfx: [{ plugin: 'common', type: 'fx.tick', label: '滴答', doc: '', params: [p('fadeDur', '淡出')] }], styles: [], recipes: [] };
  const found = (q: string, tab: 'blocks' | 'sfx' = 'blocks') => filterGallery(g, tab, q).map((x: any) => x.type);
  // a key's part (outDur): found, after the one whose own words have it
  expect(found('dur')).toEqual(['fx.durable', 'fx.burst']);
  expect(blockFinder(g.blocks, 'dur')(burst)).toBe('param');
  expect(blockFinder(g.blocks, 'dur')(dur)).toBe('block');
  // a whole param name; not a word inside one, nor a key's inside, nor a query too short
  expect([found('退場秒數'), found('退場'), found('ut'), found('ou')]).toEqual([['fx.burst'], [], [], []]);
  // `size` is on more than a tenth of them: it finds none by the key or its name
  expect([found('size'), found('大小')]).toEqual([[], []]);
  // the Sounds tab too
  expect(found('dur', 'sfx')).toEqual(['fx.tick']);
  // no query: everything, in order
  expect(found('')).toEqual(g.blocks.map((b) => b.type));
});

test('My blocks are found by the shared blocks\' finder: name, description, type, a param (after the others); a list keeps its own entries', () => {
  const entry = (type: string, name: string, desc: string, params: Array<{ key: string; label: string }>) =>
    ({ slug: 'x', type, name, desc, kind: 'overlay' as const, params: params.map((d) => ({ ...d, type: 'number' as const, default: 1 })), main: 'fx/x.js', thumb: null, from: { project: 'p', file: 'fx/x.js' }, savedAt: '', version: '1', group: [] });
  const chalk = entry('fx.chalk', '粉筆標題卡', '黑板上的標題', [{ key: 'outDur', label: '退場秒數' }]);
  const line = entry('fx.chalkLine', '粉筆底線', 'dur 寫在說明裡', []);
  expect(libraryBlock(chalk)).toEqual({ type: 'fx.chalk', label: '粉筆標題卡', doc: '黑板上的標題', params: chalk.params });
  const shared: SearchBlock[] = [{ type: 'common.slam', label: '大字', doc: '', params: [] }];
  const find = (q: string) => foundIn([chalk, line], blockFinder(shared, q), libraryBlock);
  // the entries themselves come back (not their search forms), those found only by a param last
  expect(find('dur')).toEqual([line, chalk]);
  expect([find('黑板'), find('退場秒數'), find('chalk'), find('Line'), find('粉筆')].map((xs) => xs.map((x) => x.type)))
    .toEqual([['fx.chalk'], ['fx.chalk'], ['fx.chalk', 'fx.chalkLine'], ['fx.chalkLine'], ['fx.chalk', 'fx.chalkLine']]);
  expect([find('退場'), find('ur'), find('')].map((xs) => xs.length)).toEqual([0, 0, 2]);
});

test('param search on the real blocks: dur finds the …Dur params, and size, color, x add only a few blocks to what their words find', () => {
  const blocks = plugins.flatMap((pl) => pl.items ?? []).filter((t) => !Object.hasOwn(OLD_BLOCKS, t.type)) as SearchBlock[];
  const count = (q: string) => { const f = blockFinder(blocks, q); return { block: blocks.filter((b) => f(b) === 'block').length, param: blocks.filter((b) => f(b) === 'param').length }; };
  const dur = blockFinder(blocks, 'dur');
  for (const b of blocks.filter((x) => x.params?.some((d) => /Dur$/.test(d.key)))) expect([b.type, dur(b)]).not.toEqual([b.type, undefined]);
  // the keys most blocks have are skipped: x and y add nothing, size and color a fifth of the list at most
  for (const q of ['x', 'y', 'size', 'color']) expect([q, count(q).param <= blocks.length / 5]).toEqual([q, true]);
  expect([count('x').param, count('y').param]).toEqual([0, 0]);
});

test('a template is found the same in the gallery and in the editor library\'s registry types: 頭條 finds common.wipe by band-steep', () => {
  const wipe = plugins.flatMap((pl) => pl.items ?? []).find((t) => t.type === 'common.wipe')! as SearchBlock;
  expect(wipe.templates?.some((x) => x.id === 'band-steep')).toBe(true);
  for (const q of ['頭條', '快訊', 'headline']) {
    expect([q, blockFinder([wipe], q)(wipe)]).toEqual([q, 'block']);
    expect([q, lookHit(wipe, q)]).toEqual([q, { template: 'band-steep' }]);
  }
});
