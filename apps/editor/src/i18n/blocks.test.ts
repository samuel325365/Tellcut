import { describe, expect, it } from 'vitest';
import { BLOCK_CATEGORY, HANDLES, PLUGIN_GROUP, RETIRED, SFX_CATEGORY } from '@tellcut/protocol';
import { DICTS, type Key } from './index.ts';
import { BLOCKS_EN } from './blocks.en.ts';
import { BLOCKS_JA } from './blocks.ja.ts';
import { plugins } from '@tellcut/plugins';
import { blockText } from './blocks.ts';

const CJK = /[　-〿぀-ヿ㐀-鿿＀-￯]/;
const ids = Object.values(HANDLES).filter((id) => !Object.values(RETIRED).includes(id));
const recipeIds = ids.filter((id) => id.startsWith('recipe:'));

describe('block texts', () => {
  it('every handle has an English and a Japanese name and description', () => {
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) {
      for (const [lang, d] of [['en', BLOCKS_EN], ['ja', BLOCKS_JA]] as const) {
        expect(d[id]?.label?.trim(), `${lang} label of ${id}`).toBeTruthy();
        expect(d[id]?.doc?.trim(), `${lang} doc of ${id}`).toBeTruthy();
      }
      expect(CJK.test(`${BLOCKS_EN[id].label}${BLOCKS_EN[id].doc}${(BLOCKS_EN[id].notes ?? []).join('')}`.replace(/[【】]/g, '')), `English of ${id} has CJK`).toBe(false);
    }
    for (const id of recipeIds) {
      expect(BLOCKS_EN[id].notes?.length, id).toBeGreaterThan(0);
      expect(BLOCKS_JA[id].notes?.length, id).toBe(BLOCKS_EN[id].notes!.length);
    }
  });

  it('every category and group has its name in the dictionaries', () => {
    const keys = [...Object.keys(BLOCK_CATEGORY).map((k) => `cat.block.${k}`), ...Object.keys(SFX_CATEGORY).map((k) => `cat.sfx.${k}`), ...Object.keys(PLUGIN_GROUP).map((k) => `group.${k}`)];
    for (const k of keys) for (const d of Object.values(DICTS)) expect((d as Record<string, string>)[k as Key], k).toBeTruthy();
  });

  it('blockText gives the Chinese as is, and en / ja from their files with missing fields from the Chinese', () => {
    const zh = { label: '爆字', doc: '一句超大的字', notes: ['注'] };
    expect(blockText('common.slam', zh, 'zh')).toBe(zh);
    expect(blockText('common.slam', zh, 'en').label).toBe(BLOCKS_EN['common.slam'].label);
    expect(blockText('common.slam', zh, 'ja').doc).toBe(BLOCKS_JA['common.slam'].doc);
    expect(blockText('nope.unknown', zh, 'en')).toEqual(zh);
    expect(blockText('recipe:travel', { label: 'x', doc: 'y' }, 'en').notes).toEqual(BLOCKS_EN['recipe:travel'].notes);
  });
  it('a missing Japanese text falls back to English first, then Chinese', () => {
    const zh = { label: '中', doc: '中文' };
    BLOCKS_EN['t.only'] = { label: 'En', doc: 'En doc' };
    BLOCKS_EN['t.half'] = { label: 'En2', doc: 'En doc2' };
    BLOCKS_JA['t.half'] = { label: '日', doc: '' };
    try {
      expect(blockText('t.only', zh, 'ja')).toEqual({ label: 'En', doc: 'En doc' });
      expect(blockText('t.half', zh, 'ja')).toEqual({ label: '日', doc: 'En doc2' });
      expect(blockText('t.none', zh, 'ja')).toEqual(zh);
    } finally { delete BLOCKS_EN['t.only']; delete BLOCKS_EN['t.half']; delete BLOCKS_JA['t.half']; }
  });

  it('markup brackets stay full-width in every language', () => {
    const bad: string[] = [];
    for (const p of plugins) for (const it of p.items ?? []) {
      if (!it.doc?.includes('【')) continue;
      for (const [lang, d] of [['en', BLOCKS_EN], ['ja', BLOCKS_JA]] as const) {
        const doc = d[it.type]?.doc ?? '';
        if (!doc.includes('【') || /\[[^\]\s,\d][^\],]{0,20}\]/.test(doc)) bad.push(`${lang}:${it.type}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
