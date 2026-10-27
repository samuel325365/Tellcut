import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearServerInfo, readServerInfo, tellcutUrl, writeServerInfo } from './server-info.ts';

test("the CLI finds the server where it says it listens; a stopped one, none or TELLCUT_URL fall back as they should", () => {
  const root = mkdtempSync(join(tmpdir(), 'srv-')), alive = (pid: number) => pid === 4242;
  expect(tellcutUrl({}, root, alive)).toBe('http://127.0.0.1:5174');                 // none written yet
  writeServerInfo(5199, root, 4242);
  expect(readServerInfo(root, alive)).toMatchObject({ url: 'http://127.0.0.1:5199', port: 5199, pid: 4242 });
  expect(tellcutUrl({}, root, alive)).toBe('http://127.0.0.1:5199');
  expect(tellcutUrl({ TELLCUT_URL: 'http://x:1' }, root, alive)).toBe('http://x:1');  // the page chat's own server wins
  expect(tellcutUrl({}, root, () => false)).toBe('http://127.0.0.1:5174');           // that server has stopped
  clearServerInfo(root, 1);                                                          // another server's file is left alone
  expect(readServerInfo(root, alive)?.pid).toBe(4242);
  clearServerInfo(root, 4242);
  expect(readServerInfo(root, alive)).toBeNull();
  mkdirSync(join(root, '.cache'), { recursive: true });
  writeFileSync(join(root, '.cache', 'server.json'), '{ broken');
  expect(tellcutUrl({}, root, alive)).toBe('http://127.0.0.1:5174');
});
