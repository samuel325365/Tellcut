import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaKindOfName } from '@tellcut/protocol';
import { ffmpeg, ffprobe, lengthOrNull, packetsEnd, probeDuration, probeDurationSync, probeSize } from './ffmpeg.ts';
import { kindOf, localIso, parseIso6709, probeMedia, takenFromTags } from './probe.ts';
import { makePhoneVideo, makePhoto } from './test-media.ts';

const dir = mkdtempSync(join(tmpdir(), 'probe-'));
const local = (iso: string) => { const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

test('kinds by extension; UTC times become this machine local time, times with an offset keep their own; ISO 6709 locations', () => {
  expect([kindOf('a.MOV'), kindOf('b.heic'), kindOf('c.m4a'), kindOf('d.txt')]).toEqual(['video', 'image', 'audio', null]);
  // the same lists in the browser (a file dropped on the editor), from a name alone
  expect([mediaKindOfName('a.MOV'), mediaKindOfName('x.y.webp'), mediaKindOfName('c.flac'), mediaKindOfName('mp4'), mediaKindOfName('d.txt')]).toEqual(['video', 'image', 'audio', null, null]);
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

/** a 3 s WebM written through a pipe, as a browser's MediaRecorder writes one: no length in its header */
async function pipedWebm(file: string) {
  const { stdout } = await ffmpeg(['-f', 'lavfi', '-i', 'testsrc=s=320x240:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3', '-c:v', 'libvpx-vp9', '-deadline', 'realtime',
    '-cpu-used', '8', '-b:v', '300k', '-c:a', 'libopus', '-f', 'webm', '-'], { stdout: true });
  writeFileSync(file, stdout);
  return { file, bytes: stdout };
}

test('a piped WebM with no length in its header is measured from its packets; one with no packets at all has no length, never 0 or NaN', async () => {
  const { file, bytes } = await pipedWebm(join(dir, 'rec.webm'));
  expect(await ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file])).toMatch(/^(N\/A)?$/);   // what made it 0 before
  const m = await probeMedia(file);
  expect([m.kind, m.width, m.height, m.audio]).toEqual(['video', 320, 240, true]);
  expect(m.duration).toBeCloseTo(3, 1);
  expect(await probeDuration(file)).toBeCloseTo(3, 1);
  expect(probeDurationSync(file)).toBeCloseTo(3, 1);
  // only the header of the recording (it stopped before its first frame was written): its streams, but no packet to measure
  const cut = join(dir, 'cut.webm');
  // up to its first frame: the first Cluster's header (Matroska ID 1F43B675) whole, cut before its first SimpleBlock (A3)
  const cluster = bytes.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  writeFileSync(cut, bytes.subarray(0, bytes.indexOf(0xa3, cluster + 4)));
  await expect(probeMedia(cut)).rejects.toThrow(/no length/);
  await expect(probeDuration(cut)).rejects.toThrow(/no length/);
  expect(() => probeDurationSync(cut)).toThrow(/no length/);
}, 120000);

test('packetsEnd: the latest packet time plus its length, whatever order the streams interleave in; null when none has a time', () => {
  expect(packetsEnd(['2.967000,0.033000', '2.994000,0.020000,', '2.974000,0.020000', ''])).toBeCloseTo(3.014, 6);
  expect(packetsEnd(['N/A,N/A', '1.5,N/A'])).toBe(1.5);
  expect(packetsEnd(['N/A,0.02', ''])).toBeNull();
  expect([lengthOrNull('N/A'), lengthOrNull(''), lengthOrNull(undefined), lengthOrNull('0.000000'), lengthOrNull('2.5')]).toEqual([null, null, null, null, 2.5]);
});

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
