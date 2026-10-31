// The Editor: the timeline view (zoom, scrolling, turning the page), overlaps and transitions, tracks, view keys, loop, help, layout.
import { corePlugin, createRegistry, findItem, resolveTimes } from '@tellcut/engine';
import { t } from './i18n/index.ts';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { Editor } from './editor.ts';
import { fakes } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('the layout is remembered per browser; F toggles the large preview; selecting shows the properties tab', async () => {
  const mem: Record<string, string> = { 'tellcut.layout': JSON.stringify({ split: 0.7, trackSize: 'standard', maxPreview: true, sideTab: 'props', sideW: 380 }) };
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  expect(ed.store.get().layout).toMatchObject({ split: { landscape: 0.7, portrait: null }, trackSize: 'standard', maxPreview: false, sideTab: 'library', sideW: 380 });   // not the transient bits; the panel width is kept
  ed.setLayout({ libClosed: true });
  expect(JSON.parse(mem['tellcut.layout'])).toEqual({ split: { landscape: 0.7, portrait: null }, previewW: { landscape: null, portrait: null }, libClosed: true, propsClosed: false, trackSize: 'standard', snap: true, sideW: 380, arrange: { landscape: 'auto', portrait: 'auto' } });
  ed.run('maxPreview');
  expect(ed.store.get().layout.maxPreview).toBe(true);
  await ed.open();
  ed.select(['c1']);
  expect(ed.store.get().layout.sideTab).toBe('props');
});

test('the timeline zoom first fits the whole project into the timeline as it is laid out (narrower in portrait)', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(1000);                     // fixture: 20 s
  expect([ed.store.get().pps, ed.store.get().scroll]).toEqual([50, 0]);
  ed.setView({ pps: 120 });
  ed.fitTimeline(600);                      // later resizes keep the user's zoom
  expect(ed.store.get().pps).toBe(120);
  await ed.open();
  ed.fitTimeline(600);
  expect(ed.store.get().pps).toBe(30);
});

test('a long project is not squeezed into the timeline: at least 20 px per second, and scrolling stops at the end', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 20 s would need 10 px/s
  expect(ed.store.get().pps).toBe(20);
  ed.setView({ scroll: 999 });
  expect(ed.store.get().scroll).toBe(11);   // 20 s − 200 px / 20 px/s + 1 s of air
});

test('while playing, the timeline turns the page when the playhead runs out of view', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 20 px/s: 10 s in view
  bridge.onTime(10.5);                      // not playing: the view stays
  expect(ed.store.get().scroll).toBe(0);
  ed.seek(9);
  ed.play();
  bridge.onTime(9);
  expect(ed.store.get().scroll).toBe(0);
  bridge.onTime(10.5);
  expect(ed.store.get().scroll).toBe(10.5);  // the playhead goes to the left edge
  ed.setView({ scroll: 0 });
  ed.pause(); ed.seek(15);
  ed.play();                                // play brings an off-screen playhead into view
  bridge.onTime(15);                        // further than the furthest scroll (11): the view stops at the end
  expect(ed.store.get().scroll).toBe(11);
});

test('scrolling away while playing is not undone: only crossing the right edge turns the page', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(200);                      // 10 s in view
  ed.play();
  bridge.onTime(0); bridge.onTime(2);
  ed.setView({ scroll: 5 });                // the user looks ahead
  bridge.onTime(2.1); bridge.onTime(6);
  expect(ed.store.get().scroll).toBe(5);
  bridge.onTime(14.9); bridge.onTime(15.1);  // crossed the edge of the view the user chose
  expect(ed.store.get().scroll).toBe(11);
});

test('clicking an overlap: a video pair gets a dissolve as long as the overlap; a song pair toggles a crossfade', async () => {
  const p0: any = fixture(); p0.tracks[1].items[1].start = 3.5; delete p0.tracks[1].items[1].transitionIn;
  p0.tracks[3].items.push({ id: 'm2', media: 'm', in: 0, start: 8, end: 14, gain: 0, fadeIn: 0, fadeOut: 0 });
  const { api, bridge } = fakes({ project: async () => structuredClone(p0) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const c2 = () => ed.store.get().project!.tracks[1].items[1] as any, mu = () => ed.store.get().project!.tracks[3].items as any[];
  expect(ed.overlapClick('c2')).toBe(true);
  expect(c2().transitionIn).toEqual({ type: 'dissolve', dur: 0.5 });
  expect(ed.overlapClick('c2')).toBe(true);                 // it has one now: selected for the properties panel
  expect([ed.store.get().selection, c2().transitionIn.dur]).toEqual([['c2'], 0.5]);
  ed.overlapClick('m2');
  expect([mu()[0].fadeOut, mu()[1].fadeIn]).toEqual([2, 2]);
  ed.overlapClick('m2');
  expect([mu()[0].fadeOut, mu()[1].fadeIn]).toEqual([0, 0]);
  expect(ed.overlapClick('c1')).toBe(false);               // nothing before c1
});

test('transition length from the timeline: live while dragging, one undo step, kept between a frame and the clip length', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const dur = () => (ed.store.get().project!.tracks[1].items[1] as any).transitionIn.dur;
  ed.previewTransitionDur('c2', 0.8);
  expect([dur(), ed.store.get().canUndo]).toEqual([0.8, false]);
  ed.commitLive();
  expect([dur(), ed.store.get().canUndo]).toEqual([0.8, true]);
  ed.previewTransitionDur('c2', 99); ed.commitLive();
  expect(dur()).toBe(4);                                   // c2 is 4 s long
  ed.previewTransitionDur('c2', 0); ed.commitLive();
  expect(dur()).toBe(0.04);                                // one frame at 25 fps
});

test('tracks: add, move inside the group, remove (undoable); Ctrl+] and Ctrl+[ restack the selected item', async () => {
  const p0: any = fixture(); p0.tracks[1].items[1].start = 3.5;
  const { api, bridge } = fakes({ project: async () => structuredClone(p0) });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const ids = () => ed.store.get().project!.tracks.map((t) => t.id);
  ed.addTrackOf('overlay');
  expect(ids()).toEqual(['sc', 'v', 'v2', 'overlay', 'mu', 'au', 'fx']);
  ed.moveTrack('overlay', 0);
  expect(ids()).toEqual(['overlay', 'sc', 'v', 'v2', 'mu', 'au', 'fx']);
  ed.removeTrack('overlay');
  expect(ids()).toEqual(['sc', 'v', 'v2', 'mu', 'au', 'fx']);
  ed.undo();
  expect(ids()[0]).toBe('overlay');
  const v = () => ed.store.get().project!.tracks.find((t) => t.id === 'v')!.items.map((i) => i.id);
  ed.select(['c2']);
  ed.run('lower');
  expect(v()).toEqual(['c2', 'c1']);
  ed.run('raise');
  expect(v()).toEqual(['c1', 'c2']);
  ed.run('raise');                                         // nothing above it: refused with a notice
  expect(ed.store.get().notice).toContain('上層');
});

test('F in a portrait project widens the preview column as far as the timeline allows, and back', async () => {
  const { api, bridge } = fakes({ project: async () => { const p: any = fixture(); p.meta.width = 180; p.meta.height = 320; return p; } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.run('maxPreview');
  expect(ed.store.get().layout.previewW).toEqual({ landscape: null, portrait: 10000 });
  ed.run('maxPreview');
  expect(ed.store.get().layout.previewW.portrait).toBe(null);
});

test('tracks collapse one by one or by kind (Shift), remembered per project; deleted tracks drop out of the memory', async () => {
  const mem = new Map<string, string>(), storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  await ed.open();
  ed.toggleCollapse('mu');
  expect(ed.store.get().collapsed).toEqual(['mu']);
  ed.toggleCollapse('v', true);                                  // both video tracks
  expect([...ed.store.get().collapsed].sort()).toEqual(['mu', 'v', 'v2']);
  ed.toggleCollapse('v2', true);                                 // some of the kind collapsed: Shift opens them all
  expect(ed.store.get().collapsed).toEqual(['mu']);
  ed.removeTrack('mu');
  expect(ed.store.get().collapsed).toEqual([]);
  ed.toggleCollapse('au');
  const again = new Editor('demo', { api, bridge, storage });
  await again.open();
  expect(again.store.get().collapsed).toEqual(['au']);
});

test('loop: plays the selected clips over and over (the whole project when nothing is selected); an audition is not looped', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c2']);                                          // 4–8 s
  ed.toggleLoop();
  ed.play();
  expect(bridge.calls.filter((c: any) => c[0] === 'play').at(-1)).toEqual(['play', 4]);
  bridge.onTime(4); bridge.onTime(7.99);
  expect(ed.store.get().playhead).toBe(7.99);
  bridge.onTime(8);
  expect([bridge.calls.filter((c: any) => c[0] === 'play').at(-1), ed.store.get().playing]).toEqual([['play', 4], true]);
  ed.select([]);
  bridge.onEnded();                                           // the whole project ended: from the top
  expect([bridge.calls.filter((c: any) => c[0] === 'play').at(-1), ed.store.get().playing]).toEqual([['play', 0], true]);
  ed.pause();
  ed.audition({ kind: 'clip', source: 's', from: 1, len: 2 });
  bridge.onEnded();
  expect([ed.store.get().audition, ed.store.get().playing]).toEqual([null, false]);
});

test('zoom to fit (\\) shows the whole project however long; the snap switch turns snapping off and is remembered', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(100);                                        // 20 s at the 20 px/s minimum
  ed.setView({ pps: 100, scroll: 3 });
  ed.run('zoomFit');
  expect([ed.store.get().pps, ed.store.get().scroll]).toEqual([5, 0]);   // 100 px / 20 s, at the 5 px/s floor
  ed.setView({ pps: 50, scroll: 0 });
  const drag = () => { ed.beginDrag({ grip: 'body', id: 'c2', mods: { alt: false, ctrl: false, shift: false }, selection: ['c2'] }); ed.dragTo(5, { alt: false, ctrl: false, shift: false }); ed.endDrag(); };
  drag();                                                     // 0.1 s: snaps back onto c1's end
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4);
  ed.setLayout({ snap: false });
  drag();
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4.1);
});

test('help (? or F1) opens over the editor; while open, keys do nothing to the project and Esc only closes it', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']);
  ed.run('help');
  expect(ed.store.get().helpOpen).toBe(true);
  ed.run('delete'); ed.run('playPause');
  expect([ed.store.get().project!.tracks[1].items.length, ed.store.get().playing]).toEqual([2, false]);
  ed.run('exitCrop');
  expect(ed.store.get().helpOpen).toBe(false);
});

test('a loop that jumps back to its start brings the timeline view back to the playhead', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.fitTimeline(80);                                        // 20 px/s: 4 s in view
  ed.select(['m1']);                                         // 0–10 s
  ed.toggleLoop();
  ed.play();
  for (const t of [0, 3.9, 4.1, 8, 8.2]) bridge.onTime(t);   // the view turned pages along
  expect(ed.store.get().scroll).toBe(8.2);
  bridge.onTime(10);                                         // back to 0
  bridge.onTime(0.01);
  expect(ed.store.get().scroll).toBe(0.01);
});

test('End (or ⏭) while playing stops at the end instead of starting over from 0 in the preview', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.play();
  bridge.onTime(0);
  ed.run('end');
  expect([ed.store.get().playing, ed.store.get().playhead, bridge.calls.at(-1)]).toEqual([false, 20, ['seek', 20]]);
});

test('the chosen arrangement is remembered with the layout and read back by a new editor', () => {
  const mem: Record<string, string> = {};
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, storage });
  ed.setLayout({ arrange: { landscape: 'side', portrait: 'stacked' }, previewW: { landscape: 640, portrait: null } });
  const saved = JSON.parse(mem['tellcut.layout']);
  expect(saved.arrange).toEqual({ landscape: 'side', portrait: 'stacked' });
  expect(saved.previewW).toEqual({ landscape: 640, portrait: null });
  const again = new Editor('demo', { api, bridge, storage });
  expect(again.store.get().layout).toMatchObject({ arrange: { landscape: 'side', portrait: 'stacked' }, previewW: { landscape: 640, portrait: null } });
});

test('cycleLayout steps Auto → Stacked → Side → Auto for the project orientation only', async () => {
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const seen = [1, 2, 3].map(() => { ed.run('layout'); return ed.store.get().layout.arrange.landscape; });
  expect(seen).toEqual(['stacked', 'side', 'auto']);
  expect(ed.store.get().layout.arrange.portrait).toBe('auto');
});

describe('timeline refresh minors (2026-10-29)', () => {
  const withCaption = async () => { const p: any = fixture(); p.tracks.push({ id: 'ov', kind: 'overlay', items: [{ id: 'cap', type: 'x.cap', start: 1, end: 2, params: {}, parent: 'c1' }] }); return p; };

  test('Ctrl+D leaves what Ctrl+C copied on the clipboard', async () => {
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['blk']); ed.copy();
    const clip = ed.store.get().clipboard;
    ed.select(['c1']);
    expect(ed.duplicate()).toBe(true);
    expect(ed.store.get().clipboard).toBe(clip);
  });

  test('a paste that leaves part out past the end says how many; one that leaves out everything says why in the page language', async () => {
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['c1', 'blk']); ed.copy();                          // c1 0–4, blk 2–6
    ed.seek(19);
    expect(ed.paste()).toBe(true);
    expect(ed.store.get().notice).toBe(t('ed.pastePartly', { n: 1 }));
    ed.seek(20);
    expect(ed.paste()).toBe(false);
    expect(ed.store.get().notice).toBe(t('err.cmd.pastePastEnd'));
  });

  test('without a magnetic track, Ctrl+D on a caption hung on a clip hangs the copy on the same clip', async () => {
    const { api, bridge } = fakes({ project: withCaption });
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['cap']);
    expect(ed.duplicate()).toBe(true);
    const copy: any = findItem(ed.store.get().project!, ed.store.get().selection[0]).item;
    expect([copy.parent, resolveTimes(ed.store.get().project!).get(copy.id)]).toEqual(['c1', { start: 2, end: 3 }]);
  });

  test('paste and Ctrl+D leave out a one-per-film block that is already there, and say so', async () => {
    const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.end', label: '片尾', kind: 'overlay', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge, registry });
    await ed.open();
    ed.seek(1);
    ed.addOverlay('x.end');
    const end = ed.store.get().selection[0];
    expect(ed.duplicate()).toBe(false);
    expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
    ed.select([end, 'blk']); ed.copy();
    ed.seek(8);
    expect(ed.paste()).toBe(true);
    expect(ed.store.get().selection).toEqual(['blk-2']);
    expect(ed.store.get().project!.tracks.flatMap((x) => x.items as any[]).filter((i) => i.type === 'x.end')).toHaveLength(1);
    expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
  });

  test('Q / W with only blocks selected say the selection has no clip to cut, not that the playhead has none', async () => {
    const { api, bridge } = fakes();
    const ed = new Editor('demo', { api, bridge });
    await ed.open();
    ed.select(['blk']); ed.seek(3);
    expect(ed.deleteSide('left')).toBe(false);
    expect(ed.store.get().notice).toBe(t('ed.why.selectionNoClip'));
  });
});
