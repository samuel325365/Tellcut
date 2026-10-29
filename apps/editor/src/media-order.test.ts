import { expect, test } from 'vitest';
import { isVoice, mediaUse, orderMedia, segmentUsed } from './media-order.ts';

const P: any = {
  sources: { b: {}, a: {}, c: {}, d: {} },
  media: { score: { path: 'media/score-x.wav' }, 'voice-s01': { path: 'media/voice/s01.wav' } },
  tracks: [
    { kind: 'video', items: [{ source: 'a', start: 6, end: 8, in: 10, speed: 1 }, { source: 'b', start: 0, end: 4, in: 0, speed: 2 }, { source: 'a', start: 1, end: 2, in: 0, speed: 1 }] },
    { kind: 'audio', items: [{ source: 'd', start: 3, end: 5, in: 1, rate: 1 }] },
    { kind: 'music', items: [{ media: 'voice-s01', start: 2, end: 4, in: 0 }] },
    { kind: 'overlay', items: [{ type: 'common.caption', start: 0, end: 1 }] },
  ],
};

test('the timeline order follows where each source is first used, the unused ones apart in the order they were added', () => {
  const u = mediaUse(P);
  expect(Object.fromEntries(u.first)).toEqual({ b: 0, a: 1, d: 3, 'voice-s01': 2 });
  expect(orderMedia(Object.keys(P.sources), 'timeline', u.first, (x) => x)).toEqual({ used: ['b', 'a', 'd'], unused: ['c'] });
  expect(orderMedia(Object.keys(P.sources), 'added', u.first, (x) => x)).toEqual({ used: ['b', 'a', 'c', 'd'], unused: [] });
  // by the name shown, numbers in order
  const names: Record<string, string> = { a: 'clip 10', b: 'Clip 9', c: 'beach', d: 'dock' };
  expect(orderMedia(Object.keys(P.sources), 'name', u.first, (x) => names[x]).used).toEqual(['c', 'b', 'a', 'd']);
});

test('a segment is used when an item plays part of it (speed counted), not when it only touches its edge', () => {
  const r = mediaUse(P).ranges;
  expect(r.get('b')).toEqual([[0, 8]]);
  expect(segmentUsed(r.get('a'), 0, 5)).toBe(true);
  expect(segmentUsed(r.get('a'), 1, 9.99)).toBe(false);
  expect(segmentUsed(r.get('a'), 11, 20)).toBe(true);
  expect(segmentUsed(r.get('c'), 0, 5)).toBe(false);
});

test('narration from the Cut API is told apart from music', () => {
  expect(isVoice(P.media['voice-s01'])).toBe(true);
  expect(isVoice(P.media.score)).toBe(false);
});
