import { plugins } from '@tellcut/plugins';
import { PARAMS_EN, PARAMS_JA, paramText, splitLabel } from './params.ts';

const CJK = /[぀-ヿ一-鿿]/;

test('splitLabel splits name and hint', () => {
  expect(splitLabel('徽章中心 y（畫面高比例；-1＝徽章上緣貼齊安全區上緣）')).toEqual({ name: '徽章中心 y', hint: '畫面高比例；-1＝徽章上緣貼齊安全區上緣' });
  expect(splitLabel('字級')).toEqual({ name: '字級' });
});

test('a label with nested brackets splits at the first and last', () => {
  expect(splitLabel('樣式（例：（1）粗）')).toEqual({ name: '樣式', hint: '例：（1）粗' });
});

test('every shared block parameter has an English and a Japanese name', () => {
  const missing: string[] = [];
  let n = 0;
  for (const p of plugins) {
    const owners = [...(p.items ?? []).map((i) => ({ type: i.type, params: i.params ?? [] })), ...(p.sfx ?? []).map((s) => ({ type: s.type, params: s.params ?? [] }))];
    for (const o of owners) for (const d of o.params) {
      n++;
      const k = `${o.type}.${d.key}`, zh = splitLabel(d.label);
      const en = PARAMS_EN[k], ja = PARAMS_JA[k];
      if (!en?.name || !ja?.name) { missing.push(`${k}: name`); continue; }
      if (CJK.test(en.name) || CJK.test(en.hint ?? '')) missing.push(`${k}: English has CJK`);
      if (zh.hint && (!en.hint || !ja.hint)) missing.push(`${k}: hint`);
    }
  }
  expect(n).toBeGreaterThan(500);
  expect(missing).toEqual([]);
});

test('paramText falls back', () => {
  expect(paramText('common.slam', 'size', '字級（畫面高 %）', 'zh')).toEqual({ name: '字級', hint: '畫面高 %' });
  expect(paramText('common.slam', 'size', '字級（畫面高 %）', 'en').name).toBe(PARAMS_EN['common.slam.size'].name);
  // ja missing: English; both missing: the Chinese, split
  const en = PARAMS_EN as Record<string, { name: string; hint?: string }>, ja = PARAMS_JA as Record<string, { name: string; hint?: string }>;
  en['t.only-en'] = { name: 'Only English', hint: 'h' };
  expect(paramText('t', 'only-en', '中文（說明）', 'ja')).toEqual({ name: 'Only English', hint: 'h' });
  ja['t.no-hint'] = { name: '名前' };
  en['t.no-hint'] = { name: 'Name', hint: 'English hint' };
  expect(paramText('t', 'no-hint', '名（說）', 'ja')).toEqual({ name: '名前', hint: 'English hint' });
  expect(paramText('t', 'nowhere', '中文（說明）', 'en')).toEqual({ name: '中文', hint: '說明' });
  expect(paramText('t', 'nowhere', '中文（說明）', 'ja')).toEqual({ name: '中文', hint: '說明' });
  delete en['t.only-en']; delete en['t.no-hint']; delete ja['t.no-hint'];
});

test('a project effect parameter shows its own label', () => {
  expect(paramText('fx.recipeart', 'x', '位置（畫面比例）', 'en')).toEqual({ name: '位置（畫面比例）' });
});

test('markup brackets stay full-width in every language', () => {
  const bad: string[] = [];
  for (const p of plugins) {
    const owners = [...(p.items ?? []), ...(p.sfx ?? [])];
    for (const o of owners) for (const d of o.params ?? []) {
      if (!d.label.includes('【')) continue;
      const k = `${o.type}.${d.key}`;
      for (const [lang, table] of [['en', PARAMS_EN], ['ja', PARAMS_JA]] as const) {
        const e = table[k], text = `${e?.name ?? ''} ${e?.hint ?? ''}`;
        if (!text.includes('【') || /\[(emphasis|highlight|word|number)\]/.test(text)) bad.push(`${lang}:${k}`);
      }
    }
  }
  expect(bad).toEqual([]);
});

test('splitLabel splits only when the first bracket closes at the very end', () => {
  const two = '框邊的線（hole）／外面那道細線（drawn）', after = 'a（上／左）的名字';
  expect(splitLabel(two)).toEqual({ name: two });
  expect(splitLabel(after)).toEqual({ name: after });
  expect(splitLabel('合計時間（秒；-1＝沒有）：小標換成合計')).toEqual({ name: '合計時間（秒；-1＝沒有）：小標換成合計' });
});

test('no English or Japanese name or hint has an unbalanced bracket', () => {
  const bad: string[] = [];
  const depth = (s: string, o: string, c: string) => { let d = 0; for (const ch of s) { if (ch === o) d++; if (ch === c) d--; if (d < 0) return -1; } return d; };
  for (const [lang, table] of [['en', PARAMS_EN], ['ja', PARAMS_JA]] as const) {
    for (const [k, e] of Object.entries(table as Record<string, { name: string; hint?: string }>)) {
      for (const s of [e.name, e.hint ?? '']) if (depth(s, '(', ')') !== 0 || depth(s, '（', '）') !== 0) bad.push(`${lang}:${k}`);
    }
  }
  expect(bad).toEqual([]);
});
