import { resolveTimes } from '@tellcut/engine';
import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { layoutRows } from './geometry.ts';
import { dragRecipe, itemsInRect, planDrag } from './drag.ts';

const P = fixture(), T = resolveTimes(P);
const none = { alt: false, ctrl: false, shift: false };
const apply = (recipe: (d: any) => void): any => { const d = structuredClone(P); recipe(d); return d; };

test('modifiers and grip choose the edit (spec §4.2)', () => {
  expect(planDrag(P, T, { grip: 'body', id: 'c1', mods: none, selection: ['c1', 'a1'] })).toEqual({ kind: 'move', ids: ['c1', 'a1'] });
  expect(planDrag(P, T, { grip: 'body', id: 'c1', mods: none, selection: ['a1'] })).toEqual({ kind: 'move', ids: ['c1'] });
  expect(planDrag(P, T, { grip: 'body', id: 'c2', mods: { ...none, alt: true }, selection: [] }).kind).toBe('slip');
  expect(planDrag(P, T, { grip: 'end', id: 'c1', mods: { ...none, alt: true }, selection: [] })).toEqual({ kind: 'roll', ids: ['c1'], left: 'c1', right: 'c2' });
  expect(planDrag(P, T, { grip: 'start', id: 'c2', mods: { ...none, alt: true }, selection: [] })).toEqual({ kind: 'roll', ids: ['c2'], left: 'c1', right: 'c2' });
  expect(planDrag(P, T, { grip: 'end', id: 'c2', mods: { ...none, ctrl: true }, selection: [] }).kind).toBe('stretchEnd');
  expect(planDrag(P, T, { grip: 'end', id: 'm1', mods: { ...none, ctrl: true }, selection: [] }).kind).toBe('trimEnd');
  expect(planDrag(P, T, { grip: 'start', id: 'blk', mods: none, selection: [] }).kind).toBe('trimStart');
});

test('moves snap their nearest edge to beats and edges; Ctrl-free threshold only', () => {
  const plan = planDrag(P, T, { grip: 'body', id: 'a1', mods: none, selection: [] });
  const r = dragRecipe(P, T, plan, 0.47, { snap: true, threshold: 0.1, playhead: 0 });
  expect(r.guide).toBe(1.5);
  expect(apply(r.recipe).tracks[4].items[0].start).toBe(1.5);
  const free = dragRecipe(P, T, plan, 0.47, { snap: false, threshold: 0.1, playhead: 0 });
  expect([free.guide, apply(free.recipe).tracks[4].items[0].start]).toEqual([null, 1.47]);
});

test('slip moves the media opposite to the pointer, scaled by speed', () => {
  const plan = planDrag(P, T, { grip: 'body', id: 'c2', mods: { alt: true, ctrl: false, shift: false }, selection: [] });
  expect(apply(dragRecipe(P, T, plan, 1, { snap: true, threshold: 0.1, playhead: 0 }).recipe).tracks[1].items[1].in).toBe(8);
});

test('box selection picks items overlapping the rectangle', () => {
  const rows = layoutRows(P), view = { pps: 50, scroll: 0 };
  const v = rows.find((r) => r.track.id === 'v')!;
  expect(itemsInRect(P, T, rows, view, { x0: 150, y0: v.y + 5, x1: 260, y1: v.y + 10 })).toEqual(['c1', 'c2']);
});

test('a marquee in the second lane selects only the item in that lane', () => {
  const p = fixture();
  (p.tracks[1].items as any[]).push({ id: 'c3', source: 's', in: 0, speed: 1, start: 3, end: 5, frame: [0, 0, 1, 1],
    crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, interp: 'none' });
  const rows = layoutRows(p), v = rows.find((r) => r.track.id === 'v')!;
  expect(itemsInRect(p, resolveTimes(p), rows, { pps: 50, scroll: 0 }, { x0: 160, y0: v.y + 60, x1: 240, y1: v.y + 70 })).toEqual(['c3']);
});
