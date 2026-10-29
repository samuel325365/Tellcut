// Cache names carry the source's identity: two files of one size and time are not one file (a dual-track recorder's WAVs on FAT32)
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { analysisFiles } from './analysis.ts';
import { musicFiles } from './extras.ts';
import { fileHash, sourceHash } from './hash.ts';
import { siblingFolders } from './share.ts';

const T = new Date('2026-05-01T10:00:00Z');
/** a project whose media/ holds files of one size and one time; project.json names `listed` as sources */
function project(names: string[], listed = names) {
  const projects = mkdtempSync(join(tmpdir(), 'hash-')), dir = join(projects, 'p');
  mkdirSync(join(dir, 'media'), { recursive: true });
  for (const [i, n] of names.entries()) { const f = join(dir, 'media', n); writeFileSync(f, `track ${i}`); utimesSync(f, T, T); }
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ sources: Object.fromEntries(listed.map((n, i) => [`s${i}`, { path: `media/${n}` }])), media: {} }));
  return { projects, dir, file: (n: string) => join(dir, 'media', n) };
}
const legacy = (dir: string, file: string, note?: string) => {
  const d = join(dir, 'cache', 'analysis', fileHash('analysis|a1', file));
  mkdirSync(d, { recursive: true });
  if (note) writeFileSync(join(d, 'source.json'), JSON.stringify({ path: note }));
  return d;
};

test('two files of one size and time get folders of their own: analysis, music beats and the media caches', () => {
  const p = project(['TR1.WAV', 'TR2.WAV']);
  expect(analysisFiles(p.dir, p.file('TR1.WAV')).dir).not.toBe(analysisFiles(p.dir, p.file('TR2.WAV')).dir);
  expect(musicFiles(p.dir, p.file('TR1.WAV')).dir).not.toBe(musicFiles(p.dir, p.file('TR2.WAV')).dir);
  expect(sourceHash('audio|0|1', p.dir, p.file('TR1.WAV'))).not.toBe(sourceHash('audio|0|1', p.dir, p.file('TR2.WAV')));
  // the identity is the path in the project, as NTFS sees it: the same file spelt otherwise is the same file
  expect(sourceHash('k', p.dir, p.file('TR1.WAV'))).toBe(sourceHash('k', p.dir, join(p.dir, 'MEDIA', 'tr1.wav')));
});

test('a folder made before the names carried the path is still used when nothing else in the project could be its file', () => {
  const p = project(['clip.mp4']), old = legacy(p.dir, p.file('clip.mp4'));
  expect(analysisFiles(p.dir, p.file('clip.mp4')).dir).toBe(old);   // its transcript is not made again
  // a file that is analysed for the first time: the new name
  const q = project(['clip.mp4']);
  expect(basename(analysisFiles(q.dir, q.file('clip.mp4')).dir)).toBe(sourceHash('analysis|a1', q.dir, q.file('clip.mp4')));
});

test('an old folder two files of the project could own: the one its note names keeps it, the other is analysed anew', () => {
  const p = project(['TR1.WAV', 'TR2.WAV']), old = legacy(p.dir, p.file('TR1.WAV'), p.file('TR1.WAV'));
  expect(analysisFiles(p.dir, p.file('TR1.WAV')).dir).toBe(old);
  expect(analysisFiles(p.dir, p.file('TR2.WAV')).dir).not.toBe(old);
  // no note (or one naming a file elsewhere, shared from another project): neither can tell, both are analysed anew
  const q = project(['TR1.WAV', 'TR2.WAV']), unknown = legacy(q.dir, q.file('TR1.WAV'));
  expect([analysisFiles(q.dir, q.file('TR1.WAV')).dir, analysisFiles(q.dir, q.file('TR2.WAV')).dir]).not.toContain(unknown);
});

test('a sibling project’s folder is found under either name: the same footage analysed there before is still shared', () => {
  const p = project(['clip.mp4']), sib = join(p.projects, 'older');
  const theirs = join(sib, 'cache', 'analysis', fileHash('analysis|a1', p.file('clip.mp4')));
  mkdirSync(theirs, { recursive: true });
  const mine = analysisFiles(p.dir, p.file('clip.mp4')).dir;
  expect(basename(mine)).not.toBe(basename(theirs));
  expect(siblingFolders(mine)).toEqual([theirs]);
});
