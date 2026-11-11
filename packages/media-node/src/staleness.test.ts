import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorBuildStale, playerBuildStale, rebuildPlayer } from './staleness.ts';

test('the player build is stale when a block or the engine changed after it, fresh otherwise, missing is said too', () => {
  const root = mkdtempSync(join(tmpdir(), 'stale-'));
  try {
    for (const d of ['apps/player/src', 'apps/player/dist', 'packages/engine/src', 'packages/plugin-common/src', 'packages/media-node/src']) mkdirSync(join(root, d), { recursive: true });
    expect(playerBuildStale(root)).toContain('還沒建置');
    const old = new Date(Date.now() - 60_000), now = new Date();
    for (const f of ['apps/player/src/main.ts', 'packages/engine/src/stage.ts', 'packages/plugin-common/src/progress.ts']) { writeFileSync(join(root, f), 'x'); utimesSync(join(root, f), old, old); }
    writeFileSync(join(root, 'apps/player/dist/index.html'), 'x'); utimesSync(join(root, 'apps/player/dist/index.html'), now, now);
    expect(playerBuildStale(root)).toBeNull();
    writeFileSync(join(root, 'packages/media-node/src/x.ts'), 'x');                     // Node-only code does not go into the player
    writeFileSync(join(root, 'packages/plugin-common/src/progress.test.ts'), 'x');      // nor do tests
    utimesSync(join(root, 'packages/plugin-common/src/progress.test.ts'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
    expect(playerBuildStale(root)).toBeNull();
    utimesSync(join(root, 'packages/plugin-common/src/progress.ts'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
    expect(playerBuildStale(root)).toContain('npm run build:player');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** a root with a player and an editor built now from sources a minute old */
function freshBuilds() {
  const root = mkdtempSync(join(tmpdir(), 'stale-')), old = new Date(Date.now() - 60_000), now = new Date();
  for (const d of ['apps/player/src', 'apps/player/dist', 'apps/editor/src', 'apps/editor/dist', 'packages/engine/src', 'packages/media-node/src']) mkdirSync(join(root, d), { recursive: true });
  for (const f of ['apps/player/src/main.ts', 'apps/player/index.html', 'apps/editor/src/main.tsx', 'apps/editor/index.html', 'packages/engine/src/stage.ts', 'package-lock.json']) { writeFileSync(join(root, f), 'x'); utimesSync(join(root, f), old, old); }
  for (const f of ['apps/player/dist/index.html', 'apps/editor/dist/index.html']) { writeFileSync(join(root, f), 'x'); utimesSync(join(root, f), now, now); }
  return root;
}
const touch = (root: string, f: string) => { const t = new Date(Date.now() + 60_000); utimesSync(join(root, f), t, t); };

test('the player build is stale when its page or the installed packages changed after it, not only its source', () => {
  for (const f of ['apps/player/index.html', 'package-lock.json']) {
    const root = freshBuilds();
    try {
      expect(playerBuildStale(root)).toBeNull();
      touch(root, f);
      expect(playerBuildStale(root)).toContain('npm run build:player');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('the editor build is stale the same way: its own source and page, the packages it is built from, the installed packages', () => {
  for (const f of ['apps/editor/src/main.tsx', 'apps/editor/index.html', 'packages/engine/src/stage.ts', 'package-lock.json']) {
    const root = freshBuilds();
    try {
      expect(editorBuildStale(root)).toBeNull();
      touch(root, f);
      expect(editorBuildStale(root)).toContain('npm run build:editor');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  const root = freshBuilds();
  try {
    writeFileSync(join(root, 'packages/media-node/src/x.ts'), 'x'); touch(root, 'packages/media-node/src/x.ts');   // Node-only code
    writeFileSync(join(root, 'apps/editor/src/a.e2e.test.ts'), 'x'); touch(root, 'apps/editor/src/a.e2e.test.ts');  // and tests are not built in
    touch(root, 'apps/player/src/main.ts');                                                                          // nor is the player
    expect(editorBuildStale(root)).toBeNull();
    rmSync(join(root, 'apps/editor/dist/index.html'));
    expect(editorBuildStale(root)).toContain('還沒建置');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('test helpers (test-*.ts, *-test-kit.ts, e2e-*.ts) are not source either; a file that only contains the letters is', () => {
  const helpers = ['apps/editor/src/editor-test-kit.ts', 'apps/editor/src/test-setup.ts', 'apps/editor/src/e2e-kit.ts', 'packages/engine/src/commands/test-fixture.ts'];
  const root = freshBuilds();
  try {
    mkdirSync(join(root, 'packages/engine/src/commands'), { recursive: true });
    for (const f of helpers) { writeFileSync(join(root, f), 'x'); touch(root, f); }
    expect(editorBuildStale(root)).toBeNull();
    expect(playerBuildStale(root)).toBeNull();
    for (const f of ['packages/engine/src/latest-items.ts', 'packages/engine/src/contest.ts']) {
      writeFileSync(join(root, f), 'x'); touch(root, f);
      expect(playerBuildStale(root), f).toContain('npm run build:player');
      rmSync(join(root, f));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** a root whose player source is a minute old and whose build (index.html, one chunk) is older still */
function oldBuild() {
  const root = mkdtempSync(join(tmpdir(), 'rebuild-')), old = new Date(Date.now() - 60_000), older = new Date(Date.now() - 120_000);
  mkdirSync(join(root, 'apps/player/src'), { recursive: true }); mkdirSync(join(root, 'apps/player/dist/assets'), { recursive: true });
  writeFileSync(join(root, 'apps/player/src/main.ts'), 'x'); utimesSync(join(root, 'apps/player/src/main.ts'), old, old);
  writeFileSync(join(root, 'apps/player/dist/assets/a.js'), 'a');
  writeFileSync(join(root, 'apps/player/dist/index.html'), 'v1 a.js'); utimesSync(join(root, 'apps/player/dist/index.html'), older, older);
  return root;
}
const fake = (html: string, chunk: string) => (out: string) => {
  mkdirSync(join(out, 'assets'), { recursive: true }); mkdirSync(join(out, 'fonts'), { recursive: true });
  writeFileSync(join(out, 'assets', chunk), chunk); writeFileSync(join(out, 'fonts/f.ttf'), 'font'); writeFileSync(join(out, 'index.html'), html);
  return null;
};

test('a stale player is built beside the one in use and moved in file by file: the last build\'s chunks stay for open pages, older ones go', async () => {
  const root = oldBuild(), dist = join(root, 'apps/player/dist');
  try {
    expect(await rebuildPlayer({ root, build: fake('v2 b.js', 'b.js') })).toBeNull();
    expect([readFileSync(join(dist, 'index.html'), 'utf8'), readdirSync(join(dist, 'assets')).sort(), readdirSync(join(dist, 'fonts'))]).toEqual(['v2 b.js', ['a.js', 'b.js'], ['f.ttf']]);
    expect(readdirSync(join(root, '.cache'))).toEqual([]);   // its own build folder and the lock are gone
    // fresh: nothing is built
    expect(await rebuildPlayer({ root, build: () => { throw new Error('built again'); } })).toBeNull();
    const edit = () => { const t = new Date(Date.now() - 300_000); utimesSync(join(dist, 'index.html'), t, t); };   // a block changed after the build
    edit();
    expect(await rebuildPlayer({ root, build: fake('v3 c.js', 'c.js') })).toBeNull();
    expect([readFileSync(join(dist, 'index.html'), 'utf8'), readdirSync(join(dist, 'assets')).sort()]).toEqual(['v3 c.js', ['b.js', 'c.js']]);
    // a build that fails leaves the one in use as it was
    edit();
    expect(await rebuildPlayer({ root, build: () => 'boom' })).toContain('自動建置失敗：boom');
    expect([readFileSync(join(dist, 'index.html'), 'utf8'), readdirSync(join(dist, 'assets')).sort(), readdirSync(join(root, '.cache'))]).toEqual(['v3 c.js', ['b.js', 'c.js'], []]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('build:player (force) builds a fresh player too, the same way: the fonts in use are never gone while it builds or moves in', async () => {
  const root = oldBuild(), dist = join(root, 'apps/player/dist');
  try {
    expect(await rebuildPlayer({ root, build: fake('v2 b.js', 'b.js') })).toBeNull();
    const seen: boolean[] = [];
    const watch = (html: string, chunk: string) => (out: string) => { seen.push(existsSync(join(dist, 'fonts/f.ttf'))); const r = fake(html, chunk)(out); seen.push(existsSync(join(dist, 'fonts/f.ttf'))); return r; };
    expect(await rebuildPlayer({ root, build: watch('v3 c.js', 'c.js') })).toBeNull();          // fresh: nothing built
    expect(seen).toEqual([]);
    expect(await rebuildPlayer({ root, force: true, build: watch('v3 c.js', 'c.js') })).toBeNull();
    expect(seen).toEqual([true, true]);
    expect([readFileSync(join(dist, 'index.html'), 'utf8'), readdirSync(join(dist, 'assets')).sort(), readFileSync(join(dist, 'fonts/f.ttf'), 'utf8')]).toEqual(['v3 c.js', ['b.js', 'c.js'], 'font']);
    expect(await rebuildPlayer({ root, force: true, build: () => 'boom' })).toBe('播放器建置失敗：boom');
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe('v3 c.js');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('processes rebuilding a stale player at once: one builds, the others wait for it and find it fresh', async () => {
  const root = oldBuild(), log = join(root, 'log.txt'), at = Date.now() + 2500, mod = pathToFileURL(join(import.meta.dirname, 'staleness.ts')).href;
  const code = `const fs = await import('node:fs'); const { rebuildPlayer } = await import(process.argv[1]); const [root, log] = process.argv.slice(3); ` +
    `while (Date.now() < Number(process.argv[2])); ` +
    `const r = await rebuildPlayer({ root, build: (out) => { fs.appendFileSync(log, 'start '); const t = Date.now() + 1500; while (Date.now() < t); ` +
    `fs.mkdirSync(out + '/assets', { recursive: true }); fs.writeFileSync(out + '/assets/b.js', 'b'); fs.writeFileSync(out + '/index.html', 'v2'); fs.appendFileSync(log, 'end '); return null; } }); ` +
    `process.stdout.write(String(r));`;
  try {
    const runs = Array.from({ length: 3 }, () => new Promise<string>((res, rej) => {
      const c = spawn(process.execPath, ['--input-type=module', '-e', code, mod, String(at), root, log]);
      let out = '', err = '';
      c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
      c.on('close', (n) => (n === 0 ? res(out) : rej(new Error(err))));
    }));
    expect(await Promise.all(runs)).toEqual(['null', 'null', 'null']);
    expect(readFileSync(log, 'utf8')).toBe('start end ');
    expect(readFileSync(join(root, 'apps/player/dist/index.html'), 'utf8')).toBe('v2');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);
