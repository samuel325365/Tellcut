import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lockHolder, takeOver, tryLock, waitForLock, withLock } from './locks.ts';

// Windows: a lock another process just removed is still "delete pending" (EPERM), an indexer or antivirus has it open (EBUSY)
const fail = vi.hoisted(() => ({ link: [] as string[], open: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const failing = <F extends (...a: any[]) => any>(codes: string[], f: F) => ((...a: Parameters<F>) => {
    const code = codes.shift();
    if (code) throw Object.assign(new Error(`${code}: ${String(a[0])}`), { code });
    return f(...a);
  }) as F;
  return { ...real, linkSync: failing(fail.link, real.linkSync), openSync: failing(fail.open, real.openSync) };
});
beforeEach(() => { fail.link.length = 0; fail.open.length = 0; });

test('a lock counts only while another live process holds it; this process waits for it to go', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  expect(lockHolder(file)).toBeNull();                                                       // none
  await withLock(file, async () => { expect(lockHolder(file)).toBeNull(); });                // our own
  writeFileSync(file, JSON.stringify({ pid: 999999, started: 1 }));
  expect(lockHolder(file)).toBeNull();                                                       // its process is gone
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    writeFileSync(file, JSON.stringify({ pid: child.pid, started: 5 }));
    expect(lockHolder(file)).toEqual({ pid: child.pid, started: 5 });
    const t0 = Date.now(), wait = waitForLock(file, { every: 50 });
    setTimeout(() => child.kill(), 300);
    await wait;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
  } finally { child.kill(); }
}, 30000);

test('a lock its holder stopped refreshing does not count, even when a live process now has that pid (Windows reuses them)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    writeFileSync(file, JSON.stringify({ pid: child.pid, started: 5 }));
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(file, old, old);
    expect(lockHolder(file)).toBeNull();
  } finally { child.kill(); }
});

test('withLock keeps its file fresh while the work runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  await withLock(file, async () => {
    const old = new Date(Date.now() - 60_000);
    utimesSync(file, old, old);
    await new Promise((r) => setTimeout(r, 250));
    expect(Date.now() - statSync(file).mtimeMs).toBeLessThan(5_000);
  }, { every: 50 });
  expect(existsSync(file)).toBe(false);
});

test('withLock waits for another live holder instead of writing over its lock', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    writeFileSync(file, JSON.stringify({ pid: child.pid, started: Date.now() }));
    let ran = 0;
    const t0 = Date.now(), job = withLock(file, async () => { ran = Date.now(); }, { every: 50 });
    setTimeout(() => child.kill(), 300);
    await job;
    expect(ran - t0).toBeGreaterThanOrEqual(250);
  } finally { child.kill(); }
}, 30000);

test('a lock just made and not written yet (empty, or torn) is held, not stale; an old one is taken over', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  writeFileSync(file, '');
  expect(lockHolder(file)).toBeTruthy();
  expect(tryLock(file)).toBeNull();
  expect(readFileSync(file, 'utf8')).toBe('');
  let ran = 0;
  const t0 = Date.now(), job = withLock(file, async () => { ran = Date.now(); }, { every: 50 });
  await new Promise((r) => setTimeout(r, 300));
  expect(ran).toBe(0);
  const old = new Date(Date.now() - 60_000);
  utimesSync(file, old, old);                                   // nobody ever wrote it: a crash, gone
  await job;
  expect(ran - t0).toBeGreaterThanOrEqual(250);
  writeFileSync(file, '{"pid":');
  expect(lockHolder(file)).toBeTruthy();
});

test('the lock is made with its content in place: no one sees it empty', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  await withLock(file, async () => { expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(process.pid); });
  const release = tryLock(file)!;
  expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(process.pid);
  release();
  expect(readdirSync(dir)).toEqual([]);                         // no temp files left
});

test('a waiter that judged the lock stale too late leaves the fresh one in place; one taking over at a time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    const fresh = JSON.stringify({ pid: child.pid, started: Date.now() });
    writeFileSync(file, fresh);                                 // the first waiter's lock, in place of the stale one
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(fresh);
    writeFileSync(file, JSON.stringify({ pid: 999999, started: 1 }));
    writeFileSync(`${file}.takeover`, '1');                     // another waiter is taking it over right now
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(false);
    expect(existsSync(file)).toBe(true);
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${file}.takeover`, old, old);                   // that waiter crashed in the middle: its guard goes
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(false);
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  } finally { child.kill(); }
});

test('a takeover guard whose live holder was paused past a few seconds stays its own; only a long-left one goes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock'), guard = `${file}.takeover`;
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    writeFileSync(file, JSON.stringify({ pid: 999999, started: 1 }));
    writeFileSync(guard, String(child.pid));
    const paused = new Date(Date.now() - 10_000);
    utimesSync(guard, paused, paused);                          // a busy machine held the waiter back
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(false);
    expect(readFileSync(guard, 'utf8')).toBe(String(child.pid));
    const left = new Date(Date.now() - 2 * 60_000);
    utimesSync(guard, left, left);                              // long past any pause: its pid may be someone else's by now
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(false);
    expect(takeOver(file, (f) => !lockHolder(f))).toBe(true);
  } finally { child.kill(); }
});

test('a lock that is not there is free without being judged or removed: a creator may make one at any moment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  const fresh = JSON.stringify({ pid: process.pid, started: Date.now() });
  // what the old order let happen: judged free while missing, then another waiter's fresh lock landed before the remove
  const judge = vi.fn((f: string) => { const missing = !existsSync(f); writeFileSync(f, fresh); return missing; });
  expect(takeOver(file, judge)).toBe(true);
  expect(judge).not.toHaveBeenCalled();
  writeFileSync(file, fresh);
  expect(takeOver(file, () => false)).toBe(false);
  expect(readFileSync(file, 'utf8')).toBe(fresh);
});

test('processes racing for a stale lock: exactly one of them gets it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  writeFileSync(file, JSON.stringify({ pid: 999999, started: 1 }));
  const at = Date.now() + 2500, mod = pathToFileURL(join(import.meta.dirname, 'locks.ts')).href;
  // the winner stays alive until all have answered: one that had exited would leave a stale lock a late racer rightly takes over
  const code = `const { tryLock } = await import(process.argv[1]); while (Date.now() < Number(process.argv[2])); ` +
    `process.stdout.write(tryLock(process.argv[3]) ? 'won' : 'lost'); process.stdin.on('end', () => process.exit(0)).resume();`;
  const kids = Array.from({ length: 6 }, () => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', code, mod, String(at), file]);
    let out = '', err = '';
    const answered = new Promise<void>((res) => c.stdout.on('data', (d) => { out += d; res(); }));
    c.stderr.on('data', (d) => { err += d; });
    const closed = new Promise<string>((res, rej) => c.on('close', (n) => (n === 0 ? res(out) : rej(new Error(err)))));
    return { c, answered: Promise.race([answered, closed.then(() => {})]), closed };
  });
  await Promise.all(kids.map((k) => k.answered));
  kids.forEach((k) => k.c.stdin.end());
  const got = await Promise.all(kids.map((k) => k.closed));
  expect(got.filter((x) => x === 'won')).toHaveLength(1);
  expect(got.filter((x) => x === 'lost')).toHaveLength(5);
}, 30000);

test('a holder this process may not signal (EPERM: it runs elevated) is alive', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  writeFileSync(file, JSON.stringify({ pid: 4242, started: 5 }));
  const kill = vi.spyOn(process, 'kill');
  const err = (code: string) => () => { throw Object.assign(new Error(code), { code }); };
  try {
    kill.mockImplementation(err('EPERM')); expect(lockHolder(file)).toEqual({ pid: 4242, started: 5 });
    expect(tryLock(file)).toBeNull();
    kill.mockImplementation(err('ESRCH')); expect(lockHolder(file)).toBeNull();
  } finally { kill.mockRestore(); }
});

test('a lock file that is still being deleted (EPERM, EBUSY, EACCES on Windows) is waited for, not an error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  fail.link.push('EPERM', 'EBUSY', 'EACCES'); fail.open.push('EPERM', 'EBUSY', 'EACCES');
  await expect(withLock(file, async () => 7)).resolves.toBe(7);
  expect(fail).toEqual({ link: [], open: [] });
  fail.link.push('EBUSY', 'EPERM'); fail.open.push('EBUSY', 'EPERM');
  const release = tryLock(file);
  expect(release).toBeTypeOf('function');
  release!();
  expect(fail).toEqual({ link: [], open: [] });
  expect(existsSync(file)).toBe(false);
});

test('a file system without hard links still gets a lock (made the old way)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-')), file = join(dir, 'x.lock');
  fail.link.push('ENOTSUP');
  await expect(withLock(file, async () => JSON.parse(readFileSync(file, 'utf8')).pid)).resolves.toBe(process.pid);
});
