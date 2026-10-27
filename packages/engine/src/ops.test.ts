import { fixture, item } from './commands/test-fixture.ts';
import { applyOps, OpError, OPS } from './ops.ts';

test('every op the spec lists is registered', () => {
  for (const n of ['moveItems', 'deleteItems', 'rippleDelete', 'restackItem', 'moveTrack', 'removeTrack', 'trimStart', 'trimEnd', 'slip', 'roll', 'rateStretch',
    'split', 'updateItem', 'setTrack', 'setCrop', 'addCropKey', 'removeCropKey', 'setTransform', 'addItem', 'addTrack', 'setFade', 'addEnvelopePoint',
    'moveEnvelopePoint', 'removeEnvelopePoint', 'setCrossfade', 'swapSource', 'attach', 'detach', 'setMagnetic']) expect(typeof OPS[n]).toBe('function');
});

test('ops apply in order; a new item can be named and used by the next op', () => {
  const r = applyOps(fixture(), [
    { op: 'trimEnd', id: 'c1', dt: -1 },
    { op: 'addItem', track: 'fx', as: '$hit', item: { type: 'x.tap', start: 1, end: 1.1, params: {}, gain: 0 } },
    { op: 'moveItems', ids: ['$hit'], dt: 1 },
  ]);
  expect(item(r.project, 'c1').end).toBe(3);
  const hit = r.project.tracks.find((t) => t.id === 'fx')!.items.find((i: any) => i.start === 2)!;
  expect(r.changed).toEqual(expect.arrayContaining(['c1', hit.id]));
  expect(r.summary.join('\n')).toMatch(/c1 end 4\.00→3\.00/);
  expect(r.summary.join('\n')).toMatch(/新增/);
});

test('a named new item can become the parent of another through updateItem', () => {
  const r = applyOps(fixture(), [
    { op: 'addItem', track: 'sc', as: '$b', item: { id: 'blk2', type: 'x.block', start: 8, end: 12, params: {} } },
    { op: 'updateItem', id: 'tap', patch: { parent: '$b' } },
  ]);
  expect(item(r.project, 'tap').parent).toBe('blk2');
  expect(() => applyOps(fixture(), [{ op: 'updateItem', id: 'tap', patch: { parent: '$nope' } }])).toThrow(/\$nope/);
});

test('errors name the op and its place, and leave the project untouched', () => {
  const p = fixture();
  expect(() => applyOps(p, [{ op: 'trimEnd', id: 'c1', dt: -1 }, { op: 'trimEnd', id: 'zz', dt: 1 }])).toThrow('第 2 條（trimEnd）：No item "zz"');
  expect(() => applyOps(p, [{ op: 'explode' }])).toThrow(/第 1 條（explode）：沒有這個指令/);
  expect(() => applyOps(p, [{ op: 'moveItems', ids: ['$nope'], dt: 1 }])).toThrow(/\$nope/);
  expect(() => applyOps(p, [{ op: 'updateItem', id: 'c1', patch: { speed: -3 } }])).toThrow(OpError);
  expect(item(p, 'c1').end).toBe(4);
});

test('swapSource changes the shot, keeps the length, and refuses a source too short from that point', () => {
  const r = applyOps(fixture(), [{ op: 'swapSource', id: 'c1', source: 's', in: 20 }]);
  expect(item(r.project, 'c1')).toMatchObject({ source: 's', in: 20, start: 0, end: 4 });
  expect(() => applyOps(fixture(), [{ op: 'swapSource', id: 'c1', source: 's', in: 28 }])).toThrow(/has only 2\.00 s/);
});

test('swapSource counts a held clip by the source it plays before freezeAt (c2: 3 s × speed 2)', () => {
  expect(item(applyOps(fixture(), [{ op: 'swapSource', id: 'c2', source: 's', in: 24 }]).project, 'c2')).toMatchObject({ in: 24, start: 4, end: 8 });
  expect(() => applyOps(fixture(), [{ op: 'swapSource', id: 'c2', source: 's', in: 25 }])).toThrow(/needs 6\.00 s/);
});

test('a project as read from disk (defaults left out) is filled in first: the summary names only what the ops changed', () => {
  const raw: any = structuredClone(fixture());
  for (const t of raw.tracks) for (const it of t.items) { delete it.frame; delete it.interp; }
  const r = applyOps(raw, [{ op: 'trimEnd', id: 'c1', dt: -1 }]);
  expect(r.changed).toEqual(['c1']);
  expect(r.summary).toEqual(['c1 end 4.00→3.00']);
});

test('ops that are not a list of { op } say so', () => {
  expect(() => applyOps(fixture(), 'trimEnd' as any)).toThrow(/ops 要是一個陣列/);
  expect(() => applyOps(fixture(), [null as any])).toThrow(/第 1 條.*要是 \{ op/);
});

test('the summary also comes as lines with codes, for the page to word in its language', () => {
  const r = applyOps(fixture(), [
    { op: 'trimEnd', id: 'c1', dt: -1 },
    { op: 'addItem', track: 'fx', as: '$hit', item: { type: 'x.tap', start: 1, end: 1.1, params: {}, gain: 0 } },
  ]);
  const hit = r.project.tracks.find((t) => t.id === 'fx')!.items.find((i: any) => i.type === 'x.tap' && i.start === 1)!;
  expect(r.lines).toEqual(expect.arrayContaining([
    { k: 'num', id: 'c1', key: 'end', from: '4.00', to: '3.00' },
    { k: 'add', id: hit.id, track: 'fx', type: 'x.tap' },
  ]));
  expect(r.lines!.length).toBe(r.summary.length);   // one line for each line of the Chinese summary
});
