// @vitest-environment jsdom
import { options, render } from 'preact';
import { act } from 'preact/test-utils';
import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { createStore, initialState } from '../store.ts';
import { Timeline } from './Timeline.tsx';

function mount(patch = {}) {
  // the geometry assertions below are in standard track heights
  const store = createStore({ ...initialState('t'), project: fixture(), pps: 50, scroll: 0, layout: { ...initialState('t').layout, trackSize: 'standard' as const }, ...patch });
  const calls: any[] = [];
  const editor: any = { store, seek: (t: number) => calls.push(['seek', t]), select: (ids: string[]) => calls.push(['select', ids]),
    setView: (v: any) => store.set(v), beginDrag() {}, dragTo() {}, endDrag() {} };
  const root = document.createElement('div');
  document.body.appendChild(root);
  return { root, editor, calls, store };
}

test('renders every item at its absolute time with edges and the playhead', async () => {
  const { root, editor } = mount({ playhead: 2 });
  await act(() => render(<Timeline editor={editor} />, root));
  expect(root.querySelectorAll('[data-item-id]').length).toBe(7);
  const c2 = root.querySelector<HTMLElement>('[data-item-id="c2"]')!;
  expect([c2.style.left, c2.style.width]).toEqual(['200px', '200px']);
  expect(root.querySelector<HTMLElement>('[data-item-id="tap"]')!.style.left).toBe('125px');
  expect(c2.querySelectorAll('[data-edge]').length).toBe(2);
  expect(root.querySelector<HTMLElement>('[data-playhead]')!.style.left).toBe(`${176 + 100}px`);
});

test('clicking the ruler seeks; selected items are marked', async () => {
  const { root, editor, calls } = mount({ selection: ['c1'] });
  await act(() => render(<Timeline editor={editor} />, root));
  const ruler = root.querySelector<HTMLElement>('[data-ruler]')!;
  ruler.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 176 + 150 }));
  expect(calls.find((c) => c[0] === 'seek')![1]).toBeCloseTo(3);
  expect(root.querySelector('[data-item-id="c1"]')!.classList.contains('sel')).toBe(true);
});

test('moving the playhead does not re-render the whole timeline', async () => {
  const { root, editor, store } = mount();
  await act(() => render(<Timeline editor={editor} />, root));
  let renders = 0;
  const prev = (options as any).diffed;
  (options as any).diffed = (v: any) => { if (v.type === Timeline) renders++; prev?.(v); };
  for (let i = 1; i <= 5; i++) await act(() => store.set({ playhead: i }));
  (options as any).diffed = prev;
  expect(renders).toBe(0);
  expect(root.querySelector<HTMLElement>('[data-playhead]')!.style.left).toBe(`${176 + 250}px`);
});

test('double-clicking an envelope point removes it; dragging a fade handle previews then commits', async () => {
  const { root, editor } = mount({ selection: ['m1'] });
  const live: any[] = [];
  editor.apply = (r: any) => { live.push(['apply', r]); return true; };
  editor.livePreview = (r: any) => live.push(['preview', r]);
  editor.commitLive = () => live.push(['commit']);
  await act(() => render(<Timeline editor={editor} />, root));
  const pt = root.querySelector('[data-item-id="m1"] [data-env-index="1"]')!;
  pt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(live[0][0]).toBe('apply');
  const fade = root.querySelector('[data-item-id="m1"] [data-fade="in"]')!;
  fade.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 190, clientY: 170 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 240, clientY: 170 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, clientY: 170 }));
  expect(live.map((x) => x[0])).toEqual(['apply', 'preview', 'commit']);
});

test('track headers mute, solo and set bus gain', async () => {
  const { root, editor } = mount();
  const calls: any[] = [];
  editor.setTrack = (id: string, patch: any) => calls.push([id, patch]);
  editor.toggleTrack = (id: string, key: string) => calls.push([id, key]);
  await act(() => render(<Timeline editor={editor} />, root));
  (root.querySelector('[data-row="mu"] [data-mute]') as HTMLElement).click();
  (root.querySelector('[data-row="mu"] [data-solo]') as HTMLElement).click();
  const g = root.querySelector<HTMLInputElement>('[data-row="mu"] [data-bus-gain]')!;
  g.value = '-6'; g.dispatchEvent(new Event('change', { bubbles: true }));
  (root.querySelector('[data-row="v"] [data-mute]') as HTMLElement).click();
  expect(root.querySelector('[data-row="v"] [data-solo]')).toBeNull();
  // M and S toggle the real track (during an audition the timeline shows every track muted)
  expect(calls).toEqual([['mu', 'muted'], ['mu', 'solo'], ['mu', { gain: -6 }], ['v', 'muted']]);
});

test('clicking an empty spot on a track moves the playhead there; a marquee drag does not', async () => {
  const { root, editor, calls } = mount();
  await act(() => render(<Timeline editor={editor} />, root));
  const rows = root.querySelector<HTMLElement>('.rows')!;
  rows.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 176 + 150, clientY: 5 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176 + 150, clientY: 5 }));
  expect(calls.filter((c) => c[0] === 'seek')).toEqual([['seek', 3]]);   // pps 50 → 150 px = 3 s
  calls.length = 0;
  rows.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 176 + 150, clientY: 5 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 176 + 190, clientY: 40 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176 + 190, clientY: 40 }));
  expect(calls.filter((c) => c[0] === 'seek')).toEqual([]);
});

test('the track area scrolls vertically: a plain wheel is left to it, Shift+wheel scrolls time', async () => {
  const { root, editor, store } = mount();
  await act(() => render(<Timeline editor={editor} />, root));
  const tracks = root.querySelector<HTMLElement>('[data-tracks]')!;
  expect(tracks.contains(root.querySelector('.rows'))).toBe(true);
  expect(tracks.contains(root.querySelector('[data-ruler]'))).toBe(false);   // the ruler stays put
  const plain = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
  tracks.dispatchEvent(plain);
  expect([plain.defaultPrevented, store.get().scroll]).toEqual([false, 0]);
  tracks.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, shiftKey: true }));
  expect(store.get().scroll).toBe(2);   // 100 px at 50 px/s
});

test('overlapping clips sit in separate lanes and show where they overlap', async () => {
  const p = fixture();
  (p.tracks[1].items as any[]).push({ id: 'c3', source: 's', in: 0, speed: 1, start: 3, end: 5, frame: [0, 0, 1, 1],
    crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, interp: 'none' });
  const { root, editor } = mount({ project: p });
  await act(() => render(<Timeline editor={editor} />, root));
  const c3 = root.querySelector<HTMLElement>('[data-item-id="c3"]')!;
  expect([c3.style.top, c3.style.height]).toEqual(['56px', '52px']);
  // c3 is last in the list, so on top of both: both overlaps are drawn on it (1 s each at 50 px/s)
  expect([...root.querySelectorAll<HTMLElement>('[data-item-id="c3"] .overlap')].map((o) => [o.dataset.overlap, o.style.left, o.style.width]))
    .toEqual([['c3', '0px', '50px'], ['c2', '50px', '50px']]);
  expect(root.querySelector('[data-item-id="c1"] .overlap')).toBeNull();
  expect(root.querySelector('[data-item-id="c2"] .overlap')).toBeNull();
});

test('a right click on the ruler does not move the playhead', async () => {
  const { root, editor, calls } = mount();
  await act(() => render(<Timeline editor={editor} />, root));
  root.querySelector<HTMLElement>('[data-ruler]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, clientX: 300 }));
  expect(calls.filter((c) => c[0] === 'seek')).toEqual([]);
});

test('a click on the volume line is measured from the line itself, not the clip border', async () => {
  const { root, editor } = mount({ selection: ['m1'] });
  let recipe: any = null;
  editor.apply = (r: any) => { recipe = r; return true; };
  await act(() => render(<Timeline editor={editor} />, root));
  const block = root.querySelector<HTMLElement>('[data-item-id="m1"]')!, svg = block.querySelector<SVGElement>('svg.env')!;
  block.getBoundingClientRect = () => ({ left: 100, top: 50, width: 502, height: 48, right: 602, bottom: 98 }) as DOMRect;
  svg.getBoundingClientRect = () => ({ left: 101, top: 51, width: 500, height: 46, right: 601, bottom: 97 }) as DOMRect;
  const line = block.querySelector('[data-env-line]')!;
  line.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 151, clientY: 57 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 151, clientY: 57 }));
  const d = structuredClone(fixture());
  recipe(d);
  expect(d.tracks[3].items[0]).toMatchObject({ envelope: [[0, 0], [1, 0], [5, -6], [10, 0]] });   // 50 px at 50 px/s = 1 s; 6 px down = 0 dB
});

test('changing track while dragging follows the rows as they are now, after lanes reflow', async () => {
  const { root, editor, store } = mount();
  const drags: any[] = [];
  editor.dragTo = (dx: number, mods: any, toTrack?: string) => drags.push(toTrack);
  await act(() => render(<Timeline editor={editor} />, root));
  const c1 = root.querySelector<HTMLElement>('[data-item-id="c1"]')!;
  c1.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 20, clientY: 60 }));   // row v (58..114)
  const p = structuredClone(store.get().project!);
  const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  (p.tracks[2].items as any[]).push({ id: 'x1', source: 's', in: 0, speed: 1, start: 0, end: 4, frame: [0, 0, 1, 1], crop, interp: 'none' },
    { id: 'x2', source: 's', in: 0, speed: 1, start: 1, end: 3, frame: [0, 0, 1, 1], crop, interp: 'none' });   // v2 now has 2 lanes (0..112)
  await act(() => store.set({ project: p }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 40, clientY: 80 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, clientY: 80 }));
  expect(drags.at(-1)).toBe('v2');
});

test('compact tracks are shorter, so more of them fit on screen', async () => {
  const { root, editor } = mount({ layout: { ...initialState('t').layout, trackSize: 'compact' } });
  await act(() => render(<Timeline editor={editor} />, root));
  const c1 = root.querySelector<HTMLElement>('[data-item-id="c1"]')!;
  expect(c1.style.height).toBe('40px');   // video lane 44 px compact (56 standard), minus 4
  expect(root.querySelector<HTMLElement>('[data-row="fx"]')!.style.height).toBe('20px');
});

test('the bar under the tracks scrolls time with a draggable thumb and zooms with a slider', async () => {
  const { root, editor, store } = mount({ pps: 100 });
  await act(() => render(<Timeline editor={editor} />, root));
  const thumb = root.querySelector<HTMLElement>('[data-hthumb]')!;
  expect(thumb.style.width).toBe(`${Math.round((1200 * 12) / 21)}px`);
  thumb.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 300 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 420 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 420 }));
  expect(store.get().scroll).toBeCloseTo(2.1, 3);                         // 120 px of 1200 over 21 s
  const zoom = root.querySelector<HTMLInputElement>('[data-zoom]')!;
  zoom.value = '0'; zoom.dispatchEvent(new Event('input', { bubbles: true }));
  expect(store.get().pps).toBe(5);
});

test('double-clicking an item auditions its material', async () => {
  const { root, editor, calls } = mount();
  editor.auditionItem = (id: string) => calls.push(['audition', id]);
  await act(() => render(<Timeline editor={editor} />, root));
  root.querySelector('[data-item-id="c2"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  // a short clip zoomed out is all edge grips: they audition it too
  root.querySelector('[data-item-id="c2"] [data-edge]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(calls.filter((c) => c[0] === 'audition')).toEqual([['audition', 'c2'], ['audition', 'c2']]);
  // Shift+double-click plays the finished video from the item's start
  editor.play = () => calls.push(['play']);
  root.querySelector('[data-item-id="c2"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, shiftKey: true }));
  expect(calls.slice(-2)).toEqual([['seek', 4], ['play']]);
});

test('an overlap is drawn on the item on top and marked; a click on it goes to overlapClick; a linked crossfade shows as one', async () => {
  const p: any = fixture(); p.tracks[1].items[1].start = 3.5;                 // c2 over c1 by 0.5 s
  const { root, editor, calls, store } = mount({ project: p });
  editor.overlapClick = (id: string) => calls.push(['overlap', id]);
  await act(() => render(<Timeline editor={editor} />, root));
  let ov = root.querySelector<HTMLElement>('[data-item-id="c2"] [data-overlap="c2"]')!;
  expect([ov.style.left, ov.style.width, !!ov.querySelector('.top-mark')]).toEqual(['0px', '25px', true]);
  ov.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 10, clientY: 10 }));
  expect(calls).toContainEqual(['overlap', 'c2']);
  // c1 drawn over c2: the overlap moves onto c1, at the overlapping time
  const q: any = fixture(); q.tracks[1].items[1].start = 3.5; q.tracks[1].items.reverse();
  await act(() => { store.set({ project: q }); });
  ov = root.querySelector<HTMLElement>('[data-item-id="c1"] [data-overlap="c2"]')!;
  expect([ov.style.left, ov.style.width]).toEqual(['175px', '25px']);
  expect(root.querySelector('[data-item-id="c2"] [data-overlap]')).toBe(null);
  const s: any = fixture(); s.tracks[3].items[0].fadeOut = 2;
  s.tracks[3].items.push({ id: 'm2', media: 'm', in: 0, start: 8, end: 14, gain: 0, fadeIn: 2, fadeOut: 0 });
  await act(() => { store.set({ project: s }); });
  expect(root.querySelector('[data-overlap="m2"]')!.classList.contains('xfade')).toBe(true);
});

test('a clip with a transition shows its block: the right edge drags the length, a click selects the clip', async () => {
  const { root, editor, calls } = mount();                                   // c2 has a 0.5 s dissolve
  editor.previewTransitionDur = (id: string, d: number) => calls.push(['trDur', id, d]);
  editor.commitLive = () => calls.push(['commit']);
  await act(() => render(<Timeline editor={editor} />, root));
  const block = root.querySelector<HTMLElement>('[data-item-id="c2"] [data-transition="c2"]')!;
  expect(block.style.width).toBe('25px');
  block.querySelector('[data-transition-edge]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 25 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 40 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 40 }));
  expect(calls.filter((c) => c[0] === 'trDur' || c[0] === 'commit')).toEqual([['trDur', 'c2', 0.8], ['commit']]);
  block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  expect(calls.at(-1)).toEqual(['select', ['c2']]);
  expect(root.querySelector('[data-item-id="c1"] [data-transition]')).toBe(null);   // a cut has no block
});

test('track headers: the grip drags a track within its group, × deletes (asking first when it has items), the bar adds one', async () => {
  const { root, editor, calls } = mount();
  editor.moveTrack = (id: string, to: number) => calls.push(['moveTrack', id, to]);
  editor.removeTrack = (id: string) => calls.push(['removeTrack', id]);
  editor.addTrackOf = (k: string) => calls.push(['addTrack', k]);
  await act(() => render(<Timeline editor={editor} />, root));
  const rowY = (id: string) => parseFloat(root.querySelector<HTMLElement>(`[data-row="${id}"]`)!.style.top) + 5;
  root.querySelector('[data-track-grip="sc"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await act(() => { window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: rowY('v2') })); });
  expect(root.querySelector('.track-drop')).not.toBe(null);
  await act(() => { window.dispatchEvent(new MouseEvent('mouseup', { clientY: rowY('v2') })); });
  expect(root.querySelector('.track-drop')).toBe(null);
  root.querySelector('[data-track-grip="mu"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientY: rowY('v') }));         // another group: nothing happens
  const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  (root.querySelector('[data-track-delete="v"]') as HTMLElement).click();          // declined
  (root.querySelector('[data-track-delete="v"]') as HTMLElement).click();
  (root.querySelector('[data-track-delete="v2"]') as HTMLElement).click();         // empty: no question
  expect(ask).toHaveBeenCalledTimes(2);
  ask.mockRestore();
  const add = root.querySelector<HTMLSelectElement>('[data-add-track]')!;
  add.value = 'overlay'; add.dispatchEvent(new Event('change', { bubbles: true }));
  expect(add.value).toBe('');
  expect(calls.filter((c) => ['moveTrack', 'removeTrack', 'addTrack'].includes(c[0])))
    .toEqual([['moveTrack', 'sc', 2], ['removeTrack', 'v'], ['removeTrack', 'v2'], ['addTrack', 'overlay']]);
});
test('short overlaps, transitions and clips stay usable: a 12 px overlap target, a 10 px transition block, narrower grips', async () => {
  const p: any = fixture();
  p.tracks[1].items[1].start = 3.9; p.tracks[1].items[1].transitionIn = { type: 'dissolve', dur: 0.1 };   // 0.1 s overlap and dissolve: 5 px at 50 px/s
  p.tracks[1].items.push({ id: 'c3', source: 's', in: 0, speed: 1, start: 12, end: 12.18, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });   // 9 px wide
  const { root, editor } = mount({ project: p });
  await act(() => render(<Timeline editor={editor} />, root));
  const ov = root.querySelector<HTMLElement>('[data-overlap]')!;
  expect([ov.style.width, ov.style.getPropertyValue('--w')]).toEqual(['12px', '5px']);
  expect(root.querySelector<HTMLElement>('[data-transition="c2"]')!.style.width).toBe('10px');
  expect([...root.querySelectorAll<HTMLElement>('[data-item-id="c3"] [data-edge]')].map((g) => g.style.width)).toEqual(['3px', '3px']);
});

test('overlaps on tracks where a click does nothing are marked inert; the insertion line sits below a row dragged onto from above', async () => {
  const p: any = fixture();
  p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'o1', type: 'x', start: 0, end: 2, params: {} }, { id: 'o2', type: 'x', start: 1, end: 3, params: {} }] });
  const { root, editor } = mount({ project: p });
  editor.moveTrack = () => {};
  await act(() => render(<Timeline editor={editor} />, root));
  expect(root.querySelector('[data-overlap="o2"]')!.classList.contains('inert')).toBe(true);
  const row = (id: string) => root.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
  const sc = row('sc');
  root.querySelector('[data-track-grip="v2"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));   // v2 sits above sc
  await act(() => { window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: parseFloat(sc.style.top) + 5 })); });
  expect(root.querySelector<HTMLElement>('.track-drop')!.style.top).toBe(`${parseFloat(sc.style.top) + parseFloat(sc.style.height)}px`);
  await act(() => { window.dispatchEvent(new MouseEvent('mouseup', { clientY: 0 })); });
});

test('deleting a track names the items on other tracks that go with it', async () => {
  const { root, editor } = mount();
  editor.removeTrack = () => {};
  await act(() => render(<Timeline editor={editor} />, root));
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  (root.querySelector('[data-track-delete="sc"]') as HTMLElement).click();
  expect(ask.mock.calls[0][0]).toMatch(/1 個片段.*另有 2 個/);
  ask.mockRestore();
});
test('the delete question shows the English name of an old Chinese default track', async () => {
  const { root, editor, store } = mount();
  editor.removeTrack = () => {};
  store.set({ project: { ...store.get().project!, tracks: store.get().project!.tracks.map((x) => (x.id === 'sc' ? { ...x, name: '主軌' } : x)) } });
  await act(() => render(<Timeline editor={editor} />, root));
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  (root.querySelector('[data-track-delete="sc"]') as HTMLElement).click();
  expect(ask.mock.calls[0][0]).toContain('Main');
  expect(ask.mock.calls[0][0]).not.toContain('主軌');
  ask.mockRestore();
});
test('a click on a track name collapses it (Shift: every track of its kind); a collapsed row is thin', async () => {
  const { root, editor, calls } = mount({ collapsed: ['mu'] });
  editor.toggleCollapse = (id: string, kind: boolean) => calls.push(['collapse', id, kind]);
  await act(() => render(<Timeline editor={editor} />, root));
  expect([root.querySelector('[data-row="mu"]')!.classList.contains('collapsed'), root.querySelector<HTMLElement>('[data-row="mu"]')!.style.height]).toEqual([true, '12px']);
  (root.querySelector('[data-row="v"] .tname') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  expect(calls.at(-1)).toEqual(['collapse', 'v', true]);
});

test('dragging the edge of a short transition (its block is drawn wider than it is) moves the length by the drag, not by where the block ends', async () => {
  const p: any = fixture(); p.tracks[1].items[1].transitionIn = { type: 'dissolve', dur: 0.1 };   // 5 px, drawn 10 px wide
  const { root, editor, calls } = mount({ project: p });
  editor.previewTransitionDur = (id: string, d: number) => calls.push(['trDur', id, d]);
  editor.commitLive = () => {};
  await act(() => render(<Timeline editor={editor} />, root));
  root.querySelector('[data-transition="c2"] [data-transition-edge]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 11 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 11 }));
  expect(calls.find((c) => c[0] === 'trDur')![2]).toBeCloseTo(0.12, 6);                          // 0.1 s + 1 px at 50 px/s
});

test("the items a pending proposal changes are outlined", async () => {
  const { root, editor } = mount({ proposal: { id: 'p1', label: 'x', summary: [], warnings: [], changed: ['c1'] } });
  await act(() => render(<Timeline editor={editor} />, root));
  expect(root.querySelector('[data-item-id="c1"]')!.classList.contains('proposed')).toBe(true);
  expect(root.querySelector('[data-item-id="c2"]')!.classList.contains('proposed')).toBe(false);
});

test('a magnetic track shows its button lit; children of its clips draw a line; right-click offers detach', async () => {
  const p: any = fixture();
  p.tracks[1].magnetic = true;
  p.tracks.find((t: any) => t.id === 'fx').items[0] = { id: 'tap', type: 'x.tap', start: 1, end: 1.1, params: {}, gain: 0, parent: 'c1' };
  const { root, editor, calls } = mount({ project: p });
  editor.toggleMagnetic = (id: string) => calls.push(['magnet', id]);
  editor.detach = (id: string) => calls.push(['detach', id]);
  await act(() => render(<Timeline editor={editor} />, root));
  const btn = root.querySelector<HTMLElement>('[data-track-id="v"] [data-magnet]') ?? root.querySelectorAll<HTMLElement>('[data-magnet]')[0];
  expect(btn.classList.contains('on')).toBe(true);
  expect(root.querySelectorAll('.hang').length).toBeGreaterThanOrEqual(1);
  const tap = root.querySelector<HTMLElement>('[data-item-id="tap"]')!;
  await act(() => { tap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 })); });
  const item = [...root.querySelectorAll<HTMLElement>('.ctx button')].find((b) => b.textContent === 'Detach')!;
  await act(() => { item.click(); });
  expect(calls).toContainEqual(['detach', 'tap']);
  expect(root.querySelector('.ctx')).toBeNull();
});

test('right-click: Ask Agent on an item and on empty space; detach only for hung items', async () => {
  const { root, editor, calls } = mount();
  editor.openAsk = (id?: string) => calls.push(['ask', id]);
  await act(() => render(<Timeline editor={editor} />, root));
  const c2 = root.querySelector<HTMLElement>('[data-item-id="c2"]')!;
  await act(() => { c2.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 100 })); });
  const labels = () => [...root.querySelectorAll<HTMLElement>('.ctx button')].map((b) => b.textContent);
  expect(labels()).toEqual(['Ask Agent…']);
  await act(() => { root.querySelector<HTMLElement>('.ctx button')!.click(); });
  expect(calls).toContainEqual(['ask', 'c2']);
  const rows = root.querySelector<HTMLElement>('.rows')!;
  await act(() => { rows.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 900, clientY: 100 })); });
  expect(labels()).toEqual(['Ask Agent…']);
  await act(() => { root.querySelector<HTMLElement>('.ctx button')!.click(); });
  expect(calls).toContainEqual(['ask', undefined]);
});

test('an item still hanging on a clip of a non-magnetic track can be unhooked from the menu', async () => {
  const p: any = fixture();
  p.tracks.find((t: any) => t.id === 'fx').items[0] = { id: 'tap', type: 'x.tap', start: 1, end: 1.1, params: {}, gain: 0, parent: 'c1' };
  const { root, editor } = mount({ project: p });
  editor.openAsk = () => {}; editor.detach = () => {};
  await act(() => render(<Timeline editor={editor} />, root));
  await act(() => { root.querySelector<HTMLElement>('[data-item-id="tap"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 })); });
  expect([...root.querySelectorAll<HTMLElement>('.ctx button')].map((b) => b.textContent)).toEqual(['Ask Agent…', 'Detach']);
});

test('old default track names show in English; project.json keeps them', async () => {
  const project: any = fixture();
  project.tracks.find((t: any) => t.id === 'v').name = '主軌';
  project.tracks.find((t: any) => t.id === 'v2').name = '我的軌道';
  const { root, editor, store } = mount({ project });
  await act(() => render(<Timeline editor={editor} />, root));
  const name = (id: string) => root.querySelector(`[data-track-id="${id}"] .tname`)!.textContent;
  expect([name('v'), name('v2')]).toEqual(['Main', '我的軌道']);
  expect(store.get().project!.tracks.find((t) => t.id === 'v')!.name).toBe('主軌');
});

test('a clip, envelope or marquee drag ends when the window loses focus or a move finds the button released (Alt+Tab mid-drag)', async () => {
  const { root, editor, calls } = mount({ selection: ['m1'] });
  const log: string[] = [];
  editor.beginDrag = () => log.push('begin');
  editor.dragTo = () => log.push('drag');
  editor.endDrag = () => log.push('end');
  editor.livePreview = () => log.push('preview');
  editor.commitLive = () => log.push('commit');
  editor.apply = () => { log.push('apply'); return true; };
  await act(() => render(<Timeline editor={editor} />, root));
  const c1 = root.querySelector<HTMLElement>('[data-item-id="c1"]')!;
  c1.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 20, clientY: 60 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 60, clientY: 60 }));
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 0, clientX: 120, clientY: 60 }));   // back in the window: no longer following
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 60 }));
  expect(log).toEqual(['begin', 'drag', 'end']);
  log.length = 0;
  const fade = root.querySelector('[data-item-id="m1"] [data-fade="in"]')!;
  fade.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 190, clientY: 170 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 240, clientY: 170 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 0, clientX: 260, clientY: 170 }));   // released outside the window
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 0, clientX: 280, clientY: 170 }));
  expect(log).toEqual(['preview', 'commit']);
  log.length = 0;
  const line = root.querySelector('[data-item-id="m1"] [data-env-line]')!;
  line.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 170 }));
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 170 }));
  expect(log).toEqual([]);                                      // a release never seen is not a click on the line
  calls.length = 0;
  const rows = root.querySelector<HTMLElement>('.rows')!;
  rows.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 176 + 150, clientY: 5 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 176 + 190, clientY: 40 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 0, clientX: 176 + 300, clientY: 40 }));
  const sel = calls.filter((c) => c[0] === 'select').length;
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 176 + 400, clientY: 90 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176 + 400, clientY: 90 }));
  expect([calls.filter((c) => c[0] === 'select').length, calls.filter((c) => c[0] === 'seek')]).toEqual([sel, []]);
  expect(root.querySelector('.marquee')).toBeNull();
});

test('envelope points and fade handles show only on the selected clip; a click on an unselected clip selects it, adds no point', async () => {
  const { root, editor, calls } = mount();
  let applied = 0;
  editor.apply = () => { applied++; return true; };
  await act(() => render(<Timeline editor={editor} />, root));
  const m1 = () => root.querySelector<HTMLElement>('[data-item-id="m1"]')!;
  expect([m1().querySelectorAll('circle').length, m1().querySelectorAll('[data-fade]').length, m1().querySelectorAll('[data-env-line]').length]).toEqual([0, 0, 0]);
  expect(m1().querySelector('.env-line')).not.toBeNull();                 // the line itself is still drawn
  m1().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: 170 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 170 }));
  expect([calls.find((c) => c[0] === 'select')?.[1], applied]).toEqual([['m1'], 0]);
  const sel = mount({ selection: ['m1'] });
  await act(() => render(<Timeline editor={sel.editor} />, sel.root));
  const b = sel.root.querySelector<HTMLElement>('[data-item-id="m1"]')!;
  expect([b.querySelectorAll('circle').length, b.querySelectorAll('[data-fade]').length]).toEqual([3, 2]);
});

test('a tall media clip has a name strip over its thumbnails; a short one keeps the label over them', async () => {
  const tall = mount();
  await act(() => render(<Timeline editor={tall.editor} />, tall.root));
  const c1 = tall.root.querySelector<HTMLElement>('[data-item-id="c1"]')!;
  expect(c1.querySelector('.strip .label')).not.toBeNull();
  expect(c1.querySelector('.body')).not.toBeNull();
  expect(tall.root.querySelector('[data-item-id="blk"] .strip')).toBeNull();      // a block is all name: no strip
  const folded = mount({ collapsed: ['v'] });
  await act(() => render(<Timeline editor={folded.editor} />, folded.root));
  expect(folded.root.querySelector('[data-item-id="c1"] .strip')).toBeNull();
});

test('the playhead head drags the playhead', async () => {
  const { root, editor, calls } = mount({ playhead: 2 });
  await act(() => render(<Timeline editor={editor} />, root));
  const head = root.querySelector<HTMLElement>('[data-playhead-head]')!;
  head.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 176 + 100 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 176 + 150 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 176 + 150 }));
  expect(calls.filter((c) => c[0] === 'seek').at(-1)![1]).toBeCloseTo(3);
});

test('track headers: eye on picture tracks, speaker on sound tracks, a lock on every track; the delete button is off while locked', async () => {
  const { root, editor } = mount({ locked: ['v'] });
  const calls: any[] = [];
  editor.toggleLock = (id: string) => calls.push(id);
  await act(() => render(<Timeline editor={editor} />, root));
  const row = (id: string) => root.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
  expect(row('v').querySelector('[data-mute]')!.getAttribute('data-icon')).toBe('eye');
  expect(row('mu').querySelector('[data-mute]')!.getAttribute('data-icon')).toBe('speaker');
  expect(root.querySelectorAll('[data-lock]').length).toBe(6);
  expect(row('v').querySelector('[data-lock]')!.classList.contains('on')).toBe(true);
  expect(row('v').classList.contains('locked')).toBe(true);
  expect(row('v').querySelector<HTMLButtonElement>('[data-track-delete]')!.disabled).toBe(true);
  expect(row('sc').querySelector<HTMLButtonElement>('[data-track-delete]')!.disabled).toBe(false);
  row('sc').querySelector<HTMLElement>('[data-lock]')!.click();
  expect(calls).toEqual(['sc']);
});

test('a clip on a locked track neither drags nor selects; its volume line takes no clicks', async () => {
  const { root, editor, calls } = mount({ locked: ['v', 'mu'], selection: ['m1'] });
  const log: string[] = [];
  editor.beginDrag = () => log.push('begin');
  editor.apply = () => { log.push('apply'); return true; };
  await act(() => render(<Timeline editor={editor} />, root));
  const c1 = root.querySelector<HTMLElement>('[data-item-id="c1"]')!;
  c1.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 20, clientY: 60 }));
  window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 80, clientY: 60 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 80, clientY: 60 }));
  expect([log, calls.filter((c) => c[0] === 'select')]).toEqual([[], []]);
  expect(root.querySelector('[data-item-id="m1"] [data-env-line]')).toBeNull();
});
