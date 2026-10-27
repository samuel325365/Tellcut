import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeSize } from './ffmpeg.ts';
import { kindOf, localIso, parseIso6709, probeMedia, takenFromTags } from './probe.ts';
import { makePhoneVideo, makePhoto } from './test-media.ts';

const dir = mkdtempSync(join(tmpdir(), 'probe-'));
const local = (iso: string) => { const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

test('kinds by extension; UTC times become this machine local time, times with an offset keep their own; ISO 6709 locations', () => {
  expect([kindOf('a.MOV'), kindOf('b.heic'), kindOf('c.m4a'), kindOf('d.txt')]).toEqual(['video', 'image', 'audio', null]);
  expect(localIso('2026-03-07T01:12:00.000000Z')).toBe(local('2026-03-07T01:12:00Z'));
  // a time with its own offset (iPhone creationdate) is the local time where it was shot, like a photo's EXIF: kept as is
  expect([localIso('2026-07-10T10:00:00+0300'), localIso('2026-07-10T10:00:00-05:00')]).toEqual(['2026-07-10T10:00:00', '2026-07-10T10:00:00']);
  expect(localIso('2026-03-07 10:12:00')).toBe('2026-03-07T10:12:00');
  expect(parseIso6709('+35.0116+135.7681+050.000/')).toEqual([35.0116, 135.7681]);
});

test('a phone video flagged as rotated is portrait; its creation time and sound are read', async () => {
  const f = await makePhoneVideo(join(dir, 'p.mp4'), { created: '2026-03-07T01:12:00Z' });
  const m = await probeMedia(f);
  expect([m.kind, m.width, m.height, m.audio, m.taken, m.takenGuess]).toEqual(['video', 360, 640, true, local('2026-03-07T01:12:00Z'), undefined]);
  expect(m.duration).toBeCloseTo(2, 1);
  expect(await probeSize(f)).toEqual({ width: 360, height: 640 });   // prepare checks declared sizes against this
}, 120000);

test('photos come from their EXIF; without a time the file date is a guess', async () => {
  const m = await probeMedia(await makePhoto(join(dir, 'a.jpg'), { w: 1200, h: 900, orientation: 6, taken: '2026:03:07 10:12:00', gps: [35, 135] }));
  expect([m.kind, m.width, m.height, m.taken, m.gps, m.audio]).toEqual(['image', 900, 1200, '2026-03-07T10:12:00', [35, 135], false]);
  const g = await probeMedia(await makePhoto(join(dir, 'b.jpg'), { w: 64, h: 48 }));
  expect(g.takenGuess).toBe(true);
  expect(g.taken).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
  writeFileSync(join(dir, 'x.txt'), 'x');
  await expect(probeMedia(join(dir, 'x.txt'))).rejects.toThrow(/Not a supported media file/);
}, 120000);

test('an iPhone creation date keeps its zone; a UTC-only time has none (it becomes this machine time)', () => {
  expect(takenFromTags({ 'com.apple.quicktime.creationdate': '2025-07-14T10:19:30+0800', creation_time: '2025-07-22T02:03:16.000000Z' }))
    .toEqual({ taken: '2025-07-14T10:19:30', takenOffset: '+08:00' });
  expect(takenFromTags({ creation_time: '2026-03-07T01:12:00.000000Z' })).toEqual({ taken: local('2026-03-07T01:12:00Z') });
  expect(takenFromTags({})).toBe(null);
});

test('a photo with an EXIF zone keeps it', async () => {
  const m = await probeMedia(await makePhoto(join(dir, 'z.jpg'), { w: 64, h: 48, taken: '2025:07:14 09:16:23', offset: '-07:00' }));
  expect([m.taken, m.takenOffset]).toEqual(['2025-07-14T09:16:23', '-07:00']);
}, 120000);
