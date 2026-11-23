import { PREVIEW_BG, PREVIEW_GROUND } from '@tellcut/engine';
import { blockProject, ownBlocks, pickedVariant, THEMES, type GalleryBlock } from './gallery.ts';

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
