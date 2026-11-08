import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { corePlugin, createRegistry, parseProject } from '@tellcut/engine';
import { ffmpeg, prepareProject, probeDuration } from '@tellcut/media-node';
import { exportPlan, exportProject, exportProjectTrimmed, ImportError, importProject, leftoverPaths, oddEntries, scrubText, usedRanges } from './export-project.ts';

/** a tellcut/ with one project whose footage is partly inside it and partly on another folder */
function world() {
  const root = mkdtempSync(join(tmpdir(), 'exp-')), tellcut = join(root, 'tellcut'), dir = join(tellcut, 'projects', 'trip');
  for (const d of ['fx', 'score', 'media/voice', '.history/chat', 'cache', 'exports']) mkdirSync(join(dir, d), { recursive: true });
  mkdirSync(join(root, 'footage'), { recursive: true });
  const project = { version: 1, meta: { name: '旅行' }, sources: { a: { path: '../../../footage/a.mp4' }, b: { path: 'media/b.mp4' } }, media: { v: { path: 'media/voice/1.wav' } }, tracks: [] };
  const put = (f: string, s = f) => writeFileSync(join(dir, f), s);
  put('project.json', JSON.stringify(project)); put('cut.ts'); put('narration.json'); put('storyboard.md'); put('brand.md'); put('CREDITS.md'); put('fx/ring.js'); put('score/waltz.js');
  put('media/b.mp4'); put('media/voice/1.wav'); put('.history/chat/chat.json'); put('.history/chat/chat.json.lock'); put('.history/chat/chat.json.123.tmp'); put('cache/proxy.mp4'); put('cache/cut-state.json'); put('exports/film.mp4');   // the lock and .tmp: a chat turn running as it was zipped
  writeFileSync(join(root, 'footage', 'a.mp4'), 'footage a');
  return { root, tellcut, dir };
}

test('what an export holds: the project\'s own files and history; --media adds media/ and footage from outside, rewritten to sit inside', () => {
  const { dir } = world(), project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const own = exportPlan(dir, project, { media: false });
  // cut-state.json goes too: without it the imported project's next cut wrote over the editor's edits without asking
  expect(own.files.map((f) => f.to).sort()).toEqual(['.history/chat/chat.json', 'CREDITS.md', 'brand.md', 'cache/cut-state.json', 'cut.ts', 'fx/ring.js', 'narration.json', 'score/waltz.js', 'storyboard.md']);
  expect(own.project).toEqual(project);                                       // paths untouched: the footage is not in the zip
  expect(own.outside).toEqual(['a']);
  const all = exportPlan(dir, project, { media: true });
  expect(all.files.map((f) => f.to)).toEqual(expect.arrayContaining(['media/b.mp4', 'media/voice/1.wav', 'media/linked/a-a.mp4']));
  expect(all.files.map((f) => f.to).some((t) => (t.startsWith('cache/') && t !== 'cache/cut-state.json') || t.startsWith('exports/'))).toBe(false);   // remade / the films themselves
  expect(all.project.sources!.a.path).toBe('media/linked/a-a.mp4');
  expect(all.project.sources!.b.path).toBe('media/b.mp4');
});

test('export then import: the project comes back whole under its id or a new one; an existing project is never overwritten', () => {
  const { root, tellcut, dir } = world();
  const zip = exportProject(dir, { media: true, out: join(root, 'trip.zip') });
  expect(existsSync(zip)).toBe(true);
  const other = join(root, 'other-tellcut', 'projects');
  mkdirSync(other, { recursive: true });
  const back = importProject(zip, other);
  expect(back).toBe(join(other, 'trip'));
  expect(JSON.parse(readFileSync(join(back, 'project.json'), 'utf8')).sources.a.path).toBe('media/linked/a-a.mp4');
  expect(readFileSync(join(back, 'media/linked/a-a.mp4'), 'utf8')).toBe('footage a');
  expect(readFileSync(join(back, 'storyboard.md'), 'utf8')).toBe('storyboard.md');
  expect(readFileSync(join(back, 'brand.md'), 'utf8')).toBe('brand.md');
  expect(() => importProject(zip, other)).toThrow('trip');
  expect(importProject(zip, other, 'trip-2')).toBe(join(other, 'trip-2'));
  expect(() => importProject(zip, join(tellcut, 'projects'), 'bad id!')).toThrow();
});

/** a stored (uncompressed) zip written by hand, as a Unix zip tool would: each entry's mode in the external attributes, so a
 *  symbolic link (mode 0o120777, its target as the data) is one — Windows' bsdtar follows a junction when it zips */
function unixZip(entries: Array<{ name: string; mode: number; data?: string }>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let at = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), data = Buffer.from(e.data ?? ''), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(10, 4); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE((3 << 8) | 20, 4); cd.writeUInt16LE(10, 6); cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE((e.mode << 16) >>> 0, 38); cd.writeUInt32LE(at, 42);
    locals.push(local, name, data); central.push(cd, name);
    at += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('oddEntries: a link (a junction on Windows) is named and never walked into; plain files and folders are not', () => {
  const root = mkdtempSync(join(tmpdir(), 'odd-')), dir = join(root, 'in'), outside = join(root, 'outside');
  mkdirSync(join(dir, 'p', 'fx'), { recursive: true }); mkdirSync(outside);
  writeFileSync(join(dir, 'p', 'project.json'), '{}'); writeFileSync(join(outside, 'secret.txt'), 'x');
  expect(oddEntries(dir)).toEqual([]);
  // a junction needs no privileges on Windows; elsewhere a plain symbolic link
  symlinkSync(outside, join(dir, 'p', 'fx', 'lib'), process.platform === 'win32' ? 'junction' : 'dir');
  symlinkSync(outside, join(dir, 'top'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(oddEntries(dir).sort()).toEqual(['p/fx/lib', 'top']);   // not top/secret.txt: never followed
  rmSync(dir, { recursive: true, force: true });
  expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('x');   // removing the links left what they point at
});

test('import refuses a zip with a symbolic link in it (a Mac unpacks them as links), a symlinked top folder too, and leaves nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'symzip-')), projects = join(root, 'projects'), outside = join(root, 'outside');
  mkdirSync(outside); writeFileSync(join(outside, 'keep.txt'), 'keep');
  const zips = {
    inner: unixZip([{ name: 'p/', mode: 0o40755 }, { name: 'p/project.json', mode: 0o100644, data: '{}' }, { name: 'p/.history', mode: 0o120777, data: '../../outside' }]),
    top: unixZip([{ name: 'p', mode: 0o120777, data: '../outside' }]),
  };
  for (const [what, bytes] of Object.entries(zips)) {
    const zip = join(root, `${what}.zip`);
    writeFileSync(zip, bytes);
    // Windows' bsdtar cannot make the link without privileges and fails, a Mac's makes it and the walk refuses: unpack either way
    let err: unknown;
    try { importProject(zip, projects); } catch (e) { err = e; }
    expect(err, what).toBeInstanceOf(ImportError);
    expect((err as ImportError).code, what).toBe('unpack');
    expect(readdirSync(projects), what).toEqual([]);                 // the .import- folder is gone, no project p
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8'), what).toBe('keep');   // cleaning up never went through the link
  }
});

/** each name in a zip's central directory with its UTF-8 flag (general purpose bit 11) */
function zipNames(zip: string): Array<{ name: string; utf8: boolean }> {
  const b = readFileSync(zip), out: Array<{ name: string; utf8: boolean }> = [];
  for (let i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); i >= 0; i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i + 46)) {
    const n = b.readUInt16LE(i + 28);
    out.push({ name: b.subarray(i + 46, i + 46 + n).toString('utf8'), utf8: (b.readUInt16LE(i + 8) & 0x800) !== 0 });
  }
  return out;
}

test('a zip names its files in UTF-8 with the UTF-8 flag (a Mac or another Windows language reads 影片.mp4, not garbage), and comes back whole', () => {
  const { root, dir } = world();
  writeFileSync(join(dir, 'media', '影片 ä.mp4'), 'clip');
  const zip = exportProject(dir, { media: true, out: join(root, 'utf8.zip') });
  const names = zipNames(zip);
  expect(names.map((n) => n.name)).toContain('trip/media/影片 ä.mp4');
  expect(names.find((n) => n.name.endsWith('.mp4') && /[^\x00-\x7f]/.test(n.name))?.utf8).toBe(true);
  const back = importProject(zip, join(root, 'in'));
  expect(readFileSync(join(back, 'media', '影片 ä.mp4'), 'utf8')).toBe('clip');
});

test('a project not edited since its last cut is still unedited after export and import (--media rewrites its paths); an edited one stays edited', async () => {
  const { editedSinceCut } = await import('./cut/cut.ts');
  const { createHash } = await import('node:crypto');
  const { root, dir } = world();
  // as the cut leaves it: project.json written with its newline and cut-state.json holding that text's hash
  const text = JSON.stringify(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')), null, 2) + '\n';
  writeFileSync(join(dir, 'project.json'), text);
  writeFileSync(join(dir, 'cache/cut-state.json'), JSON.stringify({ hash: createHash('sha1').update(text).digest('hex') }));
  expect(editedSinceCut(dir)).toBe(false);
  for (const media of [false, true]) {
    const back = importProject(exportProject(dir, { media, out: join(root, `clean-${media}.zip`) }), join(root, `clean-${media}`));
    expect(editedSinceCut(back)).toBe(false);
  }
  writeFileSync(join(dir, 'project.json'), text.replace('旅行', '旅行（改過）'));
  expect(editedSinceCut(dir)).toBe(true);
  const back = importProject(exportProject(dir, { media: true, out: join(root, 'edited.zip') }), join(root, 'edited'));
  expect(editedSinceCut(back)).toBe(true);
});

// showcase films (spec 2026-10-30 part 2): an example project on GitHub carries no path of this computer
test('scrubText writes this computer\u2019s tellcut folder as <tellcut> (with \\, / or as JSON writes \\); a folder beside it or the home stays, for leftoverPaths to refuse', () => {
  const o = { root: 'C:\\Users\\amy\\Desktop\\work\\tellcut' };
  expect(scrubText('at C:\\Users\\amy\\Desktop\\work\\tellcut\\projects\\x\\cut.ts and c:/users/amy/Desktop/work/tellcut/a', o))
    .toBe('at <tellcut>\\projects\\x\\cut.ts and <tellcut>/a');
  expect(scrubText(JSON.stringify({ p: 'C:\\Users\\amy\\Desktop\\work\\tellcut\\x.mp4' }), o)).toBe('{"p":"<tellcut>\\\\x.mp4"}');
  // as Git Bash writes it, in the commands the agent runs
  expect(scrubText('cd /c/Users/amy/Desktop/work/tellcut/projects/x && mkdir -p /C/Users/amy/Desktop/work/tellcut', o)).toBe('cd <tellcut>/projects/x && mkdir -p <tellcut>');
  for (const other of ['C:\\Users\\amy\\Desktop\\work\\tellcut-old\\x', 'C:\\Users\\amy\\Videos\\a.mp4']) {
    expect(scrubText(other, o)).toBe(other);
    expect(leftoverPaths(scrubText(other, o))).toEqual([other]);
  }
  expect(scrubText('nothing here', o)).toBe('nothing here');
});

test('leftoverPaths finds the absolute paths still in a text', () => {
  expect(leftoverPaths('see D:\\Trips\\rome.mp4, /Users/amy/x and /home/amy/y; but not <tellcut>\\a or ~/b or 3:45')).toEqual(['D:\\Trips\\rome.mp4', '/Users/amy/x', '/home/amy/y']);
  expect(leftoverPaths('{"p":"E:\\\\clips\\\\a.mp4"}')).toEqual(['E:\\\\clips\\\\a.mp4']);
});

test('--public: the zip\u2019s history and project carry no path of this computer, the project itself is untouched, and its cut state still matches', async () => {
  const { root, tellcut, dir } = world();
  const chat = JSON.stringify({ said: `read ${join(tellcut, 'projects', 'trip', 'media', 'b.mp4')}` });
  rmSync(join(dir, '.history/chat/chat.json'));
  writeFileSync(join(dir, '.history/chat/chat.json'), chat);
  const { sha1Of } = await import('./export-project.ts');
  writeFileSync(join(dir, 'cache/cut-state.json'), JSON.stringify({ hash: sha1Of(readFileSync(join(dir, 'project.json'), 'utf8')) }));
  const zip = exportProject(dir, { media: true, out: join(root, 'pub.zip'), public: { root: tellcut } });
  const back = importProject(zip, join(root, 'in'));
  const said = readFileSync(join(back, '.history/chat/chat.json'), 'utf8');
  expect(said).toContain('<tellcut>');
  expect(leftoverPaths(said)).toEqual([]);
  expect(readFileSync(join(dir, '.history/chat/chat.json'), 'utf8')).toBe(chat);   // a hard link in the stage: written anew, not through it
  const state = JSON.parse(readFileSync(join(back, 'cache/cut-state.json'), 'utf8')).hash;
  expect(state).toBe(sha1Of(readFileSync(join(back, 'project.json'), 'utf8')));
});

test('--public refuses a project that still names a path elsewhere on this computer, and says where', () => {
  const { root, dir } = world();
  writeFileSync(join(dir, 'storyboard.md'), 'shot list: D:\\Trips\\rome.mp4');
  expect(() => exportProject(dir, { media: true, out: join(root, 'pub.zip'), public: { root: join(root, 'tellcut') } }))
    .toThrow(/storyboard\.md.*D:\\Trips\\rome\.mp4/);
  expect(existsSync(join(root, 'pub.zip'))).toBe(false);
});

test('--public refuses footage that would stay outside the zip: from another folder without --media, or offline', () => {
  const { root, tellcut, dir } = world();
  expect(() => exportProject(dir, { media: false, out: join(root, 'pub.zip'), public: { root: tellcut } })).toThrow(/a.*--media/s);
  rmSync(join(root, 'footage', 'a.mp4'));
  expect(() => exportProject(dir, { media: true, out: join(root, 'pub.zip'), public: { root: tellcut } })).toThrow(/a/);
  expect(existsSync(join(root, 'pub.zip'))).toBe(false);
});

describe('--trim: only the footage the project uses', () => {
  const box = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
  /** a project with a long source outside it (one clip and one sound piece used), a silent .mov inside media/ (one clip), a source
   *  nothing uses and a short one used almost whole */
  async function trimWorld() {
    const root = mkdtempSync(join(tmpdir(), 'trim-')), dir = join(root, 'tellcut', 'projects', 'trip'), footage = join(root, 'footage');
    for (const d of [join(dir, 'media'), footage]) mkdirSync(d, { recursive: true });
    const clip = (out: string, seconds: number, sound = true) => ffmpeg(['-f', 'lavfi', '-i', `testsrc=size=320x180:rate=30:duration=${seconds}`,
      ...(sound ? ['-f', 'lavfi', '-i', `sine=duration=${seconds}`] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(sound ? ['-c:a', 'aac', '-shortest'] : []), out]);
    await Promise.all([clip(join(footage, 'long.mp4'), 20), clip(join(dir, 'media', 'in.mov'), 10, false), clip(join(footage, 'unused.mp4'), 6), clip(join(footage, 'most.mp4'), 4)]);
    const src = (path: string, duration: number) => ({ path, duration, width: 320, height: 180 });
    const project = {
      version: 1,
      meta: { name: 't', width: 320, height: 180, fps: 30, duration: 3, plugins: [], cut: { crf: 23, preset: 'ultrafast' },
        mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0.3 } } },
      sources: { long: src('../../../footage/long.mp4', 20), inside: src('media/in.mov', 10), unused: src('../../../footage/unused.mp4', 6), most: src('../../../footage/most.mp4', 4) },
      media: {}, grids: [],
      tracks: [
        { id: 'v', kind: 'video', items: [
          { id: 'c1', source: 'long', in: 8, speed: 1, start: 0, end: 1, crop: box },
          { id: 'c2', source: 'inside', in: 1, speed: 1, start: 1, end: 2, crop: box },
          { id: 'c3', source: 'most', in: 0.5, speed: 1, start: 2, end: 3, crop: box }] },
        { id: 'a', kind: 'audio', items: [{ id: 'au', source: 'long', in: 15, start: 0, end: 1, rate: 1, gain: 0, fadeIn: 0, fadeOut: 0 }] },
      ],
    };
    writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
    return { root, dir, footage, project };
  }
  /** the brightness of one frame (0–255), and the loudest sound over a second, in dB */
  const luma = async (f: string, t: number) => (await ffmpeg(['-ss', String(t), '-i', f, '-frames:v', '1', '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-'], { stdout: true })).stdout[0];
  const loudest = async (f: string, t: number) => Number(/max_volume: (-?[\d.]+) dB/.exec((await ffmpeg(['-ss', String(t), '-t', '1', '-i', f, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { level: 'info' })).stderr)?.[1]);

  test('usedRanges: each source\'s used parts with 2 s on each side, merged; a source nothing uses has none', async () => {
    const { project } = await trimWorld();
    const r = usedRanges(parseProject(project), createRegistry([corePlugin]));
    expect(r.get('long')!.map(([a, b]) => [a, +b.toFixed(2)])).toEqual([[6, 11.2], [13, 18]]);   // the clip reads 0.2 s past its out
    expect(r.get('inside')!.map(([a, b]) => [a, +b.toFixed(2)])).toEqual([[0, 4.2]]);
    expect(r.get('unused')).toEqual([]);
    expect(r.get('most')!.map(([a, b]) => [a, +b.toFixed(2)])).toEqual([[0, 3.7]]);
    expect(usedRanges(parseProject(project), createRegistry([corePlugin]), 5).get('long')).toEqual([[3, 20]]);   // margins that meet merge
  }, 60000);

  test('the zip carries each source at full length, black and silent where nothing uses it; the import prepares as it is', async () => {
    const { root, dir, footage } = await trimWorld(), log: string[] = [];
    const zip = await exportProjectTrimmed(dir, { out: join(root, 'trip.zip'), registry: createRegistry([corePlugin]), log: (s) => log.push(s) });
    expect(readdirSync(root).filter((f) => f.startsWith('.'))).toEqual([]);   // no stage or work folder left beside the zip
    const back = importProject(zip, join(root, 'other'));
    const p = JSON.parse(readFileSync(join(back, 'project.json'), 'utf8'));
    expect(Object.fromEntries(Object.entries(p.sources as Record<string, { path: string }>).map(([k, s]) => [k, s.path]))).toEqual({
      long: 'media/linked/long-long.mp4', inside: 'media/linked/inside-in.mp4', unused: 'media/linked/unused-unused.mp4', most: 'media/linked/most-most.mp4' });
    expect(existsSync(join(back, 'media', 'in.mov'))).toBe(false);                                  // replaced by its trimmed copy
    expect(readFileSync(join(back, 'media/linked/most-most.mp4')).equals(readFileSync(join(footage, 'most.mp4')))).toBe(true);   // used almost whole: as it was
    expect(log.join('\n')).toMatch(/most：用到 93%/);
    const long = join(back, 'media/linked/long-long.mp4');
    expect(await probeDuration(long)).toBeCloseTo(20, 0);
    expect(await luma(long, 8.5)).toBeGreaterThan(40);    // the used clip
    expect(await luma(long, 3)).toBeLessThan(20);         // nothing uses it: black
    expect(await loudest(long, 15.2)).toBeGreaterThan(-30);
    expect(await loudest(long, 2)).toBeLessThan(-80);
    expect(await luma(join(back, 'media/linked/unused-unused.mp4'), 3)).toBeLessThan(20);
    expect(statSync(join(back, 'media/linked/unused-unused.mp4')).size).toBeLessThan(statSync(join(footage, 'unused.mp4')).size / 4);
    // the source times still fit: prepare cuts every clip of the imported project (it checks each file's size and length first)
    const index = await prepareProject(back, createRegistry([corePlugin]));
    expect(Object.keys(index.videos)).toHaveLength(3);
    expect(await luma(join(back, Object.values(index.videos)[0]), 0.5)).toBeGreaterThan(40);
  }, 120000);
});
