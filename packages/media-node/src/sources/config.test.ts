import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contactOf, loadSourcesConfig, sourceKey, SOURCES_FILE } from './config.ts';

let dir: string, file: string, localFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'srccfg-'));
  file = join(dir, 'sources.json'); localFile = join(dir, 'sources.local.json');
  writeFileSync(file, JSON.stringify({ contact: '', sources: { 'bbc-sfx': { enabled: false, unofficial: true }, pixabay: { enabled: true, keyEnv: 'PIXABAY_API_KEY' }, wikimedia: { enabled: true } } }));
  writeFileSync(localFile, JSON.stringify({ contact: 'me@example.org', sources: { 'bbc-sfx': { enabled: true } }, keys: { pixabay: 'abc' } }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('local entries override the defaults field by field', () => {
  const c = loadSourcesConfig({ file, localFile });
  expect(c.sources['bbc-sfx']).toEqual({ enabled: true, unofficial: true, options: {} });
  expect(c.sources.pixabay.keyEnv).toBe('PIXABAY_API_KEY');
  expect(c.contact).toBe('me@example.org');
});

test('a key in the environment wins over the local file; TELLCUT_CONTACT wins over contact', () => {
  const c = loadSourcesConfig({ file, localFile });
  expect(sourceKey(c, 'pixabay', {})).toBe('abc');
  expect(sourceKey(c, 'pixabay', { PIXABAY_API_KEY: 'env' })).toBe('env');
  expect(sourceKey(c, 'wikimedia', {})).toBeUndefined();
  expect(contactOf(c, { TELLCUT_CONTACT: 'https://x.example' })).toBe('https://x.example');
  expect(contactOf(c, {})).toBe('me@example.org');
  expect(contactOf({ ...c, contact: '' }, {})).toBeUndefined();
});

test('no local file is fine; a broken one says which file and why', () => {
  expect(loadSourcesConfig({ file, localFile: join(dir, 'none.json') }).sources['bbc-sfx'].enabled).toBe(false);
  writeFileSync(localFile, '{ nope');
  expect(() => loadSourcesConfig({ file, localFile })).toThrow('sources.local.json 不是合法的 JSON');
  writeFileSync(localFile, JSON.stringify({ sources: { pixabay: { enabled: 'yes' } } }));
  expect(() => loadSourcesConfig({ file, localFile })).toThrow('sources.local.json 的內容不對：sources.pixabay.enabled');
});

test('keys or a contact in the public file are refused', () => {
  writeFileSync(file, JSON.stringify({ contact: '', sources: {}, keys: { pixabay: 'x' } }));
  expect(() => loadSourcesConfig({ file, localFile })).toThrow('key 只能放 sources.local.json 或環境變數');
  writeFileSync(file, JSON.stringify({ contact: 'a@b.c', sources: {} }));
  expect(() => loadSourcesConfig({ file, localFile })).toThrow('聯絡方式只能放 sources.local.json 或 TELLCUT_CONTACT');
});

test('the sources.json in the repo is valid, has no keys or contact, and keeps the unofficial sources off', () => {
  const raw = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'));
  expect(raw.keys).toBeUndefined();
  expect(raw.contact).toBe('');
  const c = loadSourcesConfig({ file: SOURCES_FILE, localFile: join(dir, 'none.json') });
  expect([c.sources['bbc-sfx'].enabled, c.sources.incompetech.enabled]).toEqual([false, false]);
  expect([c.sources['bbc-sfx'].unofficial, c.sources.incompetech.unofficial]).toEqual([true, true]);
});
