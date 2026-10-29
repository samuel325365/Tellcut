import { expect, test } from 'vitest';
import { formatClips, timelineClips } from './inspect-clips.ts';

const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clip = (id: string, start: number, end: number, source: string, at: number, more: object = {}) =>
  ({ id, start, end, source, in: at, speed: 1, frame: [0, 0, 1, 1], crop, interp: 'none', ...more });
const sound = (id: string, start: number, end: number, source: string, at: number, more: object = {}) =>
  ({ id, start, end, source, in: at, rate: 1, gain: 0, fadeIn: 0, fadeOut: 0, ...more });
const sources = { video1: { path: 'a.mp4', duration: 60 }, video2: { path: 'b.mp4', duration: 30 }, video10: { path: 'c.mp4', duration: 20 },
  photo: { path: 'p.jpg', duration: 5, kind: 'image' as const }, video11: { path: 'd.mp4', duration: 9 } };

test('each clip says which source it plays and from where; a linked sound of the clip is not repeated; unused sources are named', () => {
  const p = { sources, tracks: [
    { id: 'v1', kind: 'video' as const, items: [clip('a', 0, 2, 'video10', 12.5), clip('b', 2, 3.5, 'photo', 0), clip('c', 3.5, 5.5, 'video1', 40, { speed: 2, label: 'jump' })] },
    // the clip's own sound (relative to its parent), and a sound from another source laid under it
    { id: 'orig', name: 'Source', kind: 'audio' as const, items: [sound('s1', 0, 2, 'video10', 12.5, { parent: 'a' }), sound('s2', 1, 3, 'video2', 4, { parent: 'b' })] },
  ] } as any;
  expect(timelineClips(p)).toEqual([
    { track: 'v1', start: 0, end: 2, source: 'video10', in: 12.5, out: 14.5 },
    { track: 'v1', start: 2, end: 3.5, source: 'photo' },
    { track: 'Source', start: 3, end: 5, source: 'video2', in: 4, out: 6 },
    { track: 'v1', start: 3.5, end: 5.5, source: 'video1', in: 40, out: 44, speed: 2, label: 'jump' },
  ]);
  expect(formatClips(p)).toEqual([
    '時間軸上的片段（時間軸 ← 素材 素材裡的入點–出點）：',
    '  v1 0:00.0–0:02.0 ← video10 0:12.5–0:14.5',
    '  v1 0:02.0–0:03.5 ← photo（照片）',
    '  Source 0:03.0–0:05.0 ← video2 0:04.0–0:06.0',
    '  v1 0:03.5–0:05.5 ← video1 0:40.0–0:44.0 ×2「jump」',
    '  沒用到：video11',
  ]);
});

test('one track: no track names; an empty timeline adds nothing', () => {
  const p = { sources, tracks: [{ id: 'v1', kind: 'video' as const, items: [clip('a', 0, 1, 'video11', 0)] }] } as any;
  expect(formatClips(p)[1]).toBe('  0:00.0–0:01.0 ← video11 0:00.0–0:01.0');
  expect(formatClips({ sources, tracks: [{ id: 'v1', kind: 'video', items: [] }] } as any)).toEqual([]);
});
