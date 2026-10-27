import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listeners, threads } from './server-restart.ts';

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
