import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { filesUnder, moveBuildInto, RECORD, swapBuild } from './build-swap.ts';

/** a vite-like build into `out`: index.html naming its chunk, the chunk, a stylesheet and a file from public/ */
const fake = (chunk: string, css = 'index-a.css') => (out: string) => {
  mkdirSync(join(out, 'assets'), { recursive: true });
  writeFileSync(join(out, 'assets', chunk), chunk); writeFileSync(join(out, 'assets', css), 'css');
  writeFileSync(join(out, 'theme-first.js'), 'theme'); writeFileSync(join(out, 'index.html'), `<script src="/editor/assets/${chunk}">`);
  return null;
};
const sorted = (dir: string) => filesUnder(dir).sort();
function tmpRoot() {
  const root = mkdtempSync(join(tmpdir(), 'swap-'));
  return { root, dist: join(root, 'apps/editor/dist'), out: join(root, 'out') };
}

test('new files go in first and index.html last: every file it names is in place when it moves', () => {
  const { root, dist, out } = tmpRoot();
  try {
    fake('index-1.js')(out); mkdirSync(join(out, 'assets/deep'), { recursive: true }); writeFileSync(join(out, 'assets/deep/x.woff2'), 'w');
    const order: string[] = [];
    const rename = (a: string, b: string) => {
      if (b.endsWith('index.html')) expect(filesUnder(out)).toEqual(['index.html']);   // the rest are in dist already
      order.push(b.slice(dist.length + 1).replace(/\\/g, '/')); renameSync(a, b);
    };
    const r = moveBuildInto(out, dist, { rename });
    expect(order.at(-1)).toBe('index.html');
    expect(r).toEqual({ moved: order, removed: [] });
    expect(sorted(dist)).toEqual([RECORD, 'assets/deep/x.woff2', 'assets/index-1.js', 'assets/index-a.css', 'index.html', 'theme-first.js']);
    expect(JSON.parse(readFileSync(join(dist, RECORD), 'utf8')).sort()).toEqual(['assets/deep/x.woff2', 'assets/index-1.js', 'assets/index-a.css', 'theme-first.js']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file with the same bytes stays as it was; index.html is always replaced, so its time says the build is fresh', () => {
  const { root, dist, out } = tmpRoot();
  try {
    fake('index-1.js')(out); moveBuildInto(out, dist);
    const old = new Date(Date.now() - 60_000);
    for (const f of ['index.html', 'theme-first.js']) utimesSync(join(dist, f), old, old);
    rmSync(out, { recursive: true, force: true }); fake('index-1.js')(out);
    expect(moveBuildInto(out, dist)).toEqual({ moved: ['index.html'], removed: [] });
    expect(statSync(join(dist, 'theme-first.js')).mtimeMs).toBeLessThan(Date.now() - 30_000);
    expect(statSync(join(dist, 'index.html')).mtimeMs).toBeGreaterThan(Date.now() - 30_000);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the files the build before made stay for pages open on it; older ones and files no build made any more go', () => {
  const { root, dist, out } = tmpRoot();
  const build = (chunk: string, css?: string) => { rmSync(out, { recursive: true, force: true }); fake(chunk, css)(out); return moveBuildInto(out, dist); };
  try {
    // a dist vite wrote itself (no record): nothing in it is known to be old, so the first move removes nothing
    mkdirSync(join(dist, 'assets'), { recursive: true }); writeFileSync(join(dist, 'assets/index-0.js'), '0'); writeFileSync(join(dist, 'index.html'), 'v0');
    expect(build('index-1.js').removed).toEqual([]);
    expect(sorted(dist)).toContain('assets/index-0.js');
    expect(build('index-2.js', 'index-b.css').removed).toEqual(['assets/index-0.js']);
    expect(sorted(dist)).toEqual([RECORD, 'assets/index-1.js', 'assets/index-2.js', 'assets/index-a.css', 'assets/index-b.css', 'index.html', 'theme-first.js']);
    expect(build('index-3.js', 'index-b.css').removed.sort()).toEqual(['assets/index-1.js', 'assets/index-a.css']);
    expect(sorted(dist)).toEqual([RECORD, 'assets/index-2.js', 'assets/index-3.js', 'assets/index-b.css', 'index.html', 'theme-first.js']);
    // the same build again: only the one in use is left
    expect(build('index-3.js', 'index-b.css').removed).toEqual(['assets/index-2.js']);
    expect(sorted(dist)).toEqual([RECORD, 'assets/index-3.js', 'assets/index-b.css', 'index.html', 'theme-first.js']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('swapBuild builds in .cache and moves it in; a failed build leaves dist as it was; its own folder and the lock are gone', async () => {
  const { root, dist } = tmpRoot();
  try {
    const outs: string[] = [];
    expect(await swapBuild({ root, app: 'editor', build: (out) => { outs.push(out); return fake('index-1.js')(out); } })).toBeNull();
    expect(dirname(outs[0])).toBe(join(root, '.cache'));
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('index-1.js');
    expect(await swapBuild({ root, app: 'editor', build: (out) => { fake('index-2.js')(out); return 'boom'; } })).toBe('boom');
    expect(await swapBuild({ root, app: 'editor', build: (out) => { mkdirSync(out, { recursive: true }); return null; } })).toContain('沒有 index.html');
    expect([readFileSync(join(dist, 'index.html'), 'utf8'), sorted(join(dist, 'assets')), readdirSync(join(root, '.cache'))])
      .toEqual(['<script src="/editor/assets/index-1.js">', ['index-1.js', 'index-a.css'], []]);
    expect(existsSync(outs[0])).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('two processes building at once: the second waits for the first to finish moving in', async () => {
  const { root, dist } = tmpRoot(), log = join(root, 'log.txt'), at = Date.now() + 2500, mod = pathToFileURL(join(import.meta.dirname, 'build-swap.ts')).href;
  const code = `const fs = await import('node:fs'); const { swapBuild } = await import(process.argv[1]); const [root, log] = process.argv.slice(3); ` +
    `while (Date.now() < Number(process.argv[2])); ` +
    `const r = await swapBuild({ root, app: 'editor', build: (out) => { fs.appendFileSync(log, 'start '); const t = Date.now() + 1000; while (Date.now() < t); ` +
    `fs.mkdirSync(out + '/assets', { recursive: true }); fs.writeFileSync(out + '/assets/b.js', 'b'); fs.writeFileSync(out + '/index.html', 'v2'); fs.appendFileSync(log, 'end '); return null; } }); ` +
    `process.stdout.write(String(r));`;
  try {
    const runs = Array.from({ length: 2 }, () => new Promise<string>((res, rej) => {
      const c = spawn(process.execPath, ['--input-type=module', '-e', code, mod, String(at), root, log]);
      let out = '', err = '';
      c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
      c.on('close', (n) => (n === 0 ? res(out) : rej(new Error(err))));
    }));
    expect(await Promise.all(runs)).toEqual(['null', 'null']);
    expect(readFileSync(log, 'utf8')).toBe('start end start end ');
    expect(sorted(dist)).toEqual([RECORD, 'assets/b.js', 'index.html']);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);
