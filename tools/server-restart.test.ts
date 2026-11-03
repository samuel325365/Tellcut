import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listeners, lsofListeners, stopServer, threads, type Stopper } from './server-restart.ts';

test('the processes listening on the port, from netstat', () => {
  const out = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    127.0.0.1:5199         0.0.0.0:0              LISTENING       4242',
    '  TCP    127.0.0.1:5199         127.0.0.1:61000        ESTABLISHED     4242',
    '  TCP    127.0.0.1:61000        127.0.0.1:5199         ESTABLISHED     7',
    '  TCP    [::1]:5199             [::]:0                 LISTENING       4242',
    '  TCP    0.0.0.0:51990          0.0.0.0:0              LISTENING       9',
  ].join('\r\n');
  expect(listeners(out, 5199)).toEqual([4242]);
  expect(listeners(out, 5174)).toEqual([]);
  // another language's Windows translates the state (read in its own code page: maybe garbled); the empty foreign address is what counts
  const local = [
    '  Proto  Adresse locale         Adresse distante       État           PID',
    '  TCP    0.0.0.0:5199           0.0.0.0:0              LISTENING       77',
    '  TCP    127.0.0.1:5174         0.0.0.0:0              ABHÖREN         88',
    '  TCP    [::]:5174              [::]:0                 ����    88',
    '  TCP    127.0.0.1:5174         127.0.0.1:61000        HERGESTELLT     99',
  ].join('\r\n');
  expect(listeners(local, 5174)).toEqual([88]);
  expect(listeners(local, 5199)).toEqual([77]);
});

test('the processes listening on the port, from lsof (macOS)', () => {
  expect(lsofListeners('4242\n4242\n77\n')).toEqual([4242, 77]);
  expect(lsofListeners('')).toEqual([]);
});

test('the threads asked about: home, each project, the home drafts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tellcut-restart-'));
  for (const p of ['a', 'b', '_gallery']) { mkdirSync(join(dir, p)); writeFileSync(join(dir, p, 'project.json'), '{}'); }
  mkdirSync(join(dir, 'empty'));
  mkdirSync(join(dir, '_home'));
  writeFileSync(join(dir, '_home', 'home-abc123.json'), '{}');
  writeFileSync(join(dir, '_home', 'notes.json'), '{}');
  expect(threads(dir).sort()).toEqual(['a', 'b', 'home', 'home-abc123']);
});

/** a machine for stopServer: the pids listening, what each does on a signal (gone that many ms later; undefined: ignores it), a
 *  clock moved on by pause, and everything that happened with its time */
function machine(platform: NodeJS.Platform, procs: Record<number, { term?: number; kill?: number; taskkill?: 'fails' }>) {
  let now = 0;
  const goneAt = new Map<number, number>(), events: string[] = [];
  const listening = () => Object.keys(procs).map(Number).filter((p) => !(goneAt.has(p) && goneAt.get(p)! <= now));
  const s: Stopper = {
    platform,
    onPort: () => listening(),
    taskkill: (pid) => { events.push(`${now} taskkill ${pid}`); if (procs[pid].taskkill === 'fails') throw new Error('Access is denied'); goneAt.set(pid, now); },
    killTree: (pid, signal) => {
      events.push(`${now} ${signal} ${pid}`);
      const after = signal === 'SIGKILL' ? procs[pid].kill ?? 0 : procs[pid].term;
      if (after !== undefined) goneAt.set(pid, Math.min(goneAt.get(pid) ?? Infinity, now + after));
    },
    pause: async (ms) => { now += ms; },
    log: () => {},
  };
  return { s, events, time: () => now };
}

test('stopping the old server on macOS: SIGTERM, and SIGKILL only for one still listening 10 seconds later', async () => {
  // it leaves on SIGTERM within a second: no SIGKILL
  const quick = machine('darwin', { 10: { term: 900 } });
  expect(await stopServer(5174, [10], quick.s)).toBeNull();
  expect(quick.events).toEqual(['0 SIGTERM 10']);
  expect(quick.time()).toBe(1000);
  // one ignores SIGTERM: it gets SIGKILL after the 10 seconds, the other one only SIGTERM
  const stubborn = machine('darwin', { 10: { term: 400 }, 11: { kill: 100 } });
  expect(await stopServer(5174, [10, 11], stubborn.s)).toBeNull();
  expect(stubborn.events).toEqual(['0 SIGTERM 10', '0 SIGTERM 11', '10000 SIGKILL 11']);
  expect(stubborn.time()).toBe(10200);
  // one that outlives SIGKILL too (2 more seconds): the restart is refused
  const stuck = machine('darwin', { 10: {}, });
  stuck.s.killTree = (pid, signal) => { stuck.events.push(`${stuck.time()} ${signal} ${pid}`); };
  expect(await stopServer(5174, [10], stuck.s)).toBe('埠 5174 還被佔著，沒有重開');
  expect(stuck.events).toEqual(['0 SIGTERM 10', '10000 SIGKILL 10']);
  expect(stuck.time()).toBe(12000);
});

test('stopping the old server on Windows: taskkill /T /F, never a signal; one it cannot stop is reported', async () => {
  const m = machine('win32', { 10: {}, 11: {} });
  m.s.killTree = () => { throw new Error('signals are not for Windows'); };
  expect(await stopServer(5199, [10, 11], m.s)).toBeNull();
  expect(m.events).toEqual(['0 taskkill 10', '0 taskkill 11']);
  expect(m.time()).toBe(0);
  const denied = machine('win32', { 10: { taskkill: 'fails' }, 11: {} });
  expect(await stopServer(5199, [10, 11], denied.s)).toBe('停不掉程序 10（權限不夠？）');
  expect(denied.events).toEqual(['0 taskkill 10']);
  // one the port still names after taskkill (a server started meanwhile): waited for 10 seconds, then refused
  const busy = machine('win32', { 10: {} });
  busy.s.taskkill = () => {};
  expect(await stopServer(5199, [10], busy.s)).toBe('埠 5199 還被佔著，沒有重開');
  expect(busy.time()).toBe(10000);
});
