// The Editor: notices and refusals in the interface language, and blocks added in the English UI.
import { corePlugin, createRegistry } from '@tellcut/engine';
import { Editor } from './editor.ts';
import { setLang } from './i18n/lang.ts';
import { PARAMS_EN } from './i18n/params.ts';
import { BLOCKS_EN } from './i18n/blocks.ts';
import { fakes } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// showcase films (spec 2026-10-30 part 2): no Chinese words in a block added from the English or Japanese UI
test('a block added or swapped in the English UI starts with its words in English; in Chinese it keeps its own defaults', async () => {
  const block = (type: string, keys: string[]) => ({ type, label: type, kind: 'overlay', params: keys.map((key) => ({ key, label: key, type: 'string', default: '' })), build: () => null, draw: () => {} });
  const registry = createRegistry([corePlugin, { id: 'x', items: [block('x.a', ['color'])] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  const added = () => ed.store.get().project!.tracks.flatMap((t) => t.items as any[]).find((x: any) => x.id === ed.store.get().selection[0]);
  try {
    setLang('en');
    ed.seek(1); ed.addOverlay('core.title');
    expect(added().params).toEqual({ text: 'Title' });
    ed.seek(4); ed.addOverlay('x.a');
    const id = ed.store.get().selection[0];
    ed.updateParam(id, 'color', '#f00');
    ed.replaceBlock(id, 'core.lowerThird');
    expect(added().params).toEqual({ text: 'Place', color: '#f00' });   // the colour both have stays
    setLang('zh');
    ed.seek(7); ed.addOverlay('core.title');
    expect(added().params).toEqual({});
  } finally { setLang('zh'); }
});

test('editor notices follow the language', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.seek(20);
  setLang('en');
  try {
    expect(ed.addOverlay('core.flash')).toBe(false);
    expect(ed.store.get().notice).toBe('The playhead is at the end of the project, so nothing can be added');
  } finally { setLang('zh'); }
});

test('a refused parameter or a second unique block is named as the editor shows it (English), not by its Chinese label', async () => {
  const registry = createRegistry([corePlugin, { id: 'x', items: [
    { type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {}, params: [{ key: 'n', label: '數量（個）', type: 'number', min: 0, max: 10, default: 1 }] },
    { type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  PARAMS_EN['x.block.n'] = { name: 'Count', hint: 'items' };
  BLOCKS_EN['x.end'] = { label: 'End card', doc: '' };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  setLang('en');
  try {
    expect(ed.updateParam('blk', 'n', 11)).toBe(false);
    expect(ed.store.get().notice).toBe('"Count" must be between 0 and 10');
    expect(ed.addOverlay('x.end')).toBe(true);
    expect(ed.addOverlay('x.end')).toBe(false);
    expect(ed.store.get().notice).toBe('"End card" can only appear once in a project');
  } finally { setLang('zh'); delete PARAMS_EN['x.block.n']; delete BLOCKS_EN['x.end']; }
});

test('a refused command is told in the interface language (its code is translated; the English message is for agents)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  expect(ed.restack('blk', 'up')).toBe(false);
  expect(ed.store.get().notice).toBe('沒有重疊在上層的片段');
  for (const [lang, text] of [['en', 'No overlapping item above'], ['ja', '上に重なっている項目がありません']] as const) {
    setLang(lang);
    try {
      expect(ed.restack('blk', 'up')).toBe(false);
      expect(ed.store.get().notice).toBe(text);
    } finally { setLang('zh'); }
  }
});
