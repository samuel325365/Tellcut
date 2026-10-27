// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PresetDialog } from './PresetDialog.tsx';
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
