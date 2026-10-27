import { CommandError } from './core.ts';
import { addEnvelopePoint, moveEnvelopePoint, removeEnvelopePoint, setFade } from './audio.ts';
import { fixture, item } from './test-fixture.ts';

test('points are inserted in time order and clamped to the clip and the dB range', () => {
  const p = structuredClone(fixture());
  expect(addEnvelopePoint(p, { id: 'm1', t: 2.5, db: -3.04 })).toBe(1);
  expect(addEnvelopePoint(p, { id: 'm1', t: 99, db: -200 })).toBe(4);
  expect(item(p, 'm1').envelope).toEqual([[0, 0], [2.5, -3], [5, -6], [10, 0], [10, -60]]);
  expect(addEnvelopePoint(p, { id: 'a1', t: 0.5, db: 3 })).toBe(0);
  expect(item(p, 'a1').envelope).toEqual([[0.5, 3]]);
});

test('a dragged point never passes its neighbours; removing the last point drops the envelope', () => {
  const p = structuredClone(fixture());
  moveEnvelopePoint(p, { id: 'm1', index: 1, t: 50, db: 40 });
  expect(item(p, 'm1').envelope[1]).toEqual([10, 12]);
  moveEnvelopePoint(p, { id: 'm1', index: 1, t: -5, db: -1 });
  expect(item(p, 'm1').envelope[1]).toEqual([0, -1]);
  addEnvelopePoint(p, { id: 'a1', t: 1, db: 0 });
  removeEnvelopePoint(p, { id: 'a1', index: 0 });
  expect('envelope' in item(p, 'a1')).toBe(false);
  expect(() => removeEnvelopePoint(p, { id: 'a1', index: 0 })).toThrow(CommandError);
});

test('fades are clamped so fade-in plus fade-out fit the clip', () => {
  const p = structuredClone(fixture());
  setFade(p, { id: 'm1', edge: 'in', dur: 20 });
  expect(item(p, 'm1').fadeIn).toBe(9);
  setFade(p, { id: 'm1', edge: 'out', dur: -1 });
  expect(item(p, 'm1').fadeOut).toBe(0);
  expect(() => setFade(p, { id: 'c1', edge: 'in', dur: 1 })).toThrow('Only music and audio clips have fades');
  expect(() => addEnvelopePoint(p, { id: 'c1', t: 1, db: 0 })).toThrow('Only music and audio clips have a volume envelope');
});

test('after a trim leaves points past the clip end, dragging keeps the points in order and visible ones inside the clip', () => {
  const p = structuredClone(fixture());
  item(p, 'm1').envelope = [[0, 0], [8, -6], [10, 0]];
  item(p, 'm1').end = 5;   // trimmed: two points now lie past the end
  moveEnvelopePoint(p, { id: 'm1', index: 2, t: 1, db: 0 });
  moveEnvelopePoint(p, { id: 'm1', index: 0, t: 9, db: 0 });
  const ts = item(p, 'm1').envelope.map(([t]: [number, number]) => t);
  expect(ts).toEqual([...ts].sort((a, b) => a - b));
  expect(ts[0]).toBe(5);
});
