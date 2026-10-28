import { corePlugin, createRegistry } from '@tellcut/engine';
import { itemLook, itemName } from './names.ts';

const reg = createRegistry([corePlugin, { id: 'x', items: [
  { type: 'x.headline', label: '大標', kind: 'overlay', category: 'text', params: [{ key: 'text', label: '字', type: 'text', default: '預設字' }], build: () => null, draw: () => {} },
  { type: 'x.card', label: '卡片', kind: 'overlay', category: 'card', params: [{ key: 'font', label: '字型', type: 'string', default: 'Noto' }, { key: 'title', label: '標題', type: 'string', default: '' }], build: () => null, draw: () => {} },
  { type: 'x.plain', label: '純色', kind: 'scene', category: 'look', params: [], build: () => null, draw: () => {} },
], sfx: [{ type: 'x.tap', label: '敲', params: [], duration: () => 0.2, synth() {} }] } as any]);

const block = (type: string, params: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id: 'a', type, params, start: 0, end: 1, ...extra }) as any;
const clip = { id: 'c1', source: 'pixabay-1', in: 0, speed: 1, start: 0, end: 1 } as any;

test('a label wins; then the block text; then its display name; then the source; then the id', () => {
  expect(itemName(block('x.headline', {}, { label: '我的名字' }), 'overlay', reg, 'en')).toBe('我的名字');
  expect(itemName(block('x.headline', { text: '第一行\n第二行' }), 'overlay', reg, 'en')).toBe('第一行 第二行');
  expect(itemName(block('x.headline'), 'overlay', reg, 'en')).toBe('預設字');                       // not filled in: the default
  expect(itemName(block('x.card', { title: 'Menu' }), 'overlay', reg, 'en')).toBe('Menu');          // a string param on the name list, not the font
  expect(itemName(block('x.card'), 'overlay', reg, 'zh')).toBe('卡片');                              // an empty title: the block name
  expect(itemName(block('x.plain'), 'scene', reg, 'zh')).toBe('純色');
  expect(itemName(clip, 'video', reg, 'en')).toBe('pixabay-1');
  expect(itemName({ id: 'm1', media: 'score', in: 0, start: 0, end: 1 } as any, 'music', reg, 'en')).toBe('score');
  expect(itemName(block('fx.thing'), 'overlay', reg, 'en')).toBe('fx.thing');                       // unregistered: its type id
  expect(itemName({ ...block('x.tap'), gain: 0 }, 'sfx', reg, 'zh')).toBe('敲');
});

test('the English and Japanese display names come from blocks.en / blocks.ja; Chinese from the block itself', () => {
  const flash = block('core.flash');
  expect(itemName(flash, 'overlay', reg, 'zh')).toBe('閃白');
  expect(itemName(flash, 'overlay', reg, 'en')).toBe('Flash');
});

test('looks: blocks by category, project fx get "fx", media keep the track colour', () => {
  expect(itemLook(block('x.headline'), 'overlay', reg)).toEqual({ glyph: 'words', tone: 'words' });
  expect(itemLook(block('x.card'), 'overlay', reg)).toEqual({ glyph: 'layout', tone: 'layout' });
  expect(itemLook(block('x.plain'), 'scene', reg)).toEqual({ glyph: 'look', tone: 'look' });
  expect(itemLook(block('fx.thing'), 'overlay', reg)).toEqual({ glyph: 'fx', tone: 'fx' });
  expect(itemLook(block('core.flash'), 'overlay', reg)).toEqual({ glyph: 'moment', tone: 'moment' });   // core blocks: CORE_CATEGORY
  expect(itemLook(clip, 'video', reg)).toEqual({ glyph: 'video', tone: null });
  expect(itemLook({ ...block('x.tap'), gain: 0 }, 'sfx', reg)).toEqual({ glyph: 'sfx', tone: null });
});
