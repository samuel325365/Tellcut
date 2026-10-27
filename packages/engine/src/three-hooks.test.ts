// @vitest-environment jsdom
// The engine's hooks for three.js blocks (spec 2026-10-25-brand-preset §6.1, §7): the three flag, the late pass, ctx.three.
import { Stage } from './stage.ts';
import { createRegistry, usesThree } from './registry.ts';
import { corePlugin } from './core.ts';
import type { ItemType, Plugin } from './plugin.ts';

const media = (): any => ({ begin() {}, video: () => document.createElement('video'), place() {}, stillUrl: () => 'x.jpg', sync: async () => {}, image: () => document.createElement('img') });
let log: string[], seen: Record<string, unknown[]>;
const rec = (k: string, v: unknown) => { (seen[k] ??= []).push(v); };
const flat: ItemType = { type: 'fx.flat', label: 'flat', kind: 'overlay', params: [], build: () => ({}), draw: (c) => { log.push(`draw:${c.item.id}`); } };
const cube: ItemType = {
  type: 'fx.cube', label: 'cube', kind: 'overlay', three: true, params: [],
  build: (c) => { rec('build', c.three); rec('grades', c.grades); return {}; },
  draw: (c) => { log.push(`draw:${c.item.id}`); rec('draw', c.three); },
  late: (c) => { log.push(`late:${c.item.id}`); rec('late', c.three); },
};
const host: ItemType = { type: 'fx.host', label: 'host', kind: 'overlay', params: [{ key: 'art', label: 'art', type: 'string', default: '' }], build: () => ({}), draw() {} };
const plugin: Plugin = { id: 'fx', items: [flat, cube, host], grades: { warm: 'sepia(0.2)' } };
const reg = () => createRegistry([corePlugin, plugin]);
const project = (items: Array<{ id: string; type: string; start?: number; end?: number; params?: Record<string, unknown> }>, muted = false): any => ({
  version: 1, meta: { width: 100, height: 50, fps: 30, duration: 10, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', ...(muted ? { muted: true } : {}), items: items.map((i) => ({ start: 0, end: 10, params: {}, ...i })) }],
});

beforeEach(() => { log = []; seen = {}; });

test('usesThree is true only when a placed item type is marked three', () => {
  expect(usesThree(project([{ id: 'a', type: 'fx.flat' }]), reg())).toBe(false);
  expect(usesThree(project([{ id: 'a', type: 'fx.flat' }, { id: 'b', type: 'fx.cube' }]), reg())).toBe(true);
});

test("usesThree sees a 3D type hosted by another block's param", () => {
  expect(usesThree(project([{ id: 'a', type: 'fx.host', params: { art: 'fx.cube' } }]), reg())).toBe(true);
  expect(usesThree(project([{ id: 'a', type: 'fx.host', params: { art: 'fx.flat' } }]), reg())).toBe(false);
});

test('a muted track does not count', () => {
  expect(usesThree(project([{ id: 'b', type: 'fx.cube' }], true), reg())).toBe(false);
});

test('ctx.three and ctx.grades reach build, draw and late', () => {
  const KIT = { tag: 1 };
  const st = new Stage(document.createElement('div'), reg(), media(), { three: KIT });
  st.load(project([{ id: 'b', type: 'fx.cube' }]));
  st.draw(1); st.late(1);
  expect([seen.build[0], seen.draw[0], seen.late[0]]).toEqual([KIT, KIT, KIT]);
  expect(seen.grades[0]).toEqual({ warm: 'sepia(0.2)' });
});

test('late runs after draw, only for items showing at t', () => {
  const st = new Stage(document.createElement('div'), reg(), media());
  st.load(project([{ id: 'a', type: 'fx.cube', start: 0, end: 1 }, { id: 'b', type: 'fx.cube', start: 2, end: 3 }, { id: 'c', type: 'fx.flat', start: 0, end: 1 }]));
  st.draw(0.5); st.late(0.5);
  expect(log).toEqual(['draw:a', 'draw:c', 'late:a']);
});

test('a late that throws turns the item into a placeholder like draw does (strict: throws)', () => {
  const bad: ItemType = { ...cube, type: 'fx.bad', late: () => { throw new Error('boom'); } };
  const r = createRegistry([corePlugin, { id: 'fx', items: [bad] }]);
  const errors: string[] = [];
  const st = new Stage(document.createElement('div'), r, media(), { onError: (id) => errors.push(id) });
  st.load(project([{ id: 'x', type: 'fx.bad' }]));
  st.draw(1); st.late(1);
  expect(errors).toEqual(['x']);
  st.draw(1); st.late(1);   // the placeholder no longer runs it
  expect(errors).toEqual(['x']);
  const strict = new Stage(document.createElement('div'), r, media(), { strict: true });
  strict.load(project([{ id: 'x', type: 'fx.bad' }]));
  strict.draw(1);
  expect(() => strict.late(1)).toThrow(/"x"/);
});


test('the stage calls dispose on an item it rebuilds, removes, or drops with a new load', () => {
  const freed: string[] = [];
  const t: ItemType = { type: 'fx.held', label: 'held', kind: 'overlay', params: [{ key: 'n', label: 'n', type: 'number', default: 0 }],
    build: (c) => ({ id: c.item.id }), draw() {}, dispose: (s: { id: string }) => { freed.push(s.id); } };
  const r = createRegistry([corePlugin, { id: 'fx', items: [t] }]);
  const st = new Stage(document.createElement('div'), r, media());
  st.load(project([{ id: 'a', type: 'fx.held' }, { id: 'b', type: 'fx.held' }]));
  st.update(project([{ id: 'a', type: 'fx.held', params: { n: 1 } }, { id: 'b', type: 'fx.held' }]));   // a rebuilt
  expect(freed).toEqual(['a']);
  st.update(project([{ id: 'a', type: 'fx.held', params: { n: 1 } }]));   // b removed
  expect(freed).toEqual(['a', 'b']);
  st.load(project([]));   // everything dropped
  expect(freed).toEqual(['a', 'b', 'a']);
});
