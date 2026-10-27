// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { createRegistry, corePlugin } from '@tellcut/engine';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
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
