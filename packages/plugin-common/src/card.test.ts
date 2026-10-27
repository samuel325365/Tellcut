// @vitest-environment jsdom
import { createRegistry, mediaIssues, Stage, withDefaults, type ItemType } from '@tellcut/engine';
import { card } from './card.ts';
import { polaroid } from './polaroid.ts';

const media: any = { begin() {}, video() {}, place() {}, stillUrl: () => '', sync: async () => {}, image() {} };
const project = (art: string): any => ({
  version: 1, meta: { width: 400, height: 400, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'c', type: 'common.card', start: 0, end: 4, params: { art } }] }],
});

test('the block in the picture window gets its late pass and is disposed when it is swapped or the card goes', () => {
  const log: string[] = [];
  const art = (type: string): ItemType => ({ type, label: type, kind: 'overlay', params: [], build: () => ({ type }),
    draw() {}, late: (ctx, s: any) => log.push(`late ${s.type} ${ctx.W}x${ctx.H}`), dispose: (s: any) => log.push(`dispose ${s.type}`) });
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'x', items: [card, art('fx.a'), art('fx.b')] } as any]), media);
  st.load(project('fx.a'));
  st.draw(1); st.late(1);
  expect(log).toEqual([expect.stringMatching(/^late fx\.a \d+x\d+$/)]);   // at the window's size, not the frame's
  expect(log[0]).not.toBe('late fx.a 400x400');
  st.update(project('fx.b'));
  st.draw(1);
  expect(log.slice(1)).toEqual(['dispose fx.a']);
  st.update({ ...project('fx.b'), tracks: [{ id: 'o', kind: 'overlay', items: [] }] });
  expect(log.slice(2)).toEqual(['dispose fx.b']);
});

test('media() hands on the stills and clips of the block in the picture window (an export cuts them)', () => {
  const reg = createRegistry([{ id: 'common', items: [card, polaroid] } as any]), types = (t: string) => reg.item(t);
  const p = { ...project('common.polaroid'), sources: { s: { path: 's.mp4', duration: 9, width: 320, height: 180 } } };
  const item = (art: string, artParams: Record<string, unknown> = { source: 's', t: 2.5 }): any =>
    ({ id: 'c', type: 'common.card', start: 0, end: 4, params: withDefaults(card.params, { art, artParams }) });
  expect(card.media!(item('common.polaroid'), p, types).stills).toEqual([{ source: 's', t: 2.5, w: 720 }]);
  expect(card.media!(item('common.polaroid'), p)).toEqual({ videos: [], stills: [] });   // no registry: nothing to look the block up in
  expect(card.media!(item(''), p, types)).toEqual({ videos: [], stills: [] });
  expect(card.media!(item('common.card'), p, types)).toEqual({ videos: [], stills: [] });
  // a typo in the hosted block's source is caught before an export, naming the card
  const bad = { ...p, tracks: [{ id: 'o', kind: 'overlay', items: [item('common.polaroid', { source: 'nope' })] }] };
  expect(mediaIssues(bad as any, reg)).toEqual(['Item "c" (common.card): unknown source "nope"']);
});

test('the block in the picture window is built with the card, and ready() waits for its own ready()', async () => {
  let release!: () => void, built = 0;
  const gate = new Promise<void>((r) => { release = r; });
  const art: ItemType = { type: 'fx.slow', label: 'slow', kind: 'overlay', params: [], build: (ctx) => { built++; return { w: ctx.W, h: ctx.H }; }, draw() {},
    ready: () => gate, media: () => ({ videos: [{ source: 's', in: 0, out: 1, speed: 1, interp: 'none' }], stills: [] }) };
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'x', items: [card, art] } as any]), media);
  st.load({ ...project('fx.slow'), sources: { s: { path: 's.mp4', duration: 9, width: 320, height: 180 } } });
  expect(built).toBe(1);   // before any draw
  expect(st.mediaRefs()).toEqual([{ source: 's', in: 0, out: 1, speed: 1, interp: 'none' }]);   // the preview preloads the hosted clip
  let done = false;
  const ready = st.ready().then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 20));
  expect(done).toBe(false);
  release();
  await ready;
  expect(done).toBe(true);
  st.draw(1);
  expect(built).toBe(1);   // the first draw keeps the block built with the card
});
