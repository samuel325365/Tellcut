import { videoLinks } from './pairs.ts';

const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clip = (id: string, start: number, end: number, o: any = {}) => ({ id, source: 's', in: 0, speed: 1, start, end, frame: [0, 0, 1, 1], crop, interp: 'none', ...o });
const tracks = (...items: any[]): any => ({ tracks: [{ id: 'v', kind: 'video', items }] });

test('a linked transition: B learns A\'s frame, A learns B\'s transition in its own seconds', () => {
  const p = tracks(clip('a', 1, 5, { frame: [0, 0, 1, 1] }), clip('b', 4, 8, { frame: [0.1, 0, 0.9, 1], shape: [[0, 0], [1, 0], [1, 1]], transitionIn: { type: 'push', dur: 1, dir: 'u', x: 0.2 } }));
  const m = videoLinks(p);
  expect(m.get('b')).toEqual({ from: [0, 0, 1, 1] });
  expect(m.get('a')).toEqual({ out: { type: 'push', dir: 'u', x: 0.2, at: 3, dur: 1, frame: [0.1, 0, 0.9, 1], shaped: true } });
});

test('a transition whose length is not the overlap, a cut, or no transition links nothing (A is never moved by them)', () => {
  for (const tr of [{ type: 'push', dur: 0.5 }, { type: 'push', dur: 1.5 }, { type: 'cut', dur: 1 }, undefined]) {
    expect(videoLinks(tracks(clip('a', 0, 5), clip('b', 4, 8, tr ? { transitionIn: tr } : {}))).size).toBe(0);
  }
  // clips that only touch do not overlap; clips on different tracks are no pair
  expect(videoLinks(tracks(clip('a', 0, 4), clip('b', 4, 8, { transitionIn: { type: 'push', dur: 0 } }))).size).toBe(0);
  expect(videoLinks({ tracks: [{ id: 'v', kind: 'video', items: [clip('a', 0, 5)] }, { id: 'w', kind: 'video', items: [clip('b', 4, 8, { transitionIn: { type: 'push', dur: 1 } })] }] } as any).size).toBe(0);
});

test('a clip both incoming and outgoing gets both sides', () => {
  const m = videoLinks(tracks(clip('a', 0, 5), clip('b', 4, 9, { transitionIn: { type: 'wipe', dur: 1 } }), clip('c', 8, 12, { transitionIn: { type: 'push', dur: 1, dir: 'r' } })));
  expect(m.get('b')).toEqual({ from: [0, 0, 1, 1], out: { type: 'push', dir: 'r', at: 4, dur: 1, frame: [0, 0, 1, 1], shaped: false } });
});
