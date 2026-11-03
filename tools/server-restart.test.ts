import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listeners, lsofListeners, threads } from './server-restart.ts';

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
