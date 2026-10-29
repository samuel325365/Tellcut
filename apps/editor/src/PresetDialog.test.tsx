// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PresetDialog } from './PresetDialog.tsx';
import { NewPresetDialog } from './presets/MinePreset.tsx';
import { setLang } from './i18n/lang.ts';
import { DICTS } from './i18n/index.ts';

afterEach(() => { localStorage.clear(); });

const TRAVEL: any = { id: 'travel', order: 1, mine: false, color: '#2f8cff', name: { zh: '旅行精華' }, summary: { zh: '把旅途片段剪成短片。' },
  fit: { zh: ['一堆旅途片段'] }, facts: { zh: ['9:16 直式', '30–150 秒'] }, poster: null, preview: null,
  styles: [{ id: 'map', name: { zh: '地圖路線' }, desc: { zh: '畫出路線' } }, { id: 'chat', name: { zh: '聊天對話框' }, desc: { zh: '對話框講故事' }, custom: true },
    { id: 'dump', name: { zh: '照片卡點' }, desc: { zh: '跟著鼓點' } }] };

test('the dialog shows the plain words, ticks styles and confirms them', async () => {
  const root = document.createElement('div'), used: string[][] = [];
  let closed = 0;
  await act(() => render(<PresetDialog preset={TRAVEL} styles={['dump']} fields={{}} onConfirm={(s) => used.push(s)} onClose={() => closed++} />, root));
  const d = root.querySelector<HTMLElement>('[data-preset-dialog]')!;
  for (const t of ['旅行精華', '把旅途片段剪成短片。', '9:16 直式', '30–150 秒', '一堆旅途片段']) expect(d.textContent).toContain(t);
  const boxes = [...d.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  expect(boxes.map((b) => [b.value, b.checked])).toEqual([['map', false], ['chat', false], ['dump', true]]);
  const rows = [...d.querySelectorAll<HTMLElement>('[data-style]')];
  expect(rows.map((r) => r.getAttribute('data-tip'))).toEqual(['畫出路線', '對話框講故事', '跟著鼓點']);
  expect(rows[1].textContent).toContain('需要現做，比較花時間');
  expect(rows[0].textContent).not.toContain('需要現做');
  expect(d.querySelector('[data-poster-fallback]')).not.toBeNull();
  expect(d.querySelector('[data-field]')).toBeNull();                            // no form, no examples
  expect(d.textContent).not.toContain(DICTS.zh['preset.examplesHead']);
  await act(() => { boxes[1].click(); boxes[2].click(); });
  await act(() => { boxes[0].click(); });
  await act(() => { d.querySelector<HTMLElement>('[data-confirm]')!.click(); });
  expect(used).toEqual([['map', 'chat']]);
  await act(() => { d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await act(() => { root.querySelector<HTMLElement>('.modal-back')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(closed).toBe(2);
});

test('the dialog plays the preview when there is one', async () => {
  const root = document.createElement('div');
  await act(() => render(<PresetDialog preset={{ ...TRAVEL, preview: '/api/presets/travel/preview.webm' }} styles={[]} onConfirm={() => {}} onClose={() => {}} />, root));
  const v = root.querySelector<HTMLVideoElement>('[data-preset-dialog] video')!;
  expect(v.getAttribute('src')).toBe('/api/presets/travel/preview.webm');
  expect([v.muted, v.loop, v.autoplay, v.hasAttribute('playsinline')]).toEqual([true, true, true, true]);
});

test('the dialog follows the language', async () => {
  const p: any = { ...TRAVEL, name: { ...TRAVEL.name, en: 'Travel Highlights' }, summary: { ...TRAVEL.summary, en: 'Cuts trip clips into a short.' },
    fit: { ...TRAVEL.fit, en: ['a pile of trip clips'] }, facts: { zh: ['9:16'], en: ['9:16 vertical'] },
    styles: TRAVEL.styles.map((s: any) => ({ ...s, name: { ...s.name, en: `${s.id} style` }, desc: { ...s.desc, en: `${s.id} desc` } })) };
  const root = document.createElement('div');
  setLang('en');
  await act(() => render(<PresetDialog preset={p} styles={[]} onConfirm={() => {}} onClose={() => {}} />, root));
  const d = root.querySelector<HTMLElement>('[data-preset-dialog]')!;
  for (const t of ['Travel Highlights', 'Cuts trip clips into a short.', 'a pile of trip clips', 'map style', 'chat style']) expect(d.textContent).toContain(t);
  expect([...d.querySelectorAll('[data-style]')].map((r) => r.getAttribute('data-tip'))).toEqual(['map desc', 'chat desc', 'dump desc']);
  expect(d.querySelector('[data-confirm]')!.textContent).toBe(DICTS.en['preset.confirm']);
  expect(d.querySelector('[data-confirm]')!.textContent).toBe('Confirm');
  expect(d.querySelector('[data-style="chat"] small')!.textContent).toBe(DICTS.en['preset.custom']);
  expect(d.textContent).not.toMatch(/[一-鿿]/);
});

test('a held-down Enter (key repeat) does not confirm; a fresh Enter does', async () => {
  const root = document.createElement('div'), used: string[][] = [];
  await act(() => render(<PresetDialog preset={TRAVEL} styles={['dump']} onConfirm={(s) => used.push(s)} onClose={() => {}} />, root));
  const d = root.querySelector<HTMLElement>('[data-preset-dialog]')!;
  const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
  await act(() => { d.dispatchEvent(held); });
  expect(used).toEqual([]);
  expect(held.defaultPrevented).toBe(true);
  await act(() => { d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  expect(used).toEqual([['dump']]);
});

const opt = (id: string, zh: string) => ({ id, name: { zh } });
const CUSTOM: any = { id: 'custom', order: 0, mine: false, color: '#888', name: { zh: '自定義' }, summary: { zh: '自己決定。' }, fit: {}, facts: {},
  poster: null, preview: null, styles: [], sources: [],
  fields: [
    { id: 'ratio', name: { zh: '比例' }, group: { zh: '畫面' }, options: [opt('9:16', '9:16 直式'), opt('1:1', '1:1 方形'), opt('4:5', '4:5 直式'), opt('16:9', '16:9 橫式')] },
    { id: 'framing', name: { zh: '構圖' }, group: { zh: '畫面' }, hint: { zh: '主要畫面怎麼擺' },
      options: [opt('full', '滿版'), opt('inset', '置中留邊'), opt('split', '上下分割'), opt('side', '左右並排'), opt('pip', '畫中畫')] },
    { id: 'length', name: { zh: '長度' }, group: { zh: '畫面' }, seconds: true, options: [opt('15', '15 秒'), opt('30', '30 秒')] },
    { id: 'pace', name: { zh: '節奏' }, group: { zh: '聲音' }, autoHint: { zh: '看素材決定' }, options: [{ ...opt('slow', '慢'), hint: { zh: '鏡頭久一點' } }, opt('fast', '快')] },
  ],
  examples: [{ zh: '復古底片感' }, { zh: '黑底白字' }] };

async function openCustom(fields: Record<string, string> = {}) {
  const root = document.createElement('div'), used: any[][] = [];
  await act(() => render(<PresetDialog preset={CUSTOM} styles={[]} fields={fields} onConfirm={(...a) => used.push(a)} onClose={() => {}} />, root));
  const d = root.querySelector<HTMLElement>('[data-preset-dialog]')!;
  const row = (id: string) => d.querySelector<HTMLElement>(`[data-field="${id}"]`)!;
  const select = (id: string) => row(id).querySelector<HTMLSelectElement>('select[data-field-select]')!;
  const choose = async (id: string, v: string) => { const s = select(id); s.value = v; await act(() => { s.dispatchEvent(new Event('change', { bubbles: true })); }); };
  const type = async (v: string) => { const i = row('length').querySelector<HTMLInputElement>('input[data-seconds]')!; i.value = v; await act(() => { i.dispatchEvent(new Event('input', { bubbles: true })); }); };
  const confirm = async () => { await act(() => { d.querySelector<HTMLElement>('[data-confirm]')!.click(); }); };
  return { d, row, select, choose, type, confirm, used };
}
const pressed = (el: Element) => el.getAttribute('aria-pressed') === 'true';

test('the form shows groups, short fields as buttons, long ones as a select, all on auto', async () => {
  const { d, row, select } = await openCustom();
  expect([...d.querySelectorAll('[data-field-group]')].map((g) => g.textContent)).toEqual(['畫面', '聲音']);
  const buttons = [...row('ratio').querySelectorAll('[data-option]')];
  expect(buttons.map((b) => b.getAttribute('data-option'))).toEqual(['auto', '9:16', '1:1', '4:5', '16:9']);
  expect(buttons.filter(pressed).map((b) => b.getAttribute('data-option'))).toEqual(['auto']);
  expect(buttons[0].textContent).toBe(DICTS.zh['preset.auto']);
  expect(select('framing').value).toBe('auto');
  expect(select('length').value).toBe('auto');                                  // it has "type your own": a select
  expect([...select('length').options].map((o) => o.value)).toEqual(['auto', '15', '30', 'own']);
  expect(row('framing').querySelector('[data-tip]')!.getAttribute('data-tip')).toBe('主要畫面怎麼擺');
  expect(d.querySelector('[data-style]')).toBeNull();
  // an option button (and Auto) may have its own tooltip
  expect([...row('pace').querySelectorAll('[data-option]')].map((b) => b.getAttribute('data-tip'))).toEqual(['看素材決定', '鏡頭久一點', null]);
});

test('confirm hands back only what was changed, and the picked examples', async () => {
  const { d, row, choose, confirm, used } = await openCustom();
  await act(() => { row('ratio').querySelector<HTMLElement>('[data-option="9:16"]')!.click(); });
  expect(pressed(row('ratio').querySelector('[data-option="9:16"]')!)).toBe(true);
  await choose('framing', 'split');
  await choose('framing', 'auto');
  const ex = [...d.querySelectorAll<HTMLElement>('[data-example]')];
  expect(d.textContent).toContain(DICTS.zh['preset.examplesHead']);
  expect(ex.map((e) => e.textContent)).toEqual(['復古底片感', '黑底白字']);
  await act(() => { ex[1].click(); });
  expect(pressed(ex[1])).toBe(true);
  await confirm();
  expect(used).toEqual([[[], { ratio: '9:16' }, ['黑底白字']]]);
});

test('own seconds: 5–600 whole seconds, else the field stays on auto', async () => {
  const { row, choose, type, confirm, used } = await openCustom();
  expect(row('length').querySelector('input[data-seconds]')).toBeNull();
  await choose('length', 'own');
  expect(row('length').querySelector('input[data-seconds]')).not.toBeNull();
  expect(row('length').textContent).toContain(DICTS.zh['preset.secondsRange']);
  await type('45'); await confirm();
  for (const v of ['', '4', '601', '3.5', '045']) { await type(v); await confirm(); }
  expect(used.map((u) => u[1])).toEqual([{ length: '45' }, {}, {}, {}, {}, { length: '45' }]);
});

test('opens with the fields it was given; examples always start unpicked', async () => {
  const { d, row, select } = await openCustom({ ratio: '1:1', length: '45', pace: 'fast' });
  expect([...row('ratio').querySelectorAll('[data-option]')].filter(pressed).map((b) => b.getAttribute('data-option'))).toEqual(['1:1']);
  expect(select('length').value).toBe('own');
  expect(row('length').querySelector<HTMLInputElement>('input[data-seconds]')!.value).toBe('45');
  expect([...d.querySelectorAll('[data-example]')].filter(pressed)).toEqual([]);
  const again = await openCustom({ length: '30' });
  expect(again.select('length').value).toBe('30');
});

test('Enter in a select or the seconds box does not confirm', async () => {
  const { d, row, select, choose, used } = await openCustom();
  await choose('length', 'own');
  const enter = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(() => { select('framing').dispatchEvent(enter()); });
  await act(() => { row('length').querySelector('input[data-seconds]')!.dispatchEvent(enter()); });
  expect(used).toEqual([]);
  await act(() => { d.dispatchEvent(enter()); });
  expect(used.length).toBe(1);
});

// ---------------------------------------------------------------- presets of the user's own (spec 2026-10-29-my-library §3.6, §3.7)
const MINE: any = { ...TRAVEL, id: 'my-food', mine: true, styles: [], name: { zh: '我的美食' }, summary: { zh: '小吃店探訪' }, fit: {}, facts: { zh: ['9:16'] },
  points: ['前 2 秒放最好看的一口', '字幕放中間'],
  uses: { fonts: ['Noto Serif TC'], colors: ['#e8590c'], score: { slug: 'jazz', name: '街頭爵士', gone: false }, blocks: [{ slug: 'chalk', name: '粉筆標題卡', thumb: null, gone: false }, { slug: 'stamp', name: '印章', thumb: null, gone: true }] } };
function presetApi() {
  const calls: any[] = [];
  return { calls, api: {
    savePreset: async (b: any) => { calls.push(['save', b]); return { ...MINE, id: 'my-x' }; },
    updatePreset: async (id: string, b: any) => { calls.push(['update', id, b]); return MINE; },
    deletePreset: async (id: string) => { calls.push(['delete', id]); return { ok: true }; },
    presetPoster: async (id: string) => { calls.push(['poster', id]); return MINE; },
    formPoints: async (b: any) => { calls.push(['points', b]); return { points: [{ text: '9:16 直式', prompt: 'Make it 9:16.' }, { text: '復古底片感', prompt: '復古底片感' }] }; },
  } };
}
const type = (el: Element | null, v: string) => act(() => { const e = el as HTMLInputElement; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); });
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const clickOn = (root: Element, sel: string) => act(async () => { root.querySelector<HTMLElement>(sel)!.click(); await new Promise((r) => setTimeout(r, 0)); });

test('a preset of the user’s own shows its points and what it uses, a deleted block marked', async () => {
  const root = document.createElement('div'), { api } = presetApi();
  await act(() => render(<PresetDialog preset={MINE} styles={[]} onConfirm={() => {}} onClose={() => {}} api={api} />, root));
  expect([...root.querySelectorAll('[data-preset-points-view] li')].map((x) => x.textContent)).toEqual(['前 2 秒放最好看的一口', '字幕放中間']);
  const uses = root.querySelector('[data-preset-uses]')!.textContent!;
  for (const x of ['Noto Serif TC', '街頭爵士', '粉筆標題卡', '印章', DICTS.zh['preset.gone']]) expect(uses).toContain(x);
  expect(root.querySelector('[data-use-block="stamp"]')!.className).toContain('gone');
  expect(root.querySelector('[data-preset-edit]')).not.toBeNull();
  // a repo preset has none of this
  const other = document.createElement('div');
  await act(() => render(<PresetDialog preset={TRAVEL} styles={[]} onConfirm={() => {}} onClose={() => {}} api={api} />, other));
  expect(other.querySelector('[data-preset-edit], [data-preset-points-view], [data-preset-save-form]')).toBeNull();
});

test('rename and delete change only that preset; deleting closes the dialog', async () => {
  const root = document.createElement('div'), { api, calls } = presetApi();
  let changed = 0, gone = 0, closed = 0;
  await act(() => render(<PresetDialog preset={MINE} styles={[]} onConfirm={() => {}} onClose={() => closed++} api={api} onChanged={() => changed++} onGone={() => gone++} />, root));
  await clickOn(root, '[data-preset-rename]');
  await type(root.querySelector('[data-preset-rename-input]'), '夜市');
  await clickOn(root, '[data-preset-rename-save]');
  expect(calls[0]).toEqual(['update', 'my-food', { name: '夜市', lang: 'zh' }]);
  expect(changed).toBe(1);
  await clickOn(root, '[data-preset-delete]');
  expect(root.querySelector('[data-preset-delete-confirm-box]')!.textContent).toContain('我的美食');
  await clickOn(root, '[data-preset-delete-confirm]');
  expect(calls[1]).toEqual(['delete', 'my-food']);
  expect([gone, closed]).toEqual([1, 1]);
});

test('edit: a point left alone is named by what it was, a changed one goes in the user’s words, a removed one is gone', async () => {
  const root = document.createElement('div'), { api, calls } = presetApi();
  await act(() => render(<PresetDialog preset={MINE} styles={[]} onConfirm={() => {}} onClose={() => {}} api={api} onChanged={() => {}} />, root));
  await clickOn(root, '[data-preset-edit]');
  const dlg = root.querySelector('[data-save-preset-dialog="edit"]')!;
  await type(dlg.querySelector('[data-preset-point="1"]'), '字幕放下面');
  await clickOn(dlg, '[data-preset-point-add]');
  await type(dlg.querySelector('[data-preset-point="2"]'), '不放價格');
  await clickOn(dlg, '[data-preset-point-remove="0"]');
  await act(() => { (dlg.querySelector('[data-bring="blocks"] input') as HTMLInputElement).click(); });
  await clickOn(dlg, '[data-preset-save]');
  expect(calls[0]).toEqual(['update', 'my-food', { name: '我的美食', summary: '小吃店探訪', lang: 'zh',
    points: [{ text: '字幕放下面', prompt: '字幕放下面' }, { text: '不放價格', prompt: '不放價格' }], include: { theme: true, score: true, blocks: false } }]);
  expect(root.querySelector('[data-save-preset-dialog]')).toBeNull();
});

test('the custom form opens the save dialog on its options as points; the user adds their own, and none at all cannot be saved', async () => {
  const CUSTOM: any = { ...TRAVEL, id: 'custom', styles: [], examples: [{ zh: '復古底片感' }],
    fields: [{ id: 'ratio', name: { zh: '比例' }, options: [{ id: '9:16', name: { zh: '9:16 直式' } }, { id: '16:9', name: { zh: '16:9 橫式' } }] }] };
  const root = document.createElement('div'), { api, calls } = presetApi();
  let changed = 0;
  await act(() => render(<PresetDialog preset={CUSTOM} styles={[]} onConfirm={() => {}} onClose={() => {}} api={api} onChanged={() => changed++} />, root));
  await clickOn(root, '[data-option="9:16"]');
  await clickOn(root, '[data-example]');
  await clickOn(root, '[data-preset-save-form]');
  await tick();
  expect(calls[0]).toEqual(['points', { fields: { ratio: '9:16' }, examples: ['復古底片感'], lang: 'zh' }]);
  const dlg = root.querySelector('[data-save-preset-dialog="save"]')!;
  expect([...dlg.querySelectorAll<HTMLInputElement>('[data-preset-points] input')].map((x) => x.value)).toEqual(['9:16 直式', '復古底片感']);
  expect(dlg.querySelector('[data-preset-only]')!.textContent).toBe(DICTS.zh['preset.pointsOnly']);
  await type(dlg.querySelector('[data-preset-name]'), '我的直式');
  await clickOn(dlg, '[data-preset-point-remove="1"]');
  await clickOn(dlg, '[data-preset-point-add]');
  await type(dlg.querySelector('[data-preset-point="1"]'), '每段不超過 3 秒');
  await clickOn(dlg, '[data-preset-save]');
  expect(calls[1]).toEqual(['save', { from: 'form', name: '我的直式', summary: '', color: '#4263eb', fields: { ratio: '9:16' }, lang: 'zh',
    points: [{ text: '9:16 直式', prompt: 'Make it 9:16.' }, { text: '每段不超過 3 秒', prompt: '每段不超過 3 秒' }] }]);
  expect(changed).toBe(1);
  expect(root.querySelector('[data-save-preset-dialog]')).toBeNull();
  // every point removed: nothing to save
  await clickOn(root, '[data-preset-save-form]');
  await tick();
  const again = root.querySelector('[data-save-preset-dialog="save"]')!;
  await type(again.querySelector('[data-preset-name]'), 'x');
  await clickOn(again, '[data-preset-point-remove="0"]');
  await clickOn(again, '[data-preset-point-remove="0"]');
  expect(again.querySelector<HTMLButtonElement>('[data-preset-save]')!.disabled).toBe(true);
});

test('a new preset from nothing starts on one empty point and saves only the user’s words', async () => {
  const root = document.createElement('div'), { api, calls } = presetApi();
  let saved = 0, closed = 0;
  await act(() => render(<NewPresetDialog api={api} onSaved={() => saved++} onClose={() => closed++} />, root));
  const dlg = root.querySelector('[data-save-preset-dialog="save"]')!;
  expect(dlg.querySelectorAll('[data-preset-points] li').length).toBe(1);
  await type(dlg.querySelector('[data-preset-name]'), '我的節奏');
  expect(dlg.querySelector<HTMLButtonElement>('[data-preset-save]')!.disabled).toBe(true);
  await type(dlg.querySelector('[data-preset-point="0"]'), '每段不超過 3 秒');
  await clickOn(dlg, '[data-preset-save]');
  expect(calls).toEqual([['save', { from: 'form', name: '我的節奏', summary: '', color: '#4263eb', fields: {}, lang: 'zh', points: [{ text: '每段不超過 3 秒', prompt: '每段不超過 3 秒' }] }]]);
  expect([saved, closed]).toEqual([1, 1]);
});
