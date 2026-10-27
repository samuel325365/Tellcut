// The same footage in a second project: its analysis is shared (hard links), not made again (TODO chat-fixes).
import { mkdirSync, mkdtempSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analysisDone, analysisFiles, analyzeSource } from './analysis.ts';
import { EXTRAS_VERSION, extrasFiles, sourceExtras } from './extras.ts';
import { fakeTranscribe } from './providers/fake.ts';
import { shareAnalysis } from './share.ts';
import { makePhoneVideo } from './test-media.ts';

test('a second project with the same footage takes the first one\u2019s analysis and transcript instead of making them again', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), b = join(projects, 'b'), src = join(projects, 'clip.mp4');
  mkdirSync(a); mkdirSync(b);
  await makePhoneVideo(src);
  const sttA = fakeTranscribe('一'), sttB = fakeTranscribe('二');
  await analyzeSource(a, src);
  await sourceExtras(a, src, { label: 'clip', stt: sttA });
  expect(shareAnalysis(b, src)).toBeGreaterThan(5);                               // files taken over
  const fa = analysisFiles(a, src), fb = analysisFiles(b, src);
  expect(analysisDone(fb, src)).toBe(true);
  expect(statSync(fb.proxy).nlink).toBe(2);                                       // the same file on disk, not a copy
  await sourceExtras(b, src, { label: 'clip', stt: sttB });
  expect(sttB.calls).toHaveLength(0);
  expect(JSON.parse(readFileSync(extrasFiles(b, src).transcript, 'utf8')).segments[0].text).toBe('一');
  // each project goes its own way afterwards: a file written again in one (atomic rename) leaves the other alone
  const before = readFileSync(fb.cuts, 'utf8');
  writeFileSync(fa.cuts + '.new', '[1, 2]'); renameSync(fa.cuts + '.new', fa.cuts);
  expect(readFileSync(fb.cuts, 'utf8')).toBe(before);
  expect(shareAnalysis(b, src)).toBe(0);                                          // nothing left to take
}, 120000);

test('analysis of a project of its own, or of a file no other project has, shares nothing and fails nothing', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), src = join(projects, 'clip.mp4');
  mkdirSync(a);
  await makePhoneVideo(src);
  expect(shareAnalysis(a, src)).toBe(0);
});

test('analysing and the extras take a sibling project\u2019s work on their own (the server and inspect need no extra step)', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), b = join(projects, 'b'), src = join(projects, 'clip.mp4');
  mkdirSync(a); mkdirSync(b);
  await makePhoneVideo(src);
  await analyzeSource(a, src);
  await sourceExtras(a, src, { label: 'clip', stt: fakeTranscribe('一') });
  await analyzeSource(b, src);
  expect(statSync(analysisFiles(b, src).proxy).nlink).toBe(2);
  const stt = fakeTranscribe('二');
  await sourceExtras(b, src, { label: 'clip', stt });
  expect(stt.calls).toHaveLength(0);
}, 120000);

test('another project transcribing or analysing the same footage right now is waited for, not done twice', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), b = join(projects, 'b'), src = join(projects, 'clip.mp4');
  mkdirSync(a); mkdirSync(b);
  await makePhoneVideo(src);
  const other = JSON.stringify({ pid: process.ppid, started: 1234 });             // a live process that is not this one
  // transcribing in a: b's extras leave the transcript to it and say since when
  await analyzeSource(a, src);
  writeFileSync(join(analysisFiles(a, src).dir, 'transcript.lock'), other);
  const stt = fakeTranscribe();
  expect(await sourceExtras(b, src, { label: 'clip', stt })).toEqual({ transcribing: { started: 1234 } });
  expect(stt.calls).toHaveLength(0);
  // analysing in a (no proxy there yet): b waits until a lets go
  const c = join(projects, 'c'), src2 = join(projects, 'clip2.mp4');
  mkdirSync(c);
  await makePhoneVideo(src2, { seconds: 1 });
  const lockA = join(analysisFiles(a, src2).dir, 'analysis.lock');
  mkdirSync(join(lockA, '..'), { recursive: true });
  writeFileSync(lockA, other);
  let done = false;
  const run = analyzeSource(c, src2).then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 1500));
  expect(done).toBe(false);
  (await import('node:fs')).rmSync(lockA);
  await run;
  expect(done).toBe(true);
}, 120000);

test('a transcript another project finishes after this one was analysed is still taken over', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), b = join(projects, 'b'), src = join(projects, 'clip.mp4');
  mkdirSync(a); mkdirSync(b);
  await makePhoneVideo(src);
  await analyzeSource(a, src);
  await analyzeSource(b, src);                                                     // b analysed before a has a transcript
  await sourceExtras(a, src, { label: 'clip', stt: fakeTranscribe('一') });
  const stt = fakeTranscribe('二');
  await sourceExtras(b, src, { label: 'clip', stt });
  expect([stt.calls.length, JSON.parse(readFileSync(extrasFiles(b, src).transcript, 'utf8')).segments[0].text]).toEqual([0, '一']);
}, 120000);

test('projects made at once from the same footage transcribe it once: the ones queued behind take the first one’s', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), src = join(projects, 'clip.mp4');
  await makePhoneVideo(src);
  const dirs = ['a', 'b', 'c'].map((x) => { mkdirSync(join(projects, x)); return join(projects, x); });
  for (const d of dirs) await analyzeSource(d, src);
  // a batch: every project's extras start together, before any transcript exists, then wait for the one background slot
  const stts = dirs.map(() => fakeTranscribe('一'));
  await Promise.all(dirs.map((d, i) => sourceExtras(d, src, { label: 'clip', stt: stts[i] })));
  expect(stts.map((s) => s.calls.length)).toEqual([1, 0, 0]);
}, 120000);

test('a sibling\u2019s sheets and burned check made by an older EXTRAS_VERSION are not taken (they would be stamped current here)', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), b = join(projects, 'b'), src = join(projects, 'clip.mp4');
  mkdirSync(a); mkdirSync(b);
  await makePhoneVideo(src);
  await analyzeSource(a, src);
  await sourceExtras(a, src, { label: 'clip', stt: fakeTranscribe('一') });
  const fa = extrasFiles(a, src), fb = extrasFiles(b, src);
  writeFileSync(fa.version, 'x0'); writeFileSync(fa.sheets, JSON.stringify({ pages: 99 }));   // a was analysed by an older version
  await analyzeSource(b, src);
  const stt = fakeTranscribe('二');
  await sourceExtras(b, src, { label: 'clip', stt });
  expect([JSON.parse(readFileSync(fb.sheets, 'utf8')).pages, readFileSync(fb.version, 'utf8')]).toEqual([1, EXTRAS_VERSION]);   // made again
  expect(statSync(fb.sheets).nlink).toBe(1);
  expect(stt.calls).toHaveLength(0);                                              // the transcript has its own record: still taken
  // once a is current again, its sheets are shared as before
  const c = join(projects, 'c'); mkdirSync(c);
  writeFileSync(fa.version, EXTRAS_VERSION);
  expect(shareAnalysis(c, src)).toBeGreaterThan(5);
  expect(JSON.parse(readFileSync(extrasFiles(c, src).sheets, 'utf8')).pages).toBe(99);
}, 120000);
