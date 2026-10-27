import { PlayerBridge } from './bridge.ts';

function setup() {
  const sent: any[] = [];
  let frame: (() => void) | null = null;
  const b = new PlayerBridge('http://h', (f) => { frame = f; });
  b.attach({ postMessage: (m: any) => sent.push(m) } as any);
  return { b, sent, tick: () => { const f = frame; frame = null; f?.(); } };
}

test('load waits for boot; patches before ready are held and only the newest is sent once', () => {
  const { b, sent, tick } = setup();
  b.load({ v: 0 });
  b.patch({ v: 1 });
  expect(sent).toEqual([]);
  b.handle({ type: 'boot' });
  expect(sent).toEqual([{ type: 'load', project: { v: 1 } }]);   // the newest project, patch included
  b.patch({ v: 2 });
  tick();
  expect(sent.length).toBe(1);
  let ready = 0;
  b.onReady = (d) => { ready = d; };
  b.handle({ type: 'ready', duration: 9 });
  expect(ready).toBe(9);
  expect(sent.at(-1)).toEqual({ type: 'patch', project: { v: 2 } });
  b.patch({ v: 3 }); b.patch({ v: 4 });
  tick();
  expect(sent.filter((m) => m.type === 'patch').map((m) => m.project.v)).toEqual([2, 4]);
});

test('transport messages go out only when ready; player events reach the callbacks', () => {
  const { b, sent } = setup();
  b.seek(1);
  expect(sent).toEqual([]);
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.seek(2); b.play(2); b.pause();
  expect(sent.slice(1)).toEqual([{ type: 'seek', t: 2 }, { type: 'play', from: 2 }, { type: 'pause' }]);
  const seen: any[] = [];
  b.onTime = (t) => seen.push(t); b.onEnded = () => seen.push('end'); b.onError = (m) => seen.push(m);
  b.handle({ type: 'time', t: 0.5 }); b.handle({ type: 'ended' }); b.handle({ type: 'error', message: 'x' });
  expect(seen).toEqual([0.5, 'end', 'x']);
});

test('a re-booted player gets the newest project, not the one from open time', () => {
  const { b, sent, tick } = setup();
  b.handle({ type: 'boot' }); b.load({ v: 0 }); b.handle({ type: 'ready', duration: 1 });
  b.patch({ v: 1 }); tick();
  b.handle({ type: 'boot' });
  expect(sent.at(-1)).toEqual({ type: 'load', project: { v: 1 } });
});

test('forwarded keys reach onKey', () => {
  const { b } = setup();
  const keys: string[] = [];
  b.onKey = (k) => keys.push(k.key);
  b.handle({ type: 'key', key: 's', code: 'KeyS', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
  expect(keys).toEqual(['s']);
});

test('cropMode goes out when ready; cropChange reaches onCropChange', () => {
  const { b, sent } = setup();
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.cropMode({ itemId: 'c', which: 'from' });
  expect(sent.at(-1)).toEqual({ type: 'cropMode', sel: { itemId: 'c', which: 'from' } });
  const got: any[] = [];
  b.onCropChange = (m) => got.push(m.crop.x);
  b.handle({ type: 'cropChange', itemId: 'c', which: 'from', crop: { x: 0.3, y: 0.5, zoom: 1 }, final: true });
  expect(got).toEqual([0.3]);
});

test('level messages reach onLevel', () => {
  const { b } = setup();
  const got: number[] = [];
  b.onLevel = (db) => got.push(db);
  b.handle({ type: 'level', db: -9 });
  expect(got).toEqual([-9]);
});

test('quality goes out once the player is ready', () => {
  const { b, sent } = setup();
  b.quality('draft');
  expect(sent).toEqual([]);
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.quality('draft');
  expect(sent.at(-1)).toEqual({ type: 'quality', value: 'draft' });
});

test('selection goes to the preview; picks, transform changes and text edits come back', () => {
  const { b, sent } = setup();
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.select('f');
  expect(sent.at(-1)).toEqual({ type: 'select', itemId: 'f' });
  const got: any[] = [];
  b.onPick = (id) => got.push(['pick', id]);
  b.onTransformChange = (m) => got.push(['tf', m.final]);
  b.onParamEdit = (m) => got.push(['edit', m.key, m.value]);
  b.handle({ type: 'pick', itemId: 'f' });
  b.handle({ type: 'transformChange', itemId: 'f', transform: { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5 }, final: true });
  b.handle({ type: 'paramEdit', itemId: 'f', key: 'title', value: 'x' });
  expect(got).toEqual([['pick', 'f'], ['tf', true], ['edit', 'title', 'x']]);
});

test('a seek or play goes out after the waiting patch: the player plays the project as it is now', () => {
  const { b, sent } = setup();
  b.handle({ type: 'boot' }); b.load({ v: 0 }); b.handle({ type: 'ready', duration: 1 });
  b.patch({ v: 1 }); b.seek(2); b.play(2);
  expect(sent.slice(-3).map((m) => m.type)).toEqual(['patch', 'seek', 'play']);
});
