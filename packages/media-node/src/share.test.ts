// The same footage in a second project: its analysis is shared (hard links), not made again (TODO chat-fixes).
import { mkdirSync, mkdtempSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { analysisDone, analysisFiles, analyzeSource, shareAnalysis } from './analysis.ts';
import { EXTRAS_VERSION, extrasFiles, sourceExtras } from './extras.ts';
import { fakeTranscribe } from './providers/fake.ts';
import { labelFolder, siblingFolders } from './share.ts';
import { makePhoneVideo } from './test-media.ts';

test('a second project with the same footage takes the first one\u2019s analysis and transcript instead of making them again', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), b = join(projects, 'b'), src = join(projects, 'clip.mp4');
  mkdirSync(a); mkdirSync(b);
  await makePhoneVideo(src);
  const sttA = fakeTranscribe('一'), sttB = fakeTranscribe('二');
  await analyzeSource(a, src);
  await sourceExtras(a, src, { label: 'clip', stt: sttA });
  expect(await shareAnalysis(b, src)).toBeGreaterThan(5);                               // files taken over
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
  expect(await shareAnalysis(b, src)).toBe(0);                                          // nothing left to take
}, 120000);

test('analysis of a project of its own, or of a file no other project has, shares nothing and fails nothing', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), a = join(projects, 'a'), src = join(projects, 'clip.mp4');
  mkdirSync(a);
  await makePhoneVideo(src);
  expect(await shareAnalysis(a, src)).toBe(0);
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
  expect(await shareAnalysis(c, src)).toBeGreaterThan(5);
  expect(JSON.parse(readFileSync(extrasFiles(c, src).sheets, 'utf8')).pages).toBe(99);
}, 120000);

/** a project folder naming `files` (relative paths) as sources; each file made with `bytes` and one time */
const T = new Date('2026-05-01T10:00:00Z');
function footage(projects: string, id: string, files: Record<string, Buffer>) {
  const dir = join(projects, id);
  for (const [rel, bytes] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), bytes); utimesSync(join(dir, rel), T, T); }
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ sources: Object.fromEntries(Object.keys(files).map((rel, i) => [`s${i}`, { path: rel }])), media: {} }));
  return dir;
}
/** a finished analysis faked for `src` (no ffmpeg): the five files analysisDone looks for, the proxy stamp, a transcript, its note */
function analysed(projectDir: string, src: string, o: { note?: boolean } = {}) {
  const f = analysisFiles(projectDir, src);
  mkdirSync(f.dir, { recursive: true });
  for (const p of [f.proxy, f.thumbs, f.thumbIndex, f.cuts, f.peaks, join(f.dir, 'proxy.v3'), extrasFiles(projectDir, src).transcript]) writeFileSync(p, `made for ${src}`);
  if (o.note !== false) labelFolder(f.dir, src);
  return f;
}
const bytes = (fill: number, n = 300_000) => Buffer.alloc(n, fill);
/** a project.json that names `rel` instead of what it named (the file renamed or moved in the project, then relinked) */
const relink = (dir: string, rel: string) => writeFileSync(join(dir, 'project.json'), JSON.stringify({ sources: { s0: { path: rel } }, media: {} }));

test('footage renamed or moved in its project keeps its analysis and transcript under its new name (real analysis)', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-')), p = join(projects, 'p'), src = join(p, 'media', 'clip.mp4');
  mkdirSync(join(p, 'media'), { recursive: true });
  await makePhoneVideo(src);
  relink(p, 'media/clip.mp4');
  await analyzeSource(p, src);
  await sourceExtras(p, src, { label: 'clip', stt: fakeTranscribe('一') });
  const moved = join(p, 'media', 'day1', 'opening.mp4'), before = analysisFiles(p, src).dir;
  mkdirSync(dirname(moved)); renameSync(src, moved); relink(p, 'media/day1/opening.mp4');   // a rename keeps the file's time
  expect(analysisFiles(p, moved).dir).not.toBe(before);
  await analyzeSource(p, moved);
  expect(statSync(analysisFiles(p, moved).proxy).nlink).toBe(2);                 // the proxy made before, not a new one
  const stt = fakeTranscribe('二');
  await sourceExtras(p, moved, { label: 'clip', stt });
  expect([stt.calls.length, JSON.parse(readFileSync(extrasFiles(p, moved).transcript, 'utf8')).segments[0].text]).toEqual([0, '一']);
  // and again after a second move
  const again = join(p, 'media', 'opening.mp4');
  renameSync(moved, again); relink(p, 'media/opening.mp4');
  expect(await shareAnalysis(p, again)).toBeGreaterThan(5);
}, 120000);

test('the same footage at another path in another project is shared once its content is known to be the same', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-'));
  const a = footage(projects, 'a', { 'media/clip.mp4': bytes(1) }), b = footage(projects, 'b', { 'media/renamed.mp4': bytes(1) });
  const fa = analysed(a, join(a, 'media/clip.mp4')), mine = join(b, 'media/renamed.mp4');
  expect(await shareAnalysis(b, mine)).toBeGreaterThan(5);
  expect(analysisDone(analysisFiles(b, mine), mine)).toBe(true);
  expect(statSync(analysisFiles(b, mine).proxy).nlink).toBe(2);
  expect(readFileSync(extrasFiles(b, mine).transcript, 'utf8')).toBe(`made for ${join(a, 'media/clip.mp4')}`);
  expect(JSON.parse(readFileSync(join(analysisFiles(b, mine).dir, 'source.json'), 'utf8')).path).toBe(mine);   // its own note, not a's
  expect(await siblingFolders(analysisFiles(b, mine).dir)).toContain(fa.dir);   // so a transcript being made in a is waited for, not made twice
});

test('two different files of one size and time never share, whether the other is still there or was renamed', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-'));
  // the other one still there (a dual-track recorder's two WAVs)
  const p = footage(projects, 'p', { 'media/TR1.WAV': bytes(1), 'media/TR2.WAV': bytes(2) });
  analysed(p, join(p, 'media/TR1.WAV'));
  expect(await shareAnalysis(p, join(p, 'media/TR2.WAV'))).toBe(0);
  // the analysed one renamed away, its note's print says what it held
  const q = footage(projects, 'q', { 'media/a.wav': bytes(1) });
  analysed(q, join(q, 'media/a.wav'));
  renameSync(join(q, 'media/a.wav'), join(q, 'media/kept.wav'));
  writeFileSync(join(q, 'media/b.wav'), bytes(2)); utimesSync(join(q, 'media/b.wav'), T, T);
  relink(q, 'media/b.wav');
  expect(await shareAnalysis(q, join(q, 'media/b.wav'))).toBe(0);
  relink(q, 'media/kept.wav');
  expect(await shareAnalysis(q, join(q, 'media/kept.wav'))).toBeGreaterThan(5);   // the renamed one itself takes it
});

test('a folder from before notes held a print: taken after a rename only when nothing else could be its file', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-'));
  const p = footage(projects, 'p', { 'media/a.mp4': bytes(1) }), f = analysed(p, join(p, 'media/a.mp4'), { note: false });
  writeFileSync(join(f.dir, 'source.json'), JSON.stringify({ path: join(p, 'media/a.mp4') }));   // the old note: the path only
  renameSync(join(p, 'media/a.mp4'), join(p, 'media/b.mp4')); relink(p, 'media/b.mp4');
  expect(await shareAnalysis(p, join(p, 'media/b.mp4'))).toBeGreaterThan(5);
  // two files of the project now have that size and time: the old folder could be either's, so neither takes it
  const q = footage(mkdtempSync(join(tmpdir(), 'share-')), 'q', { 'media/a.wav': bytes(1), 'media/c.wav': bytes(3) }), g = analysed(q, join(q, 'media/a.wav'), { note: false });
  writeFileSync(join(g.dir, 'source.json'), JSON.stringify({ path: join(q, 'media/a.wav') }));
  renameSync(join(q, 'media/a.wav'), join(q, 'media/b.wav'));
  writeFileSync(join(q, 'project.json'), JSON.stringify({ sources: { s0: { path: 'media/b.wav' }, s1: { path: 'media/c.wav' } }, media: {} }));
  expect(await shareAnalysis(q, join(q, 'media/b.wav'))).toBe(0);
  expect(await shareAnalysis(q, join(q, 'media/c.wav'))).toBe(0);
});

test('looking through every project for the same footage lets other work run meanwhile (a NAS or a slow drive does not hold the server up)', async () => {
  const projects = mkdtempSync(join(tmpdir(), 'share-'));
  for (let i = 0; i < 20; i++) analysed(footage(projects, `p${i}`, { 'media/a.mp4': bytes(i + 1) }), join(projects, `p${i}`, 'media/a.mp4'));
  const mine = footage(projects, 'mine', { 'media/b.mp4': bytes(1) }), dir = analysisFiles(mine, join(mine, 'media/b.mp4')).dir;
  let ran = false;
  setImmediate(() => { ran = true; });
  const looking = siblingFolders(dir);
  expect(ran).toBe(false);
  expect(await looking).toEqual([analysisFiles(join(projects, 'p0'), join(projects, 'p0', 'media/a.mp4')).dir]);
  expect(ran).toBe(true);
});
