// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { createRegistry, corePlugin } from '@tellcut/engine';
import { fixture } from '@tellcut/engine/test-fixture';
import { createStore, initialState } from './store.ts';
import { PropertiesPanel } from './PropertiesPanel.tsx';

const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {},
  params: [{ key: 'mode', label: '模式', type: 'enum', options: ['a', 'b'], default: 'a' }, { key: 't', label: '時間點', type: 'json', default: {} }] }] } as any]);

function mount(selection: string[], notice = '', project = fixture()) {
  const store = createStore({ ...initialState('t'), project, selection, notice });
  const calls: any[] = [];
  const editor: any = { store, registry, update: (id: string, patch: any) => { calls.push(['update', id, patch]); return true; },
    updateParam: (id: string, k: string, v: unknown) => { calls.push(['param', id, k, v]); return true; },
    enterCrop: (w: unknown) => calls.push(['crop', w]), addCropKey: () => { calls.push(['addKey']); return true; },
    removeCropKey: (i: number) => { calls.push(['delKey', i]); return true; },
    setTransform: (id: string, t: any) => { calls.push(['transform', id, t]); return true; } };
  const root = document.createElement('div');
  document.body.appendChild(root);
  return { root, editor, calls, store };
}
const change = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };

test('a video clip shows its fields; a committed number becomes one update', async () => {
  const { root, editor, calls } = mount(['c2']);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const speed = root.querySelector<HTMLInputElement>('[data-field="speed"] input')!;
  expect(speed.value).toBe('2');
  change(speed, '0.5');
  expect(calls).toEqual([['update', 'c2', { speed: 0.5 }]]);
  expect(root.querySelector('[data-field="grade"] select')).not.toBeNull();
});

test('plugin params come from their definitions; broken JSON is not committed', async () => {
  const { root, editor, calls } = mount(['blk']);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  change(root.querySelector<HTMLSelectElement>('[data-param="mode"] select')!, 'b');
  const json = root.querySelector<HTMLTextAreaElement>('[data-param="t"] textarea')!;
  await act(() => change(json, '{ broken'));
  expect(calls).toEqual([['param', 'blk', 'mode', 'b']]);
  expect(root.querySelector('[data-param="t"]')!.textContent).toContain('JSON 格式錯誤');
});

test('several selected items, nothing selected and a refused edit each show a message', async () => {
  const a = mount(['c1', 'c2']);
  await act(() => render(<PropertiesPanel editor={a.editor} s={a.editor.store.get()} />, a.root));
  expect(a.root.textContent).toContain('已選取 2 個項目');
  const b = mount([], 'speed: Number must be greater than 0');
  await act(() => render(<PropertiesPanel editor={b.editor} s={b.editor.store.get()} />, b.root));
  expect(b.root.querySelector('[data-notice]')!.textContent).toContain('speed');
});

test('unparsed JSON stays with its item: selecting another item shows that item\'s value', async () => {
  const { root, editor } = mount(['blk']);
  const p = editor.store.get().project;
  p.tracks[0].items.push({ id: 'blk2', type: 'x.block', start: 7, end: 9, params: { t: { k: 2 } } });
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const ta = root.querySelector<HTMLTextAreaElement>('[data-param="t"] textarea')!;
  ta.value = '{ broken';
  await act(() => { ta.dispatchEvent(new Event('change', { bubbles: true })); });
  editor.store.set({ selection: ['blk2'] });
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const ta2 = root.querySelector<HTMLTextAreaElement>('[data-param="t"] textarea')!;
  expect(JSON.parse(ta2.value)).toEqual({ k: 2 });
  expect(root.querySelector('[data-param="t"]')!.textContent).not.toContain('JSON 格式錯誤');
});

test('a list a project gave a text param shows in its line form, is left alone until edited, and an edit stores a list again', async () => {
  const { root, editor, calls, store } = mount(['blk']);
  editor.registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {},
    params: [{ key: 'rows', label: '列', type: 'text', default: '' }, { key: 'nums', label: '數', type: 'string', default: '' }] }] } as any]);
  const blk = store.get().project!.tracks.flatMap((t: any) => t.items).find((i: any) => i.id === 'blk') as any;
  blk.params = { rows: [[0, 0, '05.26'], [2, 'all', '']], nums: [1, 2.5] };
  await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
  const rows = root.querySelector<HTMLTextAreaElement>('[data-param="rows"] textarea')!, nums = root.querySelector<HTMLInputElement>('[data-param="nums"] input')!;
  expect([rows.value, nums.value]).toEqual(['0|0|05.26\n2|all|', '1, 2.5']);
  expect(calls).toEqual([]);
  change(nums, '1, 3');
  change(rows, '0|0|05.26\n2|all|\n3|1|09.01');
  expect(calls).toEqual([['param', 'blk', 'nums', [1, 3]], ['param', 'blk', 'rows', [[0, 0, '05.26'], [2, 'all', ''], [3, 1, '09.01']]]]);
});

test('scene and overlay items have position and size fields in percent', async () => {
  const { root, editor, calls } = mount(['blk']);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const x = root.querySelector<HTMLInputElement>('[data-field="tx"] input')!;
  expect(x.value).toBe('0');
  change(x, '25');
  change(root.querySelector<HTMLInputElement>('[data-field="tscale"] input')!, '150');
  expect(calls).toEqual([['transform', 'blk', { x: 0.25, y: 0, scale: 1, ox: 0.5, oy: 0.5 }], ['transform', 'blk', { x: 0, y: 0, scale: 1.5, ox: 0.5, oy: 0.5 }]]);
  expect(root.querySelector('[data-transform-reset]')).toBeNull();
});

test('a moving item says so and can be stopped at its first place', async () => {
  const { root, editor, calls, store } = mount(['blk']);
  const p = store.get().project!, blk = p.tracks.flatMap((t: any) => t.items).find((i: any) => i.id === 'blk') as any;
  blk.transform = { x: 0.1, y: 0, scale: 1, ox: 0.5, oy: 0.5, keys: [{ t: 0, x: 0.1, y: 0, scale: 1 }, { t: 1, x: 0.2, y: 0, scale: 1 }] };
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  expect(root.querySelector('[data-transform-keys]')!.textContent).toContain('2 個關鍵格');
  root.querySelector<HTMLButtonElement>('[data-transform-keys-clear]')!.click();
  expect(calls.at(-1)).toEqual(['transform', 'blk', { ...blk.transform, keys: [] }]);
});

test('slide direction; the layer buttons step over the overlapping clip and are off when nothing overlaps that way', async () => {
  const { root, editor, calls, store } = mount(['c2']);
  const p: any = fixture(); p.tracks[1].items[1].start = 3.5; p.tracks[1].items[1].transitionIn = { type: 'slide', dur: 0.5, dir: 'u' };
  store.set({ project: p });
  editor.restack = (id: string, dir: string) => { calls.push(['restack', id, dir]); return true; };
  await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
  const dir = root.querySelector<HTMLSelectElement>('[data-field="transitionDir"] select')!;
  expect(dir.value).toBe('u');
  change(dir, 'r');
  const up = root.querySelector<HTMLButtonElement>('[data-restack="up"]')!, down = root.querySelector<HTMLButtonElement>('[data-restack="down"]')!;
  expect([up.disabled, down.disabled]).toEqual([true, false]);
  down.click();
  expect(calls).toEqual([['update', 'c2', { transitionIn: { type: 'slide', dur: 0.5, dir: 'r' } }], ['restack', 'c2', 'down']]);
  await act(() => render(<PropertiesPanel editor={editor} s={{ ...store.get(), selection: ['m1'] }} />, root));
  expect(root.querySelector('[data-restack]')).toBe(null);                 // sound has no layers
});
test('a photo hides the media-time fields; a clip with sound offers captions from its speech', async () => {
  const { root, editor, calls, store } = mount(['c1']);
  editor.speechCaptions = async (id: string) => { calls.push(['captions', id]); return true; };
  await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
  (root.querySelector('[data-speech-captions]') as HTMLElement).click();
  expect(calls.at(-1)).toEqual(['captions', 'c1']);
  const p: any = fixture(); p.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' }; p.tracks[1].items[0].source = 'ph';
  await act(() => render(<PropertiesPanel editor={editor} s={{ ...store.get(), project: p }} />, root));
  expect(['in', 'speed', 'freezeAt', 'interp'].map((k) => !!root.querySelector(`[data-field="${k}"]`))).toEqual([false, false, false, false]);
  expect(root.querySelector('[data-speech-captions]')).toBe(null);
});

test('a clip edits radius, stabilisation, easing, blur and shake', async () => {
  const { root, editor, calls } = mount(['c1']);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const field = (n: string) => root.querySelector<any>(`[data-field="${n}"] input, [data-field="${n}"] select`)!;
  change(field('radius'), '24');
  change(field('cropEase'), 'inOut');
  field('stabilize').click();
  root.querySelector<HTMLButtonElement>('[data-add-defocus]')!.click();
  root.querySelector<HTMLButtonElement>('[data-add-shake]')!.click();
  root.querySelector<HTMLButtonElement>('[data-crop-add]')!.click();
  expect(calls).toEqual([
    ['update', 'c1', { radius: 24 }],
    ['update', 'c1', { crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 2 }, ease: 'inOut' } }],
    ['update', 'c1', { stabilize: { smoothing: 20, zoom: 3 } }],
    ['update', 'c1', { defocus: { from: 0, to: 4, px: 8 } }],
    ['update', 'c1', { shake: [{ at: 0, dur: 0.4, px: 12, hz: 18 }] }],
    ['addKey'],
  ]);
});

test('existing keyframes, blur and shake show their fields', async () => {
  const { root, editor, calls, store } = mount(['c1']);
  const p = store.get().project!, c1 = (p.tracks.find((t) => t.id === 'v') as any).items[0];
  Object.assign(c1, { stabilize: { smoothing: 20, zoom: 3 }, defocus: { from: 0, to: 1, px: 2, px0: 16 }, shake: [{ at: 1, dur: 0.5, px: 9, hz: 18 }] });
  c1.crop.keys = [{ t: 1.5, x: 0.5, y: 0.5, zoom: 1.2 }];
  await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
  expect(root.querySelector('[data-crop="0"]')!.textContent).toBe('1.50s');
  root.querySelector<HTMLButtonElement>('[data-crop="0"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-crop-del="0"]')!.click();
  const input = (n: string) => root.querySelector<HTMLInputElement>(`[data-field="${n}"] input`)!;
  expect(input('stabSmoothing').value).toBe('20');
  expect(input('defocusPx0').value).toBe('16');
  change(input('shakePx-0'), '14');
  expect(calls).toEqual([['crop', 0], ['delKey', 0], ['update', 'c1', { shake: [{ at: 1, dur: 0.5, px: 14, hz: 18 }] }]]);
});

test('a shake added on a clip that hangs on another one lands at the playhead, in the clip’s own time', async () => {
  const p = fixture();
  (p.tracks[2].items as any[]).push({ id: 'b', source: 's', in: 0, speed: 1, start: 1, end: 3, parent: 'c2', crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const { root, editor, calls, store } = mount(['b'], '', p);
  store.set({ playhead: 6 });                       // c2 starts at 4, b 1 s into it
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  root.querySelector<HTMLButtonElement>('[data-add-shake]')!.click();
  expect(calls).toEqual([['update', 'b', { shake: [{ at: 1, dur: 0.4, px: 12, hz: 18 }] }]]);
});

test('a shake lands at the playhead as it is when clicked, not as it was at the panel’s last render (playback does not re-render it)', async () => {
  const { root, editor, calls, store } = mount(['c2']);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  store.set({ playhead: 5 });                       // c2 starts at 4; the panel still holds playhead 0
  root.querySelector<HTMLButtonElement>('[data-add-shake]')!.click();
  expect(calls.at(-1)[2].shake.at(-1).at).toBe(1);
});

test('a moving item (following a face) does not offer the block\u2019s own x and y: the path decides where it is', async () => {
  const { root, editor, store } = mount(['blk']);
  editor.registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '貼圖', kind: 'scene', build: () => null, draw: () => {},
    params: [{ key: 'x', label: 'x', type: 'number', default: 0.78 }, { key: 'y', label: 'y', type: 'number', default: 0.3 }, { key: 'size', label: '大小', type: 'number', default: 18 }] }] } as any]);
  const blk = store.get().project!.tracks.flatMap((t: any) => t.items).find((i: any) => i.id === 'blk') as any;
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  expect([...root.querySelectorAll<HTMLElement>('[data-param]')].map((e) => e.dataset.param)).toEqual(['x', 'y', 'size']);
  blk.transform = { x: 0.1, y: 0, scale: 1, ox: 0.78, oy: 0.3, keys: [{ t: 0, x: 0.1, y: 0, scale: 1 }, { t: 1, x: 0.2, y: 0, scale: 1 }] };
  await act(() => render(<PropertiesPanel editor={editor} s={{ ...editor.store.get() }} />, root));
  expect([...root.querySelectorAll<HTMLElement>('[data-param]')].map((e) => e.dataset.param)).toEqual(['size']);
});

test('property labels are English', async () => {
  const { root, editor } = mount(['blk']);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const labelOf = (n: string) => root.querySelector(`[data-field="${n}"] span`)!.textContent;
  expect([labelOf('label'), labelOf('start'), labelOf('end'), labelOf('tx'), labelOf('tscale')]).toEqual(['Label', 'Start (s)', 'End (s)', 'Position X (%)', 'Size (%)']);
  const clip = mount(['c2']);
  await act(() => render(<PropertiesPanel editor={clip.editor} s={clip.editor.store.get()} />, clip.root));
  expect(clip.root.querySelector('[data-restack="up"]')!.textContent).toBe('Move up');
  expect(clip.root.querySelector('[data-speech-captions]')!.textContent).toBe('Captions from speech');
  expect(clip.root.querySelector('[data-field="transition"] option[value="dissolve"]')!.textContent).toBe('Dissolve');
});

test('parameter names are English, their hints follow the language', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const { PARAMS_EN, PARAMS_JA } = await import('./i18n/params.ts');
  const blk = (m: ReturnType<typeof mount>) => m.editor.store.get().project.tracks.flatMap((t: any) => t.items).find((x: any) => x.id === 'blk');
  try {
    setLang('ja');
    const m = mount(['blk']);
    blk(m).type = 'core.title'; blk(m).params = {};
    await act(() => render(<PropertiesPanel editor={m.editor} s={m.editor.store.get()} />, m.root));
    const row = m.root.querySelector('[data-param="size"] span')!;
    expect(row.textContent).toBe(PARAMS_EN['core.title.size'].name);
    expect(row.getAttribute('data-tip')).toBe(PARAMS_JA['core.title.size'].hint);
    // the span keeps only the tooltip; the control itself is named "name: hint" for screen readers
    expect(row.getAttribute('aria-label')).toBeNull();
    expect(m.root.querySelector('[data-param="size"] input')!.getAttribute('aria-label')).toBe(`${PARAMS_EN['core.title.size'].name}: ${PARAMS_JA['core.title.size'].hint}`);
    // a project effect's parameters show their own label
    m.editor.registry = createRegistry([{ id: 'fx', items: [{ type: 'fx.thing', label: 'x', kind: 'scene', build: () => null, draw: () => {}, params: [{ key: 'n', label: '數量（個）', type: 'number', default: 1 }] }] } as any]);
    blk(m).type = 'fx.thing';
    await act(() => render(<PropertiesPanel editor={m.editor} s={{ ...m.editor.store.get() }} />, m.root));
    expect(m.root.querySelector('[data-param="n"] span')!.textContent).toBe('數量（個）');
  } finally { setLang('zh'); localStorage.clear(); }
});

test('a block with templates gets a Template row at the top of its params: an action that always shows its placeholder', async () => {
  const reg = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {},
    params: [{ key: 'mode', label: '模式', type: 'enum', options: ['a', 'b'], default: 'a' }],
    templates: [{ id: 'big-b', label: '大大的 B', doc: '開場用', params: { mode: 'b' } }] }] } as any]);
  const { root, editor, calls } = mount(['blk']);
  editor.registry = reg;
  editor.applyBlockTemplate = (id: string, x: string) => { calls.push(['template', id, x]); return true; };
  editor.lookThumb = (type: string, kind: string, key: string) => (type === 'x.block' && kind === 'template' && key === 'big-b' ? '/t/big-b.png' : undefined);
  await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
  const row = root.querySelector('[data-block-templates="x.block"] [data-field="template"]')!, picker = () => row.querySelector<HTMLButtonElement>('[data-look-picker="template"]')!;
  // before the first parameter field
  expect(row.compareDocumentPosition(root.querySelector('[data-param="mode"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(row.querySelector('span')!.textContent).toBe('Template');
  expect(row.querySelector('select')).toBeNull();
  expect(picker().textContent).toContain('套用範本…');
  await act(() => picker().click());
  const tile = row.querySelector<HTMLElement>('[data-look-tile="big-b"]')!;
  expect([tile.textContent, tile.querySelector('img')!.getAttribute('src'), tile.getAttribute('aria-pressed')]).toEqual(['大大的 B', '/t/big-b.png', 'false']);
  await act(() => tile.click());
  expect(calls).toEqual([['template', 'blk', 'big-b']]);
  // an action, not a state: back to the placeholder, no tile marked
  await act(() => render(<PropertiesPanel editor={editor} s={{ ...editor.store.get() }} />, root));
  expect(picker().textContent).toContain('套用範本…');
  expect(row.querySelector('[data-look-grid]')).toBeNull();
  // a block without templates has no row
  const plain = mount(['blk']);
  await act(() => render(<PropertiesPanel editor={plain.editor} s={plain.editor.store.get()} />, plain.root));
  expect(plain.root.querySelector('[data-field="template"]')).toBeNull();
});

describe('a block whose looks one param picks (variants)', () => {
  const looks = () => createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '區塊', kind: 'scene', build: () => null, draw: () => {},
    params: [{ key: 'mode', label: '模式', type: 'enum', options: ['a', 'b'], default: 'a' }, { key: 't', label: '時間點', type: 'json', default: {} }],
    variants: { param: 'mode', list: [{ value: 'a', label: '甲', doc: '甲的樣子' }, { value: 'b', label: '乙', doc: '乙的樣子' }] } }] } as any]);
  const blkOf = (store: any) => store.get().project.tracks.flatMap((t: any) => t.items).find((i: any) => i.id === 'blk');

  test('its field is a picker of the looks, asks for the gallery’s pictures, and a picked tile sets the param', async () => {
    const { root, editor, calls } = mount(['blk']);
    editor.registry = looks();
    editor.loadBlockThumbs = async () => { calls.push(['thumbs']); };
    editor.lookThumb = (type: string, kind: string, key: string) => (type === 'x.block' && kind === 'variant' && key === 'b' ? '/t/b.png' : undefined);
    await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
    expect(calls).toEqual([['thumbs']]);
    const field = root.querySelector('[data-param="mode"]')!;
    expect(field.querySelector('select')).toBeNull();
    const picker = field.querySelector<HTMLButtonElement>('[data-look-picker]')!;
    expect(field.querySelector('[data-field="mode"] > span')!.textContent).toBe('模式');   // x.block has no English name: its label as written
    expect(picker.textContent).toContain('甲');
    await act(() => picker.click());
    expect(field.querySelector('[data-look-tile="a"]')!.classList.contains('on')).toBe(true);
    expect(field.querySelector('[data-look-tile="a"] img')).toBeNull();
    const b = field.querySelector<HTMLElement>('[data-look-tile="b"]')!;
    expect(b.querySelector('img')!.getAttribute('src')).toBe('/t/b.png');
    await act(() => b.click());
    expect(calls.at(-1)).toEqual(['param', 'blk', 'mode', 'b']);
    // the other params keep their own fields
    expect(root.querySelector('[data-param="t"] textarea')).not.toBeNull();
  });

  test('a look with a crop shows only that part in the closed row and its tile, whole in the larger picture under the grid', async () => {
    const { root, editor } = mount(['blk']);
    editor.registry = looks();
    editor.lookThumb = (_type: string, _kind: string, key: string) => `/t/${key}.png`;
    editor.lookCrop = (type: string, kind: string, key: string) => (type === 'x.block' && kind === 'variant' && key === 'a' ? { box: [0.5, 0, 0.5, 0.2812], ratio: 9 / 16 } : undefined);
    await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
    const field = root.querySelector('[data-param="mode"]')!, picker = field.querySelector<HTMLButtonElement>('[data-look-picker]')!;
    expect(picker.querySelector('[data-cropped] img')!.getAttribute('src')).toBe('/t/a.png');
    await act(() => picker.click());
    expect(field.querySelector('[data-look-tile="a"] [data-cropped] img')!.getAttribute('src')).toBe('/t/a.png');
    expect(field.querySelector('[data-look-tile="b"] [data-cropped]')).toBeNull();
    expect(field.querySelector('[data-look-tile="b"] img')!.getAttribute('src')).toBe('/t/b.png');
    // the larger picture of the one in use: whole
    const shown = field.querySelector('[data-look-shown="a"]')!;
    expect([shown.querySelector('[data-cropped]'), shown.querySelector('img')!.getAttribute('src')]).toEqual([null, '/t/a.png']);
  });

  test('a value the list does not have (an old project’s) shows as it is', async () => {
    const { root, editor, store } = mount(['blk']);
    editor.registry = looks();
    blkOf(store).params = { mode: 'zzz' };
    await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
    expect(root.querySelector('[data-param="mode"] [data-look-picker]')!.textContent).toContain('zzz');
  });

  test('a long list gets a search box that also finds a look by its aliases and English name (common.pen: 心形 → heart)', async () => {
    const kinds = ['circle', 'arrow', 'underline', 'check', 'cross', 'heart', 'star', 'stars', 'burst', 'rays'];
    const reg = createRegistry([corePlugin, { id: 'common', items: [{ type: 'common.pen', label: '手繪標記', kind: 'overlay', build: () => null, draw: () => {},
      params: [{ key: 'kind', label: '種類', type: 'enum', options: kinds, default: 'circle' }],
      variants: { param: 'kind', list: kinds.map((k) => ({ value: k, label: `樣子 ${k}`, doc: '一個記號' })) } }] } as any]);
    const { root, editor, store, calls } = mount(['blk']);
    editor.registry = reg;
    Object.assign(blkOf(store), { type: 'common.pen', params: {} });
    await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
    const field = root.querySelector('[data-param="kind"]')!;
    await act(() => field.querySelector<HTMLButtonElement>('[data-look-picker]')!.click());
    const box = field.querySelector<HTMLInputElement>('[data-look-search]')!;
    const keys = () => [...field.querySelectorAll<HTMLElement>('[data-look-tile]')].map((x) => x.dataset.lookTile);
    const typeIn = (v: string) => act(() => { box.value = v; box.dispatchEvent(new Event('input', { bubbles: true })); });
    await typeIn('心形');   // only an alias says it (SEARCH_ALIASES['common.pen@heart'])
    expect(keys()).toEqual(['heart']);
    await typeIn('spiky');   // only the English name says it (blocks.en.ts: Spiky halo)
    expect(keys()).toEqual(['burst']);
    await act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(calls.at(-1)).toEqual(['param', 'blk', 'kind', 'burst']);
  });
});

test('the transition menu lists every type, cut first; direction only for the types that read it, the centre only for iris', async () => {
  const { TRANSITION_TYPES } = await import('@tellcut/engine');
  const { root, editor, store } = mount(['c2']);
  await act(() => render(<PropertiesPanel editor={editor} s={store.get()} />, root));
  const opts = [...root.querySelectorAll<HTMLOptionElement>('[data-field="transition"] option')];
  expect(opts.map((o) => o.value)).toEqual([...TRANSITION_TYPES]);
  expect(opts.slice(0, 4).map((o) => o.textContent)).toEqual(['Cut', 'Dissolve', 'Slide', 'Wipe']);
  const shown = async (type: string) => {
    const p: any = store.get().project; p.tracks[1].items[1].transitionIn = { type, dur: 0.5 };
    await act(() => render(<PropertiesPanel editor={editor} s={{ ...store.get() }} />, root));
    return ['transitionDir', 'transitionX', 'transitionY'].filter((n) => root.querySelector(`[data-field="${n}"]`));
  };
  for (const type of ['slide', 'wipe', 'bars', 'push', 'whip']) expect(await shown(type)).toEqual(['transitionDir']);
  expect(await shown('iris')).toEqual(['transitionX', 'transitionY']);
  for (const type of ['dissolve', 'clock', 'zoom', 'blur', 'dip', 'flash']) expect(await shown(type)).toEqual([]);
  expect(root.querySelector('[data-field="transitionDir"] span')).toBe(null);
  await shown('wipe');
  expect(root.querySelector('[data-field="transitionDir"] span')!.textContent).toBe('Direction');
});

test('a new transition type keeps the length, keeps dir where the new type reads it and drops what it does not; the centre is one update', async () => {
  const { root, editor, calls, store } = mount(['c2']);
  const set = async (tr: any) => { (store.get().project as any).tracks[1].items[1].transitionIn = tr; await act(() => render(<PropertiesPanel editor={editor} s={{ ...store.get() }} />, root)); };
  const pick = (v: string) => change(root.querySelector<HTMLSelectElement>('[data-field="transition"] select')!, v);
  await set({ type: 'slide', dur: 0.8, dir: 'u' });
  pick('push'); pick('iris'); pick('cut');
  await set({ type: 'iris', dur: 0.6, x: 0.2, y: 0.7 });
  pick('wipe'); pick('iris');
  await set(undefined);
  pick('whip');
  expect(calls.map((c) => c[2].transitionIn)).toEqual([
    { type: 'push', dur: 0.8, dir: 'u' }, { type: 'iris', dur: 0.8 }, undefined,
    { type: 'wipe', dur: 0.6, dir: 'l' }, { type: 'iris', dur: 0.6, x: 0.2, y: 0.7 },
    { type: 'whip', dur: 0.5, dir: 'l' }]);
  calls.length = 0;
  await set({ type: 'iris', dur: 0.6, x: 0.2 });
  expect(root.querySelector<HTMLInputElement>('[data-field="transitionY"] input')!.value).toBe('0.5');
  change(root.querySelector<HTMLInputElement>('[data-field="transitionY"] input')!, '0.3');
  change(root.querySelector<HTMLInputElement>('[data-field="transitionX"] input')!, '');
  change(root.querySelector<HTMLInputElement>('[data-field="transitionY"] input')!, '1.4');
  expect(calls).toEqual([['update', 'c2', { transitionIn: { type: 'iris', dur: 0.6, x: 0.2, y: 0.3 } }], ['update', 'c2', { transitionIn: { type: 'iris', dur: 0.6 } }],
    ['update', 'c2', { transitionIn: { type: 'iris', dur: 0.6, x: 0.2, y: 1 } }]]);
});

test('a transition drawn as a dissolve says so under the menu, and why, in the UI language', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const { root, editor, store } = mount(['c2']);
  const note = async (tr: any, o: any = {}, before: any = {}) => {
    const p: any = store.get().project, c1 = p.tracks[1].items[0], c2 = p.tracks[1].items[1];
    delete c2.shape; c2.frame = [0, 0, 1, 1]; c1.frame = [0, 0, 1, 1]; c2.start = 3.5;
    Object.assign(c2, o, { transitionIn: tr }); Object.assign(c1, before);
    await act(() => render(<PropertiesPanel editor={editor} s={{ ...store.get() }} />, root));
    const el = root.querySelector<HTMLElement>('[data-transition-note]');
    return el && [el.dataset.transitionNote, el.textContent];
  };
  try {
    setLang('en');
    const shape = { shape: [[0, 0], [1, 0], [1, 1], [0, 1]] };
    expect(await note({ type: 'iris', dur: 0.5 }, shape)).toEqual(['shape', 'Shown as a dissolve: this clip is cut to a shape, and the iris needs its outline.']);
    expect((await note({ type: 'push', dur: 0.5, dir: 'l' }, { frame: [0, 0, 0.5, 1] }))![0]).toBe('frame');
    expect((await note({ type: 'zoom', dur: 0.5 }, {}, { frame: [0.5, 0, 0.5, 1] }))![0]).toBe('from');      // linked: the overlap is 0.5 s
    expect(await note({ type: 'zoom', dur: 0.3 }, {}, { frame: [0.5, 0, 0.5, 1] })).toBe(null);           // not linked: the previous frame does not matter
    expect(await note({ type: 'flash', dur: 0.5 }, shape)).toBe(null);
    expect(await note({ type: 'whip', dur: 0.5, dir: 'r' }, shape)).toBe(null);
    setLang('zh');
    expect((await note({ type: 'wipe', dur: 0.5 }, shape))![1]).toContain('擦除');
  } finally { setLang('zh'); localStorage.clear(); }
});

describe('the picture window', () => {
  const clipOf = (store: any, id = 'c1') => store.get().project.tracks.flatMap((t: any) => t.items).find((i: any) => i.id === id);
  const show = async (m: ReturnType<typeof mount>, patch: Record<string, unknown> = {}) => {
    Object.assign(clipOf(m.store), patch);
    await act(() => render(<PropertiesPanel editor={m.editor} s={{ ...m.store.get() }} />, m.root));
  };
  const input = (m: ReturnType<typeof mount>, n: string) => m.root.querySelector<any>(`[data-field="${n}"] input, [data-field="${n}"] select, [data-field="${n}"] textarea`);

  test('the frame: X, Y, W, H kept inside the picture, the typed number kept (a position shrinks the window, a size moves it in); Whole frame puts it back', async () => {
    const m = mount(['c1']);
    await show(m, { frame: [0.1, 0.2, 0.5, 0.5] });
    expect(['frameX', 'frameY', 'frameW', 'frameH'].map((n) => input(m, n).value)).toEqual(['0.1', '0.2', '0.5', '0.5']);
    expect(m.root.querySelector('[data-field="frameX"] span')!.textContent).toBe('Frame X');
    change(input(m, 'frameX'), '0.3');
    change(input(m, 'frameX'), '0.9');           // the window shrinks to stay inside the picture
    change(input(m, 'frameW'), '0.95');          // a wider window moves back in
    change(input(m, 'frameH'), '0');             // never 0
    change(input(m, 'frameY'), '');              // an emptied box changes nothing
    m.root.querySelector<HTMLButtonElement>('[data-frame-whole]')!.click();
    expect(m.calls).toEqual([
      ['update', 'c1', { frame: [0.3, 0.2, 0.5, 0.5] }], ['update', 'c1', { frame: [0.9, 0.2, 0.1, 0.5] }],
      ['update', 'c1', { frame: [0.05, 0.2, 0.95, 0.5] }], ['update', 'c1', { frame: [0.1, 0.2, 0.5, 0.01] }],
      ['update', 'c1', { frame: [0, 0, 1, 1] }]]);
    await show(m, { frame: [0, 0, 1, 1] });
    expect(m.root.querySelector<HTMLButtonElement>('[data-frame-whole]')!.disabled).toBe(true);
  });

  test('the shape menu: None, the named shapes in English, a type with its defaults; None clears it', async () => {
    const { SHAPE_TYPES } = await import('@tellcut/engine');
    const m = mount(['c1']);
    await show(m);
    const opts = [...m.root.querySelectorAll<HTMLOptionElement>('[data-field="shape"] option')];
    expect(opts.map((o) => o.value)).toEqual(['', ...SHAPE_TYPES]);
    expect(opts.map((o) => o.textContent).slice(0, 4)).toEqual(['None', 'Circle', 'Ellipse', 'Arch']);
    expect(input(m, 'shape').value).toBe('');
    expect(m.root.querySelector('[data-shape-params]')).toBeNull();
    change(input(m, 'shape'), 'star');
    change(input(m, 'shape'), 'text');
    await show(m, { shape: { type: 'circle' } });
    expect(m.root.querySelector('[data-shape-params]')).toBeNull();     // a circle has no parameters
    change(input(m, 'shape'), '');
    expect(m.calls).toEqual([['update', 'c1', { shape: { type: 'star' } }], ['update', 'c1', { shape: { type: 'text', text: '你好' } }], ['update', 'c1', { shape: undefined }]]);
  });

  test('a shape shows its own parameters only, as the field each kind needs; a number is clamped, emptied puts the default back', async () => {
    const { SHAPE_PARAMS } = await import('@tellcut/engine');
    const m = mount(['c1']);
    const params = () => [...m.root.querySelectorAll<HTMLElement>('[data-shape-params] [data-field]')].map((e) => e.dataset.field);
    for (const type of ['star', 'ngon', 'stamp', 'bubble', 'blob', 'torn', 'brush', 'slats', 'text'] as const) {
      await show(m, { shape: type === 'text' ? { type, text: 'ROMA' } : { type } });
      expect(params()).toEqual(SHAPE_PARAMS[type].map((p) => `shape-${p.key}`));
    }
    await show(m, { shape: { type: 'star', points: 7 } });
    expect([input(m, 'shape-points').value, input(m, 'shape-inner').value, input(m, 'shape-round').value]).toEqual(['7', '0.45', '0']);
    expect(m.root.querySelector('[data-field="shape-inner"] span')!.textContent).toBe('Inner radius');
    m.calls.length = 0;
    change(input(m, 'shape-points'), '40');
    change(input(m, 'shape-inner'), '0.6');
    change(input(m, 'shape-points'), '');
    change(input(m, 'shape-round'), '2.5');
    expect(m.calls.map((c) => c[2].shape)).toEqual([{ type: 'star', points: 24 }, { type: 'star', points: 7, inner: 0.6 }, { type: 'star' }, { type: 'star', points: 7, round: 1 }]);
    m.calls.length = 0;
    await show(m, { shape: { type: 'bubble' } });
    expect(input(m, 'shape-tail').value).toBe('bottom-left');
    expect(m.root.querySelector('[data-field="shape-tail"] option[value="top-right"]')!.textContent).toBe('Top right');
    change(input(m, 'shape-tail'), 'top');
    await show(m, { shape: { type: 'text', text: 'ROMA' } });
    change(input(m, 'shape-text'), '  CIAO \r\n\n ROMA ');
    change(input(m, 'shape-font'), 'body');
    await show(m, { shape: { type: 'torn', sides: 'tb' } });
    const edge = (c: string) => m.root.querySelector<HTMLInputElement>(`[data-field="shape-sides"] [data-edge="${c}"] input`)!;
    expect(['t', 'b', 'l', 'r'].map((c) => edge(c).checked)).toEqual([true, true, false, false]);
    edge('r').checked = true; edge('r').dispatchEvent(new Event('change'));
    edge('t').checked = false; edge('t').dispatchEvent(new Event('change'));
    await show(m, { shape: { type: 'torn', sides: 'l' } });
    expect(edge('l').disabled).toBe(true);                               // the last torn edge stays
    expect(m.calls.map((c) => c[2].shape)).toEqual([{ type: 'bubble', tail: 'top' }, { type: 'text', text: 'CIAO\nROMA' }, { type: 'text', text: 'ROMA', font: 'body' },
      { type: 'torn', sides: 'tbr' }, { type: 'torn', sides: 'b' }]);
  });

  test('a polygon shows as Custom, not editable; choosing another shape replaces it', async () => {
    const m = mount(['c1']);
    await show(m, { shape: [[0, 0], [1, 0.1], [0.9, 1], [0, 1]] });
    expect(input(m, 'shape').value).toBe('custom');
    expect(m.root.querySelector('[data-field="shape"] option[value="custom"]')!.textContent).toBe('Custom');
    expect(m.root.querySelector('[data-shape-custom]')).not.toBeNull();
    expect(m.root.querySelector('[data-shape-params]')).toBeNull();
    change(input(m, 'shape'), 'custom');
    change(input(m, 'shape'), 'heart');
    expect(m.calls).toEqual([['update', 'c1', { shape: { type: 'heart' } }]]);
    await show(m, { shape: undefined });
    expect(m.root.querySelector('[data-field="shape"] option[value="custom"]')).toBeNull();
  });

  test('outline and shadow, with or without a shape: on with the defaults, their settings, off', async () => {
    const m = mount(['c1']);
    await show(m);
    expect(m.root.querySelector('[data-field="outlineWidth"]')).toBeNull();
    expect(m.root.querySelector('[data-field="shadowBlur"]')).toBeNull();
    input(m, 'outline').click();
    input(m, 'shadow').click();
    await show(m, { outline: { width: 8, color: '#ffffff' }, shadow: true });
    expect([input(m, 'outlineWidth').value, input(m, 'outlineColor').value, input(m, 'shadowBlur').value, input(m, 'shadowY').value, input(m, 'shadowOpacity').value])
      .toEqual(['8', '#ffffff', '30', '12', '0.45']);
    change(input(m, 'outlineWidth'), '4');
    change(input(m, 'outlineColor'), '#ff0000');
    change(input(m, 'shadowBlur'), '50');
    change(input(m, 'shadowOpacity'), '3');
    await show(m, { shadow: { blur: 50 } });
    change(input(m, 'shadowBlur'), '');                                  // nothing of its own left: the default shadow
    input(m, 'outline').click();
    input(m, 'shadow').click();
    expect(m.calls.map((c) => c[2])).toEqual([
      { outline: { width: 8, color: '#ffffff' } }, { shadow: true },
      { outline: { width: 4, color: '#ffffff' } }, { outline: { width: 8, color: '#ff0000' } }, { shadow: { blur: 50 } }, { shadow: { opacity: 1 } },
      { shadow: true }, { outline: undefined }, { shadow: undefined }]);
  });

  test('the panel runs Frame, Shape and its parameters, Outline, Shadow, Corner radius; a named shape turns the radius off and says why', async () => {
    const { setLang } = await import('./i18n/lang.ts');
    try {
      setLang('en');
      const m = mount(['c1']);
      await show(m, { shape: { type: 'star' }, outline: {}, shadow: true, radius: 12 });
      const order = [...m.root.querySelectorAll<HTMLElement>('[data-group="window"] [data-field]')].map((e) => e.dataset.field);
      expect(order).toEqual(['frameX', 'frameY', 'frameW', 'frameH', 'shape', 'shape-points', 'shape-inner', 'shape-round', 'outline', 'outlineWidth', 'outlineColor',
        'shadow', 'shadowBlur', 'shadowY', 'shadowOpacity', 'radius']);
      expect(input(m, 'radius').disabled).toBe(true);
      expect(m.root.querySelector('[data-field="radius"] span')!.getAttribute('data-tip')).toContain('Not used with a shape');
      await show(m, { shape: [[0, 0], [1, 0], [1, 1]] });                  // a polygon keeps its radius, as it always has
      expect(input(m, 'radius').disabled).toBe(false);
      await show(m, { shape: undefined });
      expect(input(m, 'radius').disabled).toBe(false);
      expect(m.root.querySelector('[data-field="radius"] span')!.getAttribute('data-tip')).toBeNull();
    } finally { setLang('zh'); localStorage.clear(); }
  });

  test('a named shape still gets the note that its reveal is drawn as a dissolve', async () => {
    const m = mount(['c2']);
    Object.assign(clipOf(m.store, 'c2'), { start: 3.5, transitionIn: { type: 'wipe', dur: 0.5, dir: 'l' }, shape: { type: 'circle' } });
    await act(() => render(<PropertiesPanel editor={m.editor} s={{ ...m.store.get() }} />, m.root));
    expect(m.root.querySelector<HTMLElement>('[data-transition-note]')!.dataset.transitionNote).toBe('shape');
  });

  test('every shape parameter has a hint in each language', async () => {
    const { SHAPE_PARAMS, SHAPE_TYPES } = await import('@tellcut/engine');
    const { DICTS } = await import('./i18n/index.ts');
    const { paramHintKey } = await import('./WindowFields.tsx');
    for (const type of SHAPE_TYPES) for (const p of SHAPE_PARAMS[type]) for (const lang of ['zh', 'en', 'ja'] as const)
      expect(DICTS[lang][paramHintKey(type, p.key)], `${lang} ${type}.${p.key}`).toBeTruthy();
  });
});

test('an unset field shows what the block really draws with (its defaultsFor, e.g. a mode\'s own colour); setting writes, clearing goes back', async () => {
  const leaf = { type: 'x.leaf', label: '葉', kind: 'overlay', build: () => null, draw: () => {},
    // like common.progress's vine: its own green and thickness where the item sets none, over the theme's accent and the ParamDef default
    defaultsFor: (set: Record<string, unknown>) => (set.mode === 'vine' ? { color: '#4caf50', thickness: 16 } : {}),
    params: [{ key: 'mode', label: '模式', type: 'enum', options: ['bar', 'vine'], default: 'bar' }, { key: 'color', label: '顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
      { key: 'thickness', label: '粗細', type: 'number', default: 12 }] };
  const reg = createRegistry([corePlugin, { id: 'x', items: [leaf] } as any]);
  const shown = async (params: Record<string, unknown>) => {
    const project = fixture();
    (project.tracks.find((tr) => tr.id === 'sc')!.items[0] as any).type = 'x.leaf';
    (project.tracks.find((tr) => tr.id === 'sc')!.items[0] as any).params = params;
    const { root, editor, calls } = mount(['blk'], '', project);
    editor.registry = reg;
    await act(() => render(<PropertiesPanel editor={editor} s={editor.store.get()} />, root));
    const color = root.querySelector<HTMLInputElement>('[data-param="color"] input')!, thick = root.querySelector<HTMLInputElement>('[data-param="thickness"] input')!;
    return { color, thick, calls };
  };
  const vine = await shown({ mode: 'vine' });
  expect([vine.color.value, vine.thick.value]).toEqual(['#4caf50', '16']);
  // setting writes the value; an emptied number goes back to unset (updateParam's undefined), which shows the mode's 16 again
  change(vine.color, '#123456');
  change(vine.thick, '');
  expect(vine.calls).toEqual([['param', 'blk', 'color', '#123456'], ['param', 'blk', 'thickness', undefined]]);
  // a value the item sets wins; another mode shows the theme's accent and the ParamDef default as before
  const own = await shown({ mode: 'vine', color: '#abcdef' });
  expect(own.color.value).toBe('#abcdef');
  const bar = await shown({ mode: 'bar' });
  expect([bar.color.value, bar.thick.value]).toEqual(['#ff4d4f', '12']);
});
