import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { takeOver, takeSlot, withFileLock } from './rate.ts';

// Windows: a lock file another process just removed is still "delete pending" and opening it answers EPERM, not EEXIST
const failOpen = vi.hoisted(() => ({ codes: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return { ...real, openSync: (...a: Parameters<typeof real.openSync>) => {
    const code = failOpen.codes.shift();
    if (code) throw Object.assign(new Error(`${code}: open ${String(a[0])}`), { code });
    return real.openSync(...a);
  } };
});

let dir: string, f: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rate-')); f = join(dir, 'x.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('within the limit slots are taken at once; over it, a short wait is waited out', async () => {
  let t = 0; const sleep = async (ms: number) => { t += ms; };
  for (let i = 0; i < 3; i++) await takeSlot(f, [{ n: 3, per: 10 }], { now: () => t, sleep });
  expect(t).toBe(0);
  await takeSlot(f, [{ n: 3, per: 10 }], { now: () => t, sleep });
  expect(t).toBeGreaterThanOrEqual(10_000);
});

test('a wait longer than maxWait is a RateWait with the seconds', async () => {
  for (let i = 0; i < 2; i++) await takeSlot(f, [{ n: 2, per: 3600 }], { now: () => 0 });
  await expect(takeSlot(f, [{ n: 2, per: 3600 }], { now: () => 0 })).rejects.toMatchObject({ name: 'RateWait', seconds: 3600 });
});

test('every limit counts: the tighter one decides', async () => {
  const limits = [{ n: 100, per: 60 }, { n: 2, per: 86400 }];
  for (let i = 0; i < 2; i++) await takeSlot(f, limits, { now: () => 0 });
  await expect(takeSlot(f, limits, { now: () => 0 })).rejects.toMatchObject({ seconds: 86400 });
});

test('a burst at the edge of a window cannot pass n in any rolling window', async () => {
  let t = 0; const sleep = async (ms: number) => { t += ms; };
  const take = () => takeSlot(f, [{ n: 3, per: 10 }], { now: () => t, sleep });
  await take();                 // t = 0
  t = 9_900; await take(); await take();
  t = 10_100; await take();     // only the one from t = 0 has left the window
  expect(t).toBe(10_100);
  await take();                 // waits until the two from 9.9 s leave
  expect(t).toBeGreaterThanOrEqual(19_900);
});

test('a state file in the old fixed-window shape counts as empty', async () => {
  writeFileSync(f, JSON.stringify({ '3/10': { start: 0, count: 3 } }));
  await expect(takeSlot(f, [{ n: 3, per: 10 }], { now: () => 0 })).resolves.toBeUndefined();
});

test('slots are shared through the state file, not memory', async () => {
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => takeSlot(f, [{ n: 5, per: 3600 }], { now: () => 0 })));
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(5);
  expect(JSON.parse(readFileSync(f, 'utf8'))).toBeTruthy();
});

test('a lock left by a crashed process is taken over after staleMs', async () => {
  writeFileSync(`${f}.lock`, ''); utimesSync(`${f}.lock`, new Date(0), new Date(0));
  await expect(withFileLock(`${f}.lock`, () => 7)).resolves.toBe(7);
});

test('a waiter that judged the lock stale too late moves a fresh one back instead of deleting it', () => {
  // the first waiter already replaced the stale lock with its own: the second one's take-over must leave that in place
  writeFileSync(`${f}.lock`, 'fresh');
  takeOver(`${f}.lock`, 10_000);
  expect(readFileSync(`${f}.lock`, 'utf8')).toBe('fresh');
  utimesSync(`${f}.lock`, new Date(0), new Date(0));
  takeOver(`${f}.lock`, 10_000);
  expect(existsSync(`${f}.lock`)).toBe(false);
  expect(readdirSync(dirname(f)).filter((n) => n.endsWith('.stale'))).toEqual([]);
});

test('a lock file that is still being deleted (EPERM, EBUSY, EACCES on Windows) is waited for, not an error', async () => {
  failOpen.codes.push('EPERM', 'EBUSY', 'EACCES');
  await expect(withFileLock(`${f}.lock`, () => 7)).resolves.toBe(7);
  expect(failOpen.codes).toEqual([]);
});
